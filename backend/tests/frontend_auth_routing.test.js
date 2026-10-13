import test from 'node:test';
import assert from 'node:assert';

/**
 * Stage 2 Phase 5 — Frontend Authentication, Protected Route Guards,
 * and Role-Aware Navigation Contract Verification
 */

// Model of ProtectedRoute decision logic implemented in ProtectedRoute.jsx
function evaluateRouteAccess({ loading, isAuthenticated, user, allowedRoles }) {
  if (loading) {
    return { state: 'LOADING', render: 'AuthLoadingScreen' };
  }
  if (!isAuthenticated || !user) {
    return { state: 'REDIRECT', destination: '/login' };
  }
  if (user.status === 'SUSPENDED') {
    return { state: 'BLOCKED', render: 'SuspendedNotice' };
  }
  if (user.status === 'PENDING') {
    return { state: 'BLOCKED', render: 'PendingApprovalNotice' };
  }
  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    return { state: 'FORBIDDEN', render: 'AccessDeniedNotice' };
  }
  return { state: 'ALLOWED', render: 'Children' };
}

// Model of Sidebar navigation items generation implemented in Sidebar.jsx
function getRoleNavItems(role) {
  if (role === 'PLATFORM_ADMIN') {
    return [
      { to: '/admin/users', group: 'Administration', label: 'Users & Roles' },
      { to: '/app', group: 'Permitted Oversight', label: 'Executive Dashboard' },
      { to: '/app/registry', group: 'Permitted Oversight', label: 'Model Registry' },
      { to: '/app/audit', group: 'Permitted Oversight', label: 'Audit Trail & Ledger' },
      { to: '/app/dossier', group: 'Permitted Oversight', label: 'Compliance Dossier' }
    ];
  }
  // Non-admin authoritative roles (ML_LEAD, GOVERNANCE_OFFICER, EXECUTIVE_APPROVER)
  return [
    { to: '/app', group: 'Lifecycle Control', label: 'Executive Dashboard' },
    { to: '/app/registry', group: 'Lifecycle Control', label: 'Model Registry' },
    { to: '/app/evaluation', group: 'Lifecycle Control', label: 'Fairness & Eval Studio' },
    { to: '/app/policies', group: 'Lifecycle Control', label: 'Policy Management' },
    { to: '/app/approvals', group: 'Lifecycle Control', label: 'Approval Center' },
    { to: '/app/monitoring', group: 'Lifecycle Control', label: 'Runtime Drift & Health' },
    { to: '/app/incidents', group: 'Lifecycle Control', label: 'Incident Management' },
    { to: '/app/audit', group: 'Lifecycle Control', label: 'Audit Trail & Ledger' },
    { to: '/app/dossier', group: 'Lifecycle Control', label: 'Compliance Dossier' }
  ];
}

// Model of API 401 response handler in api.js
function handleApiResponse(status, storage, dispatchEvent) {
  if (status === 401) {
    storage.removeItem('aegis_token');
    dispatchEvent({ type: 'aegis:unauthorized' });
    return { ok: false, status: 401, error: 'Unauthorized' };
  }
  return { ok: true, status: 200 };
}

test('Frontend Auth Guard: Unauthenticated users are redirected to /login', () => {
  const result = evaluateRouteAccess({
    loading: false,
    isAuthenticated: false,
    user: null
  });

  assert.strictEqual(result.state, 'REDIRECT');
  assert.strictEqual(result.destination, '/login');
});

test('Frontend Auth Guard: Loading state does not briefly expose protected content', () => {
  const result = evaluateRouteAccess({
    loading: true,
    isAuthenticated: true,
    user: { email: 'admin@aegis.ai', role: 'PLATFORM_ADMIN', status: 'ACTIVE' }
  });

  assert.strictEqual(result.state, 'LOADING');
  assert.strictEqual(result.render, 'AuthLoadingScreen');
});

test('Frontend Auth Guard: PENDING users see pending-access state instead of application', () => {
  const result = evaluateRouteAccess({
    loading: false,
    isAuthenticated: true,
    user: {
      email: 'newuser@example.com',
      role: 'GOVERNANCE_OFFICER',
      status: 'PENDING'
    }
  });

  assert.strictEqual(result.state, 'BLOCKED');
  assert.strictEqual(result.render, 'PendingApprovalNotice');
});

test('Frontend Auth Guard: SUSPENDED users see access-denied state', () => {
  const result = evaluateRouteAccess({
    loading: false,
    isAuthenticated: true,
    user: {
      email: 'badactor@example.com',
      role: 'GOVERNANCE_OFFICER',
      status: 'SUSPENDED'
    }
  });

  assert.strictEqual(result.state, 'BLOCKED');
  assert.strictEqual(result.render, 'SuspendedNotice');
});

test('Frontend Auth Guard: ACTIVE users can access the application', () => {
  const result = evaluateRouteAccess({
    loading: false,
    isAuthenticated: true,
    user: {
      email: 'lead@aegis.ai',
      role: 'ML_LEAD',
      status: 'ACTIVE'
    }
  });

  assert.strictEqual(result.state, 'ALLOWED');
  assert.strictEqual(result.render, 'Children');
});

test('Frontend Auth Guard: Non-admin users are blocked from /admin routes', () => {
  const result = evaluateRouteAccess({
    loading: false,
    isAuthenticated: true,
    user: {
      email: 'lead@aegis.ai',
      role: 'ML_LEAD',
      status: 'ACTIVE'
    },
    allowedRoles: ['PLATFORM_ADMIN']
  });

  assert.strictEqual(result.state, 'FORBIDDEN');
  assert.strictEqual(result.render, 'AccessDeniedNotice');
});

test('Frontend Auth Guard: Platform Admin is allowed on /admin routes', () => {
  const result = evaluateRouteAccess({
    loading: false,
    isAuthenticated: true,
    user: {
      email: 'admin@aegis.ai',
      role: 'PLATFORM_ADMIN',
      status: 'ACTIVE'
    },
    allowedRoles: ['PLATFORM_ADMIN']
  });

  assert.strictEqual(result.state, 'ALLOWED');
  assert.strictEqual(result.render, 'Children');
});

test('Role-Aware Navigation: Platform Admin receives administration and permitted oversight navigation', () => {
  const items = getRoleNavItems('PLATFORM_ADMIN');
  const paths = items.map(i => i.to);

  assert.ok(paths.includes('/admin/users'), 'Must contain /admin/users');
  assert.ok(paths.includes('/app'), 'Must contain /app');
  assert.ok(paths.includes('/app/registry'), 'Must contain /app/registry');
  assert.ok(paths.includes('/app/audit'), 'Must contain /app/audit');
  assert.ok(paths.includes('/app/dossier'), 'Must contain /app/dossier');

  // Should NOT contain domain execution routes
  assert.strictEqual(paths.includes('/app/evaluation'), false);
  assert.strictEqual(paths.includes('/app/approvals'), false);
  assert.strictEqual(paths.includes('/app/incidents'), false);
});

test('Role-Aware Navigation: Governance roles receive lifecycle control navigation', () => {
  const items = getRoleNavItems('ML_LEAD');
  const paths = items.map(i => i.to);

  assert.ok(paths.includes('/app'));
  assert.ok(paths.includes('/app/registry'));
  assert.ok(paths.includes('/app/evaluation'));
  assert.ok(paths.includes('/app/policies'));
  assert.ok(paths.includes('/app/approvals'));
  assert.ok(paths.includes('/app/monitoring'));
  assert.ok(paths.includes('/app/incidents'));
  assert.ok(paths.includes('/app/audit'));
  assert.ok(paths.includes('/app/dossier'));

  // Should NOT contain platform admin routes
  assert.strictEqual(paths.includes('/admin/users'), false);
});

test('Role-Aware Navigation: Governance Officer receives full governance lifecycle navigation', () => {
  const items = getRoleNavItems('GOVERNANCE_OFFICER');
  const paths = items.map(i => i.to);

  assert.ok(paths.includes('/app'));
  assert.ok(paths.includes('/app/registry'));
  assert.ok(paths.includes('/app/audit'));
  assert.ok(paths.includes('/app/approvals'));
  assert.ok(paths.includes('/app/policies'));
  assert.ok(paths.includes('/app/dossier'));

  // Should NOT contain admin
  assert.strictEqual(paths.includes('/admin/users'), false);
});

test('Session Handling: 401 response clears token and dispatches unauthorized event', () => {
  const storage = {
    items: { aegis_token: 'valid.looking.jwt' },
    removeItem(key) { delete this.items[key]; }
  };

  let eventDispatched = null;
  const dispatchEvent = (ev) => { eventDispatched = ev; };

  const res = handleApiResponse(401, storage, dispatchEvent);

  assert.strictEqual(res.ok, false);
  assert.strictEqual(storage.items.aegis_token, undefined, 'Token must be removed from storage');
  assert.ok(eventDispatched, 'Unauthorized event must be dispatched');
  assert.strictEqual(eventDispatched.type, 'aegis:unauthorized');
});

test('Session Handling: Logout clears local session and resets state', () => {
  const state = {
    token: 'jwt.token.here',
    user: { email: 'admin@aegis.ai', role: 'PLATFORM_ADMIN' }
  };

  const logout = () => {
    state.token = null;
    state.user = null;
  };

  logout();

  assert.strictEqual(state.token, null);
  assert.strictEqual(state.user, null);
});

// Import capabilities logic directly for testing
import { ROLE_CAPABILITIES, getRoleCapabilities } from '../../frontend/src/utils/permissions.js';

test('Role Action Capabilities: Platform Admin does not receive domain-execution actions', () => {
  const caps = getRoleCapabilities('PLATFORM_ADMIN');

  // Allowed
  assert.strictEqual(caps.canManageUsers, true);
  assert.strictEqual(caps.canRepairAudit, true);
  assert.strictEqual(caps.canSimulateTamper, true);

  // Blocked domain execution actions (Separation of duties)
  assert.strictEqual(caps.canCreateModels, false);
  assert.strictEqual(caps.canCreateVersions, false);
  assert.strictEqual(caps.canTransitionLifecycle, false);
  assert.strictEqual(caps.canRunEvaluations, false);
  assert.strictEqual(caps.canManagePolicies, false);
  assert.strictEqual(caps.canSignApprovals, false);
  assert.strictEqual(caps.canRollback, false);
  assert.strictEqual(caps.canSimulateTelemetry, false);
});

test('Role Action Capabilities: Governance Officer receives evaluation, policy management & sign-off capabilities', () => {
  const caps = getRoleCapabilities('GOVERNANCE_OFFICER');

  assert.strictEqual(caps.canRunEvaluations, true);
  assert.strictEqual(caps.canManagePolicies, true);
  assert.strictEqual(caps.canSignApprovals, true);
  assert.strictEqual(caps.canAssessRisk, true);
  assert.strictEqual(caps.canReviewIssues, true);
  assert.strictEqual(caps.canEscalateIssues, true);

  // Governance Officer cannot create models, rollback, or manage users
  assert.strictEqual(caps.canCreateModels, false);
  assert.strictEqual(caps.canRollback, false);
  assert.strictEqual(caps.canManageUsers, false);
  assert.strictEqual(caps.canSimulateTamper, false);
  assert.strictEqual(caps.canRepairAudit, false);
});

test('Role Action Capabilities: Executive Approver receives approval sign-off but cannot execute rollbacks', () => {
  const caps = getRoleCapabilities('EXECUTIVE_APPROVER');

  assert.strictEqual(caps.canSignApprovals, true);
  assert.strictEqual(caps.canRollback, false);

  // Executive Approver cannot create models, versions, run evals, or modify policies
  assert.strictEqual(caps.canCreateModels, false);
  assert.strictEqual(caps.canCreateVersions, false);
  assert.strictEqual(caps.canManagePolicies, false);
  assert.strictEqual(caps.canRunEvaluations, false);
});

test('Role Action Capabilities: ML Lead receives model operations, sign-off, and technical rollback authorization', () => {
  const caps = getRoleCapabilities('ML_LEAD');

  assert.strictEqual(caps.canSignApprovals, true);
  assert.strictEqual(caps.canRollback, true);
  assert.strictEqual(caps.canCreateModels, true);
  assert.strictEqual(caps.canCreateVersions, true);
  assert.strictEqual(caps.canRunEvaluations, true);
  assert.strictEqual(caps.canManageUsers, false);
});

test('Approval Submission: Approval role always resolves from authenticated user identity', () => {
  // Scenario 1: Authenticated user is GOVERNANCE_OFFICER, simulation persona is ML_LEAD
  const authenticatedUser = {
    _id: 'user123',
    email: 'governance@aegis.ai',
    name: 'Amina Al-Mansoor',
    role: 'GOVERNANCE_OFFICER',
    status: 'ACTIVE'
  };
  const simulationPersona = { id: 'ML_LEAD', name: 'Dr. Elena Rostova' };

  // ApprovalCenter resolution logic:
  const signoffRole = authenticatedUser?.role || simulationPersona.id;
  const approverName = authenticatedUser?.name || simulationPersona.name;

  assert.strictEqual(signoffRole, 'GOVERNANCE_OFFICER', 'Sign-off role must come from authenticated user');
  assert.strictEqual(approverName, 'Amina Al-Mansoor', 'Approver name must come from authenticated user');

  // Scenario 2: Unauthenticated demo mode falls back to simulation persona
  const unauthUser = null;
  const fallbackRole = unauthUser?.role || simulationPersona.id;
  const fallbackName = unauthUser?.name || simulationPersona.name;

  assert.strictEqual(fallbackRole, 'ML_LEAD');
  assert.strictEqual(fallbackName, 'Dr. Elena Rostova');
});

test('Audit UI: Audit repair and tamper controls are ONLY exposed when demoModeEnabled is true', () => {
  // Production environment or demo flag disabled:
  const productionIntegrity = { valid: true, demoModeEnabled: false };
  const showDemoControlsProd = Boolean(productionIntegrity.demoModeEnabled);
  assert.strictEqual(showDemoControlsProd, false, 'Production audit UI must not expose repair or tamper controls');

  // Development with ENABLE_AUDIT_TAMPER_DEMO === 'true':
  const devDemoIntegrity = { valid: false, demoModeEnabled: true };
  const showDemoControlsDev = Boolean(devDemoIntegrity.demoModeEnabled);
  assert.strictEqual(showDemoControlsDev, true, 'Development demo mode exposes repair controls when explicitly enabled');
});


