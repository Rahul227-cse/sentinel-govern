# Sentinel Govern — Database Audit & Persistence Report

*Platform Version:* 1.0.0-PROD-CANDIDATE  
*Audit Completed:* October 2026  
*Target Environment:* MongoDB Atlas (`cluster0.v4pvm60.mongodb.net`)  
*Configured Database Name:* `ai_govern`

---

## 1. Connection Verification & Network Boundary Evidence

### 1.1 Direct Atlas Connection Attempt
During this audit run, a direct read-only connection attempt was executed from the backend control plane (`backend/src/config/db.js` and standalone diagnostic script) using the existing local configuration:

- **Target Connection URI Format:** `mongodb+srv://***:***@cluster0.v4pvm60.mongodb.net/ai_govern?retryWrites=true&w=majority&appName=Cluster0` (Redacted)
- **Resolved SRV Records:**
  - `ac-jykyybn-shard-00-00.v4pvm60.mongodb.net:27017` $\rightarrow$ `159.41.191.254`
  - `ac-jykyybn-shard-00-01.v4pvm60.mongodb.net:27017`
  - `ac-jykyybn-shard-00-02.v4pvm60.mongodb.net:27017`
- **Result:** `MongooseServerSelectionError: Could not connect to any servers in your MongoDB Atlas cluster.`
- **TCP Diagnostic Outcome:** Low-level TCP socket probe directly to `159.41.191.254:27017` resulted in `TCP connect TIMEOUT (5000ms)`.
- **Root Cause Determination:** While DNS SRV records resolved correctly on the mobile hotspot, outbound TCP traffic on port 27017 to the Atlas cluster IP is actively dropped/filtered (either cellular carrier CGNAT firewall blocking port 27017 or the current public IP is not whitelisted in MongoDB Atlas Network Access).
- **Compliance with Safety Mandate:** In accordance with the prompt's explicit mandate (*"If Atlas fails, explain the precise reason and stop database-dependent verification. Do not silently switch to an in-memory database and report it as Atlas success."*), database-dependent write/read verifications against Atlas were halted immediately.

---

## 2. Persistence Architecture & Fallback Behavior

```mermaid
flowchart TD
    AppStart["Backend Startup (server.js / connectDB)"]
    EnvCheck{"NODE_ENV === 'production'?"}
    AtlasAttempt["Attempt Mongoose connect(MONGODB_URI)<br/>timeout: 5000ms"]
    
    AtlasSuccess["Connected to MongoDB Atlas<br/>(Cluster0 / ai_govern)"]
    AtlasFail{"Atlas Connect Succeeded?"}
    
    ProdHalt["FATAL ERROR: Refuse startup in insecure state<br/>Exit process (0 Data Loss)"]
    DevWarn["Log Diagnostic Warning:<br/>'External MongoDB connection failed'"]
    MemStart["Spawn Ephemeral MongoMemoryServer<br/>(Non-Production Fallback)"]

    AppStart --> EnvCheck
    EnvCheck -->|Yes| AtlasAttempt
    EnvCheck -->|No| AtlasAttempt
    AtlasAttempt --> AtlasFail
    AtlasFail -->|Yes| AtlasSuccess
    AtlasFail -->|No & Prod| ProdHalt
    AtlasFail -->|No & Non-Prod| DevWarn
    DevWarn --> MemStart
```

### 2.1 Persistence Safety Invariants
1. **Production Invariant:** In `NODE_ENV=production`, the application **never falls back to ephemeral memory**. If Atlas is unreachable, the server halts with exit code 1 to protect data integrity.
2. **Development Fallback Awareness:** In development mode, `MongoMemoryServer` provides zero-config offline execution. Clear warning banners alert developers that data will reset upon server restart.

---

## 3. Required Collections, Schemas & Index Mapping

The application models define 15 active collections across `backend/src/models/`:

| Collection Name | Model Name | Primary Purpose & Expected Schema | Required Indexes & Unique Constraints |
|---|---|---|---|
| `users` | `User` | User profiles, roles, authentication credentials, and login history. | `{ email: 1 }` (unique), `{ googleId: 1 }` (unique, sparse), `{ verificationStatus: 1 }`, `{ presence: 1 }`, `{ organizationId: 1 }` |
| `models` | `Model` | Governed AI model registry, metadata, EU AI Act risk intake, and policy pointer. | `{ name: 1 }` (unique), `{ organizationId: 1 }` |
| `modelversions` | `ModelVersion` | Model iteration candidates, lifecycle state machine (`DRAFT`..`DEPRECATED`). | `{ modelId: 1, version: 1 }` (unique), `{ modelId: 1 }`, `{ organizationId: 1 }` |
| `policies` | `Policy` | Threshold rules (DIR, Accuracy, ROC-AUC, Max Drift PSI), required approvers. | `{ name: 1 }` (unique), `{ organizationId: 1 }` |
| `approvals` | `Approval` | Multi-stakeholder sign-offs (`ML_LEAD`, `GOVERNANCE_OFFICER`, `EXECUTIVE_APPROVER`). | `{ versionId: 1, role: 1 }` (unique compound), `{ modelId: 1 }`, `{ organizationId: 1 }` |
| `evaluations` | `Evaluation` | Fairness studio calculations (DIR, TPR/FPR parity, ROC-AUC). | `{ modelId: 1 }`, `{ versionId: 1 }`, `{ organizationId: 1 }` |
| `deployments` | `Deployment` | Active production deployment records, endpoint URLs, traffic percentage. | `{ modelId: 1, status: 1 }`, `{ versionId: 1 }`, `{ organizationId: 1 }` |
| `incidents` | `Incident` | Drift & governance incidents (`#INC-xxx`), mitigation notes, rollback pointer. | `{ incidentNumber: 1 }` (unique), `{ modelId: 1 }`, `{ versionId: 1 }`, `{ workloadId: 1 }` |
| `issuereports` | `IssueReport` | Internal staff governance concerns and triage state. | `{ reportNumber: 1 }` (unique), `{ modelId: 1, status: 1 }`, `{ submitterUserId: 1 }` |
| `auditledgers` | `AuditLedger` | Immutable SHA-256 chained governance block trail. | `{ sequenceNumber: 1 }` (unique), `{ organizationId: 1 }` |
| `telemetries` | `Telemetry` | Production transaction batches, latency, feature distributions. | `{ modelId: 1 }`, `{ versionId: 1 }`, `{ workloadId: 1 }` |
| `monitorings` | `Monitoring` | Health summaries, drift status, and Evidently statistical indicators. | `{ modelId: 1, healthStatus: 1 }`, `{ versionId: 1 }`, `{ organizationId: 1 }` |
| `compliancedossiers` | `ComplianceDossier` | EU AI Act Annex III statutory technical documentation. | `{ dossierNumber: 1 }` (unique), `{ modelId: 1, versionId: 1 }` |
| `reports` | `Report` | Periodic governance and drift analysis reports. | `{ reportNumber: 1 }` (unique), `{ modelId: 1, reportType: 1 }` |
| `organizations` | `Organization` | Enterprise tenant boundaries and regulatory settings. | `{ name: 1 }` (unique), `{ slug: 1 }` (unique) |

---

## 4. Bootstrap Administrator Mapping & Password Account Investigation

### 4.1 Implementation Inspection
- **Configured Variable:** `BOOTSTRAP_ADMIN_EMAIL=rrrbxiang@gmail.com`
- **Mapping Logic in `authController.js`:**
  ```javascript
  const bootstrapEmail = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const isBootstrapAdmin = Boolean(bootstrapEmail && email === bootstrapEmail);
  if (!user) {
    const initialRole = isBootstrapAdmin ? 'PLATFORM_ADMIN' : 'GOVERNANCE_OFFICER';
    const initialVerification = isBootstrapAdmin ? 'VERIFIED' : 'PENDING';
    ...
  }
  ```
- **Password Account Status:**
  - An earlier test script created a user in an ephemeral in-memory database with a mock test password during test execution.
  - Because `mongodb-memory-server` allocates temporary RAM and destroys the process on exit, **no persistent password-based record was created in Atlas**.
  - In native signup, if `rrrbxiang@gmail.com` were registered, it would also be flagged as bootstrap admin; however, because the user logs in via Google Identity Services, the Google user document binds `{ googleId, email }` with no `passwordHash`.

---

## 5. Audit Ledger Concurrency & Sequence Safety

- **Mechanism:** Handled via sequential mutex queue `auditWriteQueue` in [`auditEngine.js`](file:///d:/Projects/govern/backend/src/services/auditEngine.js).
- **Concurrency Verification:** Validated by [`backend/tests/audit_concurrency.test.js`](file:///d:/Projects/govern/backend/tests/audit_concurrency.test.js). 30 simultaneous asynchronous writes succeed with zero E11000 duplicate key sequence collisions.
- **Hash Continuity:** Every block calculates:
  $$\text{Hash}_{n} = \text{SHA256}(\text{sequenceNumber} + \text{previousHash} + \text{timestamp} + \text{actor} + \text{action} + \text{payload})$$
  Continuity is verified from genesis Block #0 to tip Block #N.

---

## 6. Recommended Atlas Network Access Repair

To enable direct connection to MongoDB Atlas from the current mobile device or laptop:
1. Log in to [MongoDB Atlas Console](https://cloud.mongodb.com/).
2. Navigate to **Security** $\rightarrow$ **Network Access**.
3. Click **Add IP Address**:
   - Choose **Add Current IP Address**, OR
   - For unrestricted development testing, add `0.0.0.0/0` (Allow Access from Anywhere) with a 24-hour expiration.
4. Once added, restart the backend server; connection to `ai_govern` will establish automatically without requiring code changes.
