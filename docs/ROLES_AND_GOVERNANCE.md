# Sentinel Govern — Roles & Governance Matrix

*Platform Version:* 1.0.0-PROD-CANDIDATE  
*Compliance Targets:* EU AI Act (Annex III), NIST AI RMF 1.0, ISO/IEC 42001

---

## 1. Canonical Governance Roles

Sentinel Govern establishes four canonical roles to enforce statutory Separation of Duties.

| Role Key | Role Title | Primary Functional Mandate | Separation of Duties Boundary |
|---|---|---|---|
| `PLATFORM_ADMIN` | Platform Administrator | Infrastructure health, user identity verification, account suspension, and system configuration. | **Strictly prohibited** from registering models, approving model versions, or executing incident rollbacks. |
| `ML_LEAD` | Machine Learning Lead | Model registration, version creation, model artifact updates, fairness evaluations, and technical incident remediation/rollback. | Cannot approve models on behalf of Governance or Executive stakeholders. Cannot perform user account administration. |
| `GOVERNANCE_OFFICER` | AI Governance Officer | Risk intake review, policy definition, policy-to-model binding, fairness auditing, and statutory compliance approvals. | Cannot create models or execute rollbacks. Cannot alter infrastructure or assign platform roles. |
| `EXECUTIVE_APPROVER` | Executive Approver | Business risk evaluation, final sign-off authority, review of regulatory dossiers, and strategic lifecycle gating. | Read-only across telemetry simulations. Cannot create models, edit policies, or execute rollbacks. |

---

## 2. Statutory Multi-Stakeholder Approval Architecture

To ensure high-risk AI models (EU AI Act Annex III) cannot be deployed unilaterally by engineering teams, promotions to `APPROVED` and subsequent `IN_PRODUCTION` deployment require multi-stakeholder consensus.

```mermaid
flowchart TD
    CandidateVersion["Candidate Model Version<br/>(Status: EVALUATION)"]
    PolicyEvaluation["Automated Policy Evaluation<br/>DIR ≥ 0.80 | Accuracy ≥ 0.80 | ROC-AUC ≥ 0.85"]
    PendingApproval["Stage: PENDING_APPROVAL"]

    subgraph Approvers["Mandatory Three-Stakeholder Domain Sign-Offs"]
        MLSign["ML Lead Approval<br/>(Technical & Algorithmic Soundness)"]
        GovSign["Governance Officer Approval<br/>(Fairness, Legal & Policy Compliance)"]
        ExecSign["Executive Approver Approval<br/>(Enterprise Risk & Business Authorization)"]
    end

    ApprovedStage["Stage: APPROVED<br/>(Eligible for Production Deployment)"]
    InProductionStage["Stage: IN_PRODUCTION<br/>(Active Production Inference)"]

    CandidateVersion --> PolicyEvaluation
    PolicyEvaluation -->|Gate Passed| PendingApproval
    PolicyEvaluation -->|Gate Failed (DIR < 0.80)| Blocked["Blocked: Changes Requested"]
    
    PendingApproval --> MLSign
    PendingApproval --> GovSign
    PendingApproval --> ExecSign

    MLSign & GovSign & ExecSign -->|All 3 Approved| ApprovedStage
    ApprovedStage -->|Explicit ML Lead Deployment| InProductionStage

    classDef blocked fill:#ffebee,stroke:#c62828,stroke-width:2px;
    class Blocked blocked;
```

---

## 3. Detailed Role Permission Matrix

The 26 discrete platform permissions mapped across the 4 canonical roles:

| Permission Identifier | Description | `PLATFORM_ADMIN` | `ML_LEAD` | `GOVERNANCE_OFFICER` | `EXECUTIVE_APPROVER` |
|---|---|:---:|:---:|:---:|:---:|
| `admin:users_view` | View registered user directory | **YES** | NO | NO | NO |
| `admin:users_manage` | Verify, suspend, or block user accounts | **YES** | NO | NO | NO |
| `admin:roles_assign` | Assign platform roles to users | **YES** | NO | NO | NO |
| `admin:system_config` | Modify global platform configuration | **YES** | NO | NO | NO |
| `models:view` | Inspect models and metadata | **YES** | **YES** | **YES** | **YES** |
| `models:create` | Register new governed models | NO | **YES** | NO | NO |
| `models:edit` | Update model metadata & ownership | NO | **YES** | NO | NO |
| `models:assess_risk` | Complete EU AI Act risk questionnaire | NO | **YES** | **YES** | NO |
| `versions:create` | Register new model iterations/artifacts | NO | **YES** | NO | NO |
| `lifecycle:transition` | Transition lifecycle stages | NO | **YES** | NO | NO |
| `evaluations:view` | Inspect fairness and performance evaluations | **YES** | **YES** | **YES** | NO |
| `evaluations:run` | Execute evaluations on benchmark datasets | NO | **YES** | **YES** | NO |
| `evaluations:upload` | Upload `.csv` / `.xlsx` evaluation datasets | NO | **YES** | **YES** | NO |
| `policies:view` | Inspect governance policies and thresholds | **YES** | **YES** | **YES** | NO |
| `policies:create` | Create new governance policies | NO | NO | **YES** | NO |
| `policies:edit` | Modify policy thresholds and gates | NO | NO | **YES** | NO |
| `policies:check` | Run automated gate checks on versions | **YES** | **YES** | **YES** | NO |
| `approvals:view` | Inspect pending and completed sign-off queues | **YES** | **YES** | **YES** | **YES** |
| `approvals:sign_off` | Submit formal approval decisions | NO | **YES** | **YES** | **YES** |
| `telemetry:view` | Inspect telemetry history and drift reports | **YES** | **YES** | NO | NO |
| `telemetry:simulate` | Trigger controlled simulation batches | NO | **YES** | NO | NO |
| `monitoring:manage` | Configure scheduler and monitoring thresholds | NO | **YES** | NO | NO |
| `incidents:view` | Inspect open and resolved incidents | **YES** | **YES** | **YES** | **YES** |
| `incidents:investigate` | Analyze drift metrics and add mitigation notes | NO | **YES** | **YES** | NO |
| `incidents:update` | Update incident status | NO | **YES** | **YES** | NO |
| `rollback:execute` | Revert drifting production models to baseline | NO | **YES** | NO | NO |
| `audit:view` | Inspect cryptographic audit ledger | **YES** | **YES** | **YES** | **YES** |
| `audit:verify` | Run cryptographic hash chain validation | **YES** | **YES** | **YES** | NO |
| `dossier:view` | Inspect regulatory compliance dossiers | **YES** | **YES** | **YES** | **YES** |
| `dossier:export` | Export compliance dossiers to Markdown | **YES** | **YES** | **YES** | **YES** |
| `issues:view` | View employee governance reports | **YES** | **YES** | **YES** | **YES** |
| `issues:submit` | Submit an internal governance concern | **YES** | **YES** | **YES** | **YES** |
| `issues:manage` | Escalate or resolve reported issues | NO | **YES** | **YES** | NO |
