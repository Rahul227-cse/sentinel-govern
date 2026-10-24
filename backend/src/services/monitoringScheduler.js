/**
 * Sentinel Govern - Background Automatic Monitoring Scheduler
 * 
 * Provides automated, non-overlapping background monitoring of AI workloads:
 * - Local Fraud AI: default 60s
 * - Hosted Workloads (Credit Risk, Insurance): default 5m (300s)
 * - Bounded batch sizes and exponential backoff on repeated failures
 * - Independent of browser sessions and page reloads
 * - Clear separation of Demo Walkthrough Mode and Real Inference Monitoring Mode
 */

import {
  WORKLOAD_IDS,
  WORKLOAD_DEFINITIONS,
  checkWorkloadHealth,
  generateWorkloadSyntheticInputs,
  scoreWorkloadBatch,
  ensureGovernedWorkloadModels
} from './workloadService.js';
import { ingestRuntimeTelemetryBatch } from './runtimeMonitoringService.js';
import { recordAuditEvent } from './auditEngine.js';

// Default configuration with environment overrides
const DEFAULT_FRAUD_INTERVAL_MS = Number(process.env.FRAUD_MONITOR_INTERVAL_MS) || 60000; // 60s
const DEFAULT_HOSTED_INTERVAL_MS = Number(process.env.HOSTED_MONITOR_INTERVAL_MS) || 300000; // 5 min
const DEFAULT_BATCH_SIZE = Math.min(Math.max(Number(process.env.MONITOR_BATCH_SIZE) || 25, 5), 50);
const MAX_BACKOFF_MS = 900000; // 15 minutes max backoff

class MonitoringScheduler {
  constructor() {
    this.status = 'PAUSED'; // Default PAUSED until user explicitly connects and starts monitoring
    this.mode = 'REAL'; // 'REAL' (passive inference ingestion) | 'DEMO' (manual walkthrough)
    this.batchSize = DEFAULT_BATCH_SIZE;
    this.fraudIntervalMs = DEFAULT_FRAUD_INTERVAL_MS;
    this.hostedIntervalMs = DEFAULT_HOSTED_INTERVAL_MS;

    this.workloadStates = {
      [WORKLOAD_IDS.FRAUD]: {
        workloadId: WORKLOAD_IDS.FRAUD,
        name: 'Real-Time Fraud Detection AI',
        intervalMs: this.fraudIntervalMs,
        lastRunAt: null,
        nextRunAt: null,
        lastStatus: 'IDLE',
        lastError: null,
        isRunning: false,
        consecutiveFailures: 0,
        successfulRuns: 0,
        totalRuns: 0
      },
      [WORKLOAD_IDS.CREDIT_RISK]: {
        workloadId: WORKLOAD_IDS.CREDIT_RISK,
        name: 'Credit Risk Scoring',
        intervalMs: this.hostedIntervalMs,
        lastRunAt: null,
        nextRunAt: null,
        lastStatus: 'IDLE',
        lastError: null,
        isRunning: false,
        consecutiveFailures: 0,
        successfulRuns: 0,
        totalRuns: 0
      },
      [WORKLOAD_IDS.INSURANCE]: {
        workloadId: WORKLOAD_IDS.INSURANCE,
        name: 'Medical & Insurance Charges Predictor',
        intervalMs: this.hostedIntervalMs,
        lastRunAt: null,
        nextRunAt: null,
        lastStatus: 'IDLE',
        lastError: null,
        isRunning: false,
        consecutiveFailures: 0,
        successfulRuns: 0,
        totalRuns: 0
      },
      [WORKLOAD_IDS.CHURN]: {
        workloadId: WORKLOAD_IDS.CHURN,
        name: 'Customer Churn Intelligence',
        intervalMs: this.hostedIntervalMs,
        lastRunAt: null,
        nextRunAt: null,
        lastStatus: 'CONFIGURATION_REQUIRED',
        lastError: 'Missing CHURN_API_KEY credential',
        isRunning: false,
        consecutiveFailures: 0,
        successfulRuns: 0,
        totalRuns: 0
      }
    };

    this.timers = {};
    this.initialized = false;
  }

  /**
   * Initializes and starts background monitoring scheduler.
   */
  async start() {
    if (this.initialized) return;
    this.initialized = true;

    console.log('\n[Scheduler] Initializing Sentinel Govern Automated Monitoring Scheduler...');
    console.log(`[Scheduler] Mode: ${this.mode} | Fraud Interval: ${this.fraudIntervalMs / 1000}s | Hosted Interval: ${this.hostedIntervalMs / 1000}s | Batch Size: ${this.batchSize}`);

    if (this.status === 'ACTIVE') {
      this._scheduleAll();
    }
  }

  /**
   * Graceful shutdown of scheduler.
   */
  stop() {
    this._clearAllTimers();
    this.status = 'PAUSED';
    console.log('[Scheduler] Background monitoring scheduler stopped.');
  }

  /**
   * Pauses automatic monitoring runs.
   */
  pause(actor = 'ML Lead') {
    this._clearAllTimers();
    this.status = 'PAUSED';
    console.log(`[Scheduler] Monitoring paused by ${actor}.`);
    return this.getState();
  }

  /**
   * Resumes automatic monitoring runs.
   */
  resume(actor = 'ML Lead') {
    this.status = 'ACTIVE';
    this._scheduleAll();
    console.log(`[Scheduler] Monitoring resumed by ${actor}.`);
    return this.getState();
  }

  /**
   * Switches operating mode between DEMO and REAL.
   */
  setMode(newMode, actor = 'ML Lead') {
    if (!['DEMO', 'REAL'].includes(newMode)) {
      throw new Error(`Invalid scheduler mode: ${newMode}. Allowed: DEMO, REAL`);
    }
    this.mode = newMode;
    console.log(`[Scheduler] Switched operating mode to ${newMode} by ${actor}.`);
    if (this.status === 'ACTIVE') {
      this._clearAllTimers();
      this._scheduleAll();
    }
    return this.getState();
  }

  /**
   * Updates polling intervals.
   */
  configureIntervals({ fraudIntervalMs, hostedIntervalMs, batchSize }) {
    if (fraudIntervalMs && fraudIntervalMs >= 10000) {
      this.fraudIntervalMs = Number(fraudIntervalMs);
      this.workloadStates[WORKLOAD_IDS.FRAUD].intervalMs = this.fraudIntervalMs;
    }
    if (hostedIntervalMs && hostedIntervalMs >= 30000) {
      this.hostedIntervalMs = Number(hostedIntervalMs);
      this.workloadStates[WORKLOAD_IDS.CREDIT_RISK].intervalMs = this.hostedIntervalMs;
      this.workloadStates[WORKLOAD_IDS.INSURANCE].intervalMs = this.hostedIntervalMs;
      this.workloadStates[WORKLOAD_IDS.CHURN].intervalMs = this.hostedIntervalMs;
    }
    if (batchSize && batchSize >= 5 && batchSize <= 50) {
      this.batchSize = Number(batchSize);
    }
    if (this.status === 'ACTIVE') {
      this._clearAllTimers();
      this._scheduleAll();
    }
    return this.getState();
  }

  /**
   * Schedules immediate and subsequent recurring runs for active walkthrough workloads.
   */
  _scheduleAll() {
    this._clearAllTimers();

    // Schedule only the active Fraud AI workload for the interview walkthrough
    this._scheduleWorkload(WORKLOAD_IDS.FRAUD, 5000);
  }

  /**
   * Schedules a single workload with a specific initial delay.
   */
  _scheduleWorkload(workloadId, delayMs) {
    if (this.status !== 'ACTIVE') return;

    const state = this.workloadStates[workloadId];
    if (!state) return;

    if (this.timers[workloadId]) {
      clearTimeout(this.timers[workloadId]);
    }

    state.nextRunAt = new Date(Date.now() + delayMs);

    this.timers[workloadId] = setTimeout(async () => {
      await this._executeWorkloadRun(workloadId);
    }, delayMs);
  }

  _clearAllTimers() {
    for (const key of Object.keys(this.timers)) {
      if (this.timers[key]) {
        clearTimeout(this.timers[key]);
        this.timers[key] = null;
      }
    }
  }

  /**
   * Executes a scheduled monitoring run for a specific workload.
   * Enforces strict non-overlapping execution mutex (`isRunning`).
   */
  async _executeWorkloadRun(workloadId) {
    const state = this.workloadStates[workloadId];
    if (!state) return;

    // Mutex: Avoid overlapping runs for the same workload
    if (state.isRunning) {
      console.log(`[Scheduler] Skipping run for ${workloadId}: previous run still in progress.`);
      return;
    }

    state.isRunning = true;
    state.lastRunAt = new Date();
    state.totalRuns++;

    try {
      // 1. Health check first
      const health = await checkWorkloadHealth(workloadId);
      if (health.status !== 'CONNECTED') {
        state.lastStatus = health.status;
        state.lastError = health.error || health.message || 'Service unreachable';
        state.consecutiveFailures++;
        console.log(`[Scheduler] Workload ${workloadId} not connected: ${state.lastStatus} (${state.lastError})`);
        this._scheduleNextWithBackoff(workloadId);
        return;
      }

      // 2. In REAL mode, the scheduler does not generate synthetic traffic
      if (this.mode === 'REAL') {
        state.lastStatus = 'OBSERVING_REAL_INFERENCES';
        state.lastError = null;
        state.consecutiveFailures = 0;
        this._scheduleNext(workloadId);
        return;
      }

      // 3. In DEMO mode, check if a governed model binding exists first
      const modelsMap = await ensureGovernedWorkloadModels();
      const targetBinding = modelsMap[workloadId];
      if (!targetBinding || !targetBinding.modelId || !targetBinding.versionId) {
        state.lastStatus = 'NO_REFERENCE_DATA';
        state.lastError = 'No governed model registered in database for this workload';
        this._scheduleNext(workloadId);
        return;
      }

      // Generate controlled synthetic baseline requests for user-configured demo mode
      const inputs = generateWorkloadSyntheticInputs(workloadId, { scenario: 'BASELINE', count: this.batchSize });
      const scoredRecords = await scoreWorkloadBatch(workloadId, inputs);

      // Ingest through Evidently and Sentinel persistence
      const result = await ingestRuntimeTelemetryBatch({
        modelId: targetBinding.modelId,
        versionId: targetBinding.versionId,
        workloadId,
        runtimeRecords: scoredRecords,
        isSynthetic: true,
        actor: 'Sentinel Automatic Monitoring Scheduler'
      });

      state.lastStatus = result.driftDetected ? 'DRIFT_DETECTED' : 'HEALTHY';
      state.lastError = null;
      state.consecutiveFailures = 0;
      state.successfulRuns++;

      console.log(`[Scheduler] Completed scheduled run for ${workloadId}: ${scoredRecords.length} records -> Evidently verdict: ${result.driftDetected ? 'DRIFT_DETECTED' : 'HEALTHY'}`);
    } catch (err) {
      state.lastStatus = 'ERROR';
      state.lastError = err.message;
      state.consecutiveFailures++;
      console.error(`[Scheduler] Error during scheduled run for ${workloadId}:`, err.message);
    } finally {
      state.isRunning = false;
      this._scheduleNext(workloadId);
    }
  }

  /**
   * Schedules the next run using standard interval.
   */
  _scheduleNext(workloadId) {
    if (this.status !== 'ACTIVE') return;
    const state = this.workloadStates[workloadId];
    if (!state) return;

    const interval = state.consecutiveFailures > 0
      ? this._calculateBackoff(state.intervalMs, state.consecutiveFailures)
      : state.intervalMs;

    this._scheduleWorkload(workloadId, interval);
  }

  _scheduleNextWithBackoff(workloadId) {
    this._scheduleNext(workloadId);
  }

  _calculateBackoff(baseIntervalMs, failures) {
    const factor = Math.min(Math.pow(2, failures), 8);
    return Math.min(baseIntervalMs * factor, MAX_BACKOFF_MS);
  }

  /**
   * Triggers an immediate ad-hoc evaluation for a workload (e.g. from UI trigger button).
   */
  async triggerBatch(workloadId, { scenario = 'BASELINE', count = 25, actor = 'ML Lead' } = {}) {
    const state = this.workloadStates[workloadId];
    if (!state) {
      throw new Error(`Unknown workload ID: ${workloadId}`);
    }

    if (state.isRunning) {
      throw new Error(`Workload ${workloadId} monitoring execution is currently in progress. Please wait.`);
    }

    state.isRunning = true;
    try {
      const modelsMap = await ensureGovernedWorkloadModels();
      const targetBinding = modelsMap[workloadId];
      if (!targetBinding || !targetBinding.modelId || !targetBinding.versionId) {
        throw new Error(`No governed model registered in database for workload '${workloadId}'. Please register and approve a model before running evaluation.`);
      }

      const inputs = generateWorkloadSyntheticInputs(workloadId, { scenario, count });
      const scoredRecords = await scoreWorkloadBatch(workloadId, inputs);

      const result = await ingestRuntimeTelemetryBatch({
        modelId: targetBinding.modelId,
        versionId: targetBinding.versionId,
        workloadId,
        runtimeRecords: scoredRecords,
        isSynthetic: true,
        actor
      });

      state.lastRunAt = new Date();
      state.lastStatus = result.driftDetected ? 'DRIFT_DETECTED' : 'HEALTHY';
      state.lastError = null;

      return {
        ...result,
        scenario,
        isSyntheticWalkthroughTraffic: true,
        scoredCount: scoredRecords.length
      };
    } finally {
      state.isRunning = false;
    }
  }

  /**
   * Returns current scheduler state snapshot.
   */
  getState() {
    return {
      status: this.status, // 'ACTIVE' | 'PAUSED'
      mode: this.mode,     // 'DEMO' | 'REAL'
      batchSize: this.batchSize,
      intervals: {
        fraudIntervalMs: this.fraudIntervalMs,
        hostedIntervalMs: this.hostedIntervalMs
      },
      workloads: Object.values(this.workloadStates).map(w => ({
        ...w,
        intervalSeconds: Math.round(w.intervalMs / 1000)
      }))
    };
  }
}

// Singleton scheduler instance
export const monitoringScheduler = new MonitoringScheduler();
