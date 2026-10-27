from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, FileResponse
from typing import Union, List, Dict, Any, Optional
import pandas as pd
from evidently import Report
from evidently.presets import DataDriftPreset
import os
import io

app = FastAPI(title="Sentinel Monitoring Service")

REPORTS_DIR = os.environ.get("REPORTS_DIR", "reports")
os.makedirs(REPORTS_DIR, exist_ok=True)

# Metadata and output columns to exclude from feature drift detection
METADATA_COLUMNS = {
    "isSyntheticWalkthroughTraffic",
    "timestamp",
    "recordedAt",
    "createdAt",
    "updatedAt",
    "_id",
    "id",
    "batchId",
    "latency_ms",
    "target",
    "label",
    "actual",
    "ground_truth",
    "y_true",
    "y_pred",
    "prediction",
    "predicted",
    "decision",
    "probability",
    "probability_of_default",
    "model",
    "threshold",
    "band",
    "features"
}

# Legacy fallback configurations preserved for backward compatibility
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
        "file": "credit_risk_v1_creditlens_demo_synthetic.csv",
        "fallback_file": "reference_credit_risk.csv",
        "columns": [
            "amt_income",
            "amt_credit",
            "amt_annuity",
            "age",
            "emp_years",
            "region_rating",
            "cnt_children",
            "ext_source_1",
            "ext_source_2",
            "ext_source_3",
            "bureau_active",
            "bureau_dpd",
            "bureau_debt",
            "prev_approval",
            "prev_refused",
            "prev_count"
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


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "sentinel-monitoring",
        "version": "0.7.23"
    }


@app.get("/reports/{filename}")
def get_report(filename: str):
    clean_name = os.path.basename(filename)
    if not clean_name.endswith(".html"):
        raise HTTPException(status_code=400, detail="Only HTML report artifacts can be viewed")
    file_path = os.path.join(REPORTS_DIR, clean_name)
    if os.path.exists(file_path):
        return FileResponse(file_path, media_type="text/html")
    raise HTTPException(status_code=404, detail=f"Report '{clean_name}' not found")


@app.post("/analyze-drift")
async def analyze_drift(payload: Union[List[Dict[str, Any]], Dict[str, Any]]):
    try:
        model_id = None
        version_id = None
        workload_id = None
        custom_ref = None
        reference_csv = None
        monitored_columns = None

        if isinstance(payload, dict):
            model_id = payload.get("model_id")
            version_id = payload.get("version_id")
            workload_id = payload.get("workload_id")
            runtime_data = payload.get("runtime_data") or payload.get("records") or []
            custom_ref = payload.get("reference_data")
            reference_csv = payload.get("reference_csv")
            monitored_columns = payload.get("monitored_columns")
        else:
            runtime_data = payload

        if not runtime_data or len(runtime_data) == 0:
            raise HTTPException(
                status_code=400,
                detail="Runtime data cannot be empty"
            )

        # 1. Resolve Reference DataFrame dynamically
        reference = None
        if custom_ref and len(custom_ref) > 0:
            reference = pd.DataFrame(custom_ref)
        elif reference_csv and isinstance(reference_csv, str) and reference_csv.strip():
            reference = pd.read_csv(io.StringIO(reference_csv.strip()))
        else:
            # Fallback for legacy requests referencing local files
            ref_file = None
            if not workload_id and len(runtime_data) > 0 and isinstance(runtime_data[0], dict):
                workload_id = detect_workload(runtime_data[0])

            if workload_id and workload_id in WORKLOAD_CONFIGS:
                cfg = WORKLOAD_CONFIGS[workload_id]
                primary_file = cfg.get("file")
                fallback_file = cfg.get("fallback_file")
                if primary_file and os.path.exists(primary_file):
                    ref_file = primary_file
                elif fallback_file and os.path.exists(fallback_file):
                    ref_file = fallback_file
                else:
                    ref_file = primary_file
            elif isinstance(payload, dict) and payload.get("reference_file"):
                safe_name = os.path.basename(payload["reference_file"])
                if os.path.exists(safe_name):
                    ref_file = safe_name

            if ref_file and os.path.exists(ref_file):
                try:
                    reference = pd.read_csv(ref_file)
                except Exception as e:
                    raise HTTPException(
                        status_code=500,
                        detail=f"Failed to load baseline reference data from {ref_file}: {str(e)}"
                    )

        if reference is None or len(reference) == 0:
            return {
                "status": "insufficient_data",
                "message": "No reference baseline dataset provided or found for drift analysis",
                "model_id": model_id,
                "version_id": version_id,
                "workload_id": workload_id,
                "monitoring_source": "EVIDENTLY",
                "drift_detected": False,
                "drifted_columns": [],
                "records_analyzed": len(runtime_data),
                "reference_records": 0,
                "threshold": 0.05,
                "metrics": []
            }

        current = pd.DataFrame(runtime_data)

        # 2. Check minimum sample sizes for statistical testing
        if len(current) < 5 or len(reference) < 5:
            return {
                "status": "insufficient_data",
                "message": f"Insufficient sample size for distribution drift testing (current: {len(current)}, reference: {len(reference)}, min required: 5)",
                "model_id": model_id,
                "version_id": version_id,
                "workload_id": workload_id,
                "monitoring_source": "EVIDENTLY",
                "drift_detected": False,
                "drifted_columns": [],
                "records_analyzed": len(current),
                "reference_records": len(reference),
                "threshold": 0.05,
                "metrics": []
            }

        # 3. Dynamic Column Alignment
        if monitored_columns and isinstance(monitored_columns, list) and len(monitored_columns) > 0:
            target_cols = [c for c in monitored_columns if c in current.columns and c in reference.columns and c not in METADATA_COLUMNS]
        elif workload_id and workload_id in WORKLOAD_CONFIGS:
            config_cols = WORKLOAD_CONFIGS[workload_id]["columns"]
            target_cols = [c for c in config_cols if c in current.columns and c in reference.columns and c not in METADATA_COLUMNS]
            if not target_cols:
                target_cols = [c for c in reference.columns if c in current.columns and c not in METADATA_COLUMNS]
        else:
            target_cols = [c for c in reference.columns if c in current.columns and c not in METADATA_COLUMNS]

        if not target_cols:
            return {
                "status": "insufficient_data",
                "message": "Incompatible reference features: No matching monitored feature columns found between runtime records and reference dataset",
                "model_id": model_id,
                "version_id": version_id,
                "workload_id": workload_id,
                "monitoring_source": "EVIDENTLY",
                "drift_detected": False,
                "drifted_columns": [],
                "records_analyzed": len(current),
                "reference_records": len(reference),
                "threshold": 0.05,
                "metrics": []
            }

        # 4. Feature Type Alignment (Numeric & Categorical)
        aligned_cols = []
        for col in target_cols:
            if pd.api.types.is_numeric_dtype(reference[col]) or pd.api.types.is_numeric_dtype(current[col]):
                current[col] = pd.to_numeric(current[col], errors='coerce').astype(float)
                reference[col] = pd.to_numeric(reference[col], errors='coerce').astype(float)
                if current[col].isna().all():
                    continue
                aligned_cols.append(col)
            else:
                current[col] = current[col].astype(str)
                reference[col] = reference[col].astype(str)
                aligned_cols.append(col)

        if not aligned_cols:
            raise HTTPException(
                status_code=400,
                detail="All matched columns contained invalid or unparseable data"
            )

        cur_sub = current[aligned_cols].dropna()
        ref_sub = reference[aligned_cols].dropna()

        if len(cur_sub) < 5 or len(ref_sub) < 5:
            return {
                "status": "insufficient_data",
                "message": "Too few non-null records remaining after feature alignment for statistical testing",
                "model_id": model_id,
                "version_id": version_id,
                "workload_id": workload_id,
                "monitoring_source": "EVIDENTLY",
                "drift_detected": False,
                "drifted_columns": [],
                "records_analyzed": len(cur_sub),
                "reference_records": len(ref_sub),
                "threshold": 0.05,
                "metrics": []
            }

        # 5. Execute Evidently DataDrift Report
        report = Report(metrics=[DataDriftPreset(num_method="ks", cat_method="chisquare")])
        result = report.run(
            current_data=cur_sub,
            reference_data=ref_sub
        )

        # 6. Save Persistent HTML Report
        safe_tag = str(model_id or workload_id or "generic")
        timestamp_str = pd.Timestamp.now().strftime("%Y%m%d_%H%M%S")
        report_filename = f"runtime_drift_report_{safe_tag}_{timestamp_str}.html"
        report_filepath = os.path.join(REPORTS_DIR, report_filename)
        result.save_html(report_filepath)

        # Also maintain legacy file in working dir if workload_id given
        if workload_id:
            try:
                legacy_file = f"runtime_drift_report_{workload_id}.html"
                result.save_html(legacy_file)
            except Exception:
                pass

        # 7. Extract Statistical Metrics from Evidently Snapshot
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
            "model_id": model_id,
            "version_id": version_id,
            "workload_id": workload_id,
            "monitoring_source": "EVIDENTLY",
            "drift_detected": drift_detected,
            "drifted_columns": drifted_columns,
            "records_analyzed": len(cur_sub),
            "reference_records": len(ref_sub),
            "threshold": 0.05,
            "metrics": metrics_list,
            "report": report_filename
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Evidently analysis error: {str(e)}"
        )
