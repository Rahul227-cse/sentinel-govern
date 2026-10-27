import { Incident } from '../models/Incident.js';
import { Model } from '../models/Model.js';
import { ModelVersion } from '../models/ModelVersion.js';
import { Notification } from '../models/Notification.js';
import { recordAuditEvent } from './auditEngine.js';

export async function createDriftIncident({
  modelId,
  versionId,
  psi = null,
  features = [],
  telemetryId = null,
  actor = 'Telemetry Monitoring Daemon',
  source = 'PSI',
  driftedColumns = [],
  recordsAnalyzed = null,
  workloadId = 'generic-model'
}) {
  const actorString = typeof actor === 'object' && actor !== null
    ? (actor.name || actor.email || 'ML_LEAD')
    : String(actor || 'SYSTEM');

  const model = await Model.findById(modelId);
  const version = await ModelVersion.findById(versionId);

  if (!model || !version) {
    throw new Error('Model or Version not found for incident generation');
  }

  // Find the previous genuinely approved version for rollback recommendation
  const previousApprovedVersion = await ModelVersion.findOne({
    modelId: model._id,
    _id: { $ne: version._id },
    policyStatus: 'PASSED',
    $or: [
      { approvalStatus: 'APPROVED' },
      { deploymentStatus: { $in: ['IN_PRODUCTION', 'RETIRED'] } },
      { lifecycleStatus: { $in: ['APPROVED', 'RETIRED', 'DEPRECATED'] } }
    ]
  }).sort({ createdAt: -1 });

  // Check if an active incident already exists for this model & version to prevent duplicate open incidents
  const existingActiveIncident = await Incident.findOne({
    modelId: model._id,
    versionId: version._id,
    status: { $in: ['OPEN', 'INVESTIGATING'] }
  }).sort({ createdAt: -1 });

  const isEvidently = source === 'EVIDENTLY' || (psi === null && driftedColumns.length > 0);

  if (existingActiveIncident) {
    existingActiveIncident.telemetryRef = telemetryId;
    if (isEvidently) {
      existingActiveIncident.metricsSnapshot = {
        source: 'EVIDENTLY',
        driftedColumns,
        features,
        recordsAnalyzed,
        telemetryId: telemetryId ? String(telemetryId) : null,
        lastObservedAt: new Date()
      };
      const targetOrPredField = version.apiConfig?.responseMapping?.predictionField || version.referenceDataset?.targetColumn || 'prediction';
      const hasCoreFieldDrift = driftedColumns.includes(targetOrPredField) || driftedColumns.includes('fraud_risk_score');
      if (hasCoreFieldDrift || driftedColumns.length >= 3) {
        existingActiveIncident.severity = 'HIGH';
      }
      const updateNote = `\n[Telemetry Re-Confirmed ${new Date().toISOString()}]: Ongoing statistical drift observed across columns: ${driftedColumns.join(', ')}.`;
      existingActiveIncident.mitigationNotes = (existingActiveIncident.mitigationNotes || '') + updateNote;
    } else {
      existingActiveIncident.metricsSnapshot = {
        psi,
        features,
        telemetryId: telemetryId ? String(telemetryId) : null,
        lastObservedAt: new Date()
      };
      if (psi > 0.30) {
        existingActiveIncident.severity = 'HIGH';
      }
      const updateNote = `\n[Telemetry Re-Confirmed ${new Date().toISOString()}]: Ongoing distribution drift observed (PSI = ${psi}).`;
      existingActiveIncident.mitigationNotes = (existingActiveIncident.mitigationNotes || '') + updateNote;
    }

    if (previousApprovedVersion) {
      existingActiveIncident.recommendedAction = 'ROLLBACK';
      existingActiveIncident.recommendedRollbackVersionId = previousApprovedVersion._id;
    }
    await existingActiveIncident.save();

    await recordAuditEvent({
      actor: actorString,
      role: 'SYSTEM',
      action: 'INCIDENT_UPDATED',
      entityType: 'Incident',
      entityId: existingActiveIncident._id,
      payload: {
        modelId: String(model._id),
        modelName: model.name,
        versionId: String(version._id),
        version: version.version,
        incidentId: String(existingActiveIncident._id),
        incidentNumber: existingActiveIncident.incidentNumber,
        monitoringSource: isEvidently ? 'EVIDENTLY' : 'SIMULATION',
        ...(isEvidently ? { driftedColumns } : { psi }),
        event: 'RECURRING_DRIFT_TELEMETRY_LINKED'
      }
    });

    return existingActiveIncident;
  }

  const count = await Incident.countDocuments();
  const incidentNumber = `INC-${String(count + 1).padStart(3, '0')}`;

  const title = isEvidently
    ? `Statistically Significant Distribution Drift Detected in ${model.name} (${version.version})`
    : `Significant Distribution Drift Detected in ${model.name} (${version.version})`;

  const description = isEvidently
    ? `Production runtime monitoring detected statistically significant distribution drift in features (${driftedColumns.join(', ')}). Statistical hypothesis testing rejected baseline distribution stability at alpha = 0.05.`
    : `Production telemetry detected Population Stability Index (PSI) = ${psi}, exceeding the governance threshold of 0.25. Substantial feature shift observed.`;

  const targetOrPredField = version.apiConfig?.responseMapping?.predictionField || version.referenceDataset?.targetColumn || 'prediction';
  const hasCoreFieldDrift = driftedColumns.includes(targetOrPredField) || driftedColumns.includes('fraud_risk_score');
  const severity = isEvidently
    ? ((hasCoreFieldDrift || driftedColumns.length >= 3) ? 'HIGH' : 'MEDIUM')
    : (psi > 0.30 ? 'HIGH' : 'MEDIUM');

  const metricsSnapshot = isEvidently
    ? {
        source: 'EVIDENTLY',
        driftedColumns,
        features,
        recordsAnalyzed,
        telemetryId: telemetryId ? String(telemetryId) : null
      }
    : {
        psi,
        features,
        telemetryId: telemetryId ? String(telemetryId) : null
      };

  const incident = await Incident.create({
    incidentNumber,
    modelId: model._id,
    versionId: version._id,
    type: 'DATA_DRIFT',
    workloadId: workloadId || model.type?.toLowerCase() || 'generic-model',
    title,
    description,
    severity,
    status: 'OPEN',
    telemetryRef: telemetryId,
    metricsSnapshot,
    recommendedAction: previousApprovedVersion ? 'ROLLBACK' : 'RETRAIN_MODEL',
    recommendedRollbackVersionId: previousApprovedVersion ? previousApprovedVersion._id : null,
    mitigationNotes: previousApprovedVersion
      ? `Automated safety trigger: Model performance at risk of silent degradation. Recommended immediate rollback to approved baseline version ${previousApprovedVersion.version}.`
      : 'Automated safety trigger: No prior approved version found. Recommend retraining model.'
  });

  await recordAuditEvent({
    actor: actorString,
    role: 'SYSTEM',
    action: 'INCIDENT_CREATED',
    entityType: 'Incident',
    entityId: incident._id,
    payload: {
      modelId: String(model._id),
      modelName: model.name,
      versionId: String(version._id),
      version: version.version,
      incidentId: String(incident._id),
      incidentNumber: incident.incidentNumber,
      monitoringSource: isEvidently ? 'EVIDENTLY' : 'SIMULATION',
      ...(isEvidently ? { driftedColumns } : { psi }),
      recommendedRollbackVersion: previousApprovedVersion?.version || 'None'
    }
  });

  // Automatically dispatch persisted notifications to ML Lead and Governance Officer
  try {
    const { dispatchNotification } = await import('./notificationService.js');
    const affectedFeaturesStr = isEvidently && driftedColumns.length > 0
      ? driftedColumns.join(', ')
      : 'runtime feature distributions';

    await dispatchNotification({
      recipientRole: 'ML_LEAD',
      title: `[Action Required] Drift Incident ${incident.incidentNumber} Detected`,
      message: `Model "${model.name}" (${version.version}) detected statistically significant distribution drift in ${affectedFeaturesStr}. Recommended action: ${incident.recommendedAction}.`,
      type: 'DRIFT_INCIDENT',
      severity: incident.severity === 'HIGH' ? 'CRITICAL' : 'WARNING',
      targetUrl: '/app/incidents',
      modelId: model._id,
      versionId: version._id,
      incidentId: incident._id,
      idempotencyKey: `drift_incident_ml_${incident.incidentNumber}`,
      actor: 'Automated Runtime Drift Detector'
    });

    await dispatchNotification({
      recipientRole: 'GOVERNANCE_OFFICER',
      title: `Drift Incident ${incident.incidentNumber} Opened`,
      message: `Statistical distribution drift detected for "${model.name}" (${version.version}). Incident ${incident.incidentNumber} has been logged.`,
      type: 'DRIFT_INCIDENT',
      severity: incident.severity === 'HIGH' ? 'CRITICAL' : 'WARNING',
      targetUrl: '/app/incidents',
      modelId: model._id,
      versionId: version._id,
      incidentId: incident._id,
      idempotencyKey: `drift_incident_gov_${incident.incidentNumber}`,
      actor: 'Automated Runtime Drift Detector'
    });
  } catch (notifErr) {
    console.warn('[Notification] Failed to persist drift notification:', notifErr.message);
  }

  return incident;
}

export async function executeRollback({
  incidentId = null,
  modelId,
  targetVersionId,
  actor = 'ML Lead',
  role = 'ML_LEAD',
  rationale = 'Governance Incident Remediation'
}) {
  const model = await Model.findById(modelId);
  if (!model) {
    throw new Error('Model not found');
  }

  const targetVersion = await ModelVersion.findById(targetVersionId);
  if (!targetVersion) {
    throw new Error(`Target rollback version ${targetVersionId} not found`);
  }

  // Safety check: target version must belong to this model
  if (String(targetVersion.modelId) !== String(model._id)) {
    throw new Error('Target version does not belong to this model');
  }

  // Strict Governance Gate: Target version MUST have passed policies and have been approved or previously verified baseline
  const isApprovedOrProductionBaseline =
    targetVersion.policyStatus === 'PASSED' &&
    (
      targetVersion.approvalStatus === 'APPROVED' ||
      targetVersion.deploymentStatus === 'IN_PRODUCTION' ||
      targetVersion.deploymentStatus === 'RETIRED' ||
      targetVersion.lifecycleStatus === 'APPROVED' ||
      targetVersion.lifecycleStatus === 'RETIRED' ||
      targetVersion.lifecycleStatus === 'DEPRECATED'
    );

  if (!isApprovedOrProductionBaseline) {
    throw new Error(
      `ROLLBACK GATE BLOCKED: Target version ${targetVersion.version} cannot be deployed via rollback because it failed governance policies (Policy Status: ${targetVersion.policyStatus}, Approval Status: ${targetVersion.approvalStatus}, Deployment Status: ${targetVersion.deploymentStatus}). Rollback is only permitted to genuinely approved versions.`
    );
  }

  const currentVersionId = model.currentProductionVersionId;
  const currentVersion = currentVersionId ? await ModelVersion.findById(currentVersionId) : null;

  await recordAuditEvent({
    actor,
    role,
    action: 'ROLLBACK_STARTED',
    entityType: 'Model',
    entityId: model._id,
    payload: {
      modelId: String(model._id),
      modelName: model.name,
      fromVersion: currentVersion ? currentVersion.version : 'None',
      fromVersionId: currentVersion ? String(currentVersion._id) : null,
      toVersion: targetVersion.version,
      targetVersionId: String(targetVersion._id),
      rationale
    }
  });


  // Retire or mark current drifting version
  if (currentVersion) {
    currentVersion.lifecycleStatus = 'RETIRED';
    currentVersion.deploymentStatus = 'ROLLED_BACK';
    currentVersion.rolledBackAt = new Date();
    await currentVersion.save();
  }

  // Restore target version to IN_PRODUCTION
  targetVersion.lifecycleStatus = 'IN_PRODUCTION';
  targetVersion.deploymentStatus = 'IN_PRODUCTION';
  targetVersion.deployedAt = new Date();
  await targetVersion.save();

  // Point model to restored version
  model.currentProductionVersionId = targetVersion._id;
  model.lifecycleStatus = 'IN_PRODUCTION';
  await model.save();

  // Manage independent per-version monitoring streams:
  // Pause the stream of the rolled-back version and resume the target version stream.
  try {
    const { Monitoring } = await import('../models/Monitoring.js');
    if (currentVersion) {
      await Monitoring.updateMany(
        { modelId: model._id, versionId: currentVersion._id },
        { $set: { monitoringStatus: 'PAUSED' } }
      );
    }
    const targetMon = await Monitoring.findOne({ modelId: model._id, versionId: targetVersion._id });
    if (targetMon) {
      targetMon.monitoringStatus = 'ACTIVE';
      await targetMon.save();
    } else {
      await Monitoring.create({
        modelId: model._id,
        versionId: targetVersion._id,
        primaryOwner: actor,
        monitoringStatus: 'ACTIVE',
        healthStatus: 'HEALTHY'
      });
    }
  } catch (monErr) {
    console.warn('[Rollback] Could not update Monitoring records status:', monErr.message);
  }

  // If tied to an incident, mark incident mitigated
  if (incidentId) {
    const incident = await Incident.findById(incidentId);
    if (incident) {
      incident.status = 'MITIGATED';
      incident.mitigationNotes += ` [Mitigated]: Rolled back to ${targetVersion.version} by ${actor} on ${new Date().toISOString()}.`;
      incident.resolvedAt = new Date();
      incident.resolvedBy = actor;
      await incident.save();
    }
  }

  await recordAuditEvent({
    actor,
    role,
    action: 'ROLLBACK_COMPLETED',
    entityType: 'Model',
    entityId: model._id,
    payload: {
      modelId: String(model._id),
      modelName: model.name,
      versionId: String(targetVersion._id),
      activeProductionVersion: targetVersion.version,
      remediatedIncidentId: incidentId ? String(incidentId) : null
    }
  });

  // Dispatch emergency rollback notifications
  try {
    const { dispatchNotification } = await import('./notificationService.js');
    await dispatchNotification({
      recipientRole: 'ML_LEAD',
      title: `Emergency rollback executed: ${model.name}`,
      message: `Model "${model.name}" rolled back from ${currentVersion ? currentVersion.version : 'None'} to baseline ${targetVersion.version} by ${actor}. Rationale: ${rationale}.`,
      type: 'ROLLBACK_TRIGGERED',
      severity: 'CRITICAL',
      targetUrl: '/app/incidents',
      modelId: model._id,
      versionId: targetVersion._id,
      incidentId,
      idempotencyKey: `rollback_ml_${model._id}_${Date.now()}`,
      actor
    });
    await dispatchNotification({
      recipientRole: 'GOVERNANCE_OFFICER',
      title: `Emergency rollback executed: ${model.name}`,
      message: `Model "${model.name}" rolled back from ${currentVersion ? currentVersion.version : 'None'} to baseline ${targetVersion.version} by ${actor}.`,
      type: 'ROLLBACK_TRIGGERED',
      severity: 'CRITICAL',
      targetUrl: '/app/incidents',
      modelId: model._id,
      versionId: targetVersion._id,
      incidentId,
      idempotencyKey: `rollback_gov_${model._id}_${Date.now()}`,
      actor
    });
  } catch (notifErr) {
    console.warn('[Notification] Rollback notification warning:', notifErr.message);
  }


  return {
    success: true,
    modelName: model.name,
    activeVersion: targetVersion.version,
    previousVersion: currentVersion ? currentVersion.version : null
  };
}
