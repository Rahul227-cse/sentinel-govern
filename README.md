# Sentinel Govern — AI Governance & Lifecycle Platform

An end-to-end AI Governance Platform built with the **MERN Stack** (MongoDB, Express.js, React, Node.js) that manages the complete AI model lifecycle while ensuring responsible AI practices:

$$\mathbf{Model} \rightarrow \mathbf{Version} \rightarrow \mathbf{Evaluation} \rightarrow \mathbf{Policy\ Decision} \rightarrow \mathbf{Approval} \rightarrow \mathbf{Deployment} \rightarrow \mathbf{Monitoring} \rightarrow \mathbf{Incident} \rightarrow \mathbf{Rollback} \rightarrow \mathbf{Audit}$$

---

## Key Features

1. **Model Registry & Lineage**: Complete model cards, intended purpose, protected demographic attributes, training dataset lineage, bidirectional policy associations, and version history.
2. **Regulatory Risk Assessment**: Dynamic intake questionnaire aligned with **EU AI Act** (Annex III High-Risk categorizations), **NIST AI RMF 1.0**, and **ISO/IEC 42001**.
3. **Statistical Fairness Engine**:
   - Disparate Impact Ratio (DIR) with 80% legal threshold rule ($DIR = \frac{P(\hat{Y}=1 | \text{unprivileged})}{P(\hat{Y}=1 | \text{privileged})}$).
   - Demographic Parity Difference ($|P(\hat{Y}=1 | A) - P(\hat{Y}=1 | B)|$).
   - Equalized Odds (True Positive Rate and False Positive Rate group parity).
   - Core Performance Metrics: Accuracy, Precision, Recall, F1, ROC-AUC.
4. **Model-Aware Policy Engine & Gate Enforcement**:
   - Configurable governance rules stored in MongoDB and bound to models.
   - Evaluates fairness and performance against policy thresholds.
   - **Actively blocks** lifecycle progression when mandatory policies fail (strictly enforced on the Express backend).
5. **Multi-Stakeholder Approval Stage Gates (3 Domain Quorum)**:
   - Role-based sign-offs across 3 mandatory domain roles: **ML Lead**, **Governance Officer**, and **Executive Approver** (Platform Admin is partitioned).
   - Requires full quorum of domain approvers with comments before promotion to `APPROVED` or `IN_PRODUCTION`.
   - Completed approvals history tab with sign-off audit records.
6. **Dual-Pipeline Runtime Monitoring & Drift Detection**:
   - **Real Evidently AI (0.7.23) Ingestion:** Ingests live production transaction batches (`POST /api/telemetry/ingest`), computes feature-level drift with statistical p-values, and adheres to the **Zero Fake PSI Invariant** (`aggregatePsi: null`).
   - **In-Memory PSI Simulation Engine:** Computes quantile Population Stability Index for interactive scenario exploration ($PSI < 0.10$ Healthy, $0.10 \le PSI \le 0.25$ Warning, $PSI > 0.25$ Drift).
   - **External AI Model Scoring Decoupling:** Control plane connects to external model inference via `externalAiAdapter.js` (FastAPI on port 8000).
7. **Employee Issue Reporting & Incident Escalation**:
   - Staff submit observed operational anomalies and bias issues (`POST /api/issues`).
   - Governance leads triage reports and perform 1-click escalation to formal `#INC-xxx` incidents with bidirectional cross-referencing.
8. **Incident Triage & Atomic Version Rollback**:
   - Automatically generates Incident records (e.g. `#INC-001`) upon critical drift with active incident deduplication.
   - 1-click verified version rollback restores previous stable baseline and deprecates drifted models.
   - **Strict Gate:** Rollback is permitted only to versions that previously passed governance policies and achieved approved baseline status.
9. **Cryptographic Tamper-Evident Audit Trail**:
   - SHA-256 hash chaining: $\text{Hash}_n = \text{SHA256}(\text{Hash}_{n-1} + \text{Timestamp} + \text{Actor} + \text{Action} + \text{DataPayload})$.
   - 41 discrete audit action types tracked across the system.
   - Live cryptographic integrity verification function (`✓ VALID` vs `✗ TAMPER DETECTED`).
   - Tamper simulation capability for audit verification demonstrations.
10. **1-Click Compliance Dossier**:
    - Compiles formal Technical Documentation & Conformity Assessment for EU AI Act Annex III across 10 statutory sections adhering to the strict "no fabrication" rule.
    - Exportable as JSON, Markdown, and printable summary.

---

## Automated Test Suite Status

The platform maintains an authoritative, fully automated backend test suite with **zero third-party test framework overhead**:

```text
311 passed
0 failed
0 skipped
0 cancelled
0 todo
Total Test Files: 24
Duration: ~24 seconds
Pass Rate: 100% PASSING
```

---

## Quick Start Guide

### Prerequisites
- Node.js (v18+ / verified v24)
- npm (v9+)

### 1. Start Backend API (Port 5000)
```bash
cd backend
npm install
npm start
```
*Note: Connects to `MONGODB_URI` (MongoDB Atlas) if accessible, and falls back automatically to `mongodb-memory-server` in non-production environments when network boundaries block external cloud connections.*

Run backend automated tests:
```bash
npm test
```

### 2. Start Frontend Console (Port 3000)
```bash
cd frontend
npm install
npm run dev
```
Open **http://localhost:3000** in your browser.

---

## Canonical End-to-End Governance Flow

1. **Role-Aware Dashboard**: Inspect fleet risk posture, open incidents, and role-personalized action items.
2. **Model Registry**: View `CreditRisk Underwriting AI` (High Risk under EU AI Act) and bind model-specific governance policies.
3. **Fairness Studio**:
   - Run baseline evaluation on `v1.0`: Disparate Impact = 0.73 $\rightarrow$ Policy Fails $\rightarrow$ Promotion BLOCKED.
   - Run debiased evaluation on `v1.1`: Disparate Impact = 0.86, ROC-AUC = 0.88 $\rightarrow$ Policy PASSES.
4. **Approval Center**: Sign off as ML Lead, Governance Officer, and Executive Approver $\rightarrow$ Promoted to `IN_PRODUCTION`.
5. **Runtime Monitoring**:
   - Ingest live telemetry from Evidently AI or run simulation drift ($PSI = 0.31$) $\rightarrow$ Drift detected.
6. **Incident Management**:
   - Inspect Incident `#INC-001` (with deduplication on repeated drift batches).
   - Click "Execute Rollback to v1.0" $\rightarrow$ Safe rollback executed atomically.
7. **Audit Trail**: Verify SHA-256 chain integrity (`✓ VALID`) $\rightarrow$ Click "Simulate Malicious Tamper" to observe active tamper detection (`✗ TAMPER DETECTED`).
8. **Compliance Dossier**: Export 1-click technical documentation dossier.
