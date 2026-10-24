# Sentinel Monitoring Service (Evidently AI)

Stateless distribution drift detection microservice for the Sentinel Govern enterprise AI governance platform. Computes non-parametric statistical hypothesis tests (Wasserstein distance, Kolmogorov-Smirnov, Jensen-Shannon) comparing runtime inference telemetry against baseline reference datasets.

---

## 1. API Endpoints

- **`GET /health`**
  - Returns service status and Evidently version:
    ```json
    { "status": "ok", "service": "sentinel-monitoring", "version": "0.7.23" }
    ```
- **`POST /analyze-drift`**
  - Accepts a batch of inference records and computes feature-level drift:
    ```json
    {
      "workload_id": "fraud-detection",
      "runtime_data": [
        {
          "fraud_risk_score": 0.42,
          "ml_supervised_score": 0.38,
          "ml_anomaly_score": 0.12,
          "rule_heuristic_score": 0.05,
          "latency_ms": 14.2
        }
      ]
    }
    ```
  - Returns `drift_detected` boolean flag, `drifted_columns`, p-values, and statistical test methods per column.

---

## 2. Supported Workload Baselines

| Workload ID | Baseline File | Monitored Features |
| :--- | :--- | :--- |
| `fraud-detection` | `reference_data.csv` | `fraud_risk_score`, `ml_supervised_score`, `ml_anomaly_score`, `rule_heuristic_score`, `latency_ms` |
| `credit-risk` | `reference_credit_risk.csv` | `probability_of_default`, `AMT_INCOME_TOTAL`, `AMT_CREDIT`, `DAYS_BIRTH`, `latency_ms` |
| `insurance-charges`| `reference_insurance.csv` | `predicted_charge`, `age`, `bmi`, `children`, `latency_ms` |

---

## 3. Local Startup

### Prerequisites
- Python 3.10+ (verified on 3.11/3.12)

```bash
# Create and activate virtual environment
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Start FastAPI server on port 8001
uvicorn monitoring_api:app --host 0.0.0.0 --port 8001 --reload
```

---

## 4. Docker Deployment

```bash
docker build -t sentinel-monitoring:latest .
docker run -p 8001:8001 sentinel-monitoring:latest
```
