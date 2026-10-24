import pandas as pd
import numpy as np
from evidently import Report
from evidently.presets import DataDriftPreset

np.random.seed(42)

# Healthy production/reference data
reference = pd.DataFrame({
    "transaction_amount": np.random.normal(
        loc=100,
        scale=20,
        size=1000
    )
})

# New runtime/current data
# Deliberately shifted distribution
current = pd.DataFrame({
    "transaction_amount": np.random.normal(
        loc=180,
        scale=20,
        size=1000
    )
})

report = Report(
    metrics=[DataDriftPreset()]
)

result = report.run(
    current_data=current,
    reference_data=reference
)

result.save_html("drift_report.html")

print("Drift test completed.")
print("Report saved as: drift_report.html")