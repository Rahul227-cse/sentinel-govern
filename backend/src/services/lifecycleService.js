import { Model } from '../models/Model.js';
import { ModelVersion } from '../models/ModelVersion.js';
import { Policy } from '../models/Policy.js';
import { Approval } from '../models/Approval.js';
import { Deployment } from '../models/Deployment.js';
import { recordAuditEvent } from './auditEngine.js';

export const LIFECYCLE_STAGES = [
  'DRAFT',
  'UNDER_REVIEW',
  'EVALUATION',
  'PENDING_APPROVAL',
  'APPROVED',
  'IN_PRODUCTION',
  'DEPRECATED'
];

/**
 * Validates and executes a model version lifecycle transition.
 * Rejects any transition that violates governance rules.
 */
export async function transitionVersionLifecycle({
  versionId,
  targetStatus,
  actor = 'System Administrator',
  role = 'SYSTEM',
  rationale = ''
}) {
  if (!LIFECYCLE_STAGES.includes(targetStatus)) {
    throw new Error(`Invalid lifecycle status: ${targetStatus}`);
  }

  const version = await ModelVersion.findById(versionId);
  if (!version) {
    throw new Error(`Model version ${versionId} not found`);
  }

  const model = await Model.findById(version.modelId);
  if (!model) {
    throw new Error(`Parent model for version ${versionId} not found`);
  }

  const currentStatus = version.lifecycleStatus;

  if (currentStatus === targetStatus) {
    return version; // No-op
  }

  // Define transition constraints
  switch (targetStatus) {
    case 'UNDER_REVIEW':
      if (currentStatus !== 'DRAFT') {
        throw new Error(`Cannot transition to UNDER_REVIEW from ${currentStatus}. Must be DRAFT.`);
      }
      break;

    case 'EVALUATION':
      if (!['UNDER_REVIEW', 'DRAFT'].includes(currentStatus)) {
        throw new Error(`Cannot transition to EVALUATION from ${currentStatus}. Model must be UNDER_REVIEW.`);
      }
      break;

    case 'PENDING_APPROVAL':
      // Gating Rule: Must have completed evaluation and PASSED policy checks
      if (!['EVALUATION', 'UNDER_REVIEW'].includes(currentStatus)) {
        throw new Error(`Cannot transition to PENDING_APPROVAL from ${currentStatus}.`);
      }
      if (version.policyStatus !== 'PASSED') {
        throw new Error(
          `GOVERNANCE GATE BLOCKED: Model version ${version.version} cannot enter PENDING_APPROVAL because governance policies have not passed (Current Policy Status: ${version.policyStatus}).`
        );
      }
      break;

    case 'APPROVED':
      if (currentStatus !== 'PENDING_APPROVAL') {
        throw new Error(`Cannot approve model directly from ${currentStatus}. Must be PENDING_APPROVAL.`);
      }

      // Check required approvals: model-specific policy first, then applicableModelIds
      let policy = model.policyId ? await Policy.findById(model.policyId) : null;
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
      const requiredRoles = policy?.requiredApprovers || ['ML_LEAD', 'GOVERNANCE_OFFICER', 'EXECUTIVE_APPROVER'];

      const approvals = await Approval.find({ versionId: version._id });
      const approvedRoles = approvals
        .filter(a => a.decision === 'APPROVED')
        .map(a => a.role);

      const missingRoles = requiredRoles.filter(r => !approvedRoles.includes(r));
      if (missingRoles.length > 0) {
        throw new Error(
          `APPROVAL GATE BLOCKED: Missing mandatory sign-offs from: ${missingRoles.join(', ')}. All required roles must approve before version is APPROVED.`
        );
      }

      version.approvalStatus = 'APPROVED';
      break;

    case 'IN_PRODUCTION':
      // Gating Rule: Only APPROVED versions can be promoted to IN_PRODUCTION
      if (currentStatus !== 'APPROVED') {
        throw new Error(
          `DEPLOYMENT GATE BLOCKED: Version ${version.version} must be APPROVED prior to production deployment. Current status: ${currentStatus}.`
        );
      }

      // Update previous production version if any
      const previousProdVersion = await ModelVersion.findOne({
        modelId: model._id,
        lifecycleStatus: 'IN_PRODUCTION',
        _id: { $ne: version._id }
      });

      if (previousProdVersion) {
        previousProdVersion.lifecycleStatus = 'DEPRECATED';
        previousProdVersion.deploymentStatus = 'RETIRED';
        await previousProdVersion.save();

        await recordAuditEvent({
          actor,
          role,
          action: 'DEPLOYMENT_COMPLETED',
          entityType: 'ModelVersion',
          entityId: previousProdVersion._id,
          payload: {
            version: previousProdVersion.version,
            event: 'SUPERSEDED_BY_NEW_VERSION',
            newProductionVersion: version.version
          }
        });
      }

      version.deploymentStatus = 'IN_PRODUCTION';
      version.deployedAt = new Date();

      // Create or activate real Deployment document
      try {
        if (previousProdVersion) {
          await Deployment.updateMany(
            { modelId: model._id, versionId: previousProdVersion._id, status: 'ACTIVE' },
            { status: 'RETIRED' }
          );
        }

        const deployment = await Deployment.create({
          modelId: model._id,
          versionId: version._id,
          environment: 'PRODUCTION',
          deployedBy: actor,
          status: 'ACTIVE',
          endpointUrl: process.env.EXTERNAL_AI_URL || 'http://127.0.0.1:8000',
          trafficPercentage: 100,
          deployedAt: new Date()
        });
        version.deploymentRef = deployment._id;
      } catch (deployErr) {
        // Log without crashing the transition
        console.warn(`[Deployment] Notice: Deployment document creation skipped: ${deployErr.message}`);
      }

      // Update parent model's pointer and status
      model.currentProductionVersionId = version._id;
      model.lifecycleStatus = 'IN_PRODUCTION';
      await model.save();
      break;

    case 'DEPRECATED':
      if (version.deploymentStatus === 'IN_PRODUCTION') {
        version.deploymentStatus = 'RETIRED';
      }
      break;

    default:
      break;
  }

  const previousState = version.lifecycleStatus;
  version.lifecycleStatus = targetStatus;
  await version.save();

  // Audit log the transition
  await recordAuditEvent({
    actor,
    role,
    action: targetStatus === 'IN_PRODUCTION' ? 'DEPLOYMENT_COMPLETED' : 
            targetStatus === 'APPROVED' ? 'APPROVAL_GRANTED' : 'LIFECYCLE_TRANSITION',
    entityType: 'ModelVersion',
    entityId: version._id,
    payload: {
      modelId: String(model._id),
      modelName: model.name,
      versionId: String(version._id),
      version: version.version,
      previousStatus: previousState,
      newStatus: targetStatus,
      rationale
    }
  });


  return version;
}

/**
 * Validates endpoint URL for security (SSRF prevention).
 */
export function validateEndpointUrl(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') {
    throw new Error('Endpoint URL must be a non-empty string');
  }
  let parsed;
  try {
    parsed = new URL(urlStr);
  } catch {
    throw new Error(`Invalid URL format: "${urlStr}"`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`Invalid URL protocol "${parsed.protocol}". Only HTTP and HTTPS are permitted.`);
  }

  // SSRF Protection in production
  if (process.env.NODE_ENV === 'production') {
    const hostname = parsed.hostname.toLowerCase();
    const blockedHosts = ['localhost', '127.0.0.1', '::1', '0.0.0.0', '169.254.169.254'];
    if (blockedHosts.includes(hostname) || hostname.endsWith('.internal.invalid')) {
      throw new Error(`Endpoint URL "${urlStr}" references prohibited local or link-local host in production.`);
    }

    // RFC 1918 Private IPv4 address protection in production
    const isPrivateIp = 
      /^10\./.test(hostname) ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname) ||
      /^192\.168\./.test(hostname) ||
      /^127\./.test(hostname) ||
      /^169\.254\./.test(hostname);
    if (isPrivateIp) {
      throw new Error(`Endpoint URL "${urlStr}" references prohibited private network address in production.`);
    }
  }
  return true;
}

/**
 * Safely registers or updates the runtime endpoint for an approved or in-production model version.
 */
export async function registerDeploymentEndpoint({
  modelId,
  versionId,
  endpointUrl,
  actor = 'ML Lead',
  role = 'ML_LEAD'
}) {
  validateEndpointUrl(endpointUrl);

  const model = await Model.findById(modelId);
  if (!model) throw new Error('Model not found');

  const version = await ModelVersion.findById(versionId);
  if (!version) throw new Error('ModelVersion not found');

  if (String(version.modelId) !== String(model._id)) {
    throw new Error('Target version does not belong to specified model');
  }

  if (version.lifecycleStatus !== 'IN_PRODUCTION' && version.lifecycleStatus !== 'APPROVED') {
    throw new Error(
      `DEPLOYMENT GATE BLOCKED: Cannot associate endpoint for version ${version.version} with status "${version.lifecycleStatus}". Must be APPROVED or IN_PRODUCTION.`
    );
  }

  let deployment = await Deployment.findOne({ modelId: model._id, versionId: version._id, status: 'ACTIVE' });
  if (deployment) {
    deployment.endpointUrl = endpointUrl;
    await deployment.save();
  } else {
    deployment = await Deployment.create({
      modelId: model._id,
      versionId: version._id,
      environment: 'PRODUCTION',
      deployedBy: actor,
      status: 'ACTIVE',
      endpointUrl,
      trafficPercentage: 100,
      deployedAt: new Date()
    });
  }

  version.deploymentRef = deployment._id;
  await version.save();

  await recordAuditEvent({
    actor,
    role,
    action: 'DEPLOYMENT_COMPLETED',
    entityType: 'Deployment',
    entityId: deployment._id,
    payload: {
      modelId: String(model._id),
      versionId: String(version._id),
      endpointUrl,
      status: deployment.status
    }
  });

  return deployment;
}
