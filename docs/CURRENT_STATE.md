# Current State — Aegis AI

*As of: 2026-10-09 | Authoritative Implementation State*

## 1. Overall Status
Aegis AI is fully functional as a local, verified, end-to-end AI Governance control plane. The backend passes **all 293 automated unit, security, and integration tests** without errors (`npm test`). The frontend compiles and builds cleanly into production assets without errors (`npm run build`). Both Google OAuth2 and Native Email/Password authentication systems are operational, backed by strict server-authoritative RBAC across 4 canonical governance roles, real Evidently AI monitoring ingestion, external FastAPI transaction scoring integration, and an immutable SHA-256 audit ledger.

---

## 2. Working Features (Verified in Code)

- **Dual Authentication System:**
  - Google Identity Services (GIS) ID Token verification via Google Auth Library.
  - Native Email/Password signup and login with Bcrypt (12 work factor rounds).
  - Refresh token rotation using cryptographically secure opaque tokens stored as SHA-256 hashes in MongoDB and delivered via HttpOnly cookies.
  - Automatic bootstrap administrator auto-provisioning based on `BOOTSTRAP_ADMIN_EMAIL`.
  - Rate limiting on authentication endpoints (50 requests/15m overall, 20 requests/15m for login/signup, 5 requests/60m for password resets).
  - Stale legacy role detection in session bootup and refresh, immediately invalidating obsolete sessions.

- **Role Consolidation & Server-Authoritative RBAC:**
  - 4 canonical roles strictly maintained: `PLATFORM_ADMIN`, `ML_LEAD`, `GOVERNANCE_OFFICER`, and `EXECUTIVE_APPROVER`.
  - 26 discrete permissions mapped across `ROLE_PERMISSIONS` in `permissions.js`.
  - Complete Separation of Duties: `PLATFORM_ADMIN` is strictly partitioned from domain actions (cannot create models, cannot sign approval gates, cannot execute rollbacks).
  - Server-authoritative role verification: all authorization decisions derive from verified JWT claims (`req.user`), stripping client-forged roles or actors.

- **User Lifecycle & Verification Workflow:**
  - Signup → Multi-step onboarding (role, department, team, team lead) → Success modal → Explicit login.
  - New signups default to `GOVERNANCE_OFFICER` with `PENDING` verification status (`PLATFORM_ADMIN` cannot be selected).
  - Distinct operational separation between `accountStatus` (`ACTIVE` / `SUSPENDED`), `verificationStatus` (`PENDING` / `VERIFIED`), and `presence` (`ACTIVE` / `OFFLINE`).
  - Pending user access gating: unverified accounts possess full read access across models, policies, and dossiers, while state-mutating actions require Platform Admin verification (`PATCH /api/admin/users/:id/verify`).
  - Platform Admin User Management console (`/admin/users`) with role assignment, status updates, account verification, and block/unblock controls with safeguards against demoting the last admin or self-blocking.

- **Model Registry & Risk Management:**
  - Full model metadata tracking: purpose, owner, team, model type, protected demographic attributes, and version history.
  - EU AI Act Annex III and NIST AI RMF 1.0 intake risk categorization questionnaire (`UNACCEPTABLE`, `HIGH`, `LIMITED`, `MINIMAL`).
  - Model-specific governance policy assignment via `Model.policyId` and `Policy.applicableModelIds` (`PATCH /api/models/:id/policy`).

- **Fairness Studio & Evaluation Engine:**
  - In-memory computation of Disparate Impact Ratio (DIR) enforcing the 80% legal threshold rule ($DIR < 0.80$ triggers policy failure).
  - Demographic Parity Difference and Equalized Odds (TPR and FPR parity across demographic groups).
  - Performance metrics evaluation: Accuracy, Precision, Recall, F1-score, and ROC-AUC.
  - File upload parsing for benchmark evaluation datasets (`.csv` and `.xlsx`) via Multer and SheetJS. Non-training principle strictly observed.

- **Policy Engine & Stage Gate Enforcement:**
  - MongoDB-backed governance policies with configurable thresholds.
  - Model-specific policy binding (`Model.policyId`, `Policy.applicableModelIds`, and `Policy.applicableModelId`) with automatic hierarchical fallback to risk-tier defaults (`targetRiskLevel`).
  - Model details "Required vs Actual" evidence matrix highlighting threshold compliance across DIR, Demographic Parity, Accuracy, ROC-AUC, Max Drift PSI, and required sign-off roles.
  - Active lifecycle gating: models cannot enter `PENDING_APPROVAL` unless active policies pass.

- **Multi-Stakeholder Approval Center:**
  - Formal domain sign-offs across `ML_LEAD`, `GOVERNANCE_OFFICER`, and `EXECUTIVE_APPROVER`.
  - Dual view modes: "Pending Review Queue" and "Completed / Approved History" retaining sealed governance records with direct buttons to Regulatory Compliance Dossiers.
  - Rich evidence summary cards displaying evaluation metrics, policy thresholds, and dataset sources alongside stage gate seals.
  - Identity matching rule: approvers can only submit sign-offs for their authenticated role (`requireApprovalSignoffRole`).
  - Platform Admin is strictly partitioned from domain sign-offs, preserving statutory Separation of Duties.

- **Dual-Engine Runtime Telemetry & Drift Detection:**
  - **Simulation Engine:** In-memory Population Stability Index (PSI) calculation across quantile distribution bins with development simulation controls ("Stable Batch" and "Drift Shift").
  - **Production Pipeline Ingestion:** Dedicated ingestion API `POST /api/telemetry/ingest` secured via `x-sentinel-api-key`.
  - **Evidently Monitoring Service Integration:** `runtimeMonitoringService.js` sends production records to Evidently AI (port 8001, `/analyze-drift`), maps normalized statistical indicators (p-values, statistical method, drifted columns), and records `monitoringSource: 'EVIDENTLY'` with `aggregatePsi: null` (strictly zero fake PSI).
  - Updates or creates `Monitoring` state documents with `driftMethod: 'EVIDENTLY'`.

- **External AI Model Scoring Adapter:**
  - `externalAiAdapter.js` connects Sentinel Control Plane to external FastAPI model services (port 8000), verifying connectivity via `/health` and scoring live transaction streams via `/score`.
  - Enables true decoupled architecture: "The AI model does the AI work; Sentinel Govern governs the AI model."

- **Employee Issue Reporting Subsystem:**
  - Operational staff report anomalies (`PERFORMANCE`, `BIAS`, `DATA`, `SAFETY`, `DRIFT`, `OTHER`) via `POST /api/issues` (`IssueReporting.jsx`).
  - Governance triage workflow (`UNDER_INVESTIGATION`, `RESOLVED`, `REJECTED`).
  - 1-click issue escalation (`POST /api/issues/:id/escalate`): automatically creates a formal Incident (`#INC-xxx`) with bidirectional linkage (`Incident.issueReportRef` and `IssueReport.escalatedIncidentId`).

- **Incident Escalation & Safe Rollback:**
  - Automated generation of Incident records (`#INC-xxx`) upon critical drift detection or issue escalation.
  - Active incident deduplication: subsequent drift batches update and link to open incidents (`OPEN` or `INVESTIGATING`) rather than spawning duplicate records; stable telemetry batches preserve active open incidents.
  - Bidirectional linkage: `Telemetry.incidentId` $\leftrightarrow$ `Incident.telemetryRef`.
  - Safe 1-click rollback: atomically restores a previously approved production baseline version (including retired versions with `deploymentStatus: 'RETIRED'` or `lifecycleStatus: 'DEPRECATED'`) to `IN_PRODUCTION` and deprecates the drifting model. Target version must have passed policies and been approved.
  - Rollback baseline resolution: dynamically resolves prior production baselines; displays "None Available" and disables action button when no eligible baseline exists.

- **Cryptographic Audit Ledger & Compliance Dossier:**
  - SHA-256 hash chaining: $\text{Hash}_n = \text{SHA256}(\text{Hash}_{n-1} + \text{Timestamp} + \text{Actor} + \text{Action} + \text{DataPayload})$.
  - Genesis block with 64 zero characters (`'0'.repeat(64)`).
  - 40 discrete governance action enums logged immutably.
  - Verification API reporting valid chain integrity or exact sequence number of detected tampering.
  - Tamper simulation and repair tools restricted to non-production environments with `ENABLE_AUDIT_TAMPER_DEMO=true`.
  - 1-click Compliance Dossier compilation (EU AI Act Technical Documentation) exportable as JSON, Markdown, and print/PDF layout across all 10 statutory sections. No-fabrication rule strictly respected.

- **Role-Aware Dynamic Dashboard:**
  - Adapts display dynamically based on the authenticated persona (`ML_LEAD`, `GOVERNANCE_OFFICER`, `EXECUTIVE_APPROVER`, `PLATFORM_ADMIN`).
  - ML Lead: action alerts for un-evaluated drafts, policy gate failures, and returned models.
  - Governance Officer: pending governance reviews, high-risk models, and unassigned policy alerts.
  - Executive Approver: pending executive approval queue and recent decisions.
  - Platform Admin: platform user statistics and pending verification queue.

- **Safe Development DB Reset & E2E Verification Tools:**
  - `npm run db:reset` (`backend/src/seed/resetDevDb.js`): Safely clears all 15 Mongoose development collections, strictly refusing execution if `NODE_ENV === 'production'`.
  - `backend/scripts/run_real_e2e_verification.js`: Verifies live tripartite service connectivity across ports 5000, 8000, and 8001.

---

## 3. Partially Working Features

- **Password Reset Flow:**
  - Backend API (`POST /api/auth/forgot-password` and `POST /api/auth/reset-password`) is fully implemented with token hashing and expiration.
  - In non-production environments, the raw reset token is returned in the API response (`_devResetToken`) for testing.
  - Real SMTP email transmission is not implemented (deferred for production).
- **Google OAuth GIS in Local/Headless Browser Environments:**
  - Backend verification is cryptographically rigorous and tested with mock Google ID tokens.
  - Frontend Google Sign-In button requires a valid `VITE_GOOGLE_CLIENT_ID` matching the origin `http://localhost:3000` configured in the Google Cloud Console.

---

## 4. Known Runtime Problems

- **MongoDB Atlas Latency / Ephemeral Fallback:**
  - If network access to MongoDB Atlas is firewalled or offline, the server waits 5000ms (`serverSelectionTimeoutMS: 5000`) before logging a warning and falling back to `MongoMemoryServer`.
  - In-memory data does not persist across backend process restarts.

---

## 5. Known Build / Test Problems

- **None.** Current build and test health:
  - `npm test` in `backend`: **293 passed, 0 failed, 0 skipped** across 22 test files.
  - `npm run build` in `frontend`: **Built cleanly with 0 errors**.
  - `npm run lint` in `frontend`: **0 errors**, 22 minor linter warnings (unused imports and `useEffect` dependency suggestions).

---

## 6. Subsystem Status Details

| Subsystem | Status | Key Characteristics |
|---|---|---|
| **Authentication** | Active & Secure | Dual provider (Google + Native); refresh token rotation in HttpOnly cookie; Bcrypt 12 rounds; user enumeration protection; legacy role eviction. |
| **RBAC** | Active & Authoritative | 4 canonical roles, 26 permissions; server-authoritative role verification; client role spoofing stripped; Platform Admin strictly partitioned. |
| **Database** | Connected / Fallback | MongoDB Atlas `ai_govern` on `cluster0.v4pvm60.mongodb.net`; fallback to `mongodb-memory-server` v10.1.3; safe dev reset script with prod safety guard. |
| **Frontend** | Stable & Modern | React 19 + Vite 8; single AppLayout instance; ErrorBoundary wrapping; role-aware Dashboard; zero blank-screen regressions. |
| **Backend** | Stable & Hardened | Express 4.21; security headers; rate limiting; strict CORS (`localhost:3000`); API key ingestion auth. |
| **Governance** | Gated & Enforced | Policies actively block model promotion; multi-stakeholder approvals mandatory across ML Lead, Governance Officer, and Executive Approver. |
| **Telemetry & Drift** | Dual Pipeline | In-memory PSI simulation for demos; real Evidently AI (port 8001) ingestion via `POST /api/telemetry/ingest` with zero fake PSI. |
| **External AI Integration** | Active Adapter | `externalAiAdapter.js` connects to external FastAPI model services (port 8000) for live transaction scoring. |
| **Issue Reporting** | Active & Escalatable | Employees submit reports (`IssueReport`); governance officers triage and execute 1-click escalation to formal Incident tickets. |
| **Incidents & Rollback** | Automated & Safe | Deduplicating incident generation; bidirectional telemetry/issue linking; verified 1-click rollback to approved baseline models. |
| **Audit** | Cryptographically Valid | SHA-256 hash chaining; genesis block; 40 governance actions; live tamper detection; immutable event stream. |
| **Deployment** | Local Only | Frontend on `http://localhost:3000`, Backend on `http://localhost:5000`. Staging/Prod not provisioned. |

---

## 7. Immediate Priority

**Production OAuth & SMTP Email Delivery Architecture:**
Finalize production-grade external services configuration (SendGrid/AWS SES for password reset email dispatch and production Google OAuth authorized origins) without breaking zero-config local development workflows.

---

## 8. Next 3 Priorities

1. **Production Deployment Configuration:** Containerize via Docker/docker-compose for staging and production hosting, including strict environment isolation where `MongoMemoryServer` is completely disabled in production.
2. **Automated End-to-End (E2E) Browser Testing:** Implement Playwright test suites covering full end-to-end browser flows (Signup → Onboarding → Admin Verification → Model Evaluation → Approval → Rollback).
3. **Advanced Telemetry Ingestion API:** Expand batch telemetry endpoints to support streaming WebSockets or asynchronous message queuing (RabbitMQ/Kafka) for high-throughput production inference monitoring.

---

## 9. Deferred Work

- **Live Email Dispatch for Password Reset:** Deferred until production SMTP/transactional email provider credentials are configured.
- **Model Weights / Binary Storage Service:** Direct S3/GCS bucket uploads for multi-gigabyte model artifacts (currently tracked via URI strings in `artifactReference`).
- **Profile Photo Uploads:** Stored as URLs or generated initials; file uploads for avatars intentionally deferred as non-essential to core governance.

---

## 10. Blocked Work

- **None.** There are currently no technical or external blockers preventing ongoing development or local testing.
