# Sentinel Govern — Known Issues, Operational Constraints & Risk Register

*Platform Version:* 1.0.0-PROD-CANDIDATE  
*Status:* Authoritative Defect and Risk Inventory  
*Audit Completed:* October 2026

---

## 1. Active Operational Constraints

### 1.1 MongoDB Atlas Network Egress on Restrictive Wi-Fi Networks
- **Classification:** **BLOCKED BY CONFIGURATION / NETWORK EGRESS**
- **Symptom:** Connection to MongoDB Atlas (`cluster0.v4pvm60.mongodb.net`) times out with server selection error (`querySrv ECONNREFUSED` or `ETIMEDOUT`).
- **Root Cause:** Enterprise, academic, and campus Wi-Fi networks block outbound DNS SRV resolution and TCP port 27017 to non-standard external destinations.
- **Graceful Mitigation in Place:** Sentinel Govern implements an automated ephemeral fallback mechanism in non-production mode (`backend/src/config/db.js`). When Atlas is unreachable, the backend spawns a local in-memory MongoDB replica via `mongodb-memory-server` and outputs a diagnostic log.
- **Production Safety:** In `NODE_ENV=production`, ephemeral fallback is disabled; the server halts to prevent silent data loss. Connecting to a mobile hotspot or standard broadband network restores direct Atlas connectivity immediately.

### 1.2 Customer Churn Workload API Key Requirement
- **Classification:** **BLOCKED BY CONFIGURATION**
- **Symptom:** Health check to `https://churn-prediction-mlops.onrender.com/health` returns HTTP 200 OK, but inference scoring calls require authentication.
- **Root Cause:** The remote hosted service requires an API key passed via the `X-API-Key` header (`CHURN_API_KEY` in `backend/.env`).
- **Mitigation:** The control plane returns `status: "CONFIGURATION_REQUIRED"` with an informative message. The system continues operating smoothly across the other 3 active workloads (Fraud, Credit Risk, and Insurance).

### 1.3 Insurance Predictor AWS Candidate Unreachable
- **Classification:** **RESOLVED VIA FAILOVER TO RENDER HTTPS**
- **Symptom:** AWS candidate IP `http://52.57.67.6/` is unroutable.
- **Resolution:** Sentinel Govern automatically uses the verified HTTPS Render endpoint (`https://insurance-prediction-paiv.onrender.com`), which is active, responding with HTTP 200 OK.

---

## 2. Risk Register & Recommendations

| Risk Item | Severity | Current Safeguard | Recommended Action |
|---|:---:|---|---|
| Git Version Control Not Initialized | **HIGH** | Filesystem intact; zero destructive cleanup commands allowed. | Project owner should run `git init`, add remote, and create the baseline commit. |
| In-Memory Data Reset on Server Restart | **MEDIUM** | Clear warning logged to terminal when fallback is active. | Use mobile hotspot or VPN when persistent cloud database access is desired during local dev. |
| Single Bootstrap Administrator | **LOW** | Email bound to verified Google identity (`rrrbxiang@gmail.com`). | Once initial setup is complete, assign a secondary verified Platform Admin through `/admin/users`. |
