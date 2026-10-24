import pandas as pd
from evidently import Report
from evidently.presets import DataDriftPreset

reference = pd.read_csv("reference_data.csv")
current = pd.read_csv("current_data.csv")

# Use only numeric model/runtime metrics for drift detection
columns = [
    "fraud_risk_score",
    "ml_supervised_score",
    "ml_anomaly_score",
    "rule_heuristic_score",
    "latency_ms",
]

reference = reference[columns]
current = current[columns]

report = Report(
    metrics=[DataDriftPreset()]
)

result = report.run(
    current_data=current,
    reference_data=reference,
)

result.save_html("runtime_drift_report.html")

print("Evidently runtime drift analysis completed.")
print("Report saved as: runtime_drift_report.html")