# Sentinel Govern — AI Workload Integrations & Monitoring Architecture

*Platform Version:* 1.0.0-PROD-CANDIDATE  
*Integration Architecture Principle:*  
> *"The AI model does the AI work. Sentinel Govern governs the AI model."*

---

## 1. Supported AI Workloads

Sentinel Govern acts as an external, vendor-agnostic governance and observation control plane interfacing with microservices via HTTP/REST.

| Workload ID | Name & Model Architecture | Primary Endpoint | Health Endpoint | Auth Requirements | Walkthrough & System Status |
|---|---|---|---|---|---|
| `fraud-detection` | **Fraud Detection AI**<br/>FastAPI / Scikit-Learn Ensemble | `http://127.0.0.1:8000` | `/health` | None (Direct inference) | **ACTIVE WALKTHROUGH** (200 OK, verified live `/score`) |
| `credit-risk` | **Credit Risk Scoring**<br/>LightGBM Consumer Credit Scorer | `https://credit-risk-scoring-58zh.onrender.com` | `/health` | None (Direct inference) | **DEFERRED** (Preserved architecture; inactive for walkthrough) |
| `insurance-charges` | **Medical & Insurance Predictor**<br/>Gradient Boosting Regression API | `https://insurance-prediction-paiv.onrender.com` | `/` | None (Direct inference) | **DEFERRED** (Preserved architecture; inactive for walkthrough) |
| `customer-churn` | **Customer Churn Retention Intelligence**<br/>Telco Subscriber Attrition API | `https://churn-prediction-mlops.onrender.com` | `/health` | Requires `CHURN_API_KEY` (`X-API-Key` header) | **DEFERRED** (Preserved architecture; inactive for walkthrough) |

> **Walkthrough Scope Notice:** For the interview demonstration, only the local Fraud Detection AI is exposed as the active governed workload. The other three workloads remain fully preserved in code and architecture (`WORKLOAD_DEFINITIONS`) but are marked `INACTIVE` so as not to clutter the walkthrough with external network dependencies.

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

## 3. Model API Endpoint Configuration & Notifications
 
 ### 3.1 Server-Side Model API Endpoint Configuration
- ML Leads can register and configure workload endpoints directly in the UI via `PATCH /api/models/:id/endpoint`.
- The backend verifies endpoint reachability (`GET /health`) before storing the configuration in `Model.apiConfig`.
- Credentials and headers remain strictly server-side.
- The default endpoint preconfigures `http://127.0.0.1:8000` for the Fraud Detection AI service.
### 3.2 Automated Drift Incident Notifications
- When statistically significant drift is detected via Evidently ($p < 0.05$):
  1. A structured `Incident` is generated with deduplication for existing open incidents.
  2. A persisted `Notification` document (`Notification.js`) is automatically dispatched to the `ML_LEAD` role with type `DRIFT_INCIDENT`.
  3. The in-app Notification Bell in the top navigation displays the unread badge and dropdown with direct links to the Incident Queue.
  4. Audit ledger records `NOTIFICATION_SENT` and `INCIDENT_CREATED`.

### 3.3 Version Rollback Flow (v0 vs v1)
- **Version v0 (Baseline):** Demonstrates controlled feature shift on `amount` ($1200–$3500) and `channel` (`CARD_NOT_PRESENT`), triggering a drift incident and ML Lead notification.
- **Version v1 (Remediated):** Produces 100% in-distribution healthy observations ($25–$85, standard channels).
- **Governed Rollback:** Only authorized `ML_LEAD` can trigger a rollback to an approved baseline version via `POST /api/incidents/rollback`. Retraining or promotion is never executed automatically.
