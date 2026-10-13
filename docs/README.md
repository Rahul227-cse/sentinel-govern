# Sentinel Govern — Master Documentation & System Knowledge Base

Welcome to the canonical technical documentation and persistent memory system for **Sentinel Govern — AI Governance & Lifecycle Platform**.

This documentation suite serves as the single authoritative source of truth for project developers, product owners, and AI coding agents (such as Antigravity, Claude, and Codex). It is strictly backed by evidence from the active codebase.

---

## Current Project Health Dashboard

*Last Verified: 2026-10-09 | Local Environment: Windows (PowerShell) | Node.js v24.18.0 / npm v10.8.2*

| Subsystem / Area | Operational Status | Verification Evidence | Notes & Constraints |
|---|---|---|---|
| **Backend API** | **CURRENT / PASSING** | `npm test` runs 293 tests across 22 suites with 100% pass rate (0 failures, 0 skipped, duration ~42s). | Port 5000 (`http://localhost:5000`). Express 4 REST API. |
| **Frontend UI** | **CURRENT / PASSING** | `npm run build` completed cleanly in 1.98s via Vite 8 (`dist/` generated, 0 build errors). `oxlint` reports 0 errors (22 minor styling warnings). | Port 3000 (`http://localhost:3000`). React 19 + Vite 8 + React Router 7. |
| **Database** | **CURRENT / OPERATIONAL** | External MongoDB Atlas connection (`cluster0.v4pvm60.mongodb.net/ai_govern`) with automatic zero-config fallback to `MongoMemoryServer` (v10.1.3). Safe dev reset via `npm run db:reset` guarded against production. | Ephemeral in-memory database used seamlessly during automated test runs. |
| **Authentication** | **CURRENT / OPERATIONAL** | Dual auth: Google Identity Services (GIS OAuth2) + Native email/password with Bcrypt (12 rounds) & HttpOnly cookie refresh rotation. | 28 automated security tests + 29 native auth tests passing. Default signup role: `GOVERNANCE_OFFICER` (`PENDING`). |
| **RBAC & Authorization** | **CURRENT / VERIFIED** | 4 canonical roles (`PLATFORM_ADMIN`, `ML_LEAD`, `GOVERNANCE_OFFICER`, `EXECUTIVE_APPROVER`) and 26 fine-grained permissions. Platform Admin is strictly partitioned from domain sign-offs and model creation. | Server-authoritative role verification. Client role selection cannot elevate permissions. Legacy role eviction in place. |
| **Model Lifecycle** | **CURRENT / OPERATIONAL** | Lifecycle gating enforced in [lifecycleService.js](file:///d:/Projects/govern/backend/src/services/lifecycleService.js). Stages: `DRAFT`, `UNDER_REVIEW`, `EVALUATION`, `PENDING_APPROVAL`, `APPROVED`, `IN_PRODUCTION`, `DEPRECATED`. Quorum: 3 domain approvers. | Enums verified in Mongoose schema. See [Contradictions](file:///d:/Projects/govern/docs/CONTRADICTIONS.md) regarding `DEPRECATED` vs `RETIRED`. |
| **Evaluation & Fairness** | **CURRENT / OPERATIONAL** | In-memory statistical engine for Disparate Impact Ratio (80% rule), Demographic Parity Difference, and Equalized Odds TPR/FPR. CSV/XLSX import supported. | Import validates benchmarks without model training. Non-training principle strictly enforced. |
| **Monitoring & Drift** | **CURRENT / OPERATIONAL** | Dual pipeline: Real Evidently AI (0.7.23) runtime ingestion (`POST /api/telemetry/ingest`, zero fake PSI invariant) + In-memory PSI quantile simulation engine (`/api/telemetry/simulate`). | Critical drift creates an incident with deduplication; does NOT trigger silent automatic rollbacks. |
| **Incidents & Rollback** | **CURRENT / OPERATIONAL** | Incidents cycle: `OPEN` → `INVESTIGATING` → `MITIGATED` → `CLOSED`. Deduplicates ongoing drift. Bidirectional linkage with employee issue reports. 1-click rollback restores previously approved baseline. | Target rollback version must have passed policies and hold approved status. |
| **Cryptographic Audit** | **CURRENT / OPERATIONAL** | SHA-256 hash-chained immutable ledger. Genesis block + sequence linking. Tracks 41 discrete action types. Verification detects payload tampering. | Tamper simulation and repair strictly guarded by `ENABLE_AUDIT_TAMPER_DEMO=true` in non-production. |
| **Compliance Dossier** | **CURRENT / OPERATIONAL** | Server-compiled 1-click Technical Documentation & Conformity Assessment for EU AI Act Annex III and NIST AI RMF. | Read-only compilation. Strict "no fabrication" rule when evidence is missing. |
| **Production Deployment** | **LOCAL DEVELOPMENT** | Local development environments configured (`localhost:3000`, `localhost:5000`). Staging/Production hosting not provisioned. | Production OAuth origins and SMTP mail service planned for future phases. |

---

## Documentation Directory Structure

```text
docs/
├── README.md                      ← Entry point & master health dashboard (this document)
├── PROJECT_CONTEXT.md             ← Canonical project memory, scope, and non-goals
├── CURRENT_STATE.md               ← Live implementation status and immediate priorities
├── ARCHITECTURE.md                ← High-level architecture, subsystem flows, Mermaid diagrams
├── CONTRADICTIONS.md              ← Historical inconsistencies resolved with code evidence (C-001 through C-012)
├── DECISIONS.md                   ← Architectural Decision Records (ADRs D-001 through D-023)
├── ROADMAP.md                     ← Roadmap: Completed, In-Progress, Next, Deferred, Blocked
├── KNOWN_ISSUES.md                ← Known bugs, regressions, workarounds, and resolution status
├── CHANGELOG.md                   ← Development history by stages and phases
│
├── Subsystems & Domain Guides
│   ├── AUTHENTICATION.md          ← Google OAuth GIS & Native Email/Password implementation
│   ├── AUTHORIZATION_RBAC.md      ← 4 canonical roles, 26 permissions, separation of duties, legacy eviction
│   ├── USER_LIFECYCLE.md          ← Signup, Onboarding, Verification, Account Status & Presence
│   ├── MODEL_LIFECYCLE.md         ← Model progression, 3 domain approvers, transition rules
│   ├── DATABASE.md                ← MongoDB schemas, indexes, connection, in-memory fallback, reset script
│   ├── API_REFERENCE.md           ← Complete REST API route reference (all endpoints)
│   ├── FRONTEND.md                ← React 19 / Vite architecture, role-aware dashboards, blank-page prevention
│   ├── BACKEND.md                 ← Express architecture, middleware stack, controllers, services
│   ├── GOVERNANCE.md              ← Control plane philosophy, EU AI Act, NIST AI RMF alignment
│   ├── EVALUATION_AND_FAIRNESS.md ← Statistical fairness algorithms, dataset file upload
│   ├── MONITORING_AND_DRIFT.md    ← Dual monitoring: Evidently AI ingestion + PSI simulation
│   ├── INCIDENTS_AND_ROLLBACK.md  ← Incident lifecycle, deduplication, and atomic version rollback engine
│   ├── AUDIT_AND_COMPLIANCE.md    ← SHA-256 chained ledger and 1-click Compliance Dossier
│   ├── TESTING.md                 ← Authoritative 293-test verification harness, 22 test suites
│   ├── UI_UX_GUIDELINES.md        ← Design system, color tokens, layout, typography, components
│   ├── DEPLOYMENT.md              ← Local environment configuration, ports, CORS, prod gaps
│   └── ENVIRONMENT.md             ← Environment variables inventory with redacted secrets
│
├── phases/
│   ├── PHASE_STATUS.md            ← Matrix of completion across Stage 1, Stage 2, and Stage 3
│   └── PHASE_HISTORY.md           ← Detailed historical narrative of development phases
│
└── ai/
    ├── AI_AGENT_CONTEXT.md        ← Dedicated onboarding brief for new AI coding assistants
    ├── AI_CONTINUATION_RULES.md   ← Core rules of engagement for coding agents
    └── AI_CHANGE_PROTOCOL.md      ← Step-by-step verification protocol for future modifications
```

---

## Reading Guide by Audience

### For the Project Owner / Lead Architect
1. Review [CURRENT_STATE.md](file:///d:/Projects/govern/docs/CURRENT_STATE.md) for what works and what is queued next.
2. Review [ROADMAP.md](file:///d:/Projects/govern/docs/ROADMAP.md) for strategic priorities and deferred work.
3. Review [CONTRADICTIONS.md](file:///d:/Projects/govern/docs/CONTRADICTIONS.md) to understand how historical documentation discrepancies were resolved.
4. Review [DECISIONS.md](file:///d:/Projects/govern/docs/DECISIONS.md) to evaluate architectural precedents.

### For Software Engineers
1. Review [ARCHITECTURE.md](file:///d:/Projects/govern/docs/ARCHITECTURE.md) to understand subsystem interactions.
2. Review [BACKEND.md](file:///d:/Projects/govern/docs/BACKEND.md) and [FRONTEND.md](file:///d:/Projects/govern/docs/FRONTEND.md) for framework details.
3. Refer to [API_REFERENCE.md](file:///d:/Projects/govern/docs/API_REFERENCE.md) when integrating endpoints.
4. Run `npm test` in `backend` and `npm run build` in `frontend` before submitting code.

### For AI Coding Assistants (Antigravity / Codex / Claude)
1. **Mandatory First Read**: [docs/ai/AI_AGENT_CONTEXT.md](file:///d:/Projects/govern/docs/ai/AI_AGENT_CONTEXT.md).
2. **Operational Rules**: [docs/ai/AI_CONTINUATION_RULES.md](file:///d:/Projects/govern/docs/ai/AI_CONTINUATION_RULES.md).
3. **Execution Checklist**: [docs/ai/AI_CHANGE_PROTOCOL.md](file:///d:/Projects/govern/docs/ai/AI_CHANGE_PROTOCOL.md).
4. **Implementation Reality**: [docs/CURRENT_STATE.md](file:///d:/Projects/govern/docs/CURRENT_STATE.md).
