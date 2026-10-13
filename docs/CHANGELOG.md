# Aegis AI — Project Changelog & Evolution History

This changelog records the major architectural milestones and feature additions across the development history of Aegis AI.

---

## Stage 1 — Core AI Governance Platform (September 11 – September 25, 2026)

### Milestone 1.1: Foundations & Statistical Engines (2026-09-11)
- Implemented Mongoose schemas for `Model`, `ModelVersion`, `Evaluation`, `Policy`, `Approval`, `Telemetry`, `Incident`, and `AuditLedger`.
- Built native Node.js mathematical engine for Disparate Impact Ratio (DIR) enforcing the 80% legal threshold rule, Demographic Parity Difference, and Equalized Odds TPR/FPR parity (`fairnessEngine.js`).
- Implemented Population Stability Index (PSI) quantile engine for runtime distribution drift detection (`driftEngine.js`).
- Established initial SHA-256 hash-chained cryptographic audit ledger with genesis block (`auditEngine.js`).
- Added initial test suites (16 tests, expanding to 43 tests).

### Milestone 1.2: Governance Gates & Stage Progression (2026-09-25)
- Implemented `lifecycleService.js` enforcing stage gates:
  $$\text{DRAFT} \rightarrow \text{UNDER\_REVIEW} \rightarrow \text{EVALUATION} \rightarrow \text{PENDING\_APPROVAL} \rightarrow \text{APPROVED} \rightarrow \text{IN\_PRODUCTION} \rightarrow \text{DEPRECATED}$$
- Enforced policy gate checks blocking models with failing fairness or performance metrics from entering `PENDING_APPROVAL`.
- Built Multi-Stakeholder Approval Center requiring sign-offs across `ML_LEAD`, `ETHICS_OFFICER`, `COMPLIANCE_OFFICER`, and `EXECUTIVE_SPONSOR`.
- Built automated incident escalation on critical drift ($PSI \ge 0.25$) and 1-click verified atomic model rollback engine.
- Implemented initial React frontend console on port 3000 with sidebar navigation, model registry cards, and audit integrity verification.
- Reached 195 passing backend integration tests.

---

## Stage 2 — Enterprise Security, Auth, RBAC & Hardening (September 25 – October 06, 2026)

### Milestone 2.1: Evaluation Dataset Import (2026-09-25)
- Implemented `evaluationImportService.js` and Multer memory storage upload middleware.
- Supported in-memory parsing of `.csv` and `.xlsx` benchmark datasets via SheetJS (`xlsx`).
- Added automatic column detection for ground truth labels, predictions, and statutory protected attributes.
- Enforced the non-training principle: evaluation imports assess predictions without fitting model weights.
- Added 24 unit and integration tests in `evaluation_import.test.js`.

### Milestone 2.2: Google Identity Services (GIS) & Bootstrap Admin (2026-09-28)
- Integrated Google Identity Services OAuth 2.0 web client.
- Implemented backend cryptographic verification of Google ID tokens via `google-auth-library` (`googleAuthService.js`).
- Enforced audience, issuer, expiration, and subject claims validation.
- Implemented server-controlled bootstrap administrator auto-provisioning via `BOOTSTRAP_ADMIN_EMAIL`.
- Added 18 automated tests in `google_auth_stage2.test.js`.

### Milestone 2.3: Fine-Grained RBAC & Security Hardening (2026-09-28)
- Formalized 6 roles (`PLATFORM_ADMIN`, `ML_LEAD`, `ETHICS_OFFICER`, `COMPLIANCE_OFFICER`, `EXECUTIVE_SPONSOR`, `EMPLOYEE`) and 26 discrete permissions in `permissions.js`.
- Partitioned `PLATFORM_ADMIN` from domain actions (cannot create models, sign off approvals, or execute rollbacks).
- Implemented `securityMiddleware.js` adding protective HTTP security headers and IP rate limiting (auth, login, password reset).
- Restricted audit tamper simulation and ledger repair behind `ENABLE_AUDIT_TAMPER_DEMO=true` in non-production.
- Added 28 automated tests in `security_hardening.test.js`. Reached 248 passing tests.

### Milestone 2.4: Native Authentication & Refresh Token Rotation (2026-09-28)
- Implemented native email/password authentication alongside Google OAuth (`nativeAuthService.js`).
- Configured Bcrypt password hashing with 12 work factor rounds.
- Implemented opaque refresh token rotation delivered via HttpOnly, SameSite cookies with SHA-256 database hashing.
- Added user enumeration prevention with constant-time password comparisons.
- Implemented password reset token flow with dev token exposure (`_devResetToken`) in non-production environments.
- Added 29 automated tests in `native_auth.test.js`.

### Milestone 2.5: User Onboarding & Master Verification Workflow (2026-09-28)
- Built multi-step post-signup onboarding wizard (`Onboarding.jsx`) collecting role, department, team, and team lead.
- Disallowed selection of `PLATFORM_ADMIN` during self-service onboarding.
- Decoupled `status` (`ACTIVE`/`SUSPENDED`), `verificationStatus` (`PENDING`/`VERIFIED`), and `presence` (`ACTIVE`/`OFFLINE`).
- Implemented `requireVerifiedUser` middleware: unverified users browse in read-only mode with a persistent top notification banner; mutations require admin verification.
- Built Platform Admin user management console (`AdminUsers.jsx`) for account verification and blocking.
- Added 12 automated tests in `onboarding_verification_master.test.js`.

### Milestone 2.6: Regulatory Compliance Dossier & Reporting (2026-09-28)
- Built 1-click Compliance Dossier engine (`reportService.js`) compiling all 10 statutory sections for EU AI Act Annex III and NIST AI RMF.
- Enforced strict "no fabrication" rule when evidence is unpopulated.
- Added JSON and Markdown export formats alongside printable PDF layouts.
- Added 9 automated tests in `reports_dossier.test.js`. Total backend tests reached 260.

### Milestone 2.7: Frontend Stabilization & Layout Consolidation (2026-09-29)
- Resolved historical blank-screen regressions by consolidating all authenticated routes under a single persistent `<AppLayout />` parent in `App.jsx`.
- Added double-layer `<ErrorBoundary>` wrappers at the root and layout levels.
- Added loading skeleton guards in `ProtectedRoute.jsx` to prevent unhydrated user state rendering crashes.
- Configured Oxlint (`oxlint`) reporting 0 errors across 48 frontend modules.

### Milestone 2.8: Master Documentation & Persistent Context (2026-10-06)
- Created complete authoritative technical knowledge base in `docs/`.
- Reconciled all historical contradictions across test totals, lifecycle terminology, database configuration, and frontend stability against the active codebase.

### Milestone 2.9: Governance Flow Corrections & Walkthrough Refinements (2026-10-07)
- **Incident Management & Rollback Refinement:**
  - Resolved rollback target identification issue: previously retired production baseline versions (`deploymentStatus: 'RETIRED'` or `lifecycleStatus: 'DEPRECATED'`) are now correctly recognized as eligible rollback candidates.
  - Replaced misleading UI fallback (`|| 'v1.0'`) in `IncidentManagement.jsx` with an explicit "None Available (Initial version — no prior baseline)" warning and disabled action state.
  - Prevented duplicate open incident creation: recurring drift simulations on an active model/version update the existing open incident, refresh telemetry metrics, and append notes.
  - Ensured stable telemetry batches arriving after drift never delete, close, or mutate active open incidents.
- **Stage-Gate Approval Center Enhancements:**
  - Added "Completed / Approved History" tab alongside "Pending Review Queue" so approved versions remain permanently accessible for review.
  - Added dedicated `/api/approvals/completed` endpoint and updated `getPendingApprovals` to support `?status=all|pending|completed`.
  - Added rich evaluation evidence display in Approval Center (Disparate Impact DIR vs threshold, Demographic Parity Diff, ROC-AUC, Accuracy, Dataset info).
  - Ensured `EXECUTIVE_SPONSOR` is strictly included as the 4th formal sign-off role across backend lifecycle services, controllers, and frontend policies.
- **Model-Specific Policy Binding:**
  - Added `policyId` to `Model` and `applicableModelId` to `Policy` schemas, allowing direct model-to-policy binding with automatic fallback to risk-tier policies.
  - Added detailed "Required vs Actual" evidence matrix on `ModelDetails.jsx` comparing stored metrics against applicable policy rules.
- **Telemetry Simulation Controls & UX Polish:**
  - Clearly designated "Stable Batch" and "Drift Shift" as development simulation controls with in-memory empirical PSI computation.
  - Cleaned up stale hardcoded model references ("CreditRisk Underwriting AI") in `Dashboard.jsx` and `FairnessStudio.jsx`.
- Added 5 automated integration tests in `governance_flow_corrections.test.js`. Backend test suite passed all 265 tests.

---

## Stage 3 — Production Telemetry Pipeline, Role Consolidation & Multi-Service Integration (October 08, 2026)

### Milestone 2.10: Evidently AI Pipeline, Role Consolidation & Issue Escalation (2026-10-08)
- **Real Evidently Runtime Telemetry Ingestion Pipeline:**
  - Implemented `runtimeMonitoringService.js` connecting Sentinel Control Plane to external Evidently Monitoring Service (FastAPI on port 8001, `/analyze-drift`).
  - Added dedicated endpoint `POST /api/telemetry/ingest` authenticated via `x-sentinel-api-key` header (`authenticateIngestion` middleware).
  - Enforced strict "zero fake PSI" invariant for Evidently telemetry: records `monitoringSource: 'EVIDENTLY'`, parses normalized p-values and drifted columns, while setting `aggregatePsi = null`.
  - Added automatic drift escalation creating an Incident (`#INC-xxx`) with bidirectional linkage (`Telemetry.incidentId` $\leftrightarrow$ `Incident.telemetryRef`) and automatic baseline rollback identification.
  - Deduplicated recurring drift: subsequent batches link to the existing open incident without generating duplicates.
  - Added 15 automated integration tests in `runtime_monitoring_integration.test.js`.
- **External AI Model Scoring Adapter:**
  - Implemented `externalAiAdapter.js` bridging external FastAPI model service (port 8000) for transaction scoring (`/health` and `/score`).
  - Realized decoupled architecture: "The AI model does the AI work; Sentinel Govern governs the AI model."
- **Role & RBAC Architectural Consolidation:**
  - Consolidated platform roles into 4 canonical authoritative personas: `PLATFORM_ADMIN`, `ML_LEAD`, `GOVERNANCE_OFFICER`, and `EXECUTIVE_APPROVER`.
  - Legacy roles (`ETHICS_OFFICER`, `COMPLIANCE_OFFICER`, `EXECUTIVE_SPONSOR`, `EMPLOYEE`) unified: `GOVERNANCE_OFFICER` encompasses ethics and compliance governance; `EXECUTIVE_APPROVER` provides business leadership sign-offs.
  - Added automatic detection and eviction of stale legacy roles in session initialization and refresh within `AuthContext.jsx`.
  - Streamlined mandatory production stage gates to 3 domain approvers: `ML_LEAD`, `GOVERNANCE_OFFICER`, and `EXECUTIVE_APPROVER` (with `PLATFORM_ADMIN` strictly partitioned).
  - Updated default self-service signup role to `GOVERNANCE_OFFICER` with `PENDING` verification status.
- **Employee Issue Reporting Subsystem:**
  - Built full Issue Reporting architecture: `IssueReport` Mongoose schema, `issueService.js`, `issueController.js`, and `IssueReporting.jsx` UI.
  - Configured permissions: `ISSUES_SUBMIT` and `ISSUES_VIEW` (available to all verified users), `ISSUES_MANAGE` (for `ML_LEAD` and `GOVERNANCE_OFFICER`).
  - Implemented direct 1-click issue escalation (`POST /api/issues/:id/escalate`): converts an operational issue directly into a formal Incident ticket with bidirectional references (`Incident.issueReportRef` and `IssueReport.escalatedIncidentId`).
  - Added 22 automated integration tests in `issue_reporting_incident.test.js`.
- **Role-Aware Dynamic Dashboard:**
  - Refactored `dashboardController.js` and `Dashboard.jsx` to dynamically personalize metrics and action queues based on authenticated role:
    - ML Lead: action alerts for un-evaluated drafts, policy gate failures, and returned models.
    - Governance Officer: pending governance reviews, high-risk models, and unassigned policy alerts.
    - Executive Approver: pending executive approval queue and recent decisions.
    - Platform Admin: platform user statistics and pending verification queue.
  - Added automated test suite `dashboard_role_aware.test.js`.
- **Model-Aware Policy Management Expansion:**
  - Added `Policy.applicableModelIds` array alongside `Model.policyId` and `Policy.applicableModelId` for bidirectional model-to-policy relationships.
  - Added `PATCH /api/models/:id/policy` controller and route.
  - Added `attachApplicableModels` helper enriching policy queries with associated live models.
  - Added automated test suite `model_aware_policy_management.test.js`.
- **Safe Development DB Reset & Live E2E Verification Script:**
  - Created `backend/src/seed/resetDevDb.js` (`npm run db:reset`): safely removes all documents across all 15 Mongoose collections in development/test, with strict safeguard refusing execution in production (`NODE_ENV === 'production'`).
  - Created `backend/scripts/run_real_e2e_verification.js`: executes a live 8-step verification run connecting Sentinel (port 5000), External AI (port 8000), and Evidently (port 8001).
- **Expanded Audit Ledger Actions:**
  - Expanded `AuditLedger.js` enum actions to 40 distinct governance actions covering telemetry ingestion, drift detection, policy assignments, and issue reporting.
- **Comprehensive Backend Regression Testing:**
  - Backend automated test suite grew to **293 tests passed, 0 failed, 0 skipped** across 22 test files (`npm test` in `backend/`).

