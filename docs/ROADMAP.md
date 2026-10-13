# Aegis AI — Project Roadmap

This roadmap reflects the verified implementation state of the Aegis AI codebase as of **2026-10-09**, categorizing features across Completed, In-Progress, Next Priorities, Deferred, and Future horizons.

---

## 1. Completed Features (Verified by Repository Evidence)

| Item | Description | Code Evidence & Verification | Priority Level |
|---|---|---|:---:|
| **Centralized Model Registry** | Model cards, risk classification, intended purpose, and version control. | [Model.js](file:///d:/Projects/govern/backend/src/models/Model.js), [ModelVersion.js](file:///d:/Projects/govern/backend/src/models/ModelVersion.js), [ModelRegistry.jsx](file:///d:/Projects/govern/frontend/src/pages/ModelRegistry.jsx) | High |
| **Statistical Fairness Studio** | In-memory evaluation of Disparate Impact (80% rule), Demographic Parity, and Equalized Odds. | [fairnessEngine.js](file:///d:/Projects/govern/backend/src/services/fairnessEngine.js), [FairnessStudio.jsx](file:///d:/Projects/govern/frontend/src/pages/FairnessStudio.jsx) | High |
| **Dataset File Import** | CSV and XLSX file upload with automatic column detection and label normalization. | [evaluationImportService.js](file:///d:/Projects/govern/backend/src/services/evaluationImportService.js), 24 tests in `evaluation_import.test.js` | High |
| **Model-Aware Policy Engine** | Configurable rules bound to models in MongoDB that actively block lifecycle stage transitions. | [policyEngine.js](file:///d:/Projects/govern/backend/src/services/policyEngine.js), [Model.js](file:///d:/Projects/govern/backend/src/models/Model.js), 8 tests in `model_aware_policy_management.test.js` | High |
| **Multi-Stakeholder Sign-Offs** | Distributed approval gates enforcing strict separation of duties across 3 domain roles (`ML_LEAD`, `GOVERNANCE_OFFICER`, `EXECUTIVE_APPROVER`). | [Approval.js](file:///d:/Projects/govern/backend/src/models/Approval.js), [ApprovalCenter.jsx](file:///d:/Projects/govern/frontend/src/pages/ApprovalCenter.jsx) | High |
| **Dual Telemetry & Drift Monitoring** | Real Evidently AI 0.7.23 ingestion with Zero Fake PSI (`aggregatePsi: null`), plus in-memory PSI quantile simulation. | [runtimeMonitoringService.js](file:///d:/Projects/govern/backend/src/services/runtimeMonitoringService.js), [driftEngine.js](file:///d:/Projects/govern/backend/src/services/driftEngine.js), 15 tests in `runtime_monitoring_integration.test.js` | High |
| **Decoupled External AI Model Scoring** | Client adapter connecting external FastAPI model scoring on port 8000. | [externalAiAdapter.js](file:///d:/Projects/govern/backend/src/services/externalAiAdapter.js) | High |
| **Incident Escalation & Deduplication** | Automated `#INC-xxx` incident generation with active drift deduplication and safe atomic rollback to approved baselines. | [incidentService.js](file:///d:/Projects/govern/backend/src/services/incidentService.js), 5 tests in `governance_flow_corrections.test.js` | High |
| **Employee Issue Reporting** | Operational issue reporting with evidence payloads and 1-click incident escalation. | [issueService.js](file:///d:/Projects/govern/backend/src/services/issueService.js), 22 tests in `issue_reporting_incident.test.js` | High |
| **Cryptographic Audit Ledger** | SHA-256 chained blocks, genesis block, live tamper verification, and repair mechanism across 41 action types. | [auditEngine.js](file:///d:/Projects/govern/backend/src/services/auditEngine.js), [AuditTrail.jsx](file:///d:/Projects/govern/frontend/src/pages/AuditTrail.jsx) | High |
| **1-Click Compliance Dossier** | Comprehensive Technical Documentation compiling 10 statutory sections for EU AI Act Annex III. | [reportService.js](file:///d:/Projects/govern/backend/src/services/reportService.js), [ComplianceDossier.jsx](file:///d:/Projects/govern/frontend/src/pages/ComplianceDossier.jsx) | High |
| **Google Identity Services (OAuth2)** | Official GIS web client integration with cryptographic token validation. | [googleAuthService.js](file:///d:/Projects/govern/backend/src/services/googleAuthService.js), `google_auth_stage2.test.js` | High |
| **Native Email/Password Auth** | Bcrypt (12 rounds), refresh token rotation, HttpOnly cookie delivery, rate limiting. | [nativeAuthService.js](file:///d:/Projects/govern/backend/src/services/nativeAuthService.js), 29 tests in `native_auth.test.js` | High |
| **User Verification Workflow** | Multi-step onboarding, accountStatus vs verificationStatus vs presence, admin verification. | [Onboarding.jsx](file:///d:/Projects/govern/frontend/src/pages/Onboarding.jsx), [AdminUsers.jsx](file:///d:/Projects/govern/frontend/src/pages/AdminUsers.jsx), `onboarding_verification_master.test.js` | High |
| **Role-Aware Dashboard & Legacy Eviction** | Dynamic dashboard customization per persona, and automatic clearing of legacy role sessions in AuthContext. | [Dashboard.jsx](file:///d:/Projects/govern/frontend/src/pages/Dashboard.jsx), [AuthContext.jsx](file:///d:/Projects/govern/frontend/src/context/AuthContext.jsx), 4 tests in `dashboard_role_aware.test.js` | High |
| **Safe Development DB Reset** | Script resetting operational collections and reseeding clean baselines, strictly blocked in production. | [resetDevDb.js](file:///d:/Projects/govern/backend/src/seed/resetDevDb.js) (`npm run db:reset`) | Medium |
| **Frontend UI Stabilization** | Single AppLayout instance, double-layer ErrorBoundary, loading skeleton guards. | [App.jsx](file:///d:/Projects/govern/frontend/src/App.jsx), [AppLayout.jsx](file:///d:/Projects/govern/frontend/src/components/AppLayout.jsx) | High |

---

## 2. In Progress Work

- **Documentation & Agent Alignment:** Full synchronization of system documentation across all `docs/` files with active 293-test reality.

---

## 3. Next Priorities (Immediate Horizon)

| Priority | Feature / Task | Objective & Scope | Dependencies |
|:---:|---|---|---|
| **P1** | **Production SMTP Email Dispatch** | Integrate SendGrid or AWS SES to deliver real password reset emails in production, deprecating `_devResetToken`. | External email provider credentials |
| **P2** | **Production Deployment Topology** | Create multi-stage Dockerfiles and `docker-compose.yml` for staging and production, ensuring `MongoMemoryServer` is disabled in production. | Docker runtime |
| **P3** | **Playwright E2E Test Suite** | Implement headless browser tests verifying complete user flows: Signup → Onboarding → Admin Verification → Policy Gate Check → Production Rollback. | Dev server availability |
| **P4** | **WebSocket Telemetry Stream** | Supplement HTTP batch telemetry ingestion with real-time WebSocket feeds for high-throughput live drift tracking. | Node.js `ws` library |

---

## 4. Deferred Work (Intentionally Postponed)

- **Model Weight File Hosting:** Hosting multi-gigabyte PyTorch/ONNX checkpoints directly within Aegis AI (currently tracked via S3/GCS URI pointers in `artifactReference`).
- **User Avatar / Profile Photo Uploads:** Direct image file upload and cropping for user avatars (currently uses initials or Google profile picture URLs).
- **Multi-Tenant Organization Switching:** Instant switching between separate tenant databases within the UI.

---

## 5. Blocked Work

- **None.** No active tasks are blocked by external or technical impediments.

---

## 6. Future Considerations (Uncommitted Backlog)

- Automated continuous compliance monitoring hooks integrated directly with CI/CD pipelines (GitHub Actions, GitLab CI).
- Support for Generative AI & Large Language Model (LLM) governance metrics (toxicity scoring, hallucination rates, retrieval faithfulness).
- Bi-directional sync with enterprise data catalogs (Alation, Collibra) and experiment trackers (MLflow, Weights & Biases).
