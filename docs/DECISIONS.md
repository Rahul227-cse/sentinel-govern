# Aegis AI — Architectural Decision Records (ADR)

This document records the foundational architectural, security, and governance decisions established for Aegis AI.

---

### ADR D-001: Separation of Identity Authentication from Application Authorization
- **Date:** 2026-09-25
- **Status:** **CURRENT / ACTIVE**
- **Decision:** Google Identity Services (GIS) and Native Auth authenticate external identity; Aegis AI backend maintains strict, autonomous control over user authorization, roles, and permissions.
- **Context:** Third-party OAuth identity providers provide verified identity claims (email, name, picture), but should not dictate enterprise governance privileges.
- **Alternatives Considered:** Storing enterprise roles directly in Google Workspace custom user schemas or Google Groups.
- **Reason:** Aegis AI must function across mixed enterprise environments and cannot tightly couple authorization to a single cloud directory schema.
- **Impact:** New OAuth users are provisioned with baseline `EMPLOYEE` role and `PENDING` verification status. Platform Administrators manage roles within Aegis AI.

---

### ADR D-002: Platform Administrator is Not a Blanket Governance Superuser
- **Date:** 2026-09-25
- **Status:** **CURRENT / ACTIVE**
- **Decision:** `PLATFORM_ADMIN` is explicitly prohibited from creating models, signing off on governance approvals, or executing model rollbacks.
- **Context:** Traditional IT architectures grant administrators universal superuser bypasses. In AI regulatory governance (EU AI Act, NIST AI RMF), this creates a catastrophic violation of separation of duties.
- **Alternatives Considered:** Granting `PLATFORM_ADMIN` full wildcard permissions (`*`).
- **Reason:** A systems administrator must not have the authority to bypass statistical fairness gates or unilaterally approve biased algorithms into production.
- **Impact:** Model creation and lifecycle sign-offs remain strictly partitioned among domain stakeholders (`ML_LEAD`, `ETHICS_OFFICER`, `COMPLIANCE_OFFICER`, `EXECUTIVE_SPONSOR`).

---

### ADR D-003: Strict Prohibition of Role Impersonation on Approval Gates
- **Date:** 2026-09-25
- **Status:** **CURRENT / ACTIVE**
- **Decision:** Approvers can only submit sign-off decisions for their authenticated role. Client-supplied role overrides in request payloads are rejected with HTTP 403.
- **Context:** An approver attempting to approve on behalf of another domain stakeholder invalidates regulatory compliance.
- **Alternatives Considered:** Permitting proxy sign-offs with an `approvedOnBehalfOf` flag.
- **Reason:** High-risk compliance frameworks mandate non-repudiable personal accountability for sign-offs.
- **Impact:** Enforced via `requireApprovalSignoffRole` middleware.

---

### ADR D-004: PLATFORM_ADMIN is Not Selectable During Normal Signup or Onboarding
- **Date:** 2026-09-28
- **Status:** **CURRENT / ACTIVE**
- **Decision:** The `PLATFORM_ADMIN` role cannot be selected by self-service users during signup or onboarding. Only the designated `BOOTSTRAP_ADMIN_EMAIL` receives administrative privileges automatically.
- **Context:** Preventing unauthorized privilege escalation by self-registering users.
- **Alternatives Considered:** Relying on a secret signup invite code.
- **Reason:** Secure server-controlled bootstrapping eliminates shared secret leakage risks.
- **Impact:** Any onboarding payload containing `role: 'PLATFORM_ADMIN'` from non-bootstrap accounts is rejected with HTTP 403.

---

### ADR D-005: Backend Authorization is Strictly Authoritative Over Frontend State
- **Date:** 2026-09-25
- **Status:** **CURRENT / ACTIVE**
- **Decision:** Frontend UI state, role selectors, and client persona switches must never be trusted by the backend. All authorization decisions derive from verified JWT tokens and database queries.
- **Context:** Frontend persona switching is useful for interactive demos, but creates severe vulnerabilities if accepted by APIs.
- **Alternatives Considered:** Client-driven role claims in JWT tokens.
- **Reason:** A compromised client must not be able to forge governance actions by mutating localStorage or request headers.
- **Impact:** In `RoleContext.jsx`, client switching is disabled when authenticated. Backend controllers derive the actor strictly from `req.user`.

---

### ADR D-006: Dual Authentication Coexistence (Google GIS + Native Email/Password)
- **Date:** 2026-09-28
- **Status:** **CURRENT / ACTIVE**
- **Decision:** Support both Google OAuth and Native Email/Password authentication within the same unified user directory.
- **Context:** Organizations require single sign-on alongside fallback local accounts for environments where Google authentication is unavailable or restricted.
- **Alternatives Considered:** Google-only authentication; Native-only authentication.
- **Reason:** Maximum operational flexibility for both enterprise deployments and isolated developer test runs.
- **Impact:** Users can register via either flow. Accounts sharing an email are securely unified under the same `User` record.

---

### ADR D-007: Preservation of Schema Enums (`DEPRECATED` vs `RETIRED`)
- **Date:** 2026-09-26
- **Status:** **CURRENT / ACTIVE**
- **Decision:** Preserve existing Mongoose schema enums where `ModelVersion.lifecycleStatus` uses `DEPRECATED` and `ModelVersion.deploymentStatus` uses `RETIRED`. Do not rename schema enums for cosmetic reasons.
- **Context:** Historical documents debated whether `RETIRED` should replace `DEPRECATED` across all schemas.
- **Alternatives Considered:** Running database migrations to rename `DEPRECATED` to `RETIRED` across all models and tests.
- **Reason:** Arbitrary enum renames risk breaking database indexes, historical audit payloads, and downstream integrations without adding governance value.
- **Impact:** Both fields are maintained in accordance with their distinct architectural meanings.

---

### ADR D-008: Prohibition of Backend Enum Renaming for Frontend Display
- **Date:** 2026-09-26
- **Status:** **CURRENT / ACTIVE**
- **Decision:** Never alter backend database enums or API contract strings merely to adjust UI labels or marketing terminology.
- **Context:** Frontend display requirements frequently evolve (e.g. displaying "Retired" instead of "Deprecated").
- **Alternatives Considered:** Modifying backend schemas whenever UI labels change.
- **Reason:** Database schemas must remain stable and immutable; presentation mapping belongs exclusively in frontend formatter utilities.
- **Impact:** Frontend formatters translate backend enums to human-friendly labels.

---

### ADR D-009: Decoupling of Account Status, Verification Status, and Presence
- **Date:** 2026-09-28
- **Status:** **CURRENT / ACTIVE**
- **Decision:** Explicitly separate `status` (`ACTIVE`/`SUSPENDED`), `verificationStatus` (`PENDING`/`VERIFIED`), and `presence` (`ACTIVE`/`OFFLINE`) into distinct database fields.
- **Context:** Earlier drafts attempted to combine account verification and online status into a single status field.
- **Alternatives Considered:** Overloading a single `status` enum (`PENDING_VERIFICATION`, `ACTIVE_ONLINE`, `ACTIVE_OFFLINE`, `SUSPENDED`).
- **Reason:** A user can be verified but offline, or unverified but actively browsing. Conflating these vectors causes severe state synchronization bugs.
- **Impact:** Clear, orthogonal state tracking across user authentication and administrative workflows.

---

### ADR D-010: Profile Photo Uploads are Intentionally Out of Scope
- **Date:** 2026-09-28
- **Status:** **CURRENT / ACTIVE**
- **Decision:** File upload capabilities for user avatar pictures are explicitly excluded from scope. Avatars are derived from Google OAuth profile URLs or rendered as dynamic initials.
- **Context:** Discussion regarding adding image upload widgets for user profiles.
- **Alternatives Considered:** Implementing S3 image upload pipelines with image resizing and cropping.
- **Reason:** Aegis AI is a high-assurance governance engine, not a social collaboration tool. Avatar hosting introduces unnecessary attack surfaces and storage overhead.
- **Impact:** Simplifies profile management and eliminates image sanitization risks.

---

### ADR D-011: The Non-Training Principle for Benchmark Evaluations
- **Date:** 2026-09-25
- **Status:** **CURRENT / ACTIVE**
- **Decision:** Evaluation file imports (.csv/.xlsx) must evaluate pre-computed predictions against ground truth labels without executing model training.
- **Context:** Evaluating whether Aegis AI should train machine learning models on uploaded files.
- **Alternatives Considered:** Embedding scikit-learn or TensorFlow Python runtimes to train baseline models.
- **Reason:** Aegis AI is an independent governance control plane. Training models creates compute bottlenecks and blurs the boundary between system builder and system auditor.
- **Impact:** File processing remains fast, lightweight, memory-bounded, and completely free of Python dependencies.

---

### ADR D-012: Drift Escalation Triggers Incidents, Never Silent Automated Rollbacks
- **Date:** 2026-09-25
- **Status:** **CURRENT / ACTIVE**
- **Decision:** Population Stability Index drift ($\text{PSI} \ge 0.25$) generates high-severity Incident records but never triggers automatic model rollbacks.
- **Context:** Automated self-healing vs human-in-the-loop governance.
- **Alternatives Considered:** Automatically replacing production models when PSI crosses 0.25.
- **Reason:** Silent rollbacks in mission-critical enterprise systems can cause catastrophic business disruptions and violate regulatory human oversight mandates.
- **Impact:** Rollbacks require human review and explicit execution by authorized stakeholders (`ML_LEAD` or `EXECUTIVE_SPONSOR`).

---

### ADR D-013: Ephemeral MongoMemoryServer Permitted for Zero-Config Local Development
- **Date:** 2026-09-25
- **Status:** **CURRENT / ACTIVE**
- **Decision:** When external MongoDB Atlas is unreachable, the backend falls back to an embedded `mongodb-memory-server` instance.
- **Context:** Enabling instant onboarding and seamless execution of automated test suites without requiring local MongoDB installations.
- **Alternatives Considered:** Requiring developers and CI environments to run local MongoDB daemons.
- **Reason:** Drastically accelerates development velocity and guarantees 100% test pass rates across all machines.
- **Impact:** In-memory data resets on restart. Production deployments must enforce external Atlas connections.

---

### ADR D-014: Single Persistent AppLayout and Double-Layer Error Boundaries
- **Date:** 2026-09-29
- **Status:** **CURRENT / ACTIVE**
- **Decision:** All authenticated routes must render inside a single persistent `<AppLayout />` parent, protected by both root-level and layout-level ErrorBoundaries.
- **Context:** Resolving historical blank-screen rendering crashes when navigating between routes.
- **Alternatives Considered:** Independent layout wrappers on every page route.
- **Reason:** Eliminates unmounting of sidebar/navbar chrome and prevents localized page exceptions from unmounting the entire application.
- **Impact:** Zero blank-screen regressions across all application routes.

---

### ADR D-015: Strict "No Fabrication" Rule in Compliance Dossier Compilation
- **Date:** 2026-09-26
- **Status:** **CURRENT / ACTIVE**
- **Decision:** If evidence, metrics, or approvals are missing in the database, the dossier compilation service must return empty arrays or null values rather than generating placeholder evidence.
- **Context:** Generating regulatory conformity documentation for models with incomplete evaluations.
- **Alternatives Considered:** Generating synthetic passing metrics to produce complete-looking sample dossiers.
- **Reason:** Falsifying compliance evidence in a regulatory dossier breaches legal frameworks and violates the core mission of Aegis AI.
- **Impact:** Dossiers represent the true, unvarnished state of governance evidence.

---

### ADR D-016: Model-Specific Governance Policy Binding with Risk-Tier Fallback
- **Date:** 2026-10-07
- **Status:** **CURRENT / ACTIVE**
- **Decision:** Governance policies support explicit binding directly to specific models via `Model.policyId` and `Policy.applicableModelId`. Policy evaluation engines resolve model-specific policies first, falling back hierarchically to risk-tier default policies (`targetRiskLevel`) if no model-specific override exists.
- **Context:** High-risk models in specialized domains often need custom Disparate Impact or ROC-AUC thresholds tighter or distinct from general risk-tier defaults.
- **Alternatives Considered:** Forcing all models of a given risk tier to use identical policies; or requiring every model to clone a separate policy document.
- **Reason:** Provides fine-grained regulatory governance without administrative overhead or breaking existing risk-tier defaults.
- **Impact:** Model creation and policy resolution seamlessly prioritize model-specific constraints across evaluations, policy gates, and approvals.

---

### ADR D-017: Active Incident Aggregation over Duplicate Creation on Repeated Drift Telemetry
- **Date:** 2026-10-07
- **Status:** **CURRENT / ACTIVE**
- **Decision:** Repeated drift detection on the same model version updates and attaches telemetry to existing active incidents (`OPEN` or `INVESTIGATING`) instead of generating duplicate incident records. Furthermore, stable telemetry batches do not silently resolve or delete active incidents.
- **Context:** Automated or simulated telemetry streams generated duplicate incident tickets for a single drift event, while subsequent stable batches caused confusion if incidents vanished.
- **Alternatives Considered:** Generating a new incident on every telemetry window; auto-closing incidents when a single healthy batch arrives.
- **Reason:** Incidents represent ongoing operational and regulatory investigations requiring formal human triage. Duplicate tickets create noise, and transient stable periods do not guarantee root-cause resolution.
- **Impact:** Enforced in `incidentService.createDriftIncident` and verified with automated integration tests.

---

### ADR D-018: Eligibility of Retired Production Baselines for Safe Rollback
- **Date:** 2026-10-07
- **Status:** **CURRENT / ACTIVE**
- **Decision:** When evaluating rollback candidate versions, previously approved production versions that were retired upon deployment of a successor (`deploymentStatus === 'RETIRED'` or `lifecycleStatus === 'DEPRECATED'`) are recognized as eligible rollback targets. When no prior baseline exists, the system explicitly reports "None Available" and disables rollback rather than displaying speculative fallback version strings.
- **Context:** In previous iterations, deploying v2.0 retired v1.0, but the rollback engine required `deploymentStatus === 'IN_PRODUCTION'`, blocking rollback to v1.0. Simultaneously, the UI displayed `|| 'v1.0'` fallback text even when no baseline existed, confusing users.
- **Alternatives Considered:** Keeping all historical versions marked as `IN_PRODUCTION`; allowing rollback to any unapproved draft version.
- **Reason:** Restores the exact integrity of the last stable verified production state without violating strict policy or approval gate validation.
- **Impact:** Resolves rollback blocking in `incidentService.executeRollback` and eliminates confusing UI fallbacks in `IncidentManagement.jsx`.

---

### ADR D-019: Role Consolidation into Four Canonical Governance Personas
- **Date:** 2026-10-08
- **Status:** **CURRENT / ACTIVE**
- **Decision:** Consolidate the platform's role taxonomy into 4 canonical authoritative roles: `PLATFORM_ADMIN`, `ML_LEAD`, `GOVERNANCE_OFFICER`, and `EXECUTIVE_APPROVER`. Evict stale legacy roles (`ETHICS_OFFICER`, `COMPLIANCE_OFFICER`, `EXECUTIVE_SPONSOR`, `EMPLOYEE`) upon session bootup or refresh.
- **Context:** Managing separate Ethics and Compliance personas created excessive operational friction in smaller enterprise teams, while generic Employee accounts blurred statutory governance boundaries.
- **Alternatives Considered:** Retaining 6 separate roles; merging ML Lead and Governance Officer into a single role.
- **Reason:** `GOVERNANCE_OFFICER` naturally unifies regulatory compliance and statistical fairness auditing, while preserving strict separation of duties against technical builders (`ML_LEAD`), infrastructure managers (`PLATFORM_ADMIN`), and business authorizers (`EXECUTIVE_APPROVER`).
- **Impact:** Streamlines production stage gates to 3 domain approvers, simplifies onboarding selection, and enforces robust server-authoritative role binding.

---

### ADR D-020: Zero Fake PSI for Evidently AI Runtime Telemetry Ingestion
- **Date:** 2026-10-08
- **Status:** **CURRENT / ACTIVE**
- **Decision:** Telemetry documents ingested from external monitoring engines (such as Evidently AI 0.7.23 via `POST /api/telemetry/ingest`) must set `aggregatePsi = null` and record `monitoringSource = 'EVIDENTLY'`, strictly prohibiting the synthesis or fabrication of fake PSI values.
- **Context:** Evidently computes statistical test indicators (p-values, drift methods, column drift flags) rather than PSI. An early proposal suggested synthesizing a fake PSI number to fit existing PSI-based charts.
- **Alternatives Considered:** Fabricating an artificial aggregate PSI based on the percentage of drifted columns.
- **Reason:** Fabricating mathematical metrics violates core regulatory integrity principles (Rule 8: No Fabrication). Auditable regulatory systems must capture authentic statistical telemetry as produced by the underlying analyzer.
- **Impact:** `runtimeMonitoringService.js` records normalized p-values and drifted features with `aggregatePsi: null`, and incident triggers evaluate `drift_detected` flags authentically.

---

### ADR D-021: Architectural Decoupling of External AI Model Scoring
- **Date:** 2026-10-08
- **Status:** **CURRENT / ACTIVE**
- **Decision:** The Sentinel Control Plane operates strictly as an independent governance layer, communicating with external model serving runtimes (FastAPI on port 8000) via a dedicated service adapter (`externalAiAdapter.js`).
- **Context:** Clarifying the relationship between predictive AI model execution and governance policy enforcement.
- **Alternatives Considered:** Embedding model prediction logic or ONNX model runtimes directly inside Express.js.
- **Reason:** Core architectural principle: *"The AI model does the AI work; Sentinel Govern governs the AI model."* Embedding inference runtimes inside the governance plane creates compute bottlenecks and compromises auditor independence.
- **Impact:** Clear boundary separation: External AI scores transactions; Sentinel monitors drift, evaluates policies, enforces approval gates, logs audit events, and manages incidents.

---

### ADR D-022: Safe Development Database Reset Script with Strict Production Safeguard
- **Date:** 2026-10-08
- **Status:** **CURRENT / ACTIVE**
- **Decision:** Provide a dedicated development database reset script (`backend/src/seed/resetDevDb.js` / `npm run db:reset`) that safely clears all 15 Mongoose collections, while embedding a non-negotiable safeguard that throws a fatal error and halts execution if `NODE_ENV === 'production'`.
- **Context:** Automated test suites and demo walkthroughs required a clean, deterministic way to reset the local database without manual drop commands or accidental production data loss risks.
- **Alternatives Considered:** Permitting manual `dropDatabase()` calls via shell scripts without environment verification.
- **Reason:** Accidental execution of reset scripts against production Atlas databases causes catastrophic data destruction.
- **Impact:** Developers can safely reset local/test environments with `npm run db:reset`, while production deployments remain structurally immune to reset execution.

---

### ADR D-023: Employee Issue Reporting with Bidirectional Escalation to Formal Incidents
- **Date:** 2026-10-08
- **Status:** **CURRENT / ACTIVE**
- **Decision:** Implement a dedicated Employee Issue Reporting subsystem (`IssueReport`, `issueService.js`, `IssueReporting.jsx`) allowing any authenticated platform user to report perceived model defects (performance, bias, safety, drift), with a formal triage workflow that supports direct 1-click escalation into high-severity Incident tickets (`#INC-xxx`) with bidirectional references.
- **Context:** Non-engineering stakeholders observing disparate or unsafe model outputs in the field had no structured channel to submit feedback or trigger regulatory investigations.
- **Alternatives Considered:** Requiring employees to email governance officers; or creating incidents immediately without triage.
- **Reason:** Direct incident creation by any user would clutter high-severity incident queues with unverified noise. A dedicated triage buffer allows Governance Officers and ML Leads to investigate reports before formal incident escalation.
- **Impact:** Enforces end-to-end traceability: `IssueReport.escalatedIncidentId` and `Incident.issueReportRef` maintain bidirectional linkage, fully captured in the cryptographic audit ledger.


