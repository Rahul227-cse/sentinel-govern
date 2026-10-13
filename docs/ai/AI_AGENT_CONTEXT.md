# Aegis AI — Master AI Agent Context & Handover Dossier

> **CRITICAL DIRECTIVE FOR INCOMING AI AGENTS:**
> Read this document first before inspecting or modifying any code in this repository. This document is your primary source of persistent context, system invariants, security boundaries, and operational operating rules.

---

## 1. Project Identity & Purpose

- **Project Name:** Aegis AI (Preferred: **Aegis AI — Governance & Lifecycle Platform** / Sentinel Control Plane)
- **Classification:** Enterprise AI Governance, Responsible AI, and Model Lifecycle Management Control Plane.
- **Problem Statement:**
  > “Organizations deploying AI solutions require governance mechanisms to monitor model performance, approvals, version control, fairness, compliance, and auditability. This platform manages the complete AI model lifecycle while ensuring responsible AI practices.”
- **Non-Goals:** Aegis AI is **NOT** a model training framework (no PyTorch/TensorFlow training) and **NOT** a real-time prediction serving cluster. It is an independent regulatory, ethical, and operational control plane. "The AI model does the AI work; Sentinel Govern governs the AI model."

---

## 2. Technical Stack & Repository Topology

- **Architecture:** MERN Stack (React 19 + Vite 8 frontend; Express 4 + Node.js v18+ backend; MongoDB Atlas with ephemeral in-memory fallback).
- **External Model & Monitoring Services:**
  - External FastAPI Model Service (`http://127.0.0.1:8000`) for live inference scoring.
  - Evidently Monitoring Service (`http://127.0.0.1:8001`) for data drift analysis.
- **Working Directories:**
  - `backend/` — Express REST API (Port `5000`)
  - `frontend/` — React SPA (Port `3000`)
  - `docs/` — Canonical technical documentation and knowledge base

---

## 3. Current Implementation Reality

*Verified on: 2026-10-09*
- **Backend Test Status:** **293 tests passed, 0 failed, 0 skipped** across 22 test files (`npm test` in `backend/`).
- **Frontend Build Status:** **Built cleanly with 0 errors** (`npm run build` in `frontend/`).
- **Linter Status:** **0 errors**, 22 minor warnings (`npm run lint` in `frontend/`).
- **Dual Authentication:** Fully operational (Google Identity Services OAuth2 + Native Email/Password with Bcrypt and HttpOnly cookie refresh rotation). Stale legacy roles are automatically cleared.
- **Separation of Duties:** Fully enforced across 4 canonical roles and 26 discrete permissions.
- **Frontend Stability:** Stable and resilient against blank-screen crashes due to single persistent `<AppLayout />` and double-layer `<ErrorBoundary>` wrappers.

---

## 4. Critical Security & Governance Rules (DO NOT VIOLATE)

### Rule 1: Backend Authorization is Authoritative
Never trust frontend role state, client headers, or request body parameters (e.g. `{ role: '...' }` or `{ actor: '...' }`). All authorization decisions derive strictly from the verified JWT token (`req.user`) populated by `authenticateToken`.

### Rule 2: Platform Administrator is Partitioned from Domain Actions
`PLATFORM_ADMIN` manages users, verification, and infrastructure. **NEVER** grant `PLATFORM_ADMIN` permissions to:
- Create models or model versions
- Sign off on approval stage gates
- Execute model rollbacks
- Impersonate governance stakeholders

### Rule 3: Separation of Duties on Approval Gates
Approvers can **ONLY** sign off for their own authenticated role (`requireApprovalSignoffRole`). Role impersonation is strictly rejected with HTTP 403.

### Rule 4: Prohibition of Self-Promotion
Self-service users registering via Google or native signup default to `GOVERNANCE_OFFICER` and `PENDING` verification. `PLATFORM_ADMIN` cannot be selected during signup or onboarding unless the email strictly matches `BOOTSTRAP_ADMIN_EMAIL`.

### Rule 5: Non-Training Principle for Benchmark Evaluations
Evaluation file imports (.csv/.xlsx) must evaluate pre-computed predictions against ground truth labels. **NEVER** introduce model training, weight fitting, or Python execution dependencies into the control plane.

### Rule 6: Drift Escalation Never Triggers Silent Rollbacks
Significant drift ($\text{PSI} \ge 0.25$ or statistical drift in Evidently) creates an Incident record (`#INC-xxx`) and recommends a rollback version, but **NEVER** alters lifecycle state automatically. Human review and explicit rollback execution are mandatory.

### Rule 7: Rollback Only to Genuinely Approved Baselines
Model rollbacks are **ONLY** permitted to versions that previously achieved `policyStatus === 'PASSED'` and were approved (including historical production baselines marked with `deploymentStatus: 'RETIRED'` or `lifecycleStatus: 'DEPRECATED'`). Rolling back to unapproved or failing versions is strictly blocked. If no baseline exists, UI indicates "None Available" and disables the action.

### Rule 8: Strict "No Fabrication" Rule in Compliance Dossiers
When compiling compliance dossiers, if evidence, metrics, or approvals are missing in the database, return empty arrays or null values. **NEVER** fabricate or mock governance evidence.

### Rule 9: Active Incident Aggregation & Stable Telemetry Invariants
Repeated drift batches on an active version update and attach telemetry to existing open incidents (`OPEN` or `INVESTIGATING`) rather than creating duplicate incident records. Furthermore, stable telemetry batches do not delete, resolve, or silence open incidents.

### Rule 10: Three Formal Multi-Stakeholder Approvers
Production approval requires sign-offs from all 3 mandatory domain governance roles: `ML_LEAD`, `GOVERNANCE_OFFICER`, and `EXECUTIVE_APPROVER`. `PLATFORM_ADMIN` is strictly partitioned from domain sign-offs to preserve statutory Separation of Duties.

### Rule 11: Zero Fake PSI for Evidently Telemetry Ingestion
When ingesting live telemetry from Evidently AI (`POST /api/telemetry/ingest`), `aggregatePsi` must remain strictly `null`. Record statistical indicators (p-values, test method, drifted columns) under `monitoringSource: 'EVIDENTLY'`.

### Rule 12: Never Expose Credentials or Secrets
Never output raw JWT secrets, database passwords, or private keys. Always use `[REDACTED]`.

---

## 5. Model Lifecycle State Machine

$$\mathbf{DRAFT} \longrightarrow \mathbf{UNDER\_REVIEW} \longrightarrow \mathbf{EVALUATION} \longrightarrow \mathbf{PENDING\_APPROVAL} \longrightarrow \mathbf{APPROVED} \longrightarrow \mathbf{IN\_PRODUCTION} \longrightarrow \mathbf{DEPRECATED}$$

- In `ModelVersion.js`, `lifecycleStatus` enum uses **`DEPRECATED`**, while `deploymentStatus` enum uses **`RETIRED`**.
- Do **NOT** rename these enums. They serve distinct architectural concerns.

---

## 6. Core Roles (4 Canonical Roles)

- `PLATFORM_ADMIN` — System configuration, user verification, role assignment, audit integrity.
- `ML_LEAD` — Model registration, version creation, evaluation execution, deployment, incident remediation.
- `GOVERNANCE_OFFICER` — Policy creation/editing, statistical fairness audits, bias mitigation, EU AI Act conformity assessment, domain sign-offs.
- `EXECUTIVE_APPROVER` — Executive risk oversight, production stage-gate sign-off, emergency rollback execution.

*(Note: Legacy roles `ETHICS_OFFICER`, `COMPLIANCE_OFFICER`, `EXECUTIVE_SPONSOR`, and `EMPLOYEE` were migrated and consolidated. Verified platform contributors can report issues via `ISSUES_SUBMIT`.)*

---

## 7. Important Source Files

### Backend:
- `backend/src/server.js` — Server initialization, security middleware, error handlers
- `backend/src/config/db.js` — MongoDB Atlas connection and MongoMemoryServer fallback
- `backend/src/config/permissions.js` — 26-permission RBAC matrix across the 4 canonical roles
- `backend/src/middleware/authMiddleware.js` — JWT verification, role checks, verification gating, API key ingestion auth
- `backend/src/middleware/securityMiddleware.js` — Security headers, IP rate limiters
- `backend/src/services/googleAuthService.js` — Google OAuth ID token verification
- `backend/src/services/nativeAuthService.js` — Bcrypt hashing, refresh token rotation
- `backend/src/services/lifecycleService.js` — State machine and gate enforcement
- `backend/src/services/policyEngine.js` — Policy gate evaluation
- `backend/src/services/fairnessEngine.js` — Disparate Impact and Equalized Odds equations
- `backend/src/services/driftEngine.js` — PSI drift calculations and simulation batches
- `backend/src/services/runtimeMonitoringService.js` — Evidently runtime telemetry ingestion & incident escalation
- `backend/src/services/externalAiAdapter.js` — FastAPI external model service adapter (`/health`, `/score`)
- `backend/src/services/incidentService.js` — Incident creation, deduplication, and atomic rollback
- `backend/src/services/issueService.js` — Employee issue reporting, triage, and incident escalation
- `backend/src/services/auditEngine.js` — SHA-256 chained hash ledger
- `backend/src/services/reportService.js` — Compliance dossier compiler
- `backend/src/seed/resetDevDb.js` — Safe development database reset script (`npm run db:reset`)

### Frontend:
- `frontend/src/App.jsx` — Router, route guards, root ErrorBoundary
- `frontend/src/components/AppLayout.jsx` — Single persistent layout with sidebar and navbar
- `frontend/src/components/ProtectedRoute.jsx` — Session hydration guard and role router
- `frontend/src/context/AuthContext.jsx` — Session state, silent cookie refresh, legacy role eviction
- `frontend/src/context/RoleContext.jsx` — Server-authoritative role provider
- `frontend/src/pages/Dashboard.jsx` — Role-aware dynamic dashboard
- `frontend/src/pages/ApprovalCenter.jsx` — Multi-stakeholder approval review and history
- `frontend/src/pages/IssueReporting.jsx` — Operational issue reporting & escalation
- `frontend/src/pages/IncidentManagement.jsx` — Incident triage and verified 1-click rollback
- `frontend/src/pages/ComplianceDossier.jsx` — 10-section regulatory conformity documentation
- `frontend/src/services/api.js` — Consolidated API client

---

## 8. Verification Commands

Before concluding any work, execute these commands:
```bash
# 1. Verify backend tests (Must pass 293 tests with 0 failures)
cd backend
npm test

# 2. Verify frontend production build (Must build cleanly with 0 errors)
cd ../frontend
npm run build

# 3. Verify frontend linting
npm run lint
```
