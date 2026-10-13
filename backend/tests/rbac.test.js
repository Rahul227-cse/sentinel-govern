import test from 'node:test';
import assert from 'node:assert';
import { 
  requireRole, 
  requirePermission, 
  requireApprovalSignoffRole, 
  requireDemoAuditEnabled 
} from '../src/middleware/authMiddleware.js';
import { PERMISSIONS, hasPermission } from '../src/config/permissions.js';

test('RBAC Matrix: Permission mappings match defined roles strictly', () => {
  // ML Lead capabilities
  assert.strictEqual(hasPermission('ML_LEAD', PERMISSIONS.MODELS_CREATE), true);
  assert.strictEqual(hasPermission('ML_LEAD', PERMISSIONS.ROLLBACK_EXECUTE), true);
  assert.strictEqual(hasPermission('ML_LEAD', PERMISSIONS.ADMIN_USERS_MANAGE), false);

  // Governance Officer capabilities (combines Ethics + Compliance)
  assert.strictEqual(hasPermission('GOVERNANCE_OFFICER', PERMISSIONS.EVALUATIONS_RUN), true);
  assert.strictEqual(hasPermission('GOVERNANCE_OFFICER', PERMISSIONS.EVALUATION_UPLOAD), true);
  assert.strictEqual(hasPermission('GOVERNANCE_OFFICER', PERMISSIONS.POLICIES_CREATE), true);
  assert.strictEqual(hasPermission('GOVERNANCE_OFFICER', PERMISSIONS.POLICIES_EDIT), true);
  assert.strictEqual(hasPermission('GOVERNANCE_OFFICER', PERMISSIONS.MODELS_ASSESS_RISK), true);
  assert.strictEqual(hasPermission('GOVERNANCE_OFFICER', PERMISSIONS.APPROVALS_SIGN_OFF), true);
  assert.strictEqual(hasPermission('GOVERNANCE_OFFICER', PERMISSIONS.ISSUES_MANAGE), true);
  assert.strictEqual(hasPermission('GOVERNANCE_OFFICER', PERMISSIONS.ISSUES_SUBMIT), true);
  assert.strictEqual(hasPermission('GOVERNANCE_OFFICER', PERMISSIONS.MODELS_CREATE), false);
  assert.strictEqual(hasPermission('GOVERNANCE_OFFICER', PERMISSIONS.ROLLBACK_EXECUTE), false);
  assert.strictEqual(hasPermission('GOVERNANCE_OFFICER', PERMISSIONS.ADMIN_USERS_MANAGE), false);

  // Executive Approver capabilities (Oversight, Sign-Off, but NOT technical rollback)
  assert.strictEqual(hasPermission('EXECUTIVE_APPROVER', PERMISSIONS.ROLLBACK_EXECUTE), false);
  assert.strictEqual(hasPermission('EXECUTIVE_APPROVER', PERMISSIONS.APPROVALS_SIGN_OFF), true);
  assert.strictEqual(hasPermission('EXECUTIVE_APPROVER', PERMISSIONS.ISSUES_SUBMIT), true);
  assert.strictEqual(hasPermission('EXECUTIVE_APPROVER', PERMISSIONS.ISSUES_MANAGE), false);
  assert.strictEqual(hasPermission('EXECUTIVE_APPROVER', PERMISSIONS.MODELS_CREATE), false);
  assert.strictEqual(hasPermission('EXECUTIVE_APPROVER', PERMISSIONS.POLICIES_CREATE), false);

  // Platform Admin scoped strictly to administration and oversight
  assert.strictEqual(hasPermission('PLATFORM_ADMIN', PERMISSIONS.ADMIN_USERS_MANAGE), true);
  assert.strictEqual(hasPermission('PLATFORM_ADMIN', PERMISSIONS.ADMIN_ROLES_ASSIGN), true);
  assert.strictEqual(hasPermission('PLATFORM_ADMIN', PERMISSIONS.AUDIT_VIEW), true);
  assert.strictEqual(hasPermission('PLATFORM_ADMIN', PERMISSIONS.AUDIT_VERIFY), true);
  assert.strictEqual(hasPermission('PLATFORM_ADMIN', PERMISSIONS.MODELS_VIEW), true);
  assert.strictEqual(hasPermission('PLATFORM_ADMIN', PERMISSIONS.ISSUES_SUBMIT), true);

  // Platform Admin DOES NOT get domain execution permissions (separation of duties)
  assert.strictEqual(hasPermission('PLATFORM_ADMIN', PERMISSIONS.MODELS_CREATE), false);
  assert.strictEqual(hasPermission('PLATFORM_ADMIN', PERMISSIONS.EVALUATIONS_RUN), false);
  assert.strictEqual(hasPermission('PLATFORM_ADMIN', PERMISSIONS.POLICIES_CREATE), false);
  assert.strictEqual(hasPermission('PLATFORM_ADMIN', PERMISSIONS.ROLLBACK_EXECUTE), false);
  assert.strictEqual(hasPermission('PLATFORM_ADMIN', PERMISSIONS.APPROVALS_SIGN_OFF), false);
});

test('RBAC Middleware: requireRole allows authorized role', () => {
  const middleware = requireRole('ML_LEAD');
  const req = {
    user: {
      email: 'lead@aegis.ai',
      role: 'ML_LEAD',
      status: 'ACTIVE'
    }
  };

  let nextCalled = false;
  middleware(req, {}, () => { nextCalled = true; });

  assert.strictEqual(nextCalled, true);
});

test('RBAC Middleware: requireRole rejects unauthorized role with 403', () => {
  const middleware = requireRole('ML_LEAD');
  const req = {
    user: {
      email: 'approver@aegis.ai',
      role: 'EXECUTIVE_APPROVER',
      status: 'ACTIVE'
    }
  };

  let statusCode = null;
  let responseData = null;
  const res = {
    status(code) {
      statusCode = code;
      return {
        json(data) {
          responseData = data;
        }
      };
    }
  };

  let nextCalled = false;
  middleware(req, res, () => { nextCalled = true; });

  assert.strictEqual(statusCode, 403);
  assert.strictEqual(responseData.success, false);
  assert.match(responseData.error, /forbidden/i);
  assert.strictEqual(nextCalled, false);
});

test('RBAC Middleware: PLATFORM_ADMIN cannot access an ML_LEAD-only route merely because it is admin', () => {
  const middleware = requireRole('ML_LEAD');
  const req = {
    user: {
      email: 'admin@aegis.ai',
      role: 'PLATFORM_ADMIN',
      status: 'ACTIVE'
    }
  };

  let statusCode = null;
  let responseData = null;
  const res = {
    status(code) {
      statusCode = code;
      return {
        json(data) {
          responseData = data;
        }
      };
    }
  };

  let nextCalled = false;
  middleware(req, res, () => { nextCalled = true; });

  assert.strictEqual(statusCode, 403, 'Platform Admin must be rejected from ML_LEAD-specific execution route');
  assert.strictEqual(responseData.success, false);
  assert.strictEqual(nextCalled, false);
});

test('RBAC Middleware: PLATFORM_ADMIN can access platform administration endpoints', () => {
  const middleware = requireRole('PLATFORM_ADMIN');
  const req = {
    user: {
      email: 'admin@aegis.ai',
      role: 'PLATFORM_ADMIN',
      status: 'ACTIVE'
    }
  };

  let nextCalled = false;
  middleware(req, {}, () => { nextCalled = true; });

  assert.strictEqual(nextCalled, true, 'Platform Admin must pass administrative route checks');
});

test('RBAC Middleware: requireApprovalSignoffRole blocks Platform Admin from impersonating ML Lead', () => {
  const req = {
    user: {
      email: 'admin@aegis.ai',
      role: 'PLATFORM_ADMIN',
      status: 'ACTIVE'
    },
    body: {
      role: 'ML_LEAD', // Admin attempting to sign off as ML Lead
      decision: 'APPROVED'
    }
  };

  let statusCode = null;
  let responseData = null;
  const res = {
    status(code) {
      statusCode = code;
      return {
        json(data) {
          responseData = data;
        }
      };
    }
  };

  let nextCalled = false;
  requireApprovalSignoffRole(req, res, () => { nextCalled = true; });

  assert.strictEqual(statusCode, 403);
  assert.strictEqual(responseData.success, false);
  assert.match(responseData.error, /impersonation/i);
  assert.strictEqual(nextCalled, false);
});

test('RBAC Middleware: requireApprovalSignoffRole allows matching role', () => {
  const req = {
    user: {
      email: 'governance@aegis.ai',
      role: 'GOVERNANCE_OFFICER',
      status: 'ACTIVE'
    },
    body: {
      role: 'GOVERNANCE_OFFICER',
      decision: 'APPROVED'
    }
  };

  let nextCalled = false;
  requireApprovalSignoffRole(req, {}, () => { nextCalled = true; });

  assert.strictEqual(nextCalled, true);
});

test('RBAC Middleware: PLATFORM_ADMIN can still view and verify permitted audit information', () => {
  const auditViewMiddleware = requirePermission(PERMISSIONS.AUDIT_VIEW);
  const auditVerifyMiddleware = requirePermission(PERMISSIONS.AUDIT_VERIFY);
  
  const req = {
    user: {
      email: 'admin@aegis.ai',
      role: 'PLATFORM_ADMIN',
      status: 'ACTIVE'
    }
  };

  let viewPassed = false;
  auditViewMiddleware(req, {}, () => { viewPassed = true; });
  assert.strictEqual(viewPassed, true, 'Platform Admin must have permission to view audit logs');

  let verifyPassed = false;
  auditVerifyMiddleware(req, {}, () => { verifyPassed = true; });
  assert.strictEqual(verifyPassed, true, 'Platform Admin must have permission to verify audit ledger integrity');
});

test('Audit Demo: Audit repair is strictly blocked in production', () => {
  const originalEnv = process.env.NODE_ENV;
  const originalFlag = process.env.ENABLE_AUDIT_TAMPER_DEMO;

  try {
    process.env.NODE_ENV = 'production';
    process.env.ENABLE_AUDIT_TAMPER_DEMO = 'true';

    let statusCode = null;
    let responseData = null;
    const res = {
      status(code) {
        statusCode = code;
        return {
          json(data) {
            responseData = data;
          }
        };
      }
    };

    let nextCalled = false;
    requireDemoAuditEnabled({ path: '/api/audit/repair' }, res, () => { nextCalled = true; });

    assert.strictEqual(statusCode, 403);
    assert.strictEqual(responseData.success, false);
    assert.match(responseData.error, /disabled in production/i);
    assert.strictEqual(nextCalled, false);
  } finally {
    process.env.NODE_ENV = originalEnv;
    process.env.ENABLE_AUDIT_TAMPER_DEMO = originalFlag;
  }
});

test('Audit Demo: Audit tamper simulation is strictly blocked in production', () => {
  const originalEnv = process.env.NODE_ENV;
  const originalFlag = process.env.ENABLE_AUDIT_TAMPER_DEMO;

  try {
    process.env.NODE_ENV = 'production';
    process.env.ENABLE_AUDIT_TAMPER_DEMO = 'true';

    let statusCode = null;
    let responseData = null;
    const res = {
      status(code) {
        statusCode = code;
        return {
          json(data) {
            responseData = data;
          }
        };
      }
    };

    let nextCalled = false;
    requireDemoAuditEnabled({ path: '/api/audit/simulate-tamper' }, res, () => { nextCalled = true; });

    assert.strictEqual(statusCode, 403);
    assert.strictEqual(responseData.success, false);
    assert.match(responseData.error, /disabled in production/i);
    assert.strictEqual(nextCalled, false);
  } finally {
    process.env.NODE_ENV = originalEnv;
    process.env.ENABLE_AUDIT_TAMPER_DEMO = originalFlag;
  }
});

test('Audit Demo: Blocked in development if ENABLE_AUDIT_TAMPER_DEMO is not true', () => {
  const originalEnv = process.env.NODE_ENV;
  const originalFlag = process.env.ENABLE_AUDIT_TAMPER_DEMO;

  try {
    process.env.NODE_ENV = 'development';
    process.env.ENABLE_AUDIT_TAMPER_DEMO = 'false';

    let statusCode = null;
    let responseData = null;
    const res = {
      status(code) {
        statusCode = code;
        return {
          json(data) {
            responseData = data;
          }
        };
      }
    };

    let nextCalled = false;
    requireDemoAuditEnabled({}, res, () => { nextCalled = true; });

    assert.strictEqual(statusCode, 403);
    assert.strictEqual(responseData.success, false);
    assert.strictEqual(nextCalled, false);
  } finally {
    process.env.NODE_ENV = originalEnv;
    process.env.ENABLE_AUDIT_TAMPER_DEMO = originalFlag;
  }
});

test('Audit Demo: Allowed only in non-production when ENABLE_AUDIT_TAMPER_DEMO === true', () => {
  const originalEnv = process.env.NODE_ENV;
  const originalFlag = process.env.ENABLE_AUDIT_TAMPER_DEMO;

  try {
    process.env.NODE_ENV = 'development';
    process.env.ENABLE_AUDIT_TAMPER_DEMO = 'true';

    let nextCalled = false;
    requireDemoAuditEnabled({}, {}, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, true);
  } finally {
    process.env.NODE_ENV = originalEnv;
    process.env.ENABLE_AUDIT_TAMPER_DEMO = originalFlag;
  }
});

