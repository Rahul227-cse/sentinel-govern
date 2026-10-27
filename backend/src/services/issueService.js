import mongoose from 'mongoose';
import { IssueReport } from '../models/IssueReport.js';
import { Incident } from '../models/Incident.js';
import { Model } from '../models/Model.js';
import { ModelVersion } from '../models/ModelVersion.js';
import { recordAuditEvent } from './auditEngine.js';
import { PERMISSIONS, hasPermission } from '../config/permissions.js';

const VALID_ISSUE_TYPES = ['PERFORMANCE', 'BIAS', 'DATA', 'SAFETY', 'DRIFT', 'OTHER'];
const VALID_SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const VALID_REVIEW_STATUSES = ['UNDER_INVESTIGATION', 'RESOLVED', 'REJECTED'];

function mapIssueTypeToIncidentType(issueType) {
  switch (issueType) {
    case 'PERFORMANCE':
      return 'PERFORMANCE_DEGRADATION';
    case 'BIAS':
      return 'FAIRNESS_VIOLATION';
    case 'DRIFT':
    case 'DATA':
      return 'DATA_DRIFT';
    case 'SAFETY':
    case 'OTHER':
    default:
      return 'SECURITY_ANOMALY';
  }
}

async function generateReportNumber() {
  const count = await IssueReport.countDocuments();
  const candidate = `ISS-${String(count + 1).padStart(4, '0')}`;
  const exists = await IssueReport.findOne({ reportNumber: candidate });
  if (!exists) return candidate;
  return `ISS-${Date.now().toString().slice(-6)}`;
}

export async function createIssueReport({
  modelId,
  versionId = null,
  issueType,
  severity = 'MEDIUM',
  title,
  description,
  evidence = [],
  user
}) {
  if (!user || !user._id) {
    throw new Error('Authenticated user is required to submit an issue report');
  }

  if (!modelId) {
    throw new Error('Model ID is required');
  }

  if (!mongoose.Types.ObjectId.isValid(modelId)) {
    throw new Error('Invalid model ID format');
  }

  const model = await Model.findById(modelId);
  if (!model) {
    throw new Error('Referenced model does not exist');
  }

  let version = null;
  if (versionId) {
    if (!mongoose.Types.ObjectId.isValid(versionId)) {
      throw new Error('Invalid version ID format');
    }
    version = await ModelVersion.findById(versionId);
    if (!version) {
      throw new Error('Referenced model version does not exist');
    }
    if (String(version.modelId) !== String(model._id)) {
      throw new Error('Referenced model version does not belong to the specified model');
    }
  }

  if (!issueType || !VALID_ISSUE_TYPES.includes(issueType)) {
    throw new Error(`Invalid issue type. Allowed: ${VALID_ISSUE_TYPES.join(', ')}`);
  }

  if (severity && !VALID_SEVERITIES.includes(severity)) {
    throw new Error(`Invalid severity level. Allowed: ${VALID_SEVERITIES.join(', ')}`);
  }

  if (!title || typeof title !== 'string' || !title.trim()) {
    throw new Error('Issue title is required and cannot be empty');
  }

  if (!description || typeof description !== 'string' || !description.trim()) {
    throw new Error('Issue description is required and cannot be empty');
  }

  const reportNumber = await generateReportNumber();

  // Submitter identity is derived strictly from the authenticated user token
  const submitterUserId = user._id;
  const submittedBy = user.name || user.email;
  const organizationId = user.organizationId || null;

  const issue = await IssueReport.create({
    reportNumber,
    organizationId,
    modelId: model._id,
    versionId: version ? version._id : null,
    submittedBy,
    submitterUserId,
    issueType,
    severity,
    title: title.trim(),
    description: description.trim(),
    evidence: Array.isArray(evidence) ? evidence : [],
    status: 'SUBMITTED'
  });

  await recordAuditEvent({
    actor: submittedBy,
    role: user.role,
    action: 'ISSUE_REPORT_CREATED',
    entityType: 'IssueReport',
    entityId: issue._id,
    payload: {
      issueId: String(issue._id),
      modelId: String(model._id),
      modelName: model.name,
      versionId: version ? String(version._id) : null,
      version: version ? version.version : 'Model-Level',
      reportNumber: issue.reportNumber,
      issueType: issue.issueType,
      severity: issue.severity,
      title: issue.title
    }
  });


  return issue;
}

export async function getIssueReports({ user, query = {} }) {
  const filter = {};

  if (user && !hasPermission(user.role, PERMISSIONS.ISSUES_MANAGE)) {
    filter.submitterUserId = user._id;
  } else if (query.submitterUserId) {
    filter.submitterUserId = query.submitterUserId;
  }

  if (query.status) {
    filter.status = query.status;
  }

  if (query.modelId) {
    if (mongoose.Types.ObjectId.isValid(query.modelId)) {
      filter.modelId = query.modelId;
    }
  }

  if (query.severity) {
    filter.severity = query.severity;
  }

  if (query.issueType) {
    filter.issueType = query.issueType;
  }

  return IssueReport.find(filter)
    .populate('modelId')
    .populate('versionId')
    .populate('escalatedIncidentId')
    .sort({ createdAt: -1 });
}

export async function getIssueReportById({ issueId, user }) {
  if (!mongoose.Types.ObjectId.isValid(issueId)) {
    throw new Error('Invalid issue ID format');
  }

  const issue = await IssueReport.findById(issueId)
    .populate('modelId')
    .populate('versionId')
    .populate('escalatedIncidentId');

  if (!issue) {
    return null;
  }

  if (user && !hasPermission(user.role, PERMISSIONS.ISSUES_MANAGE)) {
    if (String(issue.submitterUserId) !== String(user._id)) {
      const error = new Error('Access denied: You can only view your own submitted issue reports.');
      error.statusCode = 403;
      throw error;
    }
  }

  return issue;
}

export async function updateIssueReport({ issueId, status, resolutionNotes, user }) {
  if (!mongoose.Types.ObjectId.isValid(issueId)) {
    throw new Error('Invalid issue ID format');
  }

  const issue = await IssueReport.findById(issueId);
  if (!issue) {
    return null;
  }

  if (issue.status === 'ESCALATED_TO_INCIDENT') {
    throw new Error('Cannot update status directly once issue has been escalated to an incident');
  }

  if (status) {
    if (!VALID_REVIEW_STATUSES.includes(status)) {
      throw new Error(`Invalid status for review. Allowed: ${VALID_REVIEW_STATUSES.join(', ')}`);
    }
    issue.status = status;
  }

  if (resolutionNotes !== undefined) {
    issue.resolutionNotes = resolutionNotes;
  }

  const actor = user.name || user.email;
  if (status === 'RESOLVED' || status === 'REJECTED') {
    issue.resolvedBy = actor;
    issue.resolvedUserId = user._id;
    issue.resolvedAt = new Date();
  }

  await issue.save();

  await recordAuditEvent({
    actor,
    role: user.role,
    action: 'ISSUE_REPORT_UPDATED',
    entityType: 'IssueReport',
    entityId: issue._id,
    payload: {
      modelId: String(issue.modelId),
      versionId: issue.versionId ? String(issue.versionId) : null,
      reportNumber: issue.reportNumber,
      status: issue.status,
      resolutionNotes: issue.resolutionNotes
    }
  });


  return issue;
}

export async function escalateIssueToIncident({
  issueId,
  user,
  title,
  description,
  recommendedAction,
  targetVersionId
}) {
  if (!mongoose.Types.ObjectId.isValid(issueId)) {
    throw new Error('Invalid issue ID format');
  }

  const issue = await IssueReport.findById(issueId);
  if (!issue) {
    return null;
  }

  if (issue.status === 'ESCALATED_TO_INCIDENT' || issue.escalatedIncidentId) {
    throw new Error(`Issue report ${issue.reportNumber} has already been escalated to an incident`);
  }

  const model = await Model.findById(issue.modelId);
  if (!model) {
    throw new Error('Parent model not found for issue escalation');
  }

  // Determine affected version
  let versionId = issue.versionId || targetVersionId || model.currentProductionVersionId;
  if (!versionId) {
    const latestVersion = await ModelVersion.findOne({ modelId: model._id }).sort({ createdAt: -1 });
    versionId = latestVersion?._id;
  }

  if (!versionId) {
    throw new Error('Cannot escalate issue to incident: no associated model version found');
  }

  const version = await ModelVersion.findById(versionId);
  if (!version || String(version.modelId) !== String(model._id)) {
    throw new Error('Target version does not exist or does not belong to the model');
  }

  // Find previous genuinely approved version for rollback recommendation
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

  const incidentCount = await Incident.countDocuments();
  const incidentNumber = `INC-${String(incidentCount + 1).padStart(3, '0')}`;

  const actor = user.name || user.email;

  const incident = await Incident.create({
    incidentNumber,
    modelId: model._id,
    versionId: version._id,
    type: mapIssueTypeToIncidentType(issue.issueType),
    title: title || `Governance Escalation: ${issue.title}`,
    description: description || `Escalated from Employee Issue Report ${issue.reportNumber} (${issue.issueType}): ${issue.description}`,
    severity: issue.severity || 'HIGH',
    status: 'OPEN',
    recommendedAction: recommendedAction || (previousApprovedVersion ? 'ROLLBACK' : 'INVESTIGATE'),
    recommendedRollbackVersionId: previousApprovedVersion ? previousApprovedVersion._id : null,
    organizationId: issue.organizationId || null,
    assignedTo: user.role,
    assignedUserId: user._id,
    issueReportRef: issue._id,
    mitigationNotes: previousApprovedVersion
      ? `Escalated from issue report ${issue.reportNumber}. Recommended safe rollback to approved baseline version ${previousApprovedVersion.version}.`
      : `Escalated from issue report ${issue.reportNumber}. No prior approved version found. Recommend manual investigation.`
  });

  // Link issue to incident
  issue.status = 'ESCALATED_TO_INCIDENT';
  issue.escalatedIncidentId = incident._id;
  const escalationNote = `Escalated to Incident ${incident.incidentNumber} by ${actor} (${user.role}) on ${new Date().toISOString()}`;
  issue.resolutionNotes = issue.resolutionNotes ? `${issue.resolutionNotes}\n${escalationNote}` : escalationNote;
  await issue.save();

  // Audit events for escalation and incident creation
  await recordAuditEvent({
    actor,
    role: user.role,
    action: 'ISSUE_ESCALATED_TO_INCIDENT',
    entityType: 'IssueReport',
    entityId: issue._id,
    payload: {
      modelId: String(model._id),
      modelName: model.name,
      versionId: String(version._id),
      version: version.version,
      reportNumber: issue.reportNumber,
      escalatedIncidentId: String(incident._id),
      escalatedIncidentNumber: incident.incidentNumber
    }
  });

  await recordAuditEvent({
    actor,
    role: user.role,
    action: 'INCIDENT_CREATED',
    entityType: 'Incident',
    entityId: incident._id,
    payload: {
      incidentId: String(incident._id),
      modelId: String(model._id),
      modelName: model.name,
      versionId: String(version._id),
      version: version.version,
      incidentNumber: incident.incidentNumber,
      originatingIssueReport: issue.reportNumber,
      severity: incident.severity,
      recommendedRollbackVersion: previousApprovedVersion?.version || 'None'
    }
  });

  // Notify ML Lead about escalated issue to incident
  try {
    const { dispatchNotification } = await import('./notificationService.js');
    await dispatchNotification({
      recipientRole: 'ML_LEAD',
      excludeUserId: user._id,
      title: `Issue escalated to incident ${incident.incidentNumber}`,
      message: `Issue report ${issue.reportNumber} has been escalated to Incident ${incident.incidentNumber} by ${actor}.`,
      type: 'ISSUE_ESCALATED',
      severity: 'WARNING',
      targetUrl: '/app/incidents',
      modelId: model._id,
      versionId: version._id,
      incidentId: incident._id,
      issueId: issue._id,
      idempotencyKey: `issue_escalated_${issue._id}_${incident._id}`,
      actor
    });
  } catch (notifErr) {
    console.warn('[Notification] Issue escalation notification warning:', notifErr.message);
  }


  return { issue, incident };
}
