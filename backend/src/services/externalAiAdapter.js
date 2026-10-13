/**
 * External AI Service Adapter
 * Bridges external FastAPI model service (port 8000) to Sentinel Govern.
 * "The AI model does the AI work. Sentinel Govern governs the AI model."
 */

const EXTERNAL_AI_URL = process.env.EXTERNAL_AI_URL || 'http://127.0.0.1:8000';
const MONITORING_SERVICE_URL = process.env.MONITORING_SERVICE_URL || 'http://127.0.0.1:8001';
const TIMEOUT_MS = Number(process.env.EXTERNAL_AI_TIMEOUT_MS) || 5000;

/**
 * Checks connectivity and health of the external AI model service.
 */
export async function checkExternalAiHealth() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const response = await fetch(`${EXTERNAL_AI_URL}/health`, {
      method: 'GET',
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return { status: 'UNHEALTHY', statusCode: response.status, url: EXTERNAL_AI_URL };
    }

    const data = await response.json();
    return { ...data, status: 'HEALTHY', url: EXTERNAL_AI_URL };
  } catch (err) {
    return { status: 'UNREACHABLE', url: EXTERNAL_AI_URL, error: err.message };
  }
}

/**
 * Checks connectivity and health of the Evidently monitoring service.
 */
export async function checkMonitoringServiceHealth() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const response = await fetch(`${MONITORING_SERVICE_URL}/health`, {
      method: 'GET',
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return { status: 'UNHEALTHY', statusCode: response.status, url: MONITORING_SERVICE_URL };
    }

    const data = await response.json();
    return { ...data, status: 'HEALTHY', url: MONITORING_SERVICE_URL };
  } catch (err) {
    return { status: 'UNREACHABLE', url: MONITORING_SERVICE_URL, error: err.message };
  }
}

import { checkWorkloadHealth, WORKLOAD_IDS } from './workloadService.js';

/**
 * Unified health check across tripartite governance services and all 4 AI workloads.
 */
export async function checkAllServicesHealth() {
  const [externalAi, monitoring, creditRisk, insurance, churn] = await Promise.all([
    checkExternalAiHealth(),
    checkMonitoringServiceHealth(),
    checkWorkloadHealth(WORKLOAD_IDS.CREDIT_RISK).catch(e => ({ status: 'UNAVAILABLE', error: e.message })),
    checkWorkloadHealth(WORKLOAD_IDS.INSURANCE).catch(e => ({ status: 'UNAVAILABLE', error: e.message })),
    checkWorkloadHealth(WORKLOAD_IDS.CHURN).catch(e => ({ status: 'CONFIGURATION_REQUIRED', error: e.message }))
  ]);

  return {
    externalAi,
    monitoring,
    fraudAi: externalAi,
    evidently: monitoring,
    creditRisk,
    insurance,
    churn,
    workloads: [
      { id: 'fraud-detection', name: 'Real-Time Fraud Detection AI', ...externalAi },
      { id: 'credit-risk', name: 'Credit Risk Scoring', ...creditRisk },
      { id: 'insurance-charges', name: 'Medical & Insurance Charges', ...insurance },
      { id: 'customer-churn', name: 'Customer Churn Intelligence', ...churn }
    ],
    allHealthy: externalAi.status === 'HEALTHY' && monitoring.status === 'HEALTHY'
  };
}

/**
 * Invokes the real External AI /score endpoint for a single transaction.
 */
export async function scoreTransactionWithExternalAi(transactionPayload) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const response = await fetch(`${EXTERNAL_AI_URL}/score`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(transactionPayload),
    signal: controller.signal
  });

  clearTimeout(timeoutId);

  if (!response.ok) {
    const errText = await response.text();
    const err = new Error(`External AI /score failed with HTTP ${response.status}: ${errText}`);
    err.statusCode = response.status >= 500 ? 503 : response.status;
    throw err;
  }

  return response.json();
}

/**
 * Executes scoring for a batch of transactions against the real External AI service,
 * returning formatted runtime records ready for Sentinel governance ingestion.
 */
export async function scoreTransactionsBatch(transactions) {
  if (!Array.isArray(transactions) || transactions.length === 0) {
    throw new Error('Transactions batch must be a non-empty array');
  }

  const scoredRecords = [];

  for (const txn of transactions) {
    const scored = await scoreTransactionWithExternalAi(txn);
    scoredRecords.push({
      transaction_id: scored.transaction_id,
      fraud_risk_score: scored.fraud_risk_score,
      decision: scored.decision,
      ml_supervised_score: scored.ml_supervised_score,
      ml_anomaly_score: scored.ml_anomaly_score,
      rule_heuristic_score: scored.rule_heuristic_score,
      latency_ms: scored.latency_ms
    });
  }

  return scoredRecords;
}

/**
 * Generates controlled synthetic walkthrough transactions for evaluating
 * Fraud AI /score and Evidently drift detection.
 *
 * NOTE: These transactions are explicitly labeled as synthetic demo traffic
 * and do NOT represent real banking traffic.
 */
export function generateSyntheticWalkthroughTransactions({ scenario = 'BASELINE', count = 25 } = {}) {
  const safeCount = Math.max(5, Math.min(Number(count) || 25, 100));
  const txns = [];
  const baseTime = Date.now();

  for (let i = 0; i < safeCount; i++) {
    const isAnomalous = scenario === 'DRIFTED' || (scenario === 'MIXED' && i % 3 === 0);
    const userId = `SYNTH_U${100000 + (i % 20)}`;
    const timestamp = new Date(baseTime - (safeCount - i) * 60000).toISOString();

    if (isAnomalous) {
      // Shifted / high-risk transaction profile
      txns.push({
        user_id: userId,
        amount: Number((1200 + Math.random() * 8500).toFixed(2)),
        timestamp,
        channel: 'CARD_NOT_PRESENT',
        country: ['NG', 'RO', 'RU', 'BR'][i % 4],
        merchant_id: `SYNTH_M${9000 + (i % 10)}`,
        device_id: `SYNTH_D${9000 + i}`,
        isSyntheticWalkthroughTraffic: true
      });
    } else {
      // Baseline / normal transaction profile
      txns.push({
        user_id: userId,
        amount: Number((15 + Math.random() * 65).toFixed(2)),
        timestamp,
        channel: ['POS_SWIPE', 'MOBILE_APP', 'UPI_WALLET'][i % 3],
        country: 'US',
        merchant_id: `SYNTH_M${1000 + (i % 5)}`,
        device_id: `SYNTH_D${1000 + (i % 8)}`,
        isSyntheticWalkthroughTraffic: true
      });
    }
  }

  return txns;
}
