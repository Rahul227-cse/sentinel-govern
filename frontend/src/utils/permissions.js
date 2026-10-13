/**
 * Sentinel Govern — Frontend UX Role Capability Helpers
 *
 * NOTE: Frontend permission checks are for UX guidance and display ONLY.
 * Backend RBAC (requireRole, requirePermission, requireApprovalSignoffRole)
 * remains authoritative and enforces all mutations and access.
 */

export const ROLE_CAPABILITIES = {
  PLATFORM_ADMIN: {
    canManageUsers: true,
    canCreateModels: false,
    canCreateVersions: false,
    canTransitionLifecycle: false,
    canRunEvaluations: false,
    canManagePolicies: false,
    canSignApprovals: false, // May sign only if policy explicitly requires PLATFORM_ADMIN
    canRollback: false,
    canSimulateTelemetry: false,
    canSimulateTamper: true,
    canRepairAudit: true,
    canAssessRisk: false,
    canSubmitIssues: true,
    canReviewIssues: false,
    canEscalateIssues: false
  },
  ML_LEAD: {
    canManageUsers: false,
    canCreateModels: true,
    canCreateVersions: true,
    canTransitionLifecycle: true,
    canRunEvaluations: true,
    canManagePolicies: false,
    canSignApprovals: true,
    canRollback: true,
    canSimulateTelemetry: true,
    canSimulateTamper: false,
    canRepairAudit: false,
    canAssessRisk: true,
    canSubmitIssues: true,
    canReviewIssues: true,
    canEscalateIssues: true
  },
  GOVERNANCE_OFFICER: {
    canManageUsers: false,
    canCreateModels: false,
    canCreateVersions: false,
    canTransitionLifecycle: false,
    canRunEvaluations: true,
    canManagePolicies: true,
    canSignApprovals: true,
    canRollback: false,
    canSimulateTelemetry: false,
    canSimulateTamper: false,
    canRepairAudit: false,
    canAssessRisk: true,
    canSubmitIssues: true,
    canReviewIssues: true,
    canEscalateIssues: true
  },
  EXECUTIVE_APPROVER: {
    canManageUsers: false,
    canCreateModels: false,
    canCreateVersions: false,
    canTransitionLifecycle: false,
    canRunEvaluations: false,
    canManagePolicies: false,
    canSignApprovals: true,
    canRollback: false,
    canSimulateTelemetry: false,
    canSimulateTamper: false,
    canRepairAudit: false,
    canAssessRisk: false,
    canSubmitIssues: true,
    canReviewIssues: false,
    canEscalateIssues: false
  }
};

export function getRoleCapabilities(role) {
  return ROLE_CAPABILITIES[role] || ROLE_CAPABILITIES.GOVERNANCE_OFFICER;
}
