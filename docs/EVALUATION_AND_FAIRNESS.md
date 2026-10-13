# Aegis AI — Evaluation & Statistical Fairness Engine

This document details the mathematical models, statistical algorithms, dataset import capabilities, and fairness metrics implemented in Aegis AI.

---

## 1. Core Principle: The Non-Training Rule

> **Important Architectural Rule:** Evaluation imports and fairness benchmark audits in Aegis AI **DO NOT TRAIN AI MODELS**.

Aegis AI evaluates **pre-computed predictions against ground truth labels**. Benchmark datasets uploaded via CSV or XLSX are parsed in memory, evaluated against statistical fairness equations, and recorded as governance evidence. The backend does not fit weights, compute gradients, or alter model architectures.

---

## 2. Statistical Fairness Metrics & Mathematical Formulas

The fairness calculations are implemented natively in JavaScript in [backend/src/services/fairnessEngine.js](file:///d:/Projects/ai%20govern/backend/src/services/fairnessEngine.js).

### 1. Disparate Impact Ratio (DIR) & The 80% Rule
Disparate Impact measures adverse impact under legal frameworks (e.g. EEOC Uniform Guidelines on Employee Selection Procedures and the Fair Housing Act):

$$\text{Selection Rate}_{\text{group}} = P(\hat{Y} = 1 \mid \text{Group})$$

$$\text{DIR} = \frac{P(\hat{Y} = 1 \mid \text{unprivileged})}{P(\hat{Y} = 1 \mid \text{privileged})}$$

- **The Four-Fifths (80%) Rule:** If $\text{DIR} < 0.80$, the system demonstrates statistically significant adverse impact against the unprivileged group.
- **Policy Gating:** Standard credit risk policies in Aegis AI enforce $\text{minDisparateImpact} = 0.80$ and $\text{maxDisparateImpact} = 1.25$. Any model version scoring below $0.80$ is actively blocked from progressing to `PENDING_APPROVAL`.

### 2. Demographic Parity Difference (DPD)
Measures the absolute difference in positive outcome selection rates between groups:

$$\text{DPD} = \left| P(\hat{Y} = 1 \mid \text{unprivileged}) - P(\hat{Y} = 1 \mid \text{privileged}) \right|$$

- Policy threshold: Standard maximum allowed difference is $\text{maxDemographicParityDiff} = 0.10$.

### 3. Equalized Odds (TPR & FPR Parity)
Evaluates whether prediction accuracy and error distributions are balanced across demographic groups:
- **True Positive Rate (TPR / Recall):** $\text{TPR} = \frac{\text{TP}}{\text{TP} + \text{FN}}$
- **False Positive Rate (FPR):** $\text{FPR} = \frac{\text{FP}}{\text{FP} + \text{TN}}$
- **TPR Difference:** $|\text{TPR}_{\text{privileged}} - \text{TPR}_{\text{unprivileged}}|$
- **FPR Difference:** $|\text{FPR}_{\text{privileged}} - \text{FPR}_{\text{unprivileged}}|$

---

## 3. Core Predictive Performance Metrics

Evaluated across the entire population dataset:
- **Accuracy:** $\frac{\text{TP} + \text{TN}}{\text{Total Samples}}$
- **Precision:** $\frac{\text{TP}}{\text{TP} + \text{FP}}$
- **Recall:** $\frac{\text{TP}}{\text{TP} + \text{FN}}$
- **F1-Score:** $\frac{2 \times \text{Precision} \times \text{Recall}}{\text{Precision} + \text{Recall}}$
- **ROC-AUC (Estimation):** $1 - \frac{\text{FPR}_{\text{priv}} + \text{FPR}_{\text{unpriv}}}{4} + \frac{\text{TPR}_{\text{priv}} + \text{TPR}_{\text{unpriv}}}{4}$

---

## 4. Dataset Import Engine (`evaluationImportService.js`)

Users can upload benchmark evaluation files via `POST /api/evaluations/upload/:versionId`.

### File Support & Constraints:
- **Supported Formats:** `.csv` and `.xlsx` (parsed via SheetJS `xlsx`).
- **Storage:** In-memory buffer processing via Multer (`multer.memoryStorage()`). No temporary files written to disk.
- **Sample Count Constraint:** Minimum 10 rows required for statistical significance.

### Column Detection & Normalization:
The engine dynamically matches column headers:
1. **Ground Truth Label:** Matches `actual`, `ground_truth`, `groundtruth`, `label`, `target`, `y_true`, `ytrue`, `actual_label`.
2. **Model Prediction:** Matches `predicted`, `prediction`, `pred`, `y_pred`, `ypred`, `predicted_label`.
3. **Protected Attribute:** If specified (e.g. `gender`, `race`, `age`), matches the column directly. If unset, auto-detects standard protected attributes (`gender`, `sex`, `race`, `ethnicity`, `age`, `disability`, `nationality`).

### Binary Label Normalization (`parseBinaryLabel`):
Normalizes diverse binary conventions into $1$ or $0$:
- **Positive (1):** `1`, `'true'`, `'yes'`, `'positive'`, `'approved'`, `'pass'`, `'default'`, `'high'`, `'good'`.
- **Negative (0):** `0`, `'false'`, `'no'`, `'negative'`, `'rejected'`, `'fail'`, `'non-default'`, `'low'`, `'bad'`.
- Any unrecognizable or missing label marks the row invalid and returns an explicit validation error.

---

## 5. Canonical Demo Scenario: CreditRisk AI (v1.0 vs v1.1)

In the default seeded environment:
1. **Baseline Model (`v1.0`):**
   - High-bias legacy scoring model: $\text{DIR} = 0.73$ ($73\%$).
   - Fails policy gate ($\text{DIR} < 0.80$).
   - Status: Policy check fails $\rightarrow$ Stage transition blocked.
2. **Debiased Model (`v1.1`):**
   - Debiased scoring model: $\text{DIR} = 0.86$ ($86\%$), $\text{ROC-AUC} = 0.88$, $\text{Accuracy} = 88.5\%$.
   - Passes all policy gates.
   - Status: Promoted to `PENDING_APPROVAL` and approved for production.
