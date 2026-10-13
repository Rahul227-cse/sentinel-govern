# Sentinel Govern — System Architecture & Implementation Blueprint

*Platform Version:* 1.0.0-PROD-CANDIDATE  
*Status:* Authoritative Architecture Specification  
*Updated:* October 2026

---

## 1. Executive Architectural Overview

Sentinel Govern is an enterprise-grade AI Governance, Risk, and Compliance (GRC) Control Plane. Designed to operationalize the European Union Artificial Intelligence Act (EU AI Act Annex III), the NIST AI Risk Management Framework (NIST AI RMF 1.0), and ISO/IEC 42001, Sentinel Govern enforces immutable stage gates, dual-engine distribution drift analysis, multi-stakeholder governance approval consensus, and SHA-256 chained cryptographic audit trails across machine learning lifecycles.

```mermaid
flowchart TD
    subgraph ClientLayer["Frontend Presentation Layer (Vite + React 19)"]
        UI["Web Dashboard (Port 3000)<br/>TailwindCSS | Lucide Icons | Axios"]
        AuthContext["Auth Context (JWT + GIS)"]
        Routes["Gated Governance Routes"]
    end

    subgraph ControlPlane["Sentinel Govern Control Plane (Node.js Express - Port 5000)"]
        direction TB
        SecurityMiddlewares["Security Middlewares<br/>Helmet-style Headers | CORS | Rate Limiter | CSRF/Cookie Parser"]
        AuthModule["Identity & Access (RBAC)<br/>Google Auth | Bcrypt (12 Rounds) | Refresh Token Rotation"]
        
        subgraph CoreEngines["Core Governance Engines"]
            LifecycleEngine["Model Lifecycle Engine<br/>7 Gated Stages | Strict Rejection"]
            PolicyEngine["Policy & Evaluation Engine<br/>DIR (80% Rule) | Parity | Accuracy"]
            AuditEngine["Cryptographic Audit Ledger<br/>SHA-256 Chained Hash | Concurrency Queue"]
            SchedulerEngine["Monitoring Scheduler<br/>Passive/Active Modes | Batch Processor"]
        end

        WorkloadAdapter["Common Workload Service Adapter<br/>Timeout Controls | Multi-workload Dispatch"]
    end

    subgraph DataPersistence["Data & Cryptographic Persistence"]
        MongoAtlas["MongoDB Atlas / Local Fallback<br/>Models | Versions | Policies | Incidents | Telemetry | AuditLedger"]
        MemoryServer["MongoMemoryServer<br/>(Ephemeral Non-Prod Fallback)"]
    end

    subgraph WorkloadEcosystem["Governed AI Workload Ecosystem"]
        FraudAI["Workload #1: Fraud Detection AI<br/>FastAPI | Port 8000 | Local Inference"]
        EvidentlyAI["Monitoring Engine: Evidently AI<br/>FastAPI | Port 8001 | Real Drift Analysis"]
        CreditRiskAI["Workload #2: Credit Risk Scoring<br/>LightGBM | Render HTTPS | Port 443"]
        InsuranceAI["Workload #3: Insurance Predictor<br/>Render HTTPS | Port 443"]
        ChurnAI["Workload #4: Customer Churn Intelligence<br/>Render HTTPS (Requires CHURN_API_KEY)"]
    end

    UI -->|HTTP / REST + HttpOnly Cookies| SecurityMiddlewares
    SecurityMiddlewares --> AuthModule
    AuthModule --> CoreEngines
    CoreEngines --> WorkloadAdapter
    CoreEngines --> MongoAtlas
    MongoAtlas -.->|Auto-Fallback if Offline| MemoryServer
    WorkloadAdapter -->|Inference Scoring /score| FraudAI
    WorkloadAdapter -->|Drift Analysis /analyze-drift| EvidentlyAI
    WorkloadAdapter -->|Prediction Scoring /score| CreditRiskAI
    WorkloadAdapter -->|Prediction Scoring /predict| InsuranceAI
    WorkloadAdapter -->|Secured Scoring /predict| ChurnAI
```

---

## 2. Component Subsystems

### 2.1 Presentation Tier (Frontend)
- **Framework:** React 19.x with Vite 6.x.
- **Routing:** React Router DOM v6 with role-aware layout guards (`ProtectedRoute`, `AdminRoute`, `PendingVerificationNotice`).
- **Styling:** Tailwind CSS with high-density enterprise typography, zero decorative synthetic charting animations, and authoritative tabular review interfaces.
- **Build Output:** Production bundle optimized into static HTML/CSS/JS in `/dist` without build-time warnings.

### 2.2 Control Plane Tier (Backend)
- **Runtime:** Node.js (ES Module architecture) with Express 4.21.
- **Security Middleware:** Custom Helmet-equivalent HTTP headers (`Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Strict-Transport-Security`), in-memory IP sliding-window rate limiters, and strict CORS white-listing.
- **Database Layer:** Mongoose 8.x with schemas enforcing typed indexes, compound unique constraints, and automated retry mechanisms for chained ledgers.

### 2.3 Persistence Architecture & High-Availability Fallback
- **Primary Database:** MongoDB Atlas cluster with TLS/SSL encryption and connection timeout controls (5000ms server selection).
- **Graceful Ephemeral Fallback:** When network boundaries (such as restrictive enterprise/academic Wi-Fi) block outbound SRV DNS queries or port 27017, the application automatically spawns an ephemeral `MongoMemoryServer` instance in non-production environments.
- **Production Guard:** In `NODE_ENV=production`, fallback is strictly prohibited; the server terminates immediately with a diagnostic breakdown if the primary connection fails.

---

## 3. Cryptographic Audit Trail Architecture

The Sentinel Govern audit ledger implements a verifiable SHA-256 block chain storing every state mutation across models, policies, approvals, telemetry ingestions, and user account actions.

```mermaid
sequenceDiagram
    autonumber
    participant Client as Control Plane Controller
    participant Queue as auditWriteQueue (Sequential Mutex)
    participant Engine as auditEngine
    participant DB as MongoDB AuditLedger Collection

    Client->>Queue: Enqueue recordAuditEvent(eventData)
    Note over Queue: Ensures strictly serial hash execution<br/>Eliminates E11000 duplicate sequence races
    Queue->>Engine: Process Next Event
    Engine->>DB: Query Last Block (sort: sequenceNumber: -1)
    DB-->>Engine: Block #N (currentHash, sequenceNumber: N)
    Engine->>Engine: Calculate SHA-256(N+1, Block#N.currentHash, timestamp, actor, role, action, payload)
    Engine->>DB: Insert Block #N+1
    DB-->>Engine: Document Saved
    Engine-->>Queue: Resolve Promise
    Queue-->>Client: Audit Record Committed
```

---

## 4. Workload Integration Architecture

Sentinel Govern implements the architectural principle:  
> *"The AI model does the AI work. Sentinel Govern governs the AI model."*

1. **Decoupled Workload Interfaces:** Sentinel Govern does not run model weights inside the control plane. It interfaces via HTTP/REST against distinct microservices.
2. **Evidently AI Statistical Ground Truth:** Rather than fabricating synthetic drift metrics, runtime monitoring batches are dispatched to Evidently AI (`port 8001`), which evaluates statistical tests (Wasserstein distance, Kolmogorov-Smirnov test, Jensen-Shannon divergence) against immutable baseline CSVs.
3. **Passive Scheduler:** The background telemetry scheduler operates passively by default (`REAL` mode), observing external workloads without generating synthetic spam.
