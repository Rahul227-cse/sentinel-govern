import mongoose from 'mongoose';
import { Policy } from '../models/Policy.js';
import { ModelVersion } from '../models/ModelVersion.js';
import { Evaluation } from '../models/Evaluation.js';
import { Model } from '../models/Model.js';
import { evaluatePolicyGates } from '../services/policyEngine.js';
import { recordAuditEvent } from '../services/auditEngine.js';

const VALID_APPROVERS = ['ML_LEAD', 'GOVERNANCE_OFFICER', 'EXECUTIVE_APPROVER'];

export function validatePolicyPayload({ requiredApprovers, rules, applicableModelIds }) {
  if (requiredApprovers !== undefined) {
    if (!Array.isArray(requiredApprovers) || requiredApprovers.length === 0) {
      return {
        valid: false,
        status: 400,
        error: `Policy must specify at least one required model sign-off role from: ${VALID_APPROVERS.join(', ')}`
      };
    }
    if (requiredApprovers.includes('PLATFORM_ADMIN')) {
      return {
        valid: false,
        status: 400,
        error: `Platform Admin cannot receive model approval or sign-off authority. Permitted sign-off roles are strictly: ${VALID_APPROVERS.join(', ')}`
      };
    }
    for (const appRole of requiredApprovers) {
      if (!VALID_APPROVERS.includes(appRole)) {
        return {
          valid: false,
          status: 400,
          error: `Invalid model approver role "${appRole}". Permitted sign-off roles are strictly: ${VALID_APPROVERS.join(', ')}`
        };
      }
    }
  }

  if (rules && typeof rules === 'object') {
    if (rules.maxPsiThreshold !== undefined && rules.maxPsiThreshold !== null) {
      const val = Number(rules.maxPsiThreshold);
      if (isNaN(val) || val <= 0) {
        return {
          valid: false,
          status: 400,
          error: 'Invalid drift threshold: maxPsiThreshold must be a positive numeric value.'
        };
      }
    }
    if (rules.minDisparateImpact !== undefined && rules.minDisparateImpact !== null) {
      const val = Number(rules.minDisparateImpact);
      if (isNaN(val) || val < 0) {
        return {
          valid: false,
          status: 400,
          error: 'Invalid fairness threshold: minDisparateImpact must be a non-negative number.'
        };
      }
    }
    if (rules.minRocAuc !== undefined && rules.minRocAuc !== null) {
      const val = Number(rules.minRocAuc);
      if (isNaN(val) || val < 0 || val > 1) {
        return {
          valid: false,
          status: 400,
          error: 'Invalid performance threshold: minRocAuc must be between 0 and 1.'
        };
      }
    }
    if (rules.minAccuracy !== undefined && rules.minAccuracy !== null) {
      const val = Number(rules.minAccuracy);
      if (isNaN(val) || val < 0 || val > 1) {
        return {
          valid: false,
          status: 400,
          error: 'Invalid performance threshold: minAccuracy must be between 0 and 1.'
        };
      }
    }
  }

  if (applicableModelIds !== undefined) {
    if (!Array.isArray(applicableModelIds)) {
      return {
        valid: false,
        status: 400,
        error: 'applicableModelIds must be an array of model identifiers.'
      };
    }
    for (const id of applicableModelIds) {
      if (id && !mongoose.Types.ObjectId.isValid(id)) {
        return {
          valid: false,
          status: 400,
          error: `Invalid model identifier format: "${id}". Must be a valid 24-character hexadecimal ObjectId.`
        };
      }
    }
  }

  return { valid: true };
}

/**
 * Attaches dynamically resolved applicable models to an array of policies.
 * A model is associated with a policy if:
 * 1. model.policyId === policy._id (primary model-to-policy link)
 * 2. policy.applicableModelIds includes model._id
 * 3. policy.applicableModelId === model._id (backward compatibility)
 */
export async function attachApplicableModels(policies) {
  const models = await Model.find({}, '_id name riskLevel lifecycleStatus owner team policyId');

  return policies.map(policy => {
    const policyObj = policy.toObject ? policy.toObject() : { ...policy };
    const pId = String(policyObj._id);

    const matchedModels = models.filter(m => {
      if (m.policyId && String(m.policyId) === pId) return true;
      if (policyObj.applicableModelIds && policyObj.applicableModelIds.some(id => String(id) === String(m._id))) return true;
      if (policyObj.applicableModelId && String(policyObj.applicableModelId) === String(m._id)) return true;
      return false;
    });

    policyObj.applicableModels = matchedModels.map(m => ({
      _id: m._id,
      name: m.name,
      riskLevel: m.riskLevel,
      lifecycleStatus: m.lifecycleStatus,
      owner: m.owner,
      team: m.team
    }));

    return policyObj;
  });
}

export async function getPolicies(req, res) {
  try {
    const { modelId } = req.query;
    const policies = await Policy.find().sort({ createdAt: -1 });
    let enriched = await attachApplicableModels(policies);

    if (modelId) {
      enriched = enriched.filter(p =>
        p.applicableModels.some(m => String(m._id) === String(modelId))
      );
    }

    res.json({ success: true, count: enriched.length, data: enriched });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

export async function getPolicyById(req, res) {
  try {
    const policy = await Policy.findById(req.params.id);
    if (!policy) {
      return res.status(404).json({ success: false, error: 'Policy not found' });
    }
    const [enriched] = await attachApplicableModels([policy]);
    res.json({ success: true, data: enriched });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

export async function createPolicy(req, res) {
  try {
    const createdBy = req.user ? req.user._id : null;
    const actor = req.user ? (req.user.name || req.user.email) : 'Governance Officer';
    const role = req.user ? req.user.role : 'GOVERNANCE_OFFICER';

    const { applicableModelIds = [], requiredApprovers, rules, ...bodyData } = req.body;
    const modelIdsArray = Array.isArray(applicableModelIds) ? applicableModelIds : [];

    const validation = validatePolicyPayload({ requiredApprovers, rules, applicableModelIds: modelIdsArray });
    if (!validation.valid) {
      return res.status(validation.status).json({ success: false, error: validation.error });
    }

    const policyData = {
      ...bodyData,
      ...(rules ? { rules } : {}),
      ...(requiredApprovers ? { requiredApprovers } : {}),
      applicableModelIds: modelIdsArray,
      applicableModelId: modelIdsArray.length > 0 ? modelIdsArray[0] : (bodyData.applicableModelId || null),
      createdBy
    };

    const policy = await Policy.create(policyData);

    if (modelIdsArray.length > 0) {
      await Model.updateMany(
        { _id: { $in: modelIdsArray } },
        { $set: { policyId: policy._id } }
      );
    }

    await recordAuditEvent({
      actor,
      role,
      action: 'POLICY_CREATED',
      entityType: 'Policy',
      entityId: policy._id,
      payload: {
        name: policy.name,
        targetRiskLevel: policy.targetRiskLevel,
        failureAction: policy.failureAction,
        applicableModelIds: modelIdsArray
      }
    });

    const [enriched] = await attachApplicableModels([policy]);
    res.status(201).json({ success: true, data: enriched });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

export async function updatePolicy(req, res) {
  try {
    const actor = req.user ? (req.user.name || req.user.email) : 'Governance Officer';
    const role = req.user ? req.user.role : 'GOVERNANCE_OFFICER';

    const { applicableModelIds, requiredApprovers, rules, ...bodyData } = req.body;
    const updatePayload = { ...bodyData };

    const validation = validatePolicyPayload({ requiredApprovers, rules, applicableModelIds });
    if (!validation.valid) {
      return res.status(validation.status).json({ success: false, error: validation.error });
    }

    if (requiredApprovers !== undefined) {
      updatePayload.requiredApprovers = requiredApprovers;
    }
    if (rules !== undefined) {
      updatePayload.rules = rules;
    }

    if (applicableModelIds !== undefined) {
      const modelIdsArray = Array.isArray(applicableModelIds) ? applicableModelIds : [];
      updatePayload.applicableModelIds = modelIdsArray;
      updatePayload.applicableModelId = modelIdsArray.length > 0 ? modelIdsArray[0] : null;
    }

    const policy = await Policy.findByIdAndUpdate(req.params.id, updatePayload, { new: true, runValidators: true });
    if (!policy) {
      return res.status(404).json({ success: false, error: 'Policy not found' });
    }

    if (applicableModelIds !== undefined && Array.isArray(applicableModelIds)) {
      // 1. Assign selected models to this policy
      await Model.updateMany(
        { _id: { $in: applicableModelIds } },
        { $set: { policyId: policy._id } }
      );
      // 2. Unassign models that previously pointed to this policy but were removed
      await Model.updateMany(
        { policyId: policy._id, _id: { $nin: applicableModelIds } },
        { $set: { policyId: null } }
      );
    }

    await recordAuditEvent({
      actor,
      role,
      action: 'POLICY_UPDATED',
      entityType: 'Policy',
      entityId: policy._id,
      payload: {
        name: policy.name,
        targetRiskLevel: policy.targetRiskLevel,
        failureAction: policy.failureAction,
        applicableModelIds: policy.applicableModelIds
      }
    });

    const [enriched] = await attachApplicableModels([policy]);
    res.json({ success: true, data: enriched });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

export async function evaluateGateCheck(req, res) {
  try {
    const { versionId } = req.params;
    const version = await ModelVersion.findById(versionId);
    if (!version) {
      return res.status(404).json({ success: false, error: 'Version not found' });
    }

    const model = await Model.findById(version.modelId);
    if (!model) {
      return res.status(404).json({ success: false, error: 'Parent model not found' });
    }

    const evaluation = await Evaluation.findById(version.latestEvaluationId);
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

    if (!policy) {
      return res.status(400).json({ 
        success: false, 
        error: `No governance policy assigned to model "${model.name}". A Governance Officer must assign an active governance policy before gate checks can be evaluated.`,
        noPolicyAssigned: true 
      });
    }

    const decision = evaluatePolicyGates({ policy, evaluation, modelVersion: version, model });
    res.json({ success: true, data: decision });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}
