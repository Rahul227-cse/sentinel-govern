/**
 * Sentinel Govern — Enterprise Presentation Formatters
 * 
 * Centralized formatting helpers that translate backend enum codes and internal
 * database values into polished, natural human language.
 * 
 * HARD RULE: Never display raw developer enums with underscores to user-facing UI.
 */

const ROLE_MAP = {
  PLATFORM_ADMIN: 'Platform Administrator',
  ML_LEAD: 'ML Lead',
  GOVERNANCE_OFFICER: 'Governance Officer',
  EXECUTIVE_APPROVER: 'Executive Approver'
};

const LIFECYCLE_MAP = {
  DRAFT: 'Draft',
  UNDER_REVIEW: 'Under Review',
  EVALUATION: 'Evaluation',
  PENDING_APPROVAL: 'Pending Approval',
  APPROVED: 'Approved',
  IN_PRODUCTION: 'In Production',
  DEPRECATED: 'Deprecated',
  RETIRED: 'Retired'
};

const STATUS_MAP = {
  PENDING: 'Pending',
  ACTIVE: 'Active',
  SUSPENDED: 'Suspended',
  BLOCKED: 'Blocked',
  OFFLINE: 'Offline',
  VERIFIED: 'Verified',
  PENDING_VERIFICATION: 'Pending Verification'
};

const RISK_MAP = {
  UNACCEPTABLE: 'Unacceptable Risk',
  HIGH: 'High Risk',
  LIMITED: 'Limited Risk',
  MINIMAL: 'Minimal Risk'
};

const EVALUATION_STATUS_MAP = {
  NOT_EVALUATED: 'Not Evaluated',
  EVALUATED_PASS: 'Evaluated Pass',
  EVALUATED_FAIL: 'Evaluated Fail'
};

const POLICY_STATUS_MAP = {
  PASSED: 'Gate Passed',
  FAILED: 'Gate Blocked',
  PENDING: 'Pending Gate Check'
};

const POLICY_ACTION_MAP = {
  BLOCK_PROMOTION: 'Block Promotion (Strict Gate)',
  WARN_ONLY: 'Warn Only'
};

const INCIDENT_TYPE_MAP = {
  DATA_DRIFT: 'Data Drift Anomaly',
  FAIRNESS_VIOLATION: 'Fairness Violation',
  PERFORMANCE_DEGRADATION: 'Performance Degradation',
  SECURITY_ANOMALY: 'Security Anomaly'
};

const DRIFT_STATUS_MAP = {
  HEALTHY: 'Healthy',
  WARNING: 'Warning',
  DRIFT_DETECTED: 'Drift Detected',
  NO_DATA: 'No Data Recorded',
  INCIDENT_ACTIVE: 'Incident Active'
};

const AUDIT_ACTION_MAP = {
  MODEL_CREATED: 'Model Registered',
  VERSION_CREATED: 'Version Initialized',
  EVALUATION_COMPLETED: 'Evaluation Completed',
  POLICY_PASSED: 'Policy Gate Passed',
  POLICY_FAILED: 'Policy Gate Blocked',
  APPROVAL_GRANTED: 'Approval Granted',
  APPROVAL_REJECTED: 'Approval Rejected',
  DEPLOYMENT_COMPLETED: 'Promoted to Production',
  DRIFT_DETECTED: 'Runtime Drift Detected',
  INCIDENT_CREATED: 'Incident Opened',
  INCIDENT_RESOLVED: 'Incident Resolved',
  MODEL_ROLLEDBACK: 'Rollback Executed',
  USER_SIGNUP: 'User Registered',
  USER_LOGIN: 'Session Authenticated',
  USER_LOGOUT: 'Session Ended',
  USER_ONBOARDING_COMPLETED: 'Onboarding Completed',
  USER_VERIFIED: 'Account Verified',
  USER_SUSPENDED: 'Account Suspended',
  USER_UNBLOCKED: 'Account Restored',
  USER_ROLE_CHANGED: 'Role Updated',
  AUDIT_TAMPER_SIMULATED: 'Tamper Simulation Injected',
  AUDIT_LEDGER_REPAIRED: 'Cryptographic Ledger Repaired'
};

export function formatRoleLabel(role) {
  if (!role || typeof role !== 'string') return 'Governance Officer';
  return ROLE_MAP[role] || role.replace(/_/g, ' ');
}

export function formatLifecycleLabel(status) {
  if (!status || typeof status !== 'string') return 'Draft';
  return LIFECYCLE_MAP[status] || status.replace(/_/g, ' ');
}

export function formatStatusLabel(status) {
  if (!status || typeof status !== 'string') return 'Pending';
  return STATUS_MAP[status] || status.replace(/_/g, ' ');
}

export function formatRiskLevel(level) {
  if (!level || typeof level !== 'string') return 'High Risk';
  return RISK_MAP[level] || `${level.replace(/_/g, ' ')} Risk`;
}

export function formatEvaluationStatus(status) {
  if (!status || typeof status !== 'string') return 'Not Evaluated';
  return EVALUATION_STATUS_MAP[status] || status.replace(/_/g, ' ');
}

export function formatPolicyStatus(status) {
  if (!status || typeof status !== 'string') return 'Pending Check';
  return POLICY_STATUS_MAP[status] || status.replace(/_/g, ' ');
}

export function formatPolicyAction(action) {
  if (!action || typeof action !== 'string') return 'Block Promotion';
  return POLICY_ACTION_MAP[action] || action.replace(/_/g, ' ');
}

export function formatIncidentType(type) {
  if (!type || typeof type !== 'string') return 'Operational Anomaly';
  return INCIDENT_TYPE_MAP[type] || type.replace(/_/g, ' ');
}

export function formatDriftStatus(status) {
  if (!status || typeof status !== 'string') return 'No Data';
  return DRIFT_STATUS_MAP[status] || status.replace(/_/g, ' ');
}

export function formatAuditAction(action) {
  if (!action || typeof action !== 'string') return 'System Action';
  return AUDIT_ACTION_MAP[action] || action.replace(/_/g, ' ');
}

export function formatCleanString(str) {
  if (!str || typeof str !== 'string') return '';
  return str.replace(/_/g, ' ');
}

export function formatCompactDateTime(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return String(dateStr);
  }
}

export function formatVerificationStatus(status) {
  if (!status || typeof status !== 'string') return 'Pending Verification';
  if (status === 'VERIFIED') return 'Verified';
  return 'Pending Verification';
}
