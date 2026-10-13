# Aegis AI — Historical Development Narrative

This document provides a contextual narrative explaining the evolutionary history, technical challenges, and problem-solving steps across the development of Aegis AI.

---

## 1. Stage 1: The Core AI Governance Engine

### The Problem Space
Organizations deploying predictive artificial intelligence (such as automated credit underwriting, hiring screenings, and risk scoring) face increasing regulatory scrutiny under the EU AI Act (Annex III High-Risk categorizations) and the NIST AI RMF. Standard MLOps tools focus predominantly on model performance (loss curves, ROC-AUC) while neglecting statutory fairness, multi-stakeholder separation of duties, and verifiable auditability.

### The Stage 1 Solution
Between September 11 and September 25, 2026, the foundational control plane was built:
1. **Mathematical Fairness & Drift Engines:** Pure Node.js algorithms were implemented to eliminate heavy external math runtimes. The Four-Fifths (80%) Rule for Disparate Impact Ratio and the Population Stability Index (PSI) were verified against canonical datasets.
2. **Gated Lifecycle & Separation of Duties:** A state machine enforced that models with disparate impact violations ($DIR < 0.80$) could not progress to `PENDING_APPROVAL`, and required four distinct stakeholder roles to submit signed approvals before production deployment.
3. **Cryptographic Blockchain Ledger:** To satisfy statutory record-keeping mandates (EU AI Act Article 12), a SHA-256 chained hash ledger was implemented. Any unauthorized mutation directly in MongoDB is instantly detected by `verifyAuditChainIntegrity()`.
4. **Conclusion of Stage 1:** Completed with 195 passing backend integration tests.

---

## 2. Stage 2: Enterprise Security, Hardening & Compliance

Following Stage 1, development shifted toward hardening Aegis AI for enterprise production environments:

### Authentication & RBAC (Phases 1–5)
- **Google Identity Services (GIS):** Added single sign-on using Google OAuth2 ID tokens verified via `google-auth-library`.
- **Partitioning Platform Administrators:** In response to regulatory governance requirements, `PLATFORM_ADMIN` was partitioned from domain governance actions to guarantee that system administrators cannot override statistical fairness gates or approve biased models.
- **Security Hardening:** Implemented strict HTTP security headers, CORS origin restrictions, and tiered IP rate limiters to prevent brute-force attacks and abuse.

### Full-Stack Enterprise Extensions (Phases 6–10)
- **Native Authentication & Refresh Token Rotation:** Added email/password authentication alongside Google OAuth, backed by Bcrypt (12 rounds) and rotating refresh tokens in HttpOnly cookies with user enumeration protection.
- **Decoupled User Lifecycle:** Separated account lifecycle status (`ACTIVE`/`SUSPENDED`), verification status (`PENDING`/`VERIFIED`), and operational presence (`ACTIVE`/`OFFLINE`). Built multi-step onboarding and the Platform Admin user verification console.
- **Evaluation Benchmark Dataset Import:** Supported in-memory parsing of `.csv` and `.xlsx` benchmark datasets without executing model training, upholding the non-training principle.
- **Employee Issue Reporting:** Provided operational staff with a mechanism to flag discriminatory or anomalous outputs, allowing governance teams to triage and escalate issues directly into high-severity incidents.
- **1-Click Compliance Dossier:** Built a server-authoritative compilation engine that generates formal EU AI Act Annex III Technical Documentation across 10 statutory sections adhering to the strict "no fabrication" rule.

### Frontend Stabilization
- In late September 2026, the frontend was overhauled to eliminate blank-screen regressions. All routes were consolidated under a single persistent `<AppLayout />` parent, double-layer ErrorBoundaries were introduced, and loading guards were added to ensure seamless session hydration.
- The backend reached an interim milestone of 260 passing automated tests.

---

## 3. Stage 3: Real Telemetry Ingestion, Model-Aware Policy & Production Operations

In early October 2026 (Milestone 2.10), Aegis AI evolved from isolated simulations into an enterprise-integrated control plane:

### Dual-Engine Telemetry & Real Evidently AI Integration
- **Zero Fake PSI Invariant:** Real production telemetry collected via the Sentinel Monitoring Daemon (Evidently AI 0.7.23) is ingested via `POST /api/telemetry/ingest`. To prevent falsification, `aggregatePsi` is strictly recorded as `null`, while genuine statistical drift test indicators and p-values are stored in `features` and `driftedColumns`. The in-memory PSI algorithm was preserved exclusively for simulation testing (`POST /api/telemetry/simulate`).
- **External AI Model Scoring Decoupling:** In accordance with the invariant "The AI model does the AI work; Aegis AI governs the AI model", model inference and fraud risk scoring were cleanly delegated to an external FastAPI service on port 8000 via `externalAiAdapter.js`.

### Governance Persona Consolidation & Gating Quorum
- **4 Canonical Personas:** The organizational taxonomy was consolidated from 6 legacy roles into 4 canonical roles (`PLATFORM_ADMIN`, `ML_LEAD`, `GOVERNANCE_OFFICER`, `EXECUTIVE_APPROVER`).
- **3 Domain Approvers Quorum:** Production stage-gate sign-offs require an exact quorum of 3 domain approvers (`ML_LEAD`, `GOVERNANCE_OFFICER`, `EXECUTIVE_APPROVER`).
- **Legacy Session Eviction:** `AuthContext.jsx` was enhanced to detect and clear stale browser sessions carrying deprecated role tokens.

### Enterprise Governance Refinements
- **Model-Aware Policy Management:** Policies are explicitly bound to models (`applicablePolicyIds`, `Policy.applicableModelIds`), with dedicated filtering in the Policy Library and dynamic binding via `PATCH /api/models/:id/policy`.
- **Incident Deduplication:** When successive telemetry batches exhibit continuous drift, the incident engine automatically updates the existing open incident (`telemetryRef`, `metricsSnapshot`, and re-confirmation notes) rather than creating duplicate incident records.
- **Role-Aware Dashboard:** Personalizes dashboard KPIs, action shortcuts, and approval queues based on the authenticated user's persona.
- **Safe Development DB Reset:** Introduced `backend/src/seed/resetDevDb.js` (`npm run db:reset`) with a strict runtime check that throws an exception if executed in production (`process.env.NODE_ENV === 'production'`).
- **Authoritative Test Suite Milestone:** The automated test suite was expanded and verified at **293 passing automated tests across 22 test files** with 0 failures.
