import { Approval } from '../models/Approval.js';
import { ModelVersion } from '../models/ModelVersion.js';
import { Model } from '../models/Model.js';
import { Policy } from '../models/Policy.js';
import { recordAuditEvent } from '../services/auditEngine.js';

export async function getApprovalsByVersion(req, res) {
  try {
    const { versionId } = req.params;
    const approvals = await Approval.find({ versionId }).sort({ createdAt: 1 });
    res.json({ success: true, count: approvals.length, data: approvals });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

export async function getPendingApprovals(req, res) {
  try {
    const { status = 'pending' } = req.query;
    let filter = {};

    if (status === 'completed' || status === 'approved') {
      filter = { lifecycleStatus: { $in: ['APPROVED', 'IN_PRODUCTION'] } };
    } else if (status === 'all') {
      filter = { lifecycleStatus: { $in: ['PENDING_APPROVAL', 'APPROVED', 'IN_PRODUCTION'] } };
    } else {
      // Default: pending
      filter = { lifecycleStatus: 'PENDING_APPROVAL' };
    }

    const versions = await ModelVersion.find(filter)
      .populate('modelId')
      .populate('latestEvaluationId')
      .sort({ updatedAt: -1 });

    const approvals = await Approval.find({
      versionId: { $in: versions.map(v => v._id) }
    }).sort({ createdAt: 1 });

    const result = versions.map(v => {
      const versionApprovals = approvals.filter(a => String(a.versionId) === String(v._id));
      return {
        version: v,
        model: v.modelId,
        approvals: versionApprovals
      };
    });

    res.json({ success: true, count: result.length, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

export async function getCompletedApprovals(req, res) {
  req.query.status = 'completed';
  return getPendingApprovals(req, res);
}

export async function submitApprovalDecision(req, res) {
  try {
    const { versionId } = req.params;
    const { decision, comment = '' } = req.body;

    const role = req.user ? req.user.role : req.body.role;
    const approverName = req.user ? (req.user.name || req.user.email) : req.body.approverName;

    if (!role || !approverName || !decision) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: role, approverName, decision'
      });
    }

    if (!['APPROVED', 'REJECTED', 'CHANGES_REQUESTED'].includes(decision)) {
      return res.status(400).json({
        success: false,
        error: 'Decision must be one of: APPROVED, REJECTED, CHANGES_REQUESTED'
      });
    }

    const version = await ModelVersion.findById(versionId);
    if (!version) {
      return res.status(404).json({ success: false, error: 'ModelVersion not found' });
    }

    const model = await Model.findById(version.modelId);
    if (!model) {
      return res.status(404).json({ success: false, error: 'Model not found' });
    }

    // Gating check: Must have completed evaluation and passed policy before approval review
    if (version.policyStatus !== 'PASSED') {
      return res.status(400).json({
        success: false,
        error: `Cannot submit approvals: Governance policy status is ${version.policyStatus}. Only versions that passed all policy gates are eligible for approval review.`
      });
    }

    // Check policy requirements for this model (model.policyId first, then applicableModelIds)
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
    const requiredRoles = policy?.requiredApprovers || ['ML_LEAD', 'GOVERNANCE_OFFICER', 'EXECUTIVE_APPROVER'];

    // Platform Admin separation of duties: Platform Admin must not receive model approval or sign-off authority
    if (role === 'PLATFORM_ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Platform Admin accounts do not possess model approval or sign-off authority. Approvals are strictly restricted to ML Lead, Governance Officer, and Executive Approver.'
      });
    }

    // Upsert approval for this role on this version
    const approval = await Approval.findOneAndUpdate(
      { versionId: version._id, role },
      {
        modelId: model._id,
        versionId: version._id,
        role,
        approverName,
        decision,
        comment,
        decidedAt: new Date()
      },
      { upsert: true, new: true }
    );

    // Audit log approval record
    await recordAuditEvent({
      actor: approverName,
      role,
      action: decision === 'APPROVED' ? 'APPROVAL_GRANTED' : 'APPROVAL_REJECTED',
      entityType: 'Approval',
      entityId: approval._id,
      payload: {
        modelId: String(model._id),
        modelName: model.name,
        versionId: String(version._id),
        version: version.version,
        role,
        decision,
        comment
      }
    });


    const allVersionApprovals = await Approval.find({ versionId: version._id });
    const approvedRoles = allVersionApprovals
      .filter(a => a.decision === 'APPROVED')
      .map(a => a.role);

    const isFullyApproved = requiredRoles.every(r => approvedRoles.includes(r));
    const hasRejection = allVersionApprovals.some(a => a.decision === 'REJECTED');

    if (hasRejection) {
      version.approvalStatus = 'REJECTED';
      await version.save();
    } else if (isFullyApproved) {
      version.approvalStatus = 'APPROVED';
      version.lifecycleStatus = 'APPROVED';
      await version.save();

      await recordAuditEvent({
        actor: 'Governance Stage-Gate Engine',
        role: 'SYSTEM',
        action: 'APPROVAL_GRANTED',
        entityType: 'ModelVersion',
        entityId: version._id,
        payload: {
          modelId: String(model._id),
          modelName: model.name,
          versionId: String(version._id),
          version: version.version,
          event: 'ALL_MANDATORY_ROLES_APPROVED',
          approvedRoles
        }
      });

    } else {
      version.approvalStatus = 'PENDING_APPROVAL';
      version.lifecycleStatus = 'PENDING_APPROVAL';
      await version.save();
    }

    res.json({
      success: true,
      data: {
        approval,
        version,
        isFullyApproved,
        missingRoles: requiredRoles.filter(r => !approvedRoles.includes(r))
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}
