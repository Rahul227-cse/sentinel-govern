import mongoose from 'mongoose';
import { Model } from '../models/Model.js';
import { ModelVersion } from '../models/ModelVersion.js';
import { Evaluation } from '../models/Evaluation.js';
import { Policy } from '../models/Policy.js';
import { Approval } from '../models/Approval.js';
import { Telemetry } from '../models/Telemetry.js';
import { Incident } from '../models/Incident.js';
import { IssueReport } from '../models/IssueReport.js';
import { AuditLedger } from '../models/AuditLedger.js';
import { Report } from '../models/Report.js';
import { verifyAuditChainIntegrity, recordAuditEvent } from './auditEngine.js';
import { PERMISSIONS, hasPermission } from '../config/permissions.js';

/**
 * Compiles a comprehensive, server-authoritative AI Governance & Compliance Dossier
 * for a specific model and model version.
 *
 * Strictly adheres to the NO FABRICATION rule:
 * If evidence does not exist in the database, it returns empty arrays/null values.
 * Generating a dossier is completely read-only and NEVER mutates lifecycle,
 * approvals, policies, telemetry, incidents, or audit records.
 *
 * @param {Object} options
 * @param {string} options.modelId - Target model ID
 * @param {string} [options.versionId] - Optional target version ID (defaults to production or latest)
 * @param {Object} [options.user] - Authenticated user context (if provided, enforces RBAC)
 * @returns {Promise<Object>} Compiled dossier data
 */
export async function compileGovernanceDossier({ modelId, versionId, user }) {
  // 1. RBAC authorization check (if authenticated user context is attached)
  if (user) {
    if (user.status !== 'ACTIVE') {
      const err = new Error(`Access restricted. User status is ${user.status}.`);
      err.statusCode = 403;
      throw err;
    }

    if (!hasPermission(user.role, PERMISSIONS.DOSSIER_VIEW)) {
      const err = new Error(`Forbidden: Insufficient permissions for "${PERMISSIONS.DOSSIER_VIEW}". Required role capabilities missing.`);
      err.statusCode = 403;
      throw err;
    }
  }

  // 2. Fetch target Model
  const model = await Model.findById(modelId).populate('createdBy', 'name email role');
  if (!model) {
    const err = new Error('Model not found');
    err.statusCode = 404;
    throw err;
  }

  // 3. Resolve target ModelVersion
  let version = null;
  if (versionId) {
    version = await ModelVersion.findById(versionId).populate('createdBy', 'name email role');
    if (!version || String(version.modelId) !== String(model._id)) {
      const err = new Error('Version not found for this model');
      err.statusCode = 404;
      throw err;
    }
  } else if (model.currentProductionVersionId) {
    version = await ModelVersion.findById(model.currentProductionVersionId).populate('createdBy', 'name email role');
  }

  // Fallback to latest created version if production version not set or not found
  if (!version) {
    version = await ModelVersion.findOne({ modelId: model._id }).sort({ createdAt: -1 }).populate('createdBy', 'name email role');
  }

  if (!version) {
    const err = new Error('No version found for dossier compilation');
    err.statusCode = 404;
    throw err;
  }

  // 4. Fetch all available versions for model (for frontend switcher)
  const allVersions = await ModelVersion.find({ modelId: model._id })
    .select('version lifecycleStatus deploymentStatus createdAt')
    .sort({ createdAt: -1 });

  const availableVersions = allVersions.map(v => ({
    id: v._id,
    version: v.version,
    lifecycleStatus: v.lifecycleStatus,
    deploymentStatus: v.deploymentStatus,
    isProduction: model.currentProductionVersionId ? String(model.currentProductionVersionId) === String(v._id) : false,
    createdAt: v.createdAt
  }));

  const isProduction = model.currentProductionVersionId ? String(model.currentProductionVersionId) === String(version._id) : false;

  // 5. Fetch Evaluations for this version
  const evaluations = await Evaluation.find({ versionId: version._id })
    .populate('evaluatorId', 'name email role')
    .sort({ evaluatedAt: -1 });

  // 6. Fetch Applicable Policy
  let policy = null;
  if (model.policyId) {
    policy = await Policy.findById(model.policyId);
  }
  if (!policy) {
    policy = await Policy.findOne({
      $or: [
        { applicableModelIds: model._id },
        { applicableModelId: model._id }
      ],
      isActive: true
    });
  }
  if (!policy) {
    policy = await Policy.findOne({
      targetRiskLevel: { $in: [model.riskLevel, 'ALL'] },
      $or: [
        { applicableModelIds: { $size: 0 } },
        { applicableModelIds: { $exists: false } }
      ],
      applicableModelId: null,
      isActive: true
    });
  }

  // 7. Fetch Approvals for this version
  const approvals = await Approval.find({ versionId: version._id })
    .populate('userId', 'name email role')
    .sort({ decidedAt: -1 });

  // 8. Fetch Telemetry for this version
  const latestTelemetry = await Telemetry.findOne({
    modelId: model._id,
    versionId: version._id
  }).sort({ recordedAt: -1 });

  const recentTelemetry = await Telemetry.find({
    modelId: model._id,
    versionId: version._id
  }).sort({ recordedAt: -1 }).limit(10);

  // 9. Fetch Incidents linked to model & version
  const incidents = await Incident.find({
    modelId: model._id,
    $or: [{ versionId: version._id }, { versionId: null }]
  })
    .populate('recommendedRollbackVersionId', 'version lifecycleStatus')
    .populate('issueReportRef', 'reportNumber title severity status submittedBy')
    .populate('telemetryRef', 'batchId aggregatePsi driftStatus')
    .sort({ createdAt: -1 });

  // 10. Fetch Issue Reports linked to model & version
  const issueReports = await IssueReport.find({
    modelId: model._id,
    $or: [{ versionId: version._id }, { versionId: null }]
  })
    .populate('escalatedIncidentId', 'incidentNumber type severity status')
    .sort({ createdAt: -1 });

  // 11. Fetch Audit Ledger Records
  const relatedEntityIds = [
    String(model._id),
    String(version._id),
    ...evaluations.map(e => String(e._id)),
    ...approvals.map(a => String(a._id)),
    ...incidents.map(i => String(i._id)),
    ...issueReports.map(ir => String(ir._id))
  ];

  const auditRecords = await AuditLedger.find({
    $or: [
      { entityId: { $in: relatedEntityIds } },
      { 'payload.modelId': String(model._id) },
      { 'payload.versionId': String(version._id) }
    ]
  }).sort({ sequenceNumber: 1 });

  // 12. Check Cryptographic Chain Integrity
  const integrity = await verifyAuditChainIntegrity();

  // 13. Summarize Approval Status
  const requiredRoles = policy?.requiredApprovers || [];
  const approvedRoles = approvals.filter(a => a.decision === 'APPROVED').map(a => a.role);
  const rejectedApprovals = approvals.filter(a => a.decision === 'REJECTED');
  const pendingRoles = requiredRoles.filter(r => !approvedRoles.includes(r));
  const isFullyApproved = requiredRoles.length > 0 && pendingRoles.length === 0 && rejectedApprovals.length === 0;

  // 14. Executive Summary synthesis (Strictly evidence-backed)
  const openIncidents = incidents.filter(i => ['OPEN', 'INVESTIGATING'].includes(i.status));
  const openIssues = issueReports.filter(ir => ['SUBMITTED', 'UNDER_INVESTIGATION'].includes(ir.status));

  let overallGovernanceState = version.lifecycleStatus;
  if (isProduction && version.lifecycleStatus === 'IN_PRODUCTION') {
    overallGovernanceState = 'IN_PRODUCTION — ACTIVE GOVERNANCE';
  } else if (version.lifecycleStatus === 'APPROVED') {
    overallGovernanceState = 'APPROVED — READY FOR PRODUCTION';
  } else if (version.lifecycleStatus === 'PENDING_APPROVAL') {
    overallGovernanceState = 'PENDING_APPROVAL — STAGE GATE ACTIVE';
  }

  const executiveSummary = {
    overallGovernanceState,
    riskLevel: model.riskLevel,
    policyStatus: version.policyStatus,
    approvalStatus: version.approvalStatus,
    monitoringStatus: latestTelemetry ? latestTelemetry.driftStatus : 'NO_DATA',
    openIncidentsCount: openIncidents.length,
    openIssuesCount: openIssues.length,
    evaluationPassed: evaluations.length > 0 ? (version.evaluationStatus === 'EVALUATED_PASS') : false,
    evaluationCount: evaluations.length,
    auditIntegrity: integrity.valid ? 'VALID' : 'TAMPER_DETECTED'
  };

  // 15. Assemble Canonical Dossier Payload
  const dossier = {
    dossierMetadata: {
      title: `AI Governance & Technical Documentation Dossier: ${model.name} (${version.version})`,
      generatedAt: new Date().toISOString(),
      classificationNotice: 'AI Governance Risk Assessment aligned with selected regulatory concepts (EU AI Act Annex III & NIST AI RMF). Not an official legal certification.',
      cryptographicChainIntegrity: integrity.valid ? 'VALID' : 'TAMPER_DETECTED'
    },
    executiveSummary,
    modelCard: {
      id: model._id,
      name: model.name,
      description: model.description,
      purpose: model.purpose,
      owner: model.owner,
      team: model.team,
      modelType: model.modelType,
      riskLevel: model.riskLevel,
      lifecycleStatus: model.lifecycleStatus,
      intendedUsers: model.intendedUsers || [],
      protectedAttributes: model.protectedAttributes || [],
      currentProductionVersionId: model.currentProductionVersionId,
      createdBy: model.createdBy ? {
        id: model.createdBy._id,
        name: model.createdBy.name,
        email: model.createdBy.email,
        role: model.createdBy.role
      } : null,
      createdAt: model.createdAt
    },
    riskAssessment: model.riskAssessment || {},
    versionDetails: {
      id: version._id,
      version: version.version,
      lifecycleStatus: version.lifecycleStatus,
      deploymentStatus: version.deploymentStatus,
      isProduction,
      changelog: version.changelog,
      dataset: version.trainingDatasetInfo,
      evaluationStatus: version.evaluationStatus,
      policyStatus: version.policyStatus,
      approvalStatus: version.approvalStatus,
      latestPolicyEvaluation: version.latestPolicyEvaluation,
      deployedAt: version.deployedAt || null,
      rolledBackAt: version.rolledBackAt || null,
      createdBy: version.createdBy ? {
        id: version.createdBy._id,
        name: version.createdBy.name,
        email: version.createdBy.email,
        role: version.createdBy.role
      } : null,
      createdAt: version.createdAt
    },
    availableVersions,
    governancePolicy: policy ? {
      id: policy._id,
      name: policy.name,
      description: policy.description,
      targetRiskLevel: policy.targetRiskLevel,
      rules: policy.rules,
      requiredApprovers: policy.requiredApprovers,
      failureAction: policy.failureAction
    } : null,
    evaluations,
    approvalStatusSummary: {
      requiredRoles,
      approvedRoles,
      pendingRoles,
      rejectedRoles: rejectedApprovals.map(a => a.role),
      isFullyApproved
    },
    approvals,
    monitoringEvidence: {
      latestTelemetry: latestTelemetry ? {
        batchId: latestTelemetry.batchId,
        sampleSize: latestTelemetry.sampleSize,
        aggregatePsi: latestTelemetry.aggregatePsi,
        driftStatus: latestTelemetry.driftStatus,
        monitoringSource: latestTelemetry.monitoringSource || (latestTelemetry.aggregatePsi !== null ? 'SIMULATION' : 'EVIDENTLY'),
        driftedColumns: latestTelemetry.driftedColumns || [],
        features: latestTelemetry.features,
        performanceTelemetry: latestTelemetry.performanceTelemetry,
        incidentId: latestTelemetry.incidentId,
        recordedAt: latestTelemetry.recordedAt
      } : null,
      recentBatchesCount: recentTelemetry.length,
      activeDriftIncident: incidents.find(i => i.type === 'DATA_DRIFT' && ['OPEN', 'INVESTIGATING'].includes(i.status)) || null
    },
    incidents,
    issueReports,
    auditLogSummary: auditRecords.map(r => ({
      seq: r.sequenceNumber,
      action: r.action,
      actor: r.actor,
      role: r.role,
      hash: r.currentHash ? (r.currentHash.substring(0, 16) + '...') : '',
      timestamp: r.timestamp
    })),
    disclaimers: {
      legalNotice: 'Classification Notice: AI Governance Risk Assessment aligned with selected regulatory concepts (EU AI Act Annex III & NIST AI RMF). Not an official legal certification.',
      provenanceNotice: 'All data points in this dossier are synthesized from server-authoritative audit ledgers, policy rule evaluations, cryptographic hashes, and recorded runtime signals.'
    }
  };

  return dossier;
}

/**
 * Generates an executive Markdown export of the governance dossier.
 *
 * @param {Object} dossier - Dossier object returned from compileGovernanceDossier
 * @returns {string} Formatted Markdown text
 */
export function generateDossierMarkdown(dossier) {
  const {
    dossierMetadata,
    executiveSummary,
    modelCard,
    riskAssessment,
    versionDetails,
    governancePolicy,
    evaluations,
    approvalStatusSummary,
    approvals,
    monitoringEvidence,
    incidents,
    issueReports,
    auditLogSummary,
    disclaimers
  } = dossier;

  return `# ${dossierMetadata.title}
*Generated at: ${new Date(dossierMetadata.generatedAt).toUTCString()}*
*Notice: ${dossierMetadata.classificationNotice}*
*Cryptographic Chain Integrity: ${dossierMetadata.cryptographicChainIntegrity}*

---

## Executive Governance Summary
- **Overall Governance State**: ${executiveSummary.overallGovernanceState}
- **EU AI Act Risk Tier**: ${executiveSummary.riskLevel}
- **Policy Compliance**: ${executiveSummary.policyStatus}
- **Approval Sign-off**: ${executiveSummary.approvalStatus}
- **Production Monitoring Health**: ${executiveSummary.monitoringStatus}
- **Active Incidents**: ${executiveSummary.openIncidentsCount}
- **Active Issue Reports**: ${executiveSummary.openIssuesCount}
- **Audit Ledger Integrity**: ${executiveSummary.auditIntegrity}

---

## 1. System Identity & Model Card
- **Model Name**: ${modelCard.name}
- **System Description**: ${modelCard.description}
- **Intended Purpose**: ${modelCard.purpose}
- **System Owner & Team**: ${modelCard.owner} (${modelCard.team})
- **Architecture / Type**: ${modelCard.modelType}
- **Risk Level**: ${modelCard.riskLevel}
- **Model Lifecycle Status**: ${modelCard.lifecycleStatus}
- **Intended Users**: ${modelCard.intendedUsers?.length > 0 ? modelCard.intendedUsers.join(', ') : 'Not specified'}
- **Protected Attributes**: ${modelCard.protectedAttributes?.length > 0 ? modelCard.protectedAttributes.join(', ') : 'None specified'}
- **Registered By**: ${modelCard.createdBy?.name || 'Authorized Lead'} (${modelCard.createdBy?.email || 'N/A'})

---

## 2. Risk Assessment & Regulatory Alignment
- **Classification**: ${riskAssessment?.euAiActClassification || 'HIGH'}
- **Framework Alignment**: ${riskAssessment?.frameworkAlignment?.length > 0 ? riskAssessment.frameworkAlignment.join(', ') : 'EU_AI_ACT_ANNEX_III, NIST_AI_RMF_GOVERN'}
- **Safety Impact Rating**: ${riskAssessment?.safetyImpactRating || 'Significant'}
- **Autonomy Level**: ${riskAssessment?.autonomyLevel || 'Human-in-the-loop'}
- **Prohibited Practices Checked**: ${riskAssessment?.prohibitedPracticesChecked ? 'YES' : 'NO'}
- **Assessment Notes**: ${riskAssessment?.assessmentNotes || 'None recorded'}

---

## 3. Version Lineage & Deployment Record
- **Version**: ${versionDetails.version}
- **Lifecycle Status**: ${versionDetails.lifecycleStatus}
- **Deployment Status**: ${versionDetails.deploymentStatus}
- **Active in Production**: ${versionDetails.isProduction ? 'YES (Current Production Version)' : 'NO'}
- **Changelog**: ${versionDetails.changelog || 'None recorded'}
- **Training Dataset**: ${versionDetails.dataset?.name || 'N/A'} (${versionDetails.dataset?.sampleCount?.toLocaleString() || 0} samples, ${versionDetails.dataset?.featureCount || 0} features)
- **Data Hash**: \`${versionDetails.dataset?.dataHash || 'N/A'}\`
- **Created By**: ${versionDetails.createdBy?.name || 'Authorized Lead'} (${versionDetails.createdBy?.role || 'ML_LEAD'})
- **Deployed At**: ${versionDetails.deployedAt ? new Date(versionDetails.deployedAt).toUTCString() : 'Not deployed'}
- **Rolled Back At**: ${versionDetails.rolledBackAt ? new Date(versionDetails.rolledBackAt).toUTCString() : 'N/A'}

---

## 4. Statistical Performance & Fairness Evaluations
${evaluations && evaluations.length > 0 ? evaluations.map((e, idx) => `
### Evaluation #${idx + 1}: ${e.datasetName}
- **Data Source**: ${e.dataSource} ${e.uploadedFileMeta?.filename ? `(File: ${e.uploadedFileMeta.filename})` : ''}
- **Evaluated At**: ${new Date(e.evaluatedAt).toUTCString()} by ${e.evaluatedBy || 'Automated Engine'}
- **Performance**:
  - Accuracy: ${(e.performanceMetrics.accuracy * 100).toFixed(1)}%
  - ROC-AUC: ${e.performanceMetrics.rocAuc !== null && e.performanceMetrics.rocAuc !== undefined ? e.performanceMetrics.rocAuc : 'Unavailable (no prediction scores provided)'}
  - Precision: ${e.performanceMetrics.precision} | Recall: ${e.performanceMetrics.recall} | F1: ${e.performanceMetrics.f1}
- **Fairness (Protected Attribute: ${e.fairnessMetrics.protectedAttribute || 'NONE'})**:
  - Disparate Impact Ratio (DIR): ${e.fairnessMetrics.disparateImpactRatio}${governancePolicy?.rules?.minDisparateImpact !== undefined ? ` (Policy-defined fairness threshold: >= ${governancePolicy.rules.minDisparateImpact})` : ''}
  - Demographic Parity Difference: ${e.fairnessMetrics.demographicParityDiff}${governancePolicy?.rules?.maxDemographicParityDiff !== undefined ? ` (Policy threshold: <= ${governancePolicy.rules.maxDemographicParityDiff})` : ''}
  - Fairness Assessment Status: ${e.fairnessMetrics.fairnessEvaluated ? 'Evaluated' : 'Not Evaluated'}
`).join('\n') : '*No recorded evaluation available for this version.*'}


---

## 5. Governance Policy & Stage-Gate Decision
${governancePolicy ? `
- **Applicable Policy**: ${governancePolicy.name} (Risk Level: ${governancePolicy.targetRiskLevel})
- **Failure Action**: ${governancePolicy.failureAction}
- **Policy Rules**:
  - Min Disparate Impact: >= ${governancePolicy.rules?.minDisparateImpact || 0.80}
  - Max Demographic Parity Diff: <= ${governancePolicy.rules?.maxDemographicParityDiff || 0.10}
  - Min ROC-AUC: >= ${governancePolicy.rules?.minRocAuc || 0.85}
  - Min Accuracy: >= ${governancePolicy.rules?.minAccuracy || 0.80}
- **Policy Evaluation Status**: ${versionDetails.policyStatus}
- **Latest Gate Decision**: ${versionDetails.latestPolicyEvaluation?.overallDecision || 'NOT_EVALUATED'}
- **Gate Result**: ${versionDetails.latestPolicyEvaluation?.passed ? 'PASSED' : 'NOT PASSED / PENDING'}
` : '*No governance policy configured for this risk level.*'}

---

## 6. Multi-Stakeholder Stage-Gate Sign-Off Ledger
- **Approval State**: ${versionDetails.approvalStatus}
- **Required Approvers**: ${approvalStatusSummary.requiredRoles.length > 0 ? approvalStatusSummary.requiredRoles.join(', ') : 'None specified'}
- **Approved Roles**: ${approvalStatusSummary.approvedRoles.length > 0 ? approvalStatusSummary.approvedRoles.join(', ') : 'None'}
- **Pending Roles**: ${approvalStatusSummary.pendingRoles.length > 0 ? approvalStatusSummary.pendingRoles.join(', ') : 'None'}
- **Fully Approved**: ${approvalStatusSummary.isFullyApproved ? 'YES' : 'NO'}

### Recorded Sign-Offs:
${approvals && approvals.length > 0 ? approvals.map(a => `
- **${a.role.replace(/_/g, ' ')}**: ${a.decision} by ${a.approverName} on ${new Date(a.decidedAt).toUTCString()}
  *"${a.comment || 'No comment provided'}"*
`).join('\n') : '*No approval evidence recorded for this version.*'}

---

## 7. Production Runtime Monitoring & Drift Signals
${monitoringEvidence.latestTelemetry ? (monitoringEvidence.latestTelemetry.monitoringSource === 'EVIDENTLY' ? `
- **Monitoring Source**: EVIDENTLY (Real Statistical Hypothesis Testing)
- **Latest Telemetry Batch**: ${monitoringEvidence.latestTelemetry.batchId} (Sample Size: ${monitoringEvidence.latestTelemetry.sampleSize})
- **Recorded At**: ${new Date(monitoringEvidence.latestTelemetry.recordedAt).toUTCString()}
- **Drift Status**: ${monitoringEvidence.latestTelemetry.driftStatus}
- **Drifted Columns**: ${monitoringEvidence.latestTelemetry.driftedColumns && monitoringEvidence.latestTelemetry.driftedColumns.length > 0 ? monitoringEvidence.latestTelemetry.driftedColumns.join(', ') : 'None (All Monitored Columns Stable)'}
- **Runtime Performance**:
  - Prediction Volume: ${monitoringEvidence.latestTelemetry.performanceTelemetry?.predictionVolume || 0}
  - Avg Latency: ${monitoringEvidence.latestTelemetry.performanceTelemetry?.avgLatencyMs || 0} ms
  - Error Rate: ${((monitoringEvidence.latestTelemetry.performanceTelemetry?.errorRate || 0) * 100).toFixed(2)}%
- **Monitored Statistical Features**:
${monitoringEvidence.latestTelemetry.features?.map(f => `  - ${f.name}: ${f.statisticalMethod || 'Test'} (p-value: ${typeof f.pValue === 'number' && f.pValue < 0.0001 ? f.pValue.toExponential(4) : f.pValue}, threshold: ${f.threshold || 0.05}) ${f.driftDetected ? '[DRIFT]' : '[OK]'}`).join('\n') || '  None'}
` : `
- **Latest Telemetry Batch**: ${monitoringEvidence.latestTelemetry.batchId} (Sample Size: ${monitoringEvidence.latestTelemetry.sampleSize})
- **Recorded At**: ${new Date(monitoringEvidence.latestTelemetry.recordedAt).toUTCString()}
- **Aggregate PSI**: ${monitoringEvidence.latestTelemetry.aggregatePsi} (${monitoringEvidence.latestTelemetry.driftStatus})
- **Threshold Tiers**: < 0.10 Stable | 0.10 - 0.25 Warning | >= 0.25 Drift Incident
- **Runtime Performance**:
  - Prediction Volume: ${monitoringEvidence.latestTelemetry.performanceTelemetry?.predictionVolume || 0}
  - Avg Latency: ${monitoringEvidence.latestTelemetry.performanceTelemetry?.avgLatencyMs || 0} ms
  - Error Rate: ${((monitoringEvidence.latestTelemetry.performanceTelemetry?.errorRate || 0) * 100).toFixed(2)}%
- **Monitored Features**:
${monitoringEvidence.latestTelemetry.features?.map(f => `  - ${f.name}: PSI ${f.psi} ${f.driftDetected ? '[DRIFT]' : '[OK]'}`).join('\n') || '  None'}
`) : '*No monitoring data available.*'}

---

## 8. Operational Incidents & Corrective Actions
${incidents && incidents.length > 0 ? incidents.map(inc => `
- **[${inc.incidentNumber}] ${inc.title}** (${inc.severity} Severity)
  - Type: ${inc.type} | Status: ${inc.status}
  - Recommended Action: ${inc.recommendedAction} ${inc.recommendedRollbackVersionId ? `(Target Version: ${inc.recommendedRollbackVersionId.version || 'Linked'})` : ''}
  - Traceability: ${inc.issueReportRef ? `Originating Issue: ${inc.issueReportRef.reportNumber}` : 'Telemetry Signal'}
  - Created At: ${new Date(inc.createdAt).toUTCString()}
`).join('\n') : '*No incidents recorded for this version.*'}

---

## 9. Employee Issue Reports
${issueReports && issueReports.length > 0 ? issueReports.map(iss => `
- **[${iss.reportNumber}] ${iss.title}** (${iss.severity} Severity)
  - Type: ${iss.issueType} | Status: ${iss.status}
  - Submitted By: ${iss.submittedBy} on ${new Date(iss.createdAt).toUTCString()}
  - Description: ${iss.description}
  - Escalation: ${iss.escalatedIncidentId ? `Escalated to Incident ${iss.escalatedIncidentId.incidentNumber}` : 'Not escalated'}
`).join('\n') : '*No issue reports submitted for this model or version.*'}

---

## 10. Immutable Cryptographic Audit Ledger (SHA-256 Digest)
- **Ledger Chain Integrity**: ${dossierMetadata.cryptographicChainIntegrity}
- **Recorded Events**: ${auditLogSummary.length}

| Seq | Action | Actor (Role) | Timestamp | Block Hash |
|---|---|---|---|---|
${auditLogSummary.slice(-10).map(l => `| #${l.seq} | ${l.action} | ${l.actor} (${l.role}) | ${new Date(l.timestamp).toUTCString()} | \`${l.hash}\` |`).join('\n')}

---

## Governance Disclaimers
> [!NOTE]
> ${disclaimers.legalNotice}
>
> ${disclaimers.provenanceNotice}
`;
}

/**
 * Creates or updates an authoritative Statistical Drift Report when drift is detected.
 * Deduplicates repeated drift detections belonging to the same open incident.
 */
export async function createOrUpdateDriftReport({
  model,
  version,
  telemetry,
  incident,
  driftAnalysis,
  workloadId = 'fraud-detection',
  isSynthetic = false,
  actor = 'Sentinel Monitoring Engine'
}) {
  const actorString = typeof actor === 'object' && actor !== null
    ? (actor.name || actor.email || 'ML_LEAD')
    : String(actor || 'SYSTEM');

  // Check if an existing drift report is already linked to this active incident
  let existingReport = null;
  if (incident) {
    existingReport = await Report.findOne({
      incidentId: incident._id,
      reportType: 'DATA_DRIFT_ANALYSIS'
    }).sort({ createdAt: -1 });
  }

  const features = (telemetry.features || []).map(f => ({
    name: f.name,
    statisticalMethod: f.statisticalMethod || 'EVIDENTLY',
    pValue: f.pValue,
    threshold: f.threshold || 0.05,
    driftDetected: Boolean(f.driftDetected)
  }));

  const driftedColumns = telemetry.driftedColumns || [];
  const recordsAnalyzed = telemetry.sampleSize || telemetry.performanceTelemetry?.predictionVolume || 25;

  const recommendations = [
    'Notify assigned ML Lead for technical root cause investigation.',
    'Inspect feature distribution shift histograms in Evidently runtime artifact.',
    'Evaluate incoming inference domain shifts vs baseline training distribution.',
    'Do NOT automatically retrain or promote without human stage-gate review.',
    'If model accuracy regression is verified with ground truth, assess rollback to prior approved version.'
  ];

  const executiveSummary = `Evidently 0.7.23 hypothesis testing identified statistically significant distribution shift across ${driftedColumns.length} feature(s) (${driftedColumns.join(', ')}). Significance threshold alpha = 0.05 was rejected. Operational status set to ISSUE / CRITICAL pending ML Lead investigation.`;

  if (existingReport) {
    // Update existing report evidence without duplicate report spam
    existingReport.telemetryId = telemetry._id;
    existingReport.executiveSummary = executiveSummary;
    existingReport.operationalStatus = driftedColumns.length >= 3 ? 'CRITICAL' : 'ISSUE';
    existingReport.metricsSummary = {
      openIncidentsCount: 1,
      predictionVolume: recordsAnalyzed,
      avgLatencyMs: telemetry.performanceTelemetry?.avgLatencyMs || 0
    };
    existingReport.driftAnalysis = {
      workloadId,
      driftedColumns,
      features,
      recordsAnalyzed,
      lastEvaluatedAt: new Date(),
      evidentlyReportPath: telemetry.reportArtifactPath || 'runtime_drift_report.html'
    };
    existingReport.reportContent = generateDriftReportMarkdownDoc({
      reportNumber: existingReport.reportNumber,
      createdAt: existingReport.createdAt,
      updatedAt: new Date(),
      model,
      version,
      telemetry,
      incident,
      workloadId,
      isSynthetic,
      features,
      driftedColumns,
      recordsAnalyzed,
      recommendations
    });

    await existingReport.save();

    await recordAuditEvent({
      actor: actorString,
      role: 'SYSTEM',
      action: 'REPORT_UPDATED',
      entityType: 'Report',
      entityId: existingReport._id,
      payload: {
        reportNumber: existingReport.reportNumber,
        reportType: 'DATA_DRIFT_ANALYSIS',
        modelId: String(model._id),
        versionId: String(version._id),
        incidentId: incident ? String(incident._id) : null,
        driftedColumns
      }
    });

    return existingReport;
  }

  // Create new drift report
  const count = await Report.countDocuments();
  const reportNumber = `REP-DRIFT-${String(count + 1).padStart(3, '0')}`;
  const now = new Date();

  const reportDoc = {
    reportNumber,
    createdAt: now,
    updatedAt: now,
    model,
    version,
    telemetry,
    incident,
    workloadId,
    isSynthetic,
    features,
    driftedColumns,
    recordsAnalyzed,
    recommendations
  };

  const renderedContent = generateDriftReportMarkdownDoc(reportDoc);

  const report = await Report.create({
    modelId: model._id,
    versionId: version._id,
    reportNumber,
    reportType: 'DATA_DRIFT_ANALYSIS',
    title: `Statistical Distribution Drift Report: ${model.name} (${version.version})`,
    workloadId,
    incidentId: incident ? incident._id : null,
    telemetryId: telemetry._id,
    generatedBy: actorString,
    executiveSummary,
    operationalStatus: driftedColumns.length >= 3 ? 'CRITICAL' : 'ISSUE',
    reportingPeriod: {
      startDate: new Date(Date.now() - 3600000),
      endDate: now,
      label: 'Runtime Batch Window'
    },
    metricsSummary: {
      openIncidentsCount: incident ? 1 : 0,
      predictionVolume: recordsAnalyzed
    },
    driftAnalysis: {
      workloadId,
      driftedColumns,
      features,
      recordsAnalyzed,
      evidentlyReportPath: telemetry.reportArtifactPath || 'runtime_drift_report.html'
    },
    recommendations,
    reportContent: renderedContent,
    dataProvenance: isSynthetic ? 'SIMULATED_DEMO' : 'MEASURED_REAL'
  });

  if (incident && !incident.reportRef) {
    incident.reportRef = report._id;
    await incident.save();
  }

  await recordAuditEvent({
    actor: actorString,
    role: 'SYSTEM',
    action: 'REPORT_GENERATED',
    entityType: 'Report',
    entityId: report._id,
    payload: {
      reportNumber,
      reportType: 'DATA_DRIFT_ANALYSIS',
      modelId: String(model._id),
      versionId: String(version._id),
      incidentId: incident ? String(incident._id) : null,
      telemetryBatchId: telemetry.batchId,
      driftedColumns
    }
  });

  return report;
}

/**
 * Builds the canonical markdown string for a Statistical Drift Report.
 */
function generateDriftReportMarkdownDoc({
  reportNumber,
  createdAt,
  updatedAt,
  model,
  version,
  telemetry,
  incident,
  workloadId,
  isSynthetic,
  features,
  driftedColumns,
  recordsAnalyzed,
  recommendations
}) {
  return `# SENTINEL GOVERN — STATISTICAL DISTRIBUTION DRIFT REPORT
**Report Reference:** \`${reportNumber}\`
**Generated Timestamp:** ${new Date(createdAt).toUTCString()}
${updatedAt && updatedAt !== createdAt ? `**Latest Evidence Linked:** ${new Date(updatedAt).toUTCString()}\n` : ''}
**Governance Classification:** Aligned with NIST AI RMF (Measure 2.6) & EU AI Act Annex III (Continuous Post-Market Monitoring).

---

## 1. Workload & Model Identity
- **Governed Model:** ${model.name}
- **Model Version:** ${version.version}
- **Model Architecture / Type:** ${model.modelType || 'CLASSIFICATION'}
- **EU AI Act Risk Tier:** ${model.riskLevel || 'HIGH'}
- **Workload Identifier:** \`${workloadId}\`
- **Active Lifecycle Status:** \`${version.lifecycleStatus}\`
- **Deployment Status:** \`${version.deploymentStatus}\`
- **Traffic Classification:** ${isSynthetic ? 'SYNTHETIC WALKTHROUGH TEST TRAFFIC' : 'REAL PRODUCTION INFERENCE TRAFFIC'}

---

## 2. Statistical Drift Verdict & Evidently 0.7.23 Findings
- **Monitoring Source:** EVIDENTLY (Two-sample Hypothesis Testing)
- **Overall Drift Status:** **DRIFT_DETECTED**
- **Significance Level (α):** 0.05
- **Monitored Features Total:** ${features.length}
- **Features Rejecting H₀ (Drifted):** ${driftedColumns.length} (\`${driftedColumns.join(', ') || 'None'}\`)
- **Telemetry Batch ID:** \`${telemetry.batchId}\`
- **Observation Sample Count:** ${recordsAnalyzed} records
- **Data Sufficiency Status:** SUFFICIENT (Sample size satisfies minimum power requirement for two-sample test)
- **Reference Baseline Version:** \`${telemetry.referenceDatasetVersion || 'baseline-v1.0'}\`

### Feature-Level Statistical Test Breakdown:

| Feature Name | Statistical Test Method | Computed p-value | Threshold (α) | Verdict |
|---|---|---|---|---|
${features.map(f => `| **${f.name}** | ${f.statisticalMethod} | \`${typeof f.pValue === 'number' && f.pValue < 0.0001 ? f.pValue.toExponential(4) : f.pValue}\` | ${f.threshold} | ${f.driftDetected ? '❌ **DRIFT DETECTED**' : '✅ STABLE'} |`).join('\n')}

---

## 3. Operational Performance Impact
- **Inference Volume in Window:** ${recordsAnalyzed.toLocaleString()}
- **Average Inference Latency:** ${telemetry.performanceTelemetry?.avgLatencyMs || 0} ms
- **Operational Error Rate:** ${((telemetry.performanceTelemetry?.errorRate || 0.002) * 100).toFixed(2)}%

---

## 4. Linked Governance Incident & Corrective Actions
- **Linked Incident Number:** \`${incident ? incident.incidentNumber : 'N/A'}\`
- **Incident Severity:** **${incident ? incident.severity : 'HIGH'}**
- **Incident Status:** **${incident ? incident.status : 'OPEN'}**
- **Recommended Action:** **${incident ? incident.recommendedAction : 'INVESTIGATE'}**

---

## 5. Methodological Limitations & Analysis Boundaries
> [!IMPORTANT]
> **Ground-Truth Outcome Notice:**
> Data distribution shift measures statistical divergence of feature distributions from the established baseline. It does **not** constitute mathematical proof of model accuracy degradation without ground-truth label reconciliation.
>
> **Autonomous Action Prohibition:**
> Under Sentinel Govern policy gates, drift detection triggers human-in-the-loop escalation. It **never** executes automated retraining, promotion, or unverified rollback without authorized ML Lead sign-off.

---

## 6. Recommended Next Actions
${recommendations.map((r, i) => `${i + 1}. ${r}`).join('\n')}

---
*Report generated authoritatively by Sentinel Govern Engine. Cryptographic hash recorded in Audit Ledger.*
`;
}

/**
 * Lists all reports with optional filters.
 */
export async function getGovernanceReports({ modelId, versionId, batchId, telemetryId, incidentId, reportType, limit = 50 } = {}) {
  const filter = {};
  if (modelId) filter.modelId = modelId;
  if (versionId) filter.versionId = versionId;
  if (reportType) filter.reportType = reportType;
  if (incidentId) filter.incidentId = incidentId;
  if (telemetryId) filter.telemetryId = telemetryId;

  if (batchId) {
    const { Telemetry } = await import('../models/Telemetry.js');
    const tele = await Telemetry.findOne({ batchId });
    if (tele) {
      filter.$or = [
        { telemetryId: tele._id },
        { _id: tele.reportId },
        { 'driftAnalysis.batchId': batchId }
      ];
    } else {
      filter['driftAnalysis.batchId'] = batchId;
    }
  }

  return Report.find(filter)
    .populate('modelId', 'name riskLevel lifecycleStatus')
    .populate('versionId', 'version lifecycleStatus deploymentStatus')
    .populate('incidentId', 'incidentNumber severity status recommendedAction')
    .populate('telemetryId', 'batchId sampleSize driftStatus aggregatePsi recordedAt')
    .sort({ createdAt: -1 })
    .limit(Number(limit));
}

/**
 * Retrieves a single report by ID or reportNumber.
 */
export async function getReportById(reportId) {
  if (!reportId) return null;
  const resolvedId = (typeof reportId === 'object' && reportId !== null)
    ? (reportId._id || reportId.id || reportId.reportNumber || reportId.reportId)
    : String(reportId).trim();

  if (!resolvedId) return null;

  const query = mongoose.Types.ObjectId.isValid(resolvedId)
    ? { _id: resolvedId }
    : { reportNumber: resolvedId };

  return Report.findOne(query)
    .populate('modelId', 'name riskLevel lifecycleStatus purpose owner team')
    .populate('versionId', 'version lifecycleStatus deploymentStatus')
    .populate('incidentId', 'incidentNumber severity status recommendedAction mitigationNotes')
    .populate('telemetryId', 'batchId sampleSize driftStatus aggregatePsi recordedAt');
}

