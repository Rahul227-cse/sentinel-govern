# Sentinel Govern — Feature Matrix & Implementation Verification

*Platform Version:* 1.0.0-PROD-CANDIDATE  
*Audit Reference:* October 2026

---

## 1. Governance Lifecycle & Stage Gate Matrix

| Feature / Gate | Target Standard | Enforced Lifecycle Stage | Technical Implementation | Status |
|---|---|---|---|---|
| Model Intake Risk Assessment | EU AI Act Annex III / NIST AI RMF | `DRAFT` | Categorizes into `UNACCEPTABLE`, `HIGH`, `LIMITED`, `MINIMAL`. | **VERIFIED WORKING** |
| Model-Specific Policy Binding | ISO/IEC 42001 | `DRAFT` $\rightarrow$ `UNDER_REVIEW` | Direct `Model.policyId` with hierarchical risk tier fallback. | **VERIFIED WORKING** |
| Fairness Evaluation & 80% Rule | US EEOC / EU AI Act Art. 10 | `EVALUATION` | Disparate Impact Ratio ($DIR \ge 0.80$), TPR/FPR parity, Demographic Parity. | **VERIFIED WORKING** |
| Mandatory Policy Gate Check | Sentinel Governance Core | `EVALUATION` $\rightarrow$ `PENDING_APPROVAL` | Rejects transition if $DIR < 0.80$ or accuracy below policy threshold. | **VERIFIED WORKING** |
| 3-Domain Human Sign-Off Quorum | Statutory Separation of Duties | `PENDING_APPROVAL` $\rightarrow$ `APPROVED` | Requires consensus approvals from `ML_LEAD`, `GOVERNANCE_OFFICER`, and `EXECUTIVE_APPROVER`. | **VERIFIED WORKING** |
| Production Promotion Gate | ISO/IEC 42001 | `APPROVED` $\rightarrow$ `IN_PRODUCTION` | Strictly rejects direct promotion of unapproved candidate versions. | **VERIFIED WORKING** |
| Runtime Telemetry Drift Detection | Continuous Monitoring | `IN_PRODUCTION` | Real Evidently AI (0.7.23) hypothesis testing against reference datasets. | **VERIFIED WORKING** |
| Automated Incident Generation | ISO/IEC 42001 Incident Response | `IN_PRODUCTION` | Generates `#INC-xxx` upon drift with automated alert deduplication. | **VERIFIED WORKING** |
| Verified Version Rollback | Safety & Remediation | `IN_PRODUCTION` $\rightarrow$ Baseline | Atomic rollback to previously verified baseline. Blocks unapproved targets. | **VERIFIED WORKING** |
| Cryptographic Audit Ledger | Tamper-Evident Accountability | All Stages | SHA-256 block hash chaining with concurrency mutex queue. | **VERIFIED WORKING** |
| Regulatory Technical Dossier | EU AI Act Annex IV / NIST AI RMF | All Stages | Compiles 10 statutory sections into exportable Markdown artifact. | **VERIFIED WORKING** |

---

## 2. Authentication, Authorization & Identity Matrix

| Authentication Feature | Mechanism / Protocol | Security Invariants | Status |
|---|---|---|---|
| Google Identity Services (GIS) | Google OAuth 2.0 ID Token | Verified against Google public keys; domain & issuer validation. | **VERIFIED WORKING** |
| Native Signup & Login | Bcrypt Work Factor 12 | Constant-time comparison; salted passwords. | **VERIFIED WORKING** |
| Refresh Token Rotation | Opaque Cryptographic Tokens | Stored as SHA-256 hashes in MongoDB; delivered via HttpOnly cookies. | **VERIFIED WORKING** |
| Bootstrap Administrator Auto-Mapping | Verified Email (`rrrbxiang@gmail.com`) | Auto-assigned `PLATFORM_ADMIN` & `VERIFIED`; no default passwords. | **VERIFIED WORKING** |
| Canonical RBAC Roles | 4 Canonical Roles | `PLATFORM_ADMIN`, `ML_LEAD`, `GOVERNANCE_OFFICER`, `EXECUTIVE_APPROVER`. | **VERIFIED WORKING** |
| Separation of Duties | Server-Authoritative Middleware | Platform Admin barred from creating models, approving gates, or rollback. | **VERIFIED WORKING** |
| User Lifecycle Gating | Account & Verification Statuses | `PENDING` accounts read-only; administrative verification unlocks mutations. | **VERIFIED WORKING** |

---

## 3. Workload Integration & Monitoring Matrix

| AI Workload | Architecture & Endpoint | Inference Status | Monitoring Status |
|---|---|---|---|
| **Fraud Detection AI** | FastAPI (Port 8000) / Scikit-Learn | **VERIFIED WORKING** (200 OK, 64ms) | **VERIFIED WORKING** (Evidently Port 8001) |
| **Credit Risk Scoring** | Hosted Render HTTPS / LightGBM | **VERIFIED WORKING** (200 OK, 302ms) | **VERIFIED WORKING** (Baseline Reference CSV) |
| **Medical Insurance Charges** | Hosted Render HTTPS / Gradient Boosting | **VERIFIED WORKING** (200 OK, 288ms) | **VERIFIED WORKING** (Baseline Reference CSV) |
| **Customer Churn Intelligence** | Hosted Render HTTPS / Telco Attrition | **BLOCKED BY CONFIGURATION** (Requires `CHURN_API_KEY`) | **BLOCKED BY CONFIGURATION** |
