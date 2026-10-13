# Sentinel Govern — REST API Reference

*Platform Version:* 1.0.0-PROD-CANDIDATE  
*Base URL:* `http://localhost:5000/api`  
*Format:* JSON  
*Authentication:* Bearer JWT via `Authorization: Bearer <token>` or HttpOnly Session Cookies.

---

## 1. Authentication & Session Endpoints (`/api/auth`)

| Endpoint | Method | Required Role | Description |
|---|:---:|---|---|
| `/auth/google` | `POST` | Public | Sign in using Google Identity Services (GIS) ID Token. Auto-provisions bootstrap admin if matching `BOOTSTRAP_ADMIN_EMAIL`. |
| `/auth/signup` | `POST` | Public | Native email/password registration with Bcrypt hashing (12 rounds). |
| `/auth/login` | `POST` | Public | Native email/password authentication. Issues JWT and sets HttpOnly refresh token cookie. |
| `/auth/refresh` | `POST` | Public | Rotates opaque refresh token and issues fresh JWT access token. |
| `/auth/forgot-password` | `POST` | Public | Generates time-bounded password reset token. |
| `/auth/reset-password` | `POST` | Public | Resets user password using cryptographically verified token. |
| `/auth/me` | `GET` | Authenticated | Retrieves current authenticated user profile, permissions, and verification status. |
| `/auth/onboarding` | `POST` | Authenticated | Completes multi-step onboarding profile. Prevents self-promotion to `PLATFORM_ADMIN`. |
| `/auth/logout` | `POST` | Authenticated | Revokes refresh token cookie and updates user presence to `OFFLINE`. |

---

## 2. Platform Administration (`/api/admin`)

*All administrative routes require `PLATFORM_ADMIN` role and `VERIFIED` account status.*

| Endpoint | Method | Description |
|---|:---:|---|
| `/admin/users` | `GET` | Lists all registered users, verification statuses, and roles. |
| `/admin/users/:id/role` | `PATCH` | Updates a user's canonical governance role. Safeguards prevent demoting the last active admin. |
| `/admin/users/:id/status` | `PATCH` | Toggles account status between `ACTIVE` and `SUSPENDED`. |
| `/admin/users/:id/verify` | `PATCH` | Promotes user from `PENDING` to `VERIFIED`, unlocking protected governance mutations. |
| `/admin/users/:id/block` | `PATCH` | Suspends user account and invalidates active sessions. |
| `/admin/users/:id/unblock` | `PATCH` | Restores a previously suspended user account. |

---

## 3. Model Governance & Lifecycle (`/api/models`)

| Endpoint | Method | Required Role / Permission | Description |
|---|:---:|---|---|
| `/models` | `GET` | Authenticated / Read | Lists all governed models and active production versions. |
| `/models` | `POST` | `ML_LEAD` | Registers a new governed model and initializes version `v1.0` in `DRAFT` status. |
| `/models/:id` | `GET` | Authenticated / Read | Retrieves full model metadata, risk assessment, and version history. |
| `/models/:id/risk` | `PATCH` | `GOVERNANCE_OFFICER` or `ML_LEAD` | Updates EU AI Act / NIST AI RMF risk intake classification. |
| `/models/:id/policy` | `PATCH` | `GOVERNANCE_OFFICER` | Binds a specific governance policy to the model. |
| `/models/:modelId/versions` | `POST` | `ML_LEAD` | Registers a new model iteration candidate. |
| `/models/:modelId/versions/compare` | `GET` | Authenticated / Read | Side-by-side comparison of version metrics and policy compliance. |
| `/models/versions/:versionId/transition` | `POST` | `ML_LEAD` | Transitions model lifecycle stage. Strictly validates governance gates. |

---

## 4. Evaluations & Fairness Studio (`/api/evaluations`)

| Endpoint | Method | Required Role | Description |
|---|:---:|---|---|
| `/evaluations/run/:versionId` | `POST` | `ML_LEAD` or `GOVERNANCE_OFFICER` | Computes fairness metrics (DIR, TPR/FPR parity) and evaluates active policy gates. |
| `/evaluations/upload/:versionId` | `POST` | `ML_LEAD` or `GOVERNANCE_OFFICER` | Uploads benchmark evaluation dataset (`.csv` or `.xlsx`) via Multer. |
| `/evaluations/version/:versionId` | `GET` | Authenticated / Read | Retrieves historical evaluation records for a specific model version. |

---

## 5. Governance Policies (`/api/policies`)

| Endpoint | Method | Required Role | Description |
|---|:---:|---|---|
| `/policies` | `GET` | Authenticated / Read | Lists all governance policies and threshold rules. |
| `/policies` | `POST` | `GOVERNANCE_OFFICER` | Creates a new governance policy with custom metric thresholds. |
| `/policies/:id` | `GET` | Authenticated / Read | Retrieves specific policy rules and applicable models. |
| `/policies/:id` | `PATCH` | `GOVERNANCE_OFFICER` | Updates policy thresholds or required approvers. |
| `/policies/check/:versionId` | `POST` | `policies:check` | Executes automated gate evaluation against candidate version metrics. |

---

## 6. Approvals & Stage Gates (`/api/approvals`)

| Endpoint | Method | Required Role | Description |
|---|:---:|---|---|
| `/approvals/pending` | `GET` | Authenticated / Read | Lists versions awaiting governance sign-off in `PENDING_APPROVAL`. |
| `/approvals/completed` | `GET` | Authenticated / Read | Historical registry of completed domain sign-offs. |
| `/approvals/version/:versionId` | `GET` | Authenticated / Read | Retrieves sign-off state across all 3 domain approvers. |
| `/approvals/:versionId` | `POST` | Matching Approver Role | Submits domain sign-off (`APPROVED`, `REJECTED`, `CHANGES_REQUESTED`). Identity strictly matched to JWT claims. |

---

## 7. Telemetry & Monitoring (`/api/telemetry`)

| Endpoint | Method | Required Role / Auth | Description |
|---|:---:|---|---|
| `/telemetry` | `GET` | Authenticated / Read | Retrieves historical telemetry batches and drift calculations. |
| `/telemetry/workloads` | `GET` | Authenticated / Read | Probes live health and response times across all 4 AI workloads. |
| `/telemetry/services-status` | `GET` | Authenticated / Read | Health check of external AI service and Evidently AI service. |
| `/telemetry/scheduler/status` | `GET` | Authenticated / Read | Returns scheduler state (`REAL` mode, batch size, execution history). |
| `/telemetry/scheduler/pause` | `POST` | `ML_LEAD` or `PLATFORM_ADMIN` | Pauses background monitoring scheduler. |
| `/telemetry/scheduler/resume` | `POST` | `ML_LEAD` or `PLATFORM_ADMIN` | Resumes background monitoring scheduler. |
| `/telemetry/scheduler/mode` | `POST` | `ML_LEAD` or `PLATFORM_ADMIN` | Toggles scheduler between `REAL` and `SIMULATED` modes. |
| `/telemetry/scheduler/trigger` | `POST` | `ML_LEAD` or `PLATFORM_ADMIN` | Triggers a controlled batch evaluation (`BASELINE` or `DRIFTED`). |
| `/telemetry/ingest` | `POST` | `x-sentinel-api-key` | Secured ingestion pipeline for production AI workloads. |

---

## 8. Incidents & Safe Rollback (`/api/incidents`)

| Endpoint | Method | Required Role | Description |
|---|:---:|---|---|
| `/incidents` | `GET` | Authenticated / Read | Lists all governance and drift incidents. |
| `/incidents/:id` | `GET` | Authenticated / Read | Retrieves specific incident details, metrics snapshot, and recommended rollback version. |
| `/incidents/:id` | `PATCH` | `ML_LEAD` | Updates incident status (`INVESTIGATING`, `MITIGATED`, `RESOLVED`). |
| `/incidents/rollback` | `POST` | `ML_LEAD` | Reverts active production deployment to a verified baseline version. Strictly blocks rollback to unapproved versions. |

---

## 9. Cryptographic Audit Ledger & Regulatory Dossiers (`/api/audit`)

| Endpoint | Method | Required Role | Description |
|---|:---:|---|---|
| `/audit` | `GET` | Authenticated / Read | Paginated query of immutable SHA-256 chained audit records. |
| `/audit/integrity` | `GET` | Authenticated / Read | Validates cryptographic hash continuity across all blocks from genesis. |
| `/audit/simulate-tamper` | `POST` | `PLATFORM_ADMIN` (Non-Prod Only) | Injects deliberate corruption into Block #0 for compliance verification tests. Blocked in production. |
| `/audit/repair` | `POST` | `PLATFORM_ADMIN` (Non-Prod Only) | Re-seals cryptographic hash chain following verification tests. Blocked in production. |
| `/audit/dossier/:modelId/:versionId?` | `GET` | Authenticated / Read | Generates comprehensive 10-section Regulatory Compliance Dossier with technical documentation. |
