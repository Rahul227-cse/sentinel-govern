import { Model } from '../models/Model.js';
import { ModelVersion } from '../models/ModelVersion.js';
import { Telemetry } from '../models/Telemetry.js';
import { Monitoring } from '../models/Monitoring.js';
import { createDriftIncident } from './incidentService.js';
import { createOrUpdateDriftReport } from './reportService.js';
import { WORKLOAD_DEFINITIONS, WORKLOAD_IDS } from './workloadService.js';
import { retrieveReferenceDatasetRecords } from './referenceDatasetService.js';
import { recordAuditEvent } from './auditEngine.js';
import mongoose from 'mongoose';

const MONITORING_SERVICE_URL = process.env.MONITORING_SERVICE_URL || 'http://127.0.0.1:8001';
const TIMEOUT_MS = Number(process.env.MONITORING_TIMEOUT_MS) || 15000;

/**
 * Service to orchestrate real Evidently runtime telemetry ingestion.
 * Sends scored transaction records to the Sentinel Monitoring Service (Evidently 0.7.23),
 * maps statistical evidence into a Telemetry document without fabricated PSI,
 * and escalates to IncidentManagement if statistical drift is detected.
 */
export async function ingestRuntimeTelemetryBatch({
  modelId,
  versionId,
  runtimeRecords,
  workloadId = null,
  isSynthetic = false,
  actor = 'Runtime Telemetry Ingestion'
}) {
  if (!modelId || !mongoose.Types.ObjectId.isValid(modelId)) {
    const err = new Error('Invalid or missing modelId');
    err.statusCode = 400;
    throw err;
  }

  const model = await Model.findById(modelId);
  if (!model) {
    const err = new Error('Model not found');
    err.statusCode = 404;
    throw err;
  }

  const effectiveVersionId = versionId || model.currentProductionVersionId;
  if (!effectiveVersionId || !mongoose.Types.ObjectId.isValid(effectiveVersionId)) {
    const err = new Error('Model has no active production version or invalid versionId provided');
    err.statusCode = 400;
    throw err;
  }

  const version = await ModelVersion.findById(effectiveVersionId);
  if (!version) {
    const err = new Error('ModelVersion not found');
    err.statusCode = 404;
    throw err;
  }

  if (String(version.modelId) !== String(model._id)) {
    const err = new Error('Version does not belong to specified model');
    err.statusCode = 400;
    throw err;
  }

  // Validate lifecycle appropriateness: version must be in production or approved candidate
  const allowedStatuses = ['IN_PRODUCTION', 'APPROVED'];
  if (!allowedStatuses.includes(version.lifecycleStatus) && version.deploymentStatus !== 'IN_PRODUCTION') {
    const err = new Error(
      `Model version ${version.version} (status: ${version.lifecycleStatus}) is not authorized for runtime telemetry ingestion. Version must be APPROVED or IN_PRODUCTION.`
    );
    err.statusCode = 400;
    throw err;
  }

  // Validate runtimeRecords format
  if (!Array.isArray(runtimeRecords) || runtimeRecords.length === 0) {
    const err = new Error('Runtime records array cannot be empty');
    err.statusCode = 400;
    throw err;
  }

  // 1. Retrieve reference dataset records for this version
  const referenceRecords = await retrieveReferenceDatasetRecords(version, model);

  // 2. Resolve effective workload ID
  let effectiveWorkloadId = workloadId;
  const sample = runtimeRecords[0] || {};
  if (!effectiveWorkloadId) {
    if (sample.probability_of_default !== undefined || /Credit/i.test(model.name)) {
      effectiveWorkloadId = WORKLOAD_IDS.CREDIT_RISK;
    } else if (sample.predicted_charge !== undefined || /Insurance/i.test(model.name)) {
      effectiveWorkloadId = WORKLOAD_IDS.INSURANCE;
    } else if (sample.MonthlyCharges !== undefined || /Churn/i.test(model.name)) {
      effectiveWorkloadId = WORKLOAD_IDS.CHURN;
    } else if (model.type) {
      effectiveWorkloadId = model.type.toLowerCase().replace(/[\s_]+/g, '-');
    } else {
      effectiveWorkloadId = WORKLOAD_IDS.FRAUD;
    }
  }

  // 3. Quick sanity check on runtime records format
  for (let i = 0; i < Math.min(runtimeRecords.length, 10); i++) {
    if (typeof runtimeRecords[i] !== 'object' || runtimeRecords[i] === null) {
      const err = new Error(`Invalid record format at index ${i}: expected an object`);
      err.statusCode = 400;
      throw err;
    }
  }

  // 3b. Verify records contain monitored feature columns
  const workloadDef = WORKLOAD_DEFINITIONS[effectiveWorkloadId] || null;
  const availableRuntimeCols = Object.keys(runtimeRecords[0] || {});
  const expectedCols = version.referenceDataset?.featureColumns?.length > 0
    ? version.referenceDataset.featureColumns
    : (workloadDef?.monitoredFeatures || []);

  const nonFeatureRegex = /^(target|label|actual|ground_truth|y_true|y_pred|prediction|predicted|decision|probability|probability_of_default|model|threshold|band|features|latency_ms)$/i;
  const nonTargetExpected = expectedCols.filter(col => !nonFeatureRegex.test(col.trim()));

  const matchingCols = nonTargetExpected.filter(col => availableRuntimeCols.includes(col));
  if (nonTargetExpected.length > 0 && matchingCols.length === 0) {
    const err = new Error(
      `Runtime records missing required monitored column: expected at least one feature column among [${nonTargetExpected.slice(0, 5).join(', ')}] but received columns [${availableRuntimeCols.join(', ')}]`
    );
    err.statusCode = 400;
    throw err;
  }

  // 4. Compute performance telemetry
  const predictionVolume = runtimeRecords.length;
  const latencies = runtimeRecords
    .map(r => Number(r.latency_ms))
    .filter(l => !isNaN(l) && l > 0);
  const avgLatencyMs = latencies.length > 0
    ? Number((latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(2))
    : null;

  // Real ground-truth accuracy / error rate evaluation only if ground-truth labels are present
  // Never fabricate errorRate or estimatedAccuracy
  let errorRate = null;
  let estimatedAccuracy = null;
  const targetCol = version.referenceDataset?.targetColumn || 'target';
  const predCol = version.apiConfig?.responseMapping?.predictionField || 'prediction';
  const labeledRecords = runtimeRecords.filter(r => r[targetCol] !== undefined && r[predCol] !== undefined);
  if (labeledRecords.length >= 5) {
    const matches = labeledRecords.filter(r => String(r[targetCol]) === String(r[predCol])).length;
    estimatedAccuracy = Number((matches / labeledRecords.length).toFixed(4));
    errorRate = Number((1 - estimatedAccuracy).toFixed(4));
  }

  // 5. Send batch to Evidently Monitoring Service with dynamic reference data
  let driftAnalysis;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const payload = {
      model_id: String(model._id),
      version_id: String(version._id),
      workload_id: effectiveWorkloadId,
      runtime_data: runtimeRecords,
      reference_data: referenceRecords || null,
      monitored_columns: nonTargetExpected.length > 0 ? nonTargetExpected : null
    };

    const response = await fetch(`${MONITORING_SERVICE_URL}/analyze-drift`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errBody = await response.text();
      const err = new Error(`Evidently monitoring service returned HTTP ${response.status}: ${errBody}`);
      err.statusCode = response.status >= 500 ? 503 : response.status;
      throw err;
    }

    driftAnalysis = await response.json();
  } catch (err) {
    if (
      err.name === 'AbortError' ||
      err.code === 'ECONNREFUSED' ||
      err.code === 'ENOTFOUND' ||
      err.type === 'system' ||
      !err.statusCode ||
      err.statusCode >= 500
    ) {
      const serviceUnavailableErr = new Error(
        `Sentinel Monitoring Service (Evidently) is currently unavailable or unreachable: ${err.message}`
      );
      serviceUnavailableErr.statusCode = 503;
      serviceUnavailableErr.code = 'MONITORING_SERVICE_UNAVAILABLE';
      throw serviceUnavailableErr;
    }
    throw err;
  }

  const isInsufficient = driftAnalysis.status === 'insufficient_data';
  const driftDetected = Boolean(driftAnalysis.drift_detected);
  const driftStatus = driftDetected 
    ? 'DRIFT_DETECTED' 
    : (isInsufficient ? 'INSUFFICIENT_DATA' : 'HEALTHY');
  const driftedColumns = Array.isArray(driftAnalysis.drifted_columns) ? driftAnalysis.drifted_columns : [];
  const metrics = Array.isArray(driftAnalysis.metrics) ? driftAnalysis.metrics : [];

  // Map statistical features
  const features = metrics.map((m) => ({
    name: m.column,
    psi: null, // Strictly null for Evidently
    statisticalMethod: m.method || 'EVIDENTLY',
    pValue: typeof m.p_value === 'number' ? m.p_value : null,
    threshold: typeof m.threshold === 'number' ? m.threshold : 0.05,
    driftDetected: Boolean(m.drift_detected)
  }));

  const batchId = `BATCH-EVD-${Date.now()}`;

  const referenceDatasetVersion = version.referenceDataset?.filename || version.version || 'baseline-v1.0';

  // Persist Telemetry document
  const telemetry = await Telemetry.create({
    modelId: model._id,
    versionId: version._id,
    workloadId: effectiveWorkloadId,
    batchId,
    sampleSize: predictionVolume,
    features,
    aggregatePsi: null, // No fake PSI
    driftStatus,
    monitoringSource: 'EVIDENTLY',
    driftedColumns,
    reportArtifactPath: driftAnalysis.report || `runtime_drift_report_${effectiveWorkloadId}.html`,
    isSyntheticWalkthroughTraffic: Boolean(isSynthetic),
    referenceDatasetVersion,
    performanceTelemetry: {
      predictionVolume,
      avgLatencyMs,
      errorRate,
      estimatedAccuracy
    },
    runtimeRecords: runtimeRecords.slice(0, 100),
    recordedAt: new Date()
  });

  // Normalize actor string and role
  const actorString = typeof actor === 'object' && actor !== null
    ? (actor.name || actor.email || 'ML_LEAD')
    : String(actor || 'SYSTEM');
  const actorRole = typeof actor === 'object' && actor !== null
    ? (actor.role || 'ML_LEAD')
    : 'ML_LEAD';

  // Audit event: TELEMETRY_INGESTED
  await recordAuditEvent({
    actor: actorString,
    role: actorRole,
    action: 'TELEMETRY_INGESTED',
    entityType: 'Telemetry',
    entityId: telemetry._id,
    payload: {
      modelId: String(model._id),
      modelName: model.name,
      versionId: String(version._id),
      version: version.version,
      workloadId: effectiveWorkloadId,
      batchId,
      sampleSize: predictionVolume,
      monitoringSource: 'EVIDENTLY',
      driftStatus,
      driftedColumns
    }
  });

  let generatedIncident = null;
  let generatedReport = null;

  if (driftDetected) {
    // 1. Audit event: DRIFT_DETECTED
    await recordAuditEvent({
      actor: actorString,
      role: 'SYSTEM',
      action: 'DRIFT_DETECTED',
      entityType: 'Telemetry',
      entityId: telemetry._id,
      payload: {
        modelId: String(model._id),
        modelName: model.name,
        versionId: String(version._id),
        version: version.version,
        workloadId: effectiveWorkloadId,
        monitoringSource: 'EVIDENTLY',
        driftedColumns,
        affectedFeatures: driftedColumns,
        recordsAnalyzed: predictionVolume
      }
    });

    // 2. Automated incident creation with deduplication and baseline rollback identification
    generatedIncident = await createDriftIncident({
      modelId: model._id,
      versionId: version._id,
      psi: null,
      features,
      telemetryId: telemetry._id,
      actor,
      source: 'EVIDENTLY',
      driftedColumns,
      recordsAnalyzed: predictionVolume,
      workloadId: effectiveWorkloadId
    });

    // 3. Automated drift report creation or updating (deduplicated per open incident)
    generatedReport = await createOrUpdateDriftReport({
      model,
      version,
      telemetry,
      incident: generatedIncident,
      driftAnalysis,
      workloadId: effectiveWorkloadId,
      isSynthetic,
      actor
    });

    // 4. Bidirectional linkage
    telemetry.incidentId = generatedIncident._id;
    telemetry.reportId = generatedReport._id;
    await telemetry.save();
  }

  // 5. Update or create Monitoring state document
  let monitoring = await Monitoring.findOne({ modelId: model._id, versionId: version._id });
  if (!monitoring) {
    monitoring = new Monitoring({
      modelId: model._id,
      versionId: version._id,
      primaryOwner: model.owner || 'ML Engineering',
      monitoringTeam: model.team || 'MLOps & Governance',
      monitoringStatus: 'ACTIVE'
    });
  }

  monitoring.healthStatus = driftDetected ? 'CRITICAL' : (isInsufficient ? 'WARNING' : 'HEALTHY');
  monitoring.driftDetected = driftDetected;
  monitoring.driftMethod = 'EVIDENTLY';
  monitoring.latestPsi = null;
  monitoring.lastEvaluatedAt = new Date();
  monitoring.telemetryRef = telemetry._id;
  await monitoring.save();

  if (!version.activeMonitoringRef || String(version.activeMonitoringRef) !== String(monitoring._id)) {
    version.activeMonitoringRef = monitoring._id;
    await version.save();
  }

  return {
    telemetry,
    incident: generatedIncident,
    report: generatedReport,
    driftDetected,
    driftStatus: telemetry.driftStatus,
    driftedColumns,
    monitoringSource: 'EVIDENTLY',
    recordsAnalyzed: predictionVolume,
    metrics,
    workloadId: effectiveWorkloadId
  };
}
