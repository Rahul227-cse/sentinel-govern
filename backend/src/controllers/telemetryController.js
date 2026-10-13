import { Telemetry } from '../models/Telemetry.js';
import { Model } from '../models/Model.js';
import { ModelVersion } from '../models/ModelVersion.js';
import { Incident } from '../models/Incident.js';
import { IssueReport } from '../models/IssueReport.js';
import { Report } from '../models/Report.js';
import { generateTelemetryBatch } from '../services/driftEngine.js';
import { ingestRuntimeTelemetryBatch } from '../services/runtimeMonitoringService.js';
import { createDriftIncident } from '../services/incidentService.js';
import { recordAuditEvent } from '../services/auditEngine.js';
import { 
  checkAllServicesHealth, 
  checkExternalAiHealth, 
  scoreTransactionsBatch, 
  generateSyntheticWalkthroughTransactions 
} from '../services/externalAiAdapter.js';
import {
  WORKLOAD_IDS,
  WORKLOAD_DEFINITIONS,
  checkAllWorkloadsHealth,
  checkWorkloadHealth,
  generateWorkloadSyntheticInputs,
  scoreWorkloadBatch,
  ensureGovernedWorkloadModels
} from '../services/workloadService.js';
import { monitoringScheduler } from '../services/monitoringScheduler.js';

export async function getTelemetryHistory(req, res) {
  try {
    const { modelId, versionId, workloadId, limit = 50 } = req.query;
    const filter = {};
    if (modelId) filter.modelId = modelId;
    if (versionId) filter.versionId = versionId;
    if (workloadId) filter.workloadId = workloadId;

    const telemetry = await Telemetry.find(filter)
      .populate('modelId', 'name lifecycleStatus riskLevel purpose')
      .populate('versionId', 'version lifecycleStatus deploymentStatus')
      .populate('incidentId', 'incidentNumber status severity recommendedAction')
      .populate('reportId', 'reportNumber title reportType operationalStatus')
      .sort({ recordedAt: -1 })
      .limit(Number(limit));

    res.json({ success: true, count: telemetry.length, data: telemetry });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

export async function simulateTelemetryBatch(req, res) {
  try {
    const {
      modelId,
      versionId,
      scenario = 'STABLE', // 'STABLE' or 'DRIFTED'
      sampleSize = 2500
    } = req.body;

    const actor = req.user ? (req.user.name || req.user.email) : (req.body.actor || 'Telemetry Simulator');

    const model = await Model.findById(modelId);
    if (!model) {
      return res.status(404).json({ success: false, error: 'Model not found' });
    }

    const effectiveVersionId = versionId || model.currentProductionVersionId;
    if (!effectiveVersionId) {
      return res.status(400).json({
        success: false,
        error: 'Model has no active production version. Promote a version to production before monitoring.'
      });
    }

    const version = await ModelVersion.findById(effectiveVersionId);
    if (!version) {
      return res.status(404).json({ success: false, error: 'ModelVersion not found' });
    }

    const batchData = generateTelemetryBatch({ scenario, sampleSize });

    const telemetry = await Telemetry.create({
      modelId: model._id,
      versionId: version._id,
      batchId: batchData.batchId,
      sampleSize: batchData.sampleSize,
      features: batchData.features,
      aggregatePsi: batchData.aggregatePsi,
      driftStatus: batchData.driftStatus,
      performanceTelemetry: batchData.performanceTelemetry,
      recordedAt: new Date()
    });

    let generatedIncident = null;

    if (batchData.driftStatus === 'DRIFT_DETECTED') {
      await recordAuditEvent({
        actor,
        role: 'SYSTEM',
        action: 'DRIFT_DETECTED',
        entityType: 'Telemetry',
        entityId: telemetry._id,
        payload: {
          modelId: String(model._id),
          modelName: model.name,
          versionId: String(version._id),
          version: version.version,
          aggregatePsi: batchData.aggregatePsi,
          threshold: 0.25,
          affectedFeatures: batchData.features.filter(f => f.driftDetected).map(f => f.name)
        }
      });

      generatedIncident = await createDriftIncident({
        modelId: model._id,
        versionId: version._id,
        psi: batchData.aggregatePsi,
        features: batchData.features,
        telemetryId: telemetry._id,
        actor
      });

      telemetry.incidentId = generatedIncident._id;
      await telemetry.save();
    }

    res.status(201).json({
      success: true,
      data: {
        telemetry,
        incident: generatedIncident,
        scenarioTriggered: scenario
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

export async function ingestRuntimeTelemetry(req, res) {
  try {
    const { modelId, versionId, runtimeRecords, workloadId, isSynthetic } = req.body;
    const actor = req.user ? (req.user.name || req.user.email) : 'Runtime Telemetry Ingestion';

    const result = await ingestRuntimeTelemetryBatch({
      modelId,
      versionId,
      runtimeRecords,
      workloadId,
      isSynthetic,
      actor
    });

    res.status(201).json({
      success: true,
      data: result
    });
  } catch (error) {
    const status = error.statusCode || 500;
    res.status(status).json({
      success: false,
      error: error.message,
      code: error.code || undefined
    });
  }
}

export async function getMonitoringOverview(req, res) {
  try {
    const modelId = req.params.modelId || req.query.modelId;
    const workloadId = req.query.workloadId;
    let model = null;

    // Workload mapping lookup if workloadId specified
    if (workloadId) {
      const modelsMap = await ensureGovernedWorkloadModels();
      const binding = modelsMap[workloadId];
      if (binding) {
        model = await Model.findById(binding.modelId).populate('currentProductionVersionId');
      }
    }

    if (!model && modelId) {
      model = await Model.findById(modelId).populate('currentProductionVersionId');
      if (!model) {
        return res.status(404).json({ success: false, error: 'Model not found' });
      }
    }

    if (!model) {
      model = await Model.findOne({ lifecycleStatus: 'IN_PRODUCTION' }).populate('currentProductionVersionId');
      if (!model) {
        model = await Model.findOne().sort({ createdAt: -1 }).populate('currentProductionVersionId');
      }
    }

    if (!model) {
      return res.json({
        success: true,
        data: {
          model: null,
          version: null,
          signalStatus: 'NO_DATA',
          thresholds: { warning: 0.10, incident: 0.25 },
          latestTelemetry: null,
          activeIncidents: [],
          recentTrend: [],
          telemetryHistory: [],
          schedulerState: monitoringScheduler.getState()
        }
      });
    }

    // Identify effective version
    let effectiveVersion = model.currentProductionVersionId;
    if (!effectiveVersion) {
      effectiveVersion = await ModelVersion.findOne({
        modelId: model._id,
        lifecycleStatus: 'APPROVED'
      }).sort({ createdAt: -1 });
    }
    if (!effectiveVersion) {
      effectiveVersion = await ModelVersion.findOne({ modelId: model._id }).sort({ createdAt: -1 });
    }

    // Determine effective workloadId for this model
    let resolvedWorkloadId = workloadId;
    if (!resolvedWorkloadId) {
      if (/Credit/i.test(model.name)) resolvedWorkloadId = WORKLOAD_IDS.CREDIT_RISK;
      else if (/Insurance/i.test(model.name)) resolvedWorkloadId = WORKLOAD_IDS.INSURANCE;
      else if (/Churn/i.test(model.name)) resolvedWorkloadId = WORKLOAD_IDS.CHURN;
      else resolvedWorkloadId = WORKLOAD_IDS.FRAUD;
    }

    // If workloadId was explicitly provided in query, scope by workloadId (or modelId).
    // Otherwise, scope strictly to the target modelId so unmonitored models return clean NO_DATA.
    const queryFilter = workloadId 
      ? { $or: [{ workloadId }, { modelId: model._id }] }
      : { modelId: model._id };

    const telemetry = await Telemetry.find(queryFilter)
      .populate('versionId', 'version lifecycleStatus deploymentStatus')
      .populate('incidentId', 'incidentNumber status severity recommendedAction')
      .populate('reportId', 'reportNumber title reportType operationalStatus')
      .sort({ recordedAt: -1 })
      .limit(30);

    // Fetch active incidents (OPEN or INVESTIGATING)
    const activeIncidents = await Incident.find({
      ...queryFilter,
      status: { $in: ['OPEN', 'INVESTIGATING'] }
    })
      .populate('versionId', 'version')
      .populate('issueReportRef', 'reportNumber issueType title submittedBy')
      .populate('telemetryRef', 'batchId aggregatePsi driftStatus')
      .populate('reportRef', 'reportNumber title reportType operationalStatus')
      .sort({ createdAt: -1 });

    const latestTelemetry = telemetry.length > 0 ? telemetry[0] : null;

    // Fetch latest reports for this model/workload
    const latestReports = await Report.find(queryFilter)
      .sort({ createdAt: -1 })
      .limit(5);

    // Compute signal status:
    // INCIDENT_ACTIVE > DRIFT_DETECTED > WARNING > HEALTHY > NO_DATA
    let signalStatus = 'NO_DATA';
    if (activeIncidents.length > 0) {
      signalStatus = 'INCIDENT_ACTIVE';
    } else if (latestTelemetry) {
      if (latestTelemetry.driftStatus === 'DRIFT_DETECTED') {
        signalStatus = 'DRIFT_DETECTED';
      } else if (latestTelemetry.driftStatus === 'WARNING') {
        signalStatus = 'WARNING';
      } else {
        signalStatus = 'HEALTHY';
      }
    }

    // Construct genuine metric trend (chronological order)
    const recentTrend = telemetry
      .slice(0, 15)
      .reverse()
      .map(t => ({
        batchId: t.batchId,
        recordedAt: t.recordedAt,
        aggregatePsi: t.aggregatePsi !== undefined && t.aggregatePsi !== null ? t.aggregatePsi : null,
        driftStatus: t.driftStatus,
        monitoringSource: t.monitoringSource || (t.aggregatePsi !== null ? 'SIMULATION' : 'EVIDENTLY'),
        driftedColumns: t.driftedColumns || [],
        avgLatencyMs: t.performanceTelemetry?.avgLatencyMs ?? 0,
        errorRate: t.performanceTelemetry?.errorRate ?? 0,
        predictionVolume: t.performanceTelemetry?.predictionVolume ?? (t.sampleSize || 25),
        estimatedAccuracy: t.performanceTelemetry?.estimatedAccuracy ?? 0,
        hasIncident: Boolean(t.incidentId),
        incidentId: t.incidentId,
        reportId: t.reportId,
        isSyntheticWalkthroughTraffic: Boolean(t.isSyntheticWalkthroughTraffic)
      }));

    res.json({
      success: true,
      data: {
        model: {
          _id: model._id,
          name: model.name,
          purpose: model.purpose,
          riskLevel: model.riskLevel,
          lifecycleStatus: model.lifecycleStatus
        },
        version: effectiveVersion ? {
          _id: effectiveVersion._id,
          version: effectiveVersion.version,
          lifecycleStatus: effectiveVersion.lifecycleStatus,
          deploymentStatus: effectiveVersion.deploymentStatus,
          policyStatus: effectiveVersion.policyStatus,
          approvalStatus: effectiveVersion.approvalStatus
        } : null,
        workloadId: resolvedWorkloadId,
        workloadConfig: WORKLOAD_DEFINITIONS[resolvedWorkloadId],
        signalStatus,
        thresholds: {
          warning: 0.10,
          incident: 0.25
        },
        latestTelemetry,
        activeIncidents,
        latestReports,
        recentTrend,
        telemetryHistory: telemetry,
        schedulerState: monitoringScheduler.getState()
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * Returns connectivity and health of all 4 AI workloads plus Evidently.
 */
export async function getMonitoringServicesStatus(req, res) {
  try {
    const health = await checkAllServicesHealth();
    res.json({
      success: true,
      data: health
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Returns detailed health check for all four workloads.
 */
export async function getWorkloadsStatus(req, res) {
  try {
    const status = await checkAllWorkloadsHealth();
    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Returns background monitoring scheduler status and configuration.
 */
export async function getSchedulerStatus(req, res) {
  try {
    const state = monitoringScheduler.getState();
    res.json({
      success: true,
      data: state
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Pauses background monitoring scheduler.
 */
export async function pauseScheduler(req, res) {
  try {
    const actor = req.user ? (req.user.name || req.user.email) : 'ML Lead';
    const state = monitoringScheduler.pause(actor);
    res.json({
      success: true,
      message: 'Automatic background monitoring scheduler paused.',
      data: state
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Resumes background monitoring scheduler.
 */
export async function resumeScheduler(req, res) {
  try {
    const actor = req.user ? (req.user.name || req.user.email) : 'ML Lead';
    const state = monitoringScheduler.resume(actor);
    res.json({
      success: true,
      message: 'Automatic background monitoring scheduler resumed.',
      data: state
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Sets scheduler operating mode: DEMO or REAL.
 */
export async function setSchedulerMode(req, res) {
  try {
    const { mode } = req.body;
    const actor = req.user ? (req.user.name || req.user.email) : 'ML Lead';
    const state = monitoringScheduler.setMode(mode, actor);
    res.json({
      success: true,
      message: `Automatic monitoring scheduler mode set to ${mode}.`,
      data: state
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Manually triggers an ad-hoc monitoring batch for any of the 4 workloads.
 */
export async function triggerSchedulerBatch(req, res) {
  try {
    const { workloadId = WORKLOAD_IDS.FRAUD, scenario = 'BASELINE', count = 25 } = req.body;
    const actor = req.user ? (req.user.name || req.user.email) : 'ML Lead';
    const result = await monitoringScheduler.triggerBatch(workloadId, { scenario, count: Number(count), actor });
    res.status(201).json({
      success: true,
      message: `Successfully executed batch for workload '${workloadId}' in scenario '${scenario}'.`,
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Executes live prediction on controlled test transactions for any workload,
 * transforms responses, feeds to Evidently (/analyze-drift), and persists the result.
 */
export async function evaluateExternalAiTelemetry(req, res) {
  try {
    const {
      workloadId = WORKLOAD_IDS.FRAUD,
      modelId,
      versionId,
      scenario = 'BASELINE', // 'BASELINE' | 'DRIFTED' | 'MIXED'
      count = 25,
      transactions,
      inputs
    } = req.body;

    const actor = req.user ? (req.user.name || req.user.email) : 'External AI Evaluation';

    // 1. Health check for requested workload
    const health = await checkWorkloadHealth(workloadId);
    if (health.status !== 'CONNECTED') {
      const code = health.status === 'CONFIGURATION_REQUIRED' ? 'CONFIGURATION_REQUIRED' : 'EXTERNAL_AI_UNAVAILABLE';
      return res.status(health.status === 'CONFIGURATION_REQUIRED' ? 400 : 503).json({
        success: false,
        error: `Workload '${workloadId}' is not connected: ${health.message || health.error || 'Health check failed'}`,
        code,
        data: health
      });
    }

    // 2. Identify target governed Model & Version
    const modelsMap = await ensureGovernedWorkloadModels();
    let effectiveModelId = modelId;
    let effectiveVersionId = versionId;

    if (!effectiveModelId && modelsMap[workloadId]) {
      effectiveModelId = modelsMap[workloadId].modelId;
      effectiveVersionId = modelsMap[workloadId].versionId;
    }

    let model = effectiveModelId ? await Model.findById(effectiveModelId) : null;
    if (!model) {
      model = await Model.findOne({ lifecycleStatus: 'IN_PRODUCTION' }) || await Model.findOne().sort({ createdAt: -1 });
    }
    if (!model) {
      return res.status(404).json({ success: false, error: 'No governed model found for telemetry evaluation.' });
    }

    if (!effectiveVersionId) {
      effectiveVersionId = model.currentProductionVersionId;
      if (!effectiveVersionId) {
        const v = await ModelVersion.findOne({ modelId: model._id }).sort({ createdAt: -1 });
        if (v) effectiveVersionId = v._id;
      }
    }

    const version = effectiveVersionId ? await ModelVersion.findById(effectiveVersionId) : null;
    if (!version) {
      return res.status(404).json({ success: false, error: 'Model version not found.' });
    }

    // 3. Obtain controlled test inputs (synthetic walkthrough traffic)
    const testInputs = (Array.isArray(transactions) && transactions.length > 0)
      ? transactions
      : (Array.isArray(inputs) && inputs.length > 0)
        ? inputs
        : generateWorkloadSyntheticInputs(workloadId, { scenario, count });

    // 4. Score inputs against real prediction service
    const scoredRecords = await scoreWorkloadBatch(workloadId, testInputs);

    // 5. Ingest scored records through Evidently and Sentinel persistence
    const result = await ingestRuntimeTelemetryBatch({
      modelId: model._id,
      versionId: version._id,
      workloadId,
      runtimeRecords: scoredRecords,
      isSynthetic: true,
      actor
    });

    res.status(201).json({
      success: true,
      message: `Successfully scored ${scoredRecords.length} controlled inputs via '${workloadId}' and analyzed drift via Evidently.`,
      data: {
        ...result,
        scenario,
        workloadId,
        isSyntheticWalkthroughTraffic: true,
        scoredCount: scoredRecords.length,
        sampleScoredRecord: scoredRecords[0]
      }
    });
  } catch (error) {
    const status = error.statusCode || 500;
    res.status(status).json({
      success: false,
      error: error.message,
      code: error.code || undefined
    });
  }
}
