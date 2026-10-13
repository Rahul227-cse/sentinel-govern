# Sentinel Govern — AI Workload Integrations & Monitoring Architecture

*Platform Version:* 1.0.0-PROD-CANDIDATE  
*Integration Architecture Principle:*  
> *"The AI model does the AI work. Sentinel Govern governs the AI model."*

---

## 1. Supported AI Workloads

Sentinel Govern acts as an external, vendor-agnostic governance and observation control plane interfacing with microservices via HTTP/REST.

| Workload ID | Name & Model Architecture | Primary Endpoint | Health Endpoint | Auth Requirements | Current Status |
|---|---|---|---|---|---|
| `fraud-detection` | **Fraud Detection AI**<br/>FastAPI / Scikit-Learn Ensemble | `http://127.0.0.1:8000` | `/health` | None (Direct inference) | **VERIFIED WORKING** (200 OK, 64ms) |
| `credit-risk` | **Credit Risk Scoring**<br/>LightGBM Consumer Credit Scorer | `https://credit-risk-scoring-58zh.onrender.com` | `/health` | None (Direct inference) | **VERIFIED WORKING** (200 OK, 302ms) |
| `insurance-charges` | **Medical & Insurance Predictor**<br/>Gradient Boosting Regression API | `https://insurance-prediction-paiv.onrender.com` | `/` | None (Direct inference) | **VERIFIED WORKING** (200 OK, 288ms) |
| `customer-churn` | **Customer Churn Retention Intelligence**<br/>Telco Subscriber Attrition API | `https://churn-prediction-mlops.onrender.com` | `/health` | Requires `CHURN_API_KEY` (`X-API-Key` header) | **BLOCKED BY CONFIGURATION** (Health check 200 OK; scoring blocked) |

---

## 2. Evidently AI Monitoring Service

Sentinel Govern delegates distribution drift calculation to an independent Evidently AI service running on `http://127.0.0.1:8001`.

```mermaid
flowchart LR
    ControlPlane["Sentinel Govern Control Plane"]
    EvidentlyService["Evidently Monitoring Service<br/>(Port 8001 /analyze-drift)"]
    ReferenceData["Immutable Reference CSVs<br/>(D:/sentinel-monitoring/*.csv)"]
    IncidentEngine["Incident & Audit Engine"]

    ControlPlane -->|POST /analyze-drift<br/>Runtime Telemetry Batch| EvidentlyService
    ReferenceData -->|Baseline Distribution| EvidentlyService
    EvidentlyService -->|Statistical p-values & Drift Flags| ControlPlane
    ControlPlane -->|If Drift Detected (p < 0.05)| IncidentEngine
```

### 2.1 Statistical Ground Truth & No Fake Metrics
- **Statistical Tests:** Evidently executes Wasserstein distance, Kolmogorov-Smirnov (KS) tests, or Jensen-Shannon divergence based on data distributions.
- **Strict Prohibition of Fabricated PSI:** In accordance with Sentinel Govern audit guidelines, when telemetry is evaluated by Evidently, `aggregatePsi` is recorded as `null`, and `monitoringSource` is tagged as `'EVIDENTLY'`. The application does not fabricate or substitute synthetic PSI values for real statistical hypothesis tests.

---

## 3. Background Monitoring Scheduler Modes

The background monitoring scheduler (`monitoringScheduler.js`) manages continuous observation across all registered workloads.

1. **`REAL` Mode (Default Production Behavior):**
   - The scheduler runs passively.
   - It performs passive health checks and ingests incoming production traffic sent via `POST /api/telemetry/ingest`.
   - It does not generate artificial synthetic batches or flood models with simulated transactions.
2. **Controlled Manual Triggers:**
   - Authorized operators (`ML_LEAD` or `PLATFORM_ADMIN`) can trigger controlled batches via `POST /api/telemetry/scheduler/trigger`.
   - Supports explicit `BASELINE` or `DRIFTED` scenarios for verifying incident handling and automated deduplication.
   - Requires administrative authorization or `x-sentinel-api-key`.
