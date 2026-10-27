import net from 'node:net';
import dns from 'node:dns/promises';
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
  'RETIRED'
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
  const normalizedTarget = targetStatus === 'DEPRECATED' ? 'RETIRED' : targetStatus;
  if (!LIFECYCLE_STAGES.includes(normalizedTarget)) {
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
        previousProdVersion.lifecycleStatus = 'RETIRED';
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
          endpointUrl: model.apiConfig?.endpointUrl || process.env.EXTERNAL_AI_URL || '',
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

    case 'RETIRED':
    case 'DEPRECATED':
      if (version.deploymentStatus === 'IN_PRODUCTION') {
        version.deploymentStatus = 'RETIRED';
      }
      break;

    default:
      break;
  }

  const previousState = version.lifecycleStatus;
  version.lifecycleStatus = normalizedTarget;
  await version.save();

  // Audit log the transition
  await recordAuditEvent({
    actor,
    role,
    action: normalizedTarget === 'IN_PRODUCTION' ? 'DEPLOYMENT_COMPLETED' : 
            normalizedTarget === 'APPROVED' ? 'APPROVAL_GRANTED' : 'LIFECYCLE_TRANSITION',
    entityType: 'ModelVersion',
    entityId: version._id,
    payload: {
      modelId: String(model._id),
      modelName: model.name,
      versionId: String(version._id),
      version: version.version,
      previousStatus: previousState,
      newStatus: normalizedTarget,
      rationale
    }
  });

  // Notify stakeholders on production deployment
  if (normalizedTarget === 'IN_PRODUCTION') {
    try {
      const { dispatchNotification } = await import('./notificationService.js');
      await dispatchNotification({
        recipientRole: 'ML_LEAD',
        title: `Production promotion completed: ${model.name} ${version.version}`,
        message: `Model "${model.name}" version ${version.version} has been deployed to production.`,
        type: 'LIFECYCLE_PROMOTION',
        severity: 'INFO',
        targetUrl: '/app/monitoring',
        modelId: model._id,
        versionId: version._id,
        idempotencyKey: `promoted_prod_ml_${version._id}`,
        actor
      });
      await dispatchNotification({
        recipientRole: 'GOVERNANCE_OFFICER',
        title: `Production promotion completed: ${model.name} ${version.version}`,
        message: `Model "${model.name}" version ${version.version} has been promoted to live production.`,
        type: 'LIFECYCLE_PROMOTION',
        severity: 'INFO',
        targetUrl: '/app/monitoring',
        modelId: model._id,
        versionId: version._id,
        idempotencyKey: `promoted_prod_gov_${version._id}`,
        actor
      });
    } catch (notifErr) {
      console.warn('[Notification] Lifecycle promotion notification warning:', notifErr.message);
    }
  }


  return version;
}

/**
 * Determines whether an IP address is private, loopback, link-local, carrier-grade NAT, or cloud metadata.
 */
export function isPrivateOrInternalIp(ip) {
  if (!ip || typeof ip !== 'string') return true;
  const cleanIp = ip.toLowerCase().trim();

  // IPv4-mapped IPv6, e.g. ::ffff:127.0.0.1 or ::ffff:169.254.169.254
  if (cleanIp.startsWith('::ffff:')) {
    return isPrivateOrInternalIp(cleanIp.slice(7));
  }

  if (net.isIPv4(cleanIp)) {
    const parts = cleanIp.split('.').map(Number);
    if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) return true;

    // 0.0.0.0/8 (Current / broadcast)
    if (parts[0] === 0) return true;
    // 10.0.0.0/8 (Private RFC 1918)
    if (parts[0] === 10) return true;
    // 127.0.0.0/8 (Loopback)
    if (parts[0] === 127) return true;
    // 169.254.0.0/16 (Link-local & cloud metadata)
    if (parts[0] === 169 && parts[1] === 254) return true;
    // 172.16.0.0/12 (Private RFC 1918: 172.16.x.x - 172.31.x.x)
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    // 192.168.0.0/16 (Private RFC 1918)
    if (parts[0] === 192 && parts[1] === 168) return true;
    // 100.64.0.0/10 (Carrier-Grade NAT)
    if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true;
    // TEST-NET & documentation IPs
    if (parts[0] === 192 && parts[1] === 0 && parts[2] === 2) return true;
    if (parts[0] === 198 && parts[1] === 51 && parts[2] === 100) return true;
    if (parts[0] === 203 && parts[1] === 0 && parts[2] === 113) return true;
    // Multicast & Reserved (224.0.0.0/4 and 240.0.0.0/4)
    if (parts[0] >= 224) return true;

    return false;
  }

  if (net.isIPv6(cleanIp)) {
    // Loopback ::1 and unspecified ::
    if (cleanIp === '::1' || cleanIp === '::' || cleanIp === '0:0:0:0:0:0:0:1') return true;
    // Unique local fc00::/7 (fc.. or fd..)
    if (cleanIp.startsWith('fc') || cleanIp.startsWith('fd')) return true;
    // Link-local fe80::/10 (fe8, fe9, fea, feb)
    if (/^fe[89ab]/.test(cleanIp)) return true;
    // Multicast ff00::/8
    if (cleanIp.startsWith('ff')) return true;

    return false;
  }

  return true; // Unknown/invalid IP format is blocked
}

/**
 * Validates endpoint URL for security (SSRF prevention).
 * Synchronous URL syntax and static host validation.
 */
export function validateEndpointUrl(urlStr, options = {}) {
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

  const hostname = parsed.hostname.toLowerCase();
  const rawHost = hostname.replace(/^\[|\]$/g, '');

  // Cloud metadata protection across ALL environments (never permitted)
  if (
    rawHost === '169.254.169.254' ||
    rawHost === 'metadata.google.internal' ||
    rawHost === 'instance-data' ||
    rawHost.endsWith('.internal.invalid')
  ) {
    throw new Error(`SSRF BLOCKED: Prohibited cloud metadata destination: "${urlStr}"`);
  }

  // Enforce private network & loopback block in production or when allowLocal is explicitly false
  const enforceBlock = process.env.NODE_ENV === 'production' || options.allowLocal === false;

  if (enforceBlock) {
    const blockedHosts = ['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0'];
    if (blockedHosts.includes(hostname) || blockedHosts.includes(rawHost) || hostname.endsWith('.local') || hostname.endsWith('.localhost')) {
      throw new Error(`SSRF BLOCKED: Endpoint URL "${urlStr}" references prohibited local host.`);
    }

    if (net.isIP(rawHost) && isPrivateOrInternalIp(rawHost)) {
      throw new Error(`SSRF BLOCKED: Endpoint URL "${urlStr}" references prohibited internal IP address: ${rawHost}`);
    }
  }

  return true;
}

/**
 * Asynchronously validates endpoint URL including DNS resolution against internal addresses (DNS rebinding prevention).
 */
export async function validateSafeEndpointUrl(urlStr, options = {}) {
  validateEndpointUrl(urlStr, options);

  const parsed = new URL(urlStr);
  const hostname = parsed.hostname.toLowerCase();
  const enforceBlock = process.env.NODE_ENV === 'production' || options.allowLocal === false;

  if (enforceBlock && !net.isIP(hostname)) {
    try {
      const records = await dns.lookup(hostname, { all: true });
      for (const rec of records) {
        if (isPrivateOrInternalIp(rec.address)) {
          throw new Error(
            `SSRF BLOCKED: Hostname "${hostname}" resolves to prohibited internal address: ${rec.address}`
          );
        }
      }
    } catch (err) {
      if (err.message.includes('SSRF BLOCKED')) {
        throw err;
      }
      throw new Error(`SSRF BLOCKED: Unable to resolve hostname "${hostname}": ${err.message}`);
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
