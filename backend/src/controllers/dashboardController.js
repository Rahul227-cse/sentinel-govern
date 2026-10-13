import { Model } from '../models/Model.js';
import { ModelVersion } from '../models/ModelVersion.js';
import { Policy } from '../models/Policy.js';
import { Evaluation } from '../models/Evaluation.js';
import { Approval } from '../models/Approval.js';
import { Incident } from '../models/Incident.js';
import { Telemetry } from '../models/Telemetry.js';
import { AuditLedger } from '../models/AuditLedger.js';
import { User } from '../models/User.js';

/**
 * GET /api/dashboard/stats
 * Real, role-aware, enterprise AI governance metrics directly from the authoritative database.
 * No synthetic or showcase data.
 */
export async function getDashboardStats(req, res) {
  try {
    const user = req.user || null;
    const userRole = user?.role || 'ML_LEAD';

    // 1. Global High-Level Overview Counts
    const [
      totalModels,
      productionModels,
      modelsInGovernance,
      pendingApprovals,
      policyViolations,
      openIncidents,
      driftAlerts,
      totalPolicies,
      activePolicies,
      modelsWithoutPolicyCount
    ] = await Promise.all([
      Model.countDocuments(),
      Model.countDocuments({ lifecycleStatus: 'IN_PRODUCTION' }),
      Model.countDocuments({ lifecycleStatus: { $in: ['DRAFT', 'UNDER_REVIEW', 'EVALUATION', 'PENDING_APPROVAL'] } }),
      ModelVersion.countDocuments({ lifecycleStatus: 'PENDING_APPROVAL' }),
      ModelVersion.countDocuments({ policyStatus: 'FAILED' }),
      Incident.countDocuments({ status: { $in: ['OPEN', 'INVESTIGATING'] } }),
      Telemetry.countDocuments({ driftStatus: 'DRIFT_DETECTED' }),
      Policy.countDocuments(),
      Policy.countDocuments({ isActive: true }),
      Model.countDocuments({ $or: [{ policyId: null }, { policyId: { $exists: false } }] })
    ]);

    // 2. Risk Distribution
    const riskCounts = await Model.aggregate([
      { $group: { _id: '$riskLevel', count: { $sum: 1 } } }
    ]);
    const riskDistribution = {
      UNACCEPTABLE: 0,
      HIGH: 0,
      LIMITED: 0,
      MINIMAL: 0,
      ...riskCounts.reduce((acc, curr) => ({ ...acc, [curr._id]: curr.count }), {})
    };

    // 3. Lifecycle Distribution
    const lifecycleCounts = await ModelVersion.aggregate([
      { $group: { _id: '$lifecycleStatus', count: { $sum: 1 } } }
    ]);
    const lifecycleDistribution = lifecycleCounts.reduce((acc, curr) => ({ ...acc, [curr._id]: curr.count }), {});

    // 4. Recent Cryptographic Audit Records
    const recentAudit = await AuditLedger.find().sort({ sequenceNumber: -1 }).limit(10);

    // 5. Models without policy assigned (critical enterprise governance gap)
    const modelsWithoutPolicy = await Model.find({
      $or: [{ policyId: null }, { policyId: { $exists: false } }]
    })
      .select('name riskLevel owner team lifecycleStatus createdAt')
      .sort({ createdAt: -1 })
      .limit(10);

    // 6. Action models (models in review, evaluation or pending approval)
    const actionModels = await Model.find({
      $or: [
        { lifecycleStatus: 'PENDING_APPROVAL' },
        { lifecycleStatus: 'EVALUATION' },
        { lifecycleStatus: 'UNDER_REVIEW' }
      ]
    })
      .populate('currentProductionVersionId')
      .populate('policyId')
      .sort({ updatedAt: -1 })
      .limit(8);

    // 7. Role-Specific Datasets

    // --- ML Lead Data ---
    let myModels = [];
    if (user && (user.name || user.email)) {
      myModels = await Model.find({
        $or: [
          { owner: user.name },
          { createdBy: user._id }
        ]
      })
        .populate('policyId')
        .populate('currentProductionVersionId')
        .sort({ updatedAt: -1 })
        .limit(10);
    }
    // Fallback: If no personal models found or unauthenticated, retrieve the most recent models
    if (myModels.length === 0) {
      myModels = await Model.find()
        .populate('policyId')
        .populate('currentProductionVersionId')
        .sort({ updatedAt: -1 })
        .limit(10);
    }

    // ML Lead Actions Requiring Attention
    const [draftVersionsWithoutEval, gateFailedVersions, returnedVersions] = await Promise.all([
      ModelVersion.find({
        lifecycleStatus: { $in: ['DRAFT', 'EVALUATION', 'UNDER_REVIEW'] },
        evaluationStatus: 'NOT_EVALUATED'
      })
        .populate('modelId')
        .sort({ updatedAt: -1 })
        .limit(5),
      ModelVersion.find({ policyStatus: 'FAILED' })
        .populate('modelId')
        .sort({ updatedAt: -1 })
        .limit(5),
      ModelVersion.find({ approvalStatus: { $in: ['CHANGES_REQUESTED', 'REJECTED'] } })
        .populate('modelId')
        .sort({ updatedAt: -1 })
        .limit(5)
    ]);

    // --- Approvals Pool for Queues ---
    const pendingVersions = await ModelVersion.find({ lifecycleStatus: 'PENDING_APPROVAL' })
      .populate('modelId')
      .populate('latestEvaluationId')
      .sort({ updatedAt: -1 })
      .limit(20);

    const pendingVersionIds = pendingVersions.map(v => v._id);
    const existingApprovals = await Approval.find({
      versionId: { $in: pendingVersionIds }
    }).sort({ createdAt: 1 });

    // Helper to assemble approval queue item
    const buildQueueItem = (v) => {
      const vApprovals = existingApprovals.filter(a => String(a.versionId) === String(v._id));
      const model = v.modelId;
      return {
        versionId: v._id,
        version: v.version,
        changelog: v.changelog,
        lifecycleStatus: v.lifecycleStatus,
        policyStatus: v.policyStatus,
        evaluationStatus: v.evaluationStatus,
        latestEvaluation: v.latestEvaluationId,
        modelId: model?._id,
        modelName: model?.name,
        riskLevel: model?.riskLevel,
        policyId: model?.policyId,
        submittedDate: v.updatedAt || v.createdAt,
        approvals: vApprovals
      };
    };

    // Governance Review Queue: versions in PENDING_APPROVAL where GOVERNANCE_OFFICER has not yet decided
    const governanceQueue = pendingVersions
      .filter(v => !existingApprovals.some(a => String(a.versionId) === String(v._id) && a.role === 'GOVERNANCE_OFFICER' && a.decision !== 'PENDING'))
      .map(buildQueueItem);

    // Executive Review Queue: versions in PENDING_APPROVAL where EXECUTIVE_APPROVER has not yet decided
    const executiveQueue = pendingVersions
      .filter(v => !existingApprovals.some(a => String(a.versionId) === String(v._id) && a.role === 'EXECUTIVE_APPROVER' && a.decision !== 'PENDING'))
      .map(buildQueueItem);

    // High Risk Models
    const highRiskModels = await Model.find({ riskLevel: { $in: ['HIGH', 'UNACCEPTABLE'] } })
      .populate('policyId')
      .sort({ updatedAt: -1 })
      .limit(8);

    // Recent Decisions
    const [recentGovernanceDecisions, recentExecutiveDecisions] = await Promise.all([
      Approval.find({ role: 'GOVERNANCE_OFFICER', decision: { $ne: 'PENDING' } })
        .populate('modelId')
        .populate('versionId')
        .sort({ updatedAt: -1 })
        .limit(5),
      Approval.find({ role: 'EXECUTIVE_APPROVER', decision: { $ne: 'PENDING' } })
        .populate('modelId')
        .populate('versionId')
        .sort({ updatedAt: -1 })
        .limit(5)
    ]);

    // Platform Admin User Stats
    let userStats = { total: 0, active: 0, pending: 0, suspended: 0 };
    let pendingUsers = [];
    if (userRole === 'PLATFORM_ADMIN') {
      const [totalUsers, activeUsers, pendingVerifyUsers, suspendedUsers] = await Promise.all([
        User.countDocuments(),
        User.countDocuments({ status: 'ACTIVE' }),
        User.countDocuments({ verificationStatus: 'PENDING' }),
        User.countDocuments({ status: 'SUSPENDED' })
      ]);
      userStats = {
        total: totalUsers,
        active: activeUsers,
        pending: pendingVerifyUsers,
        suspended: suspendedUsers
      };
      pendingUsers = await User.find({ verificationStatus: 'PENDING' })
        .select('name email role department status createdAt')
        .sort({ createdAt: -1 })
        .limit(8);
    }

    // Open Incidents List
    const openIncidentsList = await Incident.find({ status: { $in: ['OPEN', 'INVESTIGATING'] } })
      .populate('modelId')
      .sort({ createdAt: -1 })
      .limit(5);

    // Assemble comprehensive enterprise payload
    return res.json({
      success: true,
      data: {
        // 1. High-level KPIs (Backward compatible & accurate)
        totalModels,
        productionModels,
        modelsInGovernance,
        pendingApprovals,
        policyViolations,
        openIncidents,
        driftAlerts,
        totalPolicies,
        activePolicies,
        modelsWithoutPolicyCount,

        // 2. Distributions
        riskDistribution,
        lifecycleDistribution,

        // 3. Shared Ledgers
        recentAudit,
        actionModels,
        openIncidentsList,
        modelsWithoutPolicy,

        // 4. Role-Specific Data Pools
        mlLead: {
          myModels,
          attentionItems: {
            draftVersionsWithoutEval,
            gateFailedVersions,
            returnedVersions
          },
          evaluationsPendingCount: draftVersionsWithoutEval.length,
          failedGatesCount: policyViolations,
          driftAlertsCount: driftAlerts
        },

        governance: {
          reviewQueue: governanceQueue,
          pendingReviewsCount: governanceQueue.length,
          approvedCount: await Approval.countDocuments({ role: 'GOVERNANCE_OFFICER', decision: 'APPROVED' }),
          returnedCount: await Approval.countDocuments({ role: 'GOVERNANCE_OFFICER', decision: { $in: ['CHANGES_REQUESTED', 'REJECTED'] } }),
          fairnessIssuesCount: policyViolations,
          highRiskModels,
          recentDecisions: recentGovernanceDecisions,
          policyStats: {
            total: totalPolicies,
            active: activePolicies,
            draft: totalPolicies - activePolicies,
            unassignedModelsCount: modelsWithoutPolicyCount
          },
          policyViolationsList: gateFailedVersions,
          modelsWithoutPolicyList: modelsWithoutPolicy
        },

        ethics: {
          reviewQueue: governanceQueue,
          pendingReviewsCount: governanceQueue.length,
          approvedCount: await Approval.countDocuments({ role: 'GOVERNANCE_OFFICER', decision: 'APPROVED' }),
          returnedCount: await Approval.countDocuments({ role: 'GOVERNANCE_OFFICER', decision: { $in: ['CHANGES_REQUESTED', 'REJECTED'] } }),
          fairnessIssuesCount: policyViolations,
          highRiskModels,
          recentDecisions: recentGovernanceDecisions
        },

        compliance: {
          policyStats: {
            total: totalPolicies,
            active: activePolicies,
            draft: totalPolicies - activePolicies,
            unassignedModelsCount: modelsWithoutPolicyCount
          },
          reviewQueue: governanceQueue,
          pendingReviewsCount: governanceQueue.length,
          policyViolationsList: gateFailedVersions,
          modelsWithoutPolicyList: modelsWithoutPolicy,
          recentDecisions: recentGovernanceDecisions
        },

        executive: {
          summary: {
            productionModels,
            highRiskProductionCount: await Model.countDocuments({ lifecycleStatus: 'IN_PRODUCTION', riskLevel: { $in: ['HIGH', 'UNACCEPTABLE'] } }),
            pendingExecutiveDecisions: executiveQueue.length,
            openCriticalIncidents: await Incident.countDocuments({ severity: { $in: ['CRITICAL', 'HIGH'] }, status: { $in: ['OPEN', 'INVESTIGATING'] } }),
            policyViolations,
            unassignedPolicyCount: modelsWithoutPolicyCount
          },
          decisionsQueue: executiveQueue,
          recentDecisions: recentExecutiveDecisions
        },

        platformAdmin: {
          userStats,
          pendingUsers,
          totalAuditEvents: recentAudit.length > 0 ? recentAudit[0].sequenceNumber || 0 : 0
        }
      }
    });
  } catch (error) {
    console.error('Error in getDashboardStats:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
