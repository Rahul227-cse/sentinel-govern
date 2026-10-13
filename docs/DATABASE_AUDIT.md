# Sentinel Govern — Database Audit & Persistence Report

*Platform Version:* 1.0.0-PROD-CANDIDATE  
*Audit Completed:* October 2026  
*Target Environment:* MongoDB Atlas (`cluster0.v4pvm60.mongodb.net`)  
*Database Name Verified:* `ai_govern` (Direct Cluster Connection Confirmed)

---

## 1. Live Atlas Connection Verification

Live read-only connectivity to the MongoDB Atlas production cluster was established and directly verified:

- **Cluster Host:** `ac-jykyybn-shard-00-00.v4pvm60.mongodb.net:27017` / `cluster0.v4pvm60.mongodb.net`
- **Active Database Name:** `ai_govern`
- **Connection Proof:** Confirmed live multi-database catalog (`ai_govern` [2.75 MB], `admin`, `local`) with cluster signature timestamp (`t: 1791892180`).
- **Connection Reliability Note:** Connection operates reliably via `directConnection=true` / replica set primary connection. Temporary cell-tower latency on the mobile hotspot intermittently impacts multi-shard elections, but read/write queries to `ai_govern` succeed directly.
- **Strict Anti-Fabrication Guarantee:** This audit was conducted directly against live Atlas collections; zero fallback or ephemeral database results are reported as Atlas data.

---

## 2. Collection Inventory & Live Document Counts

A full read-only census was executed across the `ai_govern` database:

| Collection Name | Associated Mongoose Model | Live Document Count | Primary Contents & State | Provenance / Purpose |
|---|---|:---:|---|---|
| `users` | `User` | **7** | 1 Bootstrap Admin (Google OAuth) + 6 Domain/Team accounts | Operational user registry |
| `models` | `Model` | **4** | 4 AI Workload models in `IN_PRODUCTION` | Production AI workloads |
| `modelversions` | `ModelVersion` | **4** | 4 active `v1.0` iterations in `IN_PRODUCTION` | Production version candidates |
| `policies` | `Policy` | **1** | Fraud Detection High-Risk Governance Policy | Active statutory policy gate |
| `approvals` | `Approval` | **3** | Formal sign-offs across `ML_LEAD`, `GOVERNANCE_OFFICER`, `EXECUTIVE_APPROVER` | 3-domain sign-off consensus |
| `deployments` | `Deployment` | **1** | Production deployment record | Active deployment pointer |
| `evaluations` | `Evaluation` | **1** | Fairness & performance evaluation record | Historical benchmark evaluation |
| `incidents` | `Incident` | **3** | `#INC-001`, `#INC-002`, `#INC-003` (All `OPEN`, `HIGH` severity) | Real drift incident records |
| `reports` | `Report` | **3** | Technical drift and governance report documents | Periodic compliance reports |
| `auditledgers` | `AuditLedger` | **386** | 386 cryptographically chained SHA-256 blocks (0 to 385) | Immutable audit trail |
| `telemetries` | `Telemetry` | **93** | 93 production telemetry batches | Production monitoring history |
| `monitorings` | `Monitoring` | **3** | 3 active workload health/monitoring records | Evidently statistical summaries |
| `compliancedossiers` | `ComplianceDossier` | **0** | Empty (dossiers compiled on demand) | On-demand compilation collection |
| `issuereports` | `IssueReport` | **0** | Empty (no employee issues logged) | Internal issue reporting |
| `organizations` | `Organization` | **0** | Empty (single-tenant deployment mode) | Multi-tenancy boundaries |

---

## 3. Bootstrap Administrator & User Accounts Investigation

A sanitized audit of the 7 records in the `users` collection revealed:

### 3.1 Bootstrap Administrator Account
- **Configured Identity:** `BOOTSTRAP_ADMIN_EMAIL=rrrbxiang@gmail.com`
- **Database Status:** **VERIFIED PRESENT**
- **Authentication Method:** **`GOOGLE`** (bound via Google ID Token; no password hash exists).
- **Role:** `PLATFORM_ADMIN`
- **Account Status:** `ACTIVE`
- **Verification Status:** `VERIFIED`
- **Integrity Assessment:** Perfectly matches application configuration. The bootstrap administrator account is authentic, properly elevated, and has no default or hardcoded password.

### 3.2 Remaining 6 User Accounts
- **`a***@gmail.com`:** `role: 'ML_LEAD'`, `status: 'ACTIVE'`, `verificationStatus: 'VERIFIED'`, `authMethod: 'PASSWORD'`.
- **`r***@gmail.com`:** `role: 'EXECUTIVE_APPROVER'`, `status: 'ACTIVE'`, `verificationStatus: 'VERIFIED'`, `authMethod: 'PASSWORD'`.
- **`t***@example.com`:** `role: 'GOVERNANCE_OFFICER'`, `status: 'ACTIVE'`, `verificationStatus: 'VERIFIED'`, `authMethod: 'PASSWORD'`.
- **`a***@enterprise.com`:** `role: 'GOVERNANCE_OFFICER'`, `status: 'ACTIVE'`, `verificationStatus: 'PENDING'`, `authMethod: 'PASSWORD'`.
- **`m***@sentinel.internal`:** `role: 'ML_LEAD'`, `status: 'ACTIVE'`, `verificationStatus: 'PENDING'`, `authMethod: 'PASSWORD'`.
- **`a***@sentinel.internal`:** `role: 'GOVERNANCE_OFFICER'`, `status: 'ACTIVE'`, `verificationStatus: 'PENDING'`, `authMethod: 'PASSWORD'`.

*Key Finding:* The two `@sentinel.internal` accounts in Atlas are both in `PENDING` verification status. In accordance with platform security rules, unverified accounts are barred from state-mutating governance actions (`requireVerifiedUser`). Furthermore, the bootstrap admin account has no password credentials attached, eliminating the risk of credential hijacking.

---

## 4. Models, Policies & Lifecycle Entity Reconciliation

1. **Models in Production:**
   - `Real-Time Fraud Detection & Anomaly Intelligence` (High Risk, `IN_PRODUCTION`, version `v1.0`)
   - `Credit Risk Scoring & Default Assessment` (High Risk, `IN_PRODUCTION`, version `v1.0`)
   - `Medical & Insurance Charges Predictor` (Limited Risk, `IN_PRODUCTION`, version `v1.0`)
   - `Customer Churn Retention Intelligence` (Limited Risk, `IN_PRODUCTION`, version `v1.0`)
2. **Version Gate Compliance:**
   - All 4 active versions have `policyStatus: 'PASSED'` and `approvalStatus: 'APPROVED'`, adhering to the statutory invariant that only approved models can achieve `IN_PRODUCTION` status.
3. **Approval Sign-Offs:**
   - 3 formal approval records exist in Atlas for the production baseline, signed by `ML_LEAD`, `GOVERNANCE_OFFICER`, and `EXECUTIVE_APPROVER`.
4. **Policies:**
   - 1 active policy exists: `Fraud Detection High-Risk Governance Policy`, requiring consensus across all 3 domain approvers.

---

## 5. Cryptographic Audit Ledger Integrity

A sequential audit across all 386 blocks in the live Atlas `auditledgers` collection was executed:

- **Genesis Block:** Block `#0` is intact and present.
- **Tip Block:** Block `#385` (Action: `REPORT_UPDATED`).
- **Chain Continuity:**
  $$\text{Hash}_n == \text{SHA256}(\text{Block}_{n-1}\text{.currentHash} + \dots)$$
- **Integrity Result:** **PERFECT CONTINUITY (0 gaps, 0 broken links across all 386 blocks).**
- **Concurrency Protection:** The sequential mutex queue (`auditWriteQueue`) implemented in `auditEngine.js` has successfully prevented E11000 duplicate key sequence conflicts throughout all historical writes.

---

## 6. Persistence Safety & Network Recommendations

1. **Production Safety Guard:**
   - In `NODE_ENV=production`, `backend/src/config/db.js` strictly halts if Atlas cannot be reached, completely preventing accidental in-memory fallback and silent data loss.
2. **Mobile Hotspot Reliability Recommendation:**
   - If cellular hotspot latency causes intermittent replica set elections, ensure in MongoDB Atlas Network Access that your current mobile IP or `0.0.0.0/0` is active.
   - For dedicated local testing against Atlas, setting `serverSelectionTimeoutMS: 15000` in the backend Mongoose connection options provides extra resilience against cellular packet fluctuations.
