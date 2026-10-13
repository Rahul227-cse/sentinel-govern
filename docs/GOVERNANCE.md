# Aegis AI — Governance Philosophy & Regulatory Frameworks

This document articulates the governance philosophy, control plane architecture, regulatory framework alignment, and separation-of-duties principles embodied by Aegis AI.

---

## 1. Governance Philosophy: The Control Plane Concept

Aegis AI is an **enterprise AI governance control plane**, NOT a machine learning training platform or predictive inference cluster:

| Feature / Responsibility | Model Training Frameworks (PyTorch, TensorFlow) | Serving / Inference Gateways (vLLM, Triton) | Aegis AI Governance Control Plane |
|---|:---:|:---:|:---:|
| Compute Grids & GPUs | ✅ Primary | ✅ Primary | ❌ Not in scope |
| Model Weight Checkpoints | ✅ Trains weights | ✅ Serves weights | ❌ Metadata & URIs only |
| Regulatory Risk Intake | ❌ None | ❌ None | ✅ EU AI Act & NIST RMF |
| Policy Gate Enforcement | ❌ None | ❌ None | ✅ Actively blocks promotion |
| Multi-Stakeholder Sign-Offs | ❌ None | ❌ None | ✅ Mandatory separation of duties |
| Statistical Fairness Auditing | ⚠️ Ad-hoc notebooks | ❌ None | ✅ Gated Disparate Impact engine |
| Population Stability Drift (PSI) | ❌ None | ⚠️ Raw metrics | ✅ Quantile drift & incidents |
| Cryptographic Audit Trail | ❌ None | ❌ None | ✅ SHA-256 chained ledger |
| Regulatory Compliance Dossiers | ❌ None | ❌ None | ✅ 1-click technical documentation |

---

## 2. Regulatory Alignment

Aegis AI incorporates statutory requirements from the premier international AI governance standards:

### 1. European Union AI Act (Regulation EU 2024/1689)
- **Article 5 (Prohibited AI Practices):** Risk intake questionnaire flags unacceptable risk systems (e.g. social scoring, subliminal manipulation) and blocks progression.
- **Article 6 & Annex III (High-Risk AI Systems):** Categorizes models deployed in credit scoring, employment screening, essential public services, and law enforcement as High-Risk.
- **Article 9 (Risk Management System):** Requires continuous identification, estimation, and evaluation of known and foreseeable risks.
- **Article 10 (Data and Data Governance):** Mandates examination of training datasets for biases and demographic disparities.
- **Article 11 & Annex IV (Technical Documentation):** Implemented via Aegis AI's **1-Click Compliance Dossier**, which compiles all 10 statutory sections into exportable formats.
- **Article 12 (Record-Keeping / Logging):** Cryptographically enforced via Aegis AI's SHA-256 chained audit ledger.
- **Article 14 (Human Oversight):** Enforced via multi-stakeholder approval stage gates (`ML_LEAD`, `ETHICS_OFFICER`, `COMPLIANCE_OFFICER`, `EXECUTIVE_SPONSOR`).

### 2. NIST AI Risk Management Framework (AI RMF 1.0)
- **GOVERN:** Organizational structures, policies, and roles mapped in Aegis AI's RBAC matrix.
- **MAP:** Context, intended purpose, and potential downstream impacts documented in the Model Card.
- **MEASURE:** Statistical fairness (DIR, Demographic Parity, Equalized Odds) and runtime drift (PSI).
- **MANAGE:** Operational incident escalation, human investigation notes, and atomic rollback capabilities.

---

## 3. Separation of Duties

To prevent conflicts of interest and regulatory non-compliance, Aegis AI enforces strict operational boundaries:
1. **The Builder cannot self-certify:** The `ML_LEAD` who authors the model and trains the version cannot single-handedly promote it to production.
2. **The Ethicist audits fairness independently:** The `ETHICS_OFFICER` has sole discretion over whether demographic parity differences and disparate impact ratios meet ethical guidelines.
3. **The Compliance Officer governs rules:** The `COMPLIANCE_OFFICER` defines policies and legal thresholds. The ML Lead cannot relax policy thresholds to pass a failing model.
4. **The Executive accepts residual risk:** The `EXECUTIVE_SPONSOR` must review all prior sign-offs and formally authorize production deployment or emergency rollback.
5. **The Platform Administrator is partitioned:** `PLATFORM_ADMIN` oversees users and infrastructure, but is explicitly blocked from participating in domain governance gates.
