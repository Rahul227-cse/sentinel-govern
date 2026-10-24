from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from typing import Union, List, Dict, Any
import pandas as pd
from evidently import Report
from evidently.presets import DataDriftPreset
import os

app = FastAPI(title="Sentinel Monitoring Service")


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "sentinel-monitoring",
        "version": "0.7.23"
    }


WORKLOAD_CONFIGS = {
    "fraud-detection": {
        "file": "reference_data.csv",
        "columns": [
            "fraud_risk_score",
            "ml_supervised_score",
            "ml_anomaly_score",
            "rule_heuristic_score",
            "latency_ms",
        ]
    },
    "credit-risk": {
        "file": "reference_credit_risk.csv",
        "columns": [
            "probability_of_default",
            "AMT_INCOME_TOTAL",
            "AMT_CREDIT",
            "DAYS_BIRTH",
            "latency_ms"
        ]
    },
    "insurance-charges": {
        "file": "reference_insurance.csv",
        "columns": [
            "predicted_charge",
            "age",
            "bmi",
            "children",
            "latency_ms"
        ]
    },
    "customer-churn": {
        "file": "reference_churn.csv",
        "columns": [
            "MonthlyCharges",
            "TotalCharges",
            "Tenure",
            "latency_ms"
        ]
    }
}


def detect_workload(sample: dict) -> str:
    if "probability_of_default" in sample:
        return "credit-risk"
    if "predicted_charge" in sample:
        return "insurance-charges"
    if "MonthlyCharges" in sample or "CustomerID" in sample:
        return "customer-churn"
    return "fraud-detection"


@app.post("/analyze-drift")
async def analyze_drift(payload: Union[List[Dict[str, Any]], Dict[str, Any]]):
    try:
        workload_id = None
        custom_ref = None

        if isinstance(payload, dict):
            workload_id = payload.get("workload_id")
            runtime_data = payload.get("runtime_data") or payload.get("records") or []
            custom_ref = payload.get("reference_data")
        else:
            runtime_data = payload

        if not runtime_data or len(runtime_data) == 0:
            raise HTTPException(
                status_code=400,
                detail="Runtime data cannot be empty"
            )

        if not workload_id:
            workload_id = detect_workload(runtime_data[0])

        config = WORKLOAD_CONFIGS.get(workload_id, WORKLOAD_CONFIGS["fraud-detection"])
        columns = config["columns"]
        ref_file = config["file"]

        if custom_ref and len(custom_ref) > 0:
            reference = pd.DataFrame(custom_ref)
        else:
            if not os.path.exists(ref_file):
                raise HTTPException(
                    status_code=404,
                    detail=f"Reference baseline dataset not found for workload '{workload_id}': {ref_file}"
                )
            try:
                reference = pd.read_csv(ref_file)
            except Exception as e:
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to load baseline reference data: {str(e)}"
                )

        current = pd.DataFrame(runtime_data)

        # Check required columns for this workload
        valid_columns = [col for col in columns if col in current.columns and col in reference.columns]
        if not valid_columns:
            missing_columns = [col for col in columns if col not in current.columns]
            raise HTTPException(
                status_code=400,
                detail=f"Missing columns for workload '{workload_id}': {missing_columns}"
            )

        # Validate numeric types
        for col in valid_columns:
            current[col] = pd.to_numeric(current[col], errors='coerce')
            reference[col] = pd.to_numeric(reference[col], errors='coerce')

        if current[valid_columns].isna().any().any():
            raise HTTPException(
                status_code=400,
                detail="Malformed runtime data: monitored columns must contain valid numeric values"
            )

        reference = reference[valid_columns]
        current = current[valid_columns]

        report = Report(
            metrics=[DataDriftPreset()]
        )

        result = report.run(
            current_data=current,
            reference_data=reference,
        )

        report_file = f"runtime_drift_report_{workload_id}.html"
        result.save_html(report_file)

        result_dict = result.dict()

        drifted_columns = []
        metrics_list = []

        for metric in result_dict.get("metrics", []):
            metric_name = metric.get("metric_name", "")
            cfg = metric.get("config", {})
            value = metric.get("value")

            is_value_drift = (
                isinstance(cfg, dict) and "ValueDrift" in cfg.get("type", "")
            ) or metric_name.startswith("ValueDrift(")

            if is_value_drift:
                column_name = cfg.get("column") if isinstance(cfg, dict) else None
                if not column_name:
                    start = "column="
                    start_index = metric_name.find(start)
                    if start_index != -1:
                        col_start = start_index + len(start)
                        col_end = metric_name.find(",", col_start)
                        if col_end != -1:
                            column_name = metric_name[col_start:col_end]

                method_name = cfg.get("method") if isinstance(cfg, dict) else None
                if not method_name:
                    start_m = "method="
                    start_m_idx = metric_name.find(start_m)
                    if start_m_idx != -1:
                        m_start = start_m_idx + len(start_m)
                        m_end = metric_name.find(",", m_start)
                        if m_end != -1:
                            method_name = metric_name[m_start:m_end]
                        else:
                            closing = metric_name.find(")", m_start)
                            method_name = metric_name[m_start:closing] if closing != -1 else "EVIDENTLY"
                    else:
                        method_name = "EVIDENTLY"

                threshold_val = cfg.get("threshold", 0.05) if isinstance(cfg, dict) else 0.05
                p_value = float(value) if isinstance(value, (int, float)) else None
                is_drifted = bool(p_value is not None and p_value < threshold_val)

                if is_drifted and column_name and column_name not in drifted_columns:
                    drifted_columns.append(column_name)

                metrics_list.append({
                    "column": column_name or "unknown",
                    "method": method_name or "EVIDENTLY",
                    "p_value": p_value,
                    "threshold": threshold_val,
                    "drift_detected": is_drifted
                })

        drift_detected = len(drifted_columns) > 0

        return {
            "status": "completed",
            "workload_id": workload_id,
            "monitoring_source": "EVIDENTLY",
            "drift_detected": drift_detected,
            "drifted_columns": drifted_columns,
            "records_analyzed": len(current),
            "threshold": 0.05,
            "metrics": metrics_list,
            "report": report_file
        }

    except HTTPException:
        raise

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Evidently analysis error: {str(e)}"
        )
