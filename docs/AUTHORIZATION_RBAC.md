# Aegis AI — Authorization & Role-Based Access Control (RBAC)

Aegis AI enforces a strict, server-authoritative Role-Based Access Control (RBAC) architecture designed around the regulatory requirement of **Separation of Duties** (EU AI Act, NIST AI RMF, and ISO 42001).

---

## 1. Implemented Roles (4 Canonical Roles)

The platform defines 4 canonical roles within [backend/src/config/permissions.js](file:///d:/Projects/govern/backend/src/config/permissions.js):

1. **`PLATFORM_ADMIN` (Platform Administrator):** Oversees platform users, account verification, role assignment, system infrastructure, and audit integrity. **Explicitly prohibited from model authoring, policy sign-off, or rollback execution.**
2. **`ML_LEAD` (Machine Learning & Data Science Lead):** Responsible for model registration, version control, training lineage, evaluation execution, runtime monitoring, and technical incident remediation.
3. **`GOVERNANCE_OFFICER` (AI Governance & Compliance Officer):** Unified regulatory and ethical gatekeeper. Configures governance policies, assesses EU AI Act conformity, audits statistical fairness and bias mitigation, and submits mandatory governance sign-offs.
4. **`EXECUTIVE_APPROVER` (Executive Approver / VP Leadership):** High-level business authority granting final deployment authorizations, evaluating residual risk, and authorizing emergency rollbacks.

*(Note: Legacy roles `ETHICS_OFFICER`, `COMPLIANCE_OFFICER`, `EXECUTIVE_SPONSOR`, and `EMPLOYEE` were consolidated. Verified platform contributors can report issues via `ISSUES_SUBMIT`.)*

---

## 2. Complete Permissions Matrix (26 Permissions)

| Permission Identifier | Action Description | Platform Admin | ML Lead | Governance Officer | Executive Approver |
|---|---|:---:|:---:|:---:|:---:|
| `models:view` | View model registry & cards | ✅ | ✅ | ✅ | ✅ |
| `models:create` | Register new AI models | ❌ | ✅ | ❌ | ❌ |
| `models:edit` | Update model metadata | ❌ | ✅ | ❌ | ❌ |
| `models:assess_risk` | Conduct risk intake assessment | ❌ | ✅ | ✅ | ❌ |
| `versions:create` | Create new model versions | ❌ | ✅ | ❌ | ❌ |
| `lifecycle:transition` | Advance lifecycle stage gates | ❌ | ✅ | ❌ | ❌ |
| `evaluations:view` | Inspect evaluation benchmarks | ✅ | ✅ | ✅ | ❌ |
| `evaluations:run` | Execute statistical evaluations | ❌ | ✅ | ✅ | ❌ |
| `evaluations:upload` | Upload CSV/XLSX benchmark files | ❌ | ✅ | ✅ | ❌ |
| `policies:view` | View governance policy rules | ✅ | ✅ | ✅ | ❌ |
| `policies:create` | Author new governance policies | ❌ | ❌ | ✅ | ❌ |
| `policies:edit` | Modify policy rule thresholds | ❌ | ❌ | ✅ | ❌ |
| `policies:check` | Run policy gate evaluation check | ✅ | ✅ | ✅ | ❌ |
| `approvals:view` | View approval stage status | ✅ | ✅ | ✅ | ✅ |
| `approvals:sign_off` | Submit formal approval decision | ❌ | ✅ | ✅ | ✅ |
| `telemetry:view` | View production drift metrics | ✅ | ✅ | ❌ | ❌ |
| `telemetry:simulate` | Trigger drift simulation batch | ❌ | ✅ | ❌ | ❌ |
| `monitoring:manage` | Configure monitoring thresholds | ❌ | ✅ | ❌ | ❌ |
| `incidents:view` | View operational incidents | ✅ | ✅ | ✅ | ✅ |
| `incidents:investigate` | Add triage/investigation notes | ❌ | ✅ | ✅ | ❌ |
| `incidents:update` | Update incident status | ❌ | ✅ | ✅ | ❌ |
| `rollback:execute` | Execute emergency version rollback | ❌ | ✅ | ❌ | ✅ |
| `audit:view` | View cryptographic audit ledger | ✅ | ✅ | ✅ | ✅ |
| `audit:verify` | Run cryptographic integrity check | ✅ | ✅ | ✅ | ❌ |
| `audit:simulate` | Run non-prod tamper simulation | ❌* | ❌ | ❌ | ❌ |
| `dossier:view` | View regulatory compliance dossier | ✅ | ✅ | ✅ | ✅ |
| `dossier:export` | Export compliance dossier artifact | ✅ | ✅ | ✅ | ✅ |
| `issues:view` | View reported issues | ✅ | ✅ | ✅ | ✅ |
| `issues:submit` | Submit operational issue report | ✅ | ✅ | ✅ | ✅ |
| `issues:manage` | Triage / resolve issue reports | ❌ | ✅ | ✅ | ❌ |
| `admin:users_view` | View registered platform users | ✅ | ❌ | ❌ | ❌ |
| `admin:users_manage` | Verify, block, or unblock users | ✅ | ❌ | ❌ | ❌ |
| `admin:roles_assign` | Assign roles to existing users | ✅ | ❌ | ❌ | ❌ |
| `admin:system_config` | Modify platform configurations | ✅ | ❌ | ❌ | ❌ |

*\*Note: `audit:simulate` and ledger repair are additionally protected by the environment guard `requireDemoAuditEnabled` (`ENABLE_AUDIT_TAMPER_DEMO=true` in non-production only).*

---

## 3. Core Security Rules & Non-Negotiable Invariants

### 1. Frontend Persona Selection is NOT Authorization
The frontend UI allows persona switching during unauthenticated walkthroughs. However, once a user is authenticated, [RoleContext.jsx](file:///d:/Projects/govern/frontend/src/context/RoleContext.jsx) locks persona switching:
```javascript
const switchRole = (roleId) => {
  if (isAuthenticated) {
    console.warn('[RoleContext] Role cannot be overridden: Authenticated Aegis role is server-authoritative.');
    return;
  }
  // ...
};
```
Every backend request verifies the JWT Bearer token and pulls the user record directly from the database.

### 2. Backend Authorization is Strictly Authoritative
Client-supplied headers or request body parameters (e.g. `{ role: 'PLATFORM_ADMIN' }` or `{ actor: 'Admin' }`) are **completely ignored** by backend controllers. The authenticated user identity (`req.user`) attached by `authenticateToken` is the sole source of truth for all role and actor assignments.

### 3. Separation of Duties Enforced on Platform Administrators
A common enterprise security flaw is granting the platform administrator universal superuser capabilities. In Aegis AI:
- `PLATFORM_ADMIN` **cannot** create models or model versions.
- `PLATFORM_ADMIN` **cannot** sign off on approval stage gates.
- `PLATFORM_ADMIN` **cannot** execute model rollbacks.
- `PLATFORM_ADMIN` **cannot** impersonate an ML Lead, Governance Officer, or Executive Approver.

### 4. Prohibition of Self-Promotion During Signup & Onboarding
- Public signup defaults every user to `role: 'GOVERNANCE_OFFICER'` and `verificationStatus: 'PENDING'`.
- The onboarding endpoint (`POST /api/auth/onboarding`) explicitly rejects any submission of `role: 'PLATFORM_ADMIN'` with HTTP 403 unless the user email strictly matches `BOOTSTRAP_ADMIN_EMAIL`.

### 5. Role Impersonation Prevention on Sign-Offs
In [authMiddleware.js](file:///d:/Projects/govern/backend/src/middleware/authMiddleware.js), `requireApprovalSignoffRole` guarantees that an approver can only submit a sign-off for their authenticated role:
```javascript
if (requestedRole && req.user.role !== requestedRole) {
  return res.status(403).json({
    success: false,
    error: `Forbidden: You are authenticated as [${req.user.role}], but attempted to sign off as [${requestedRole}]. Role impersonation is blocked.`
  });
}
```

### 6. Protection of the Last Remaining Platform Administrator
In [adminController.js](file:///d:/Projects/govern/backend/src/controllers/adminController.js), demoting or self-suspending the last active `PLATFORM_ADMIN` is prevented:
- `updateUserRole` blocks demoting the last active administrator.
- `updateUserStatus` and `blockUser` reject self-suspension with HTTP 400.

### 7. Legacy Role Detection & Session Eviction
In [AuthContext.jsx](file:///d:/Projects/govern/frontend/src/context/AuthContext.jsx), sessions containing retired legacy roles (`ETHICS_OFFICER`, `COMPLIANCE_OFFICER`, `EXECUTIVE_SPONSOR`, `EMPLOYEE`) are automatically identified as stale and evicted, requiring fresh authentication to acquire a canonical role.
