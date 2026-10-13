# Aegis AI — Deployment & Infrastructure Architecture

This document outlines the deployment environments, infrastructure topology, network requirements, and operational steps for Aegis AI.

---

## 1. Environment Status Summary

| Environment | Current Status | Host / URL | Notes & Provisioning State |
|---|:---:|---|---|
| **Local Development** | **CURRENT / OPERATIONAL** | Frontend: `http://localhost:3000`<br>Backend: `http://localhost:5000` | Full end-to-end functionality. Zero-config database fallback operational. |
| **Staging** | **NOT YET ESTABLISHED** | Not provisioned | Planned for containerized ECS/Kubernetes or PaaS rollout. |
| **Production** | **NOT YET ESTABLISHED** | Not provisioned | Requires custom domain, SSL certificates, SMTP credentials, and production Google OAuth verification. |

---

## 2. Local Development Environment

### Prerequisites:
- Node.js v18.0.0+ (Tested on v24.18.0)
- npm v9.0.0+ (Tested on v10.8.2)

### 1. Backend Service Launch:
```bash
cd backend
npm install
npm start
# Server listens on http://localhost:5000
```
- Automatically connects to `MONGODB_URI` if reachable.
- If offline, boots embedded `MongoMemoryServer` with zero manual database setup.
- Seeds canonical policies and models on fresh initialization.

### 2. Frontend Client Launch:
```bash
cd frontend
npm install
npm run dev
# Vite dev server serves client on http://localhost:3000
```
- Vite development proxy automatically routes all `/api/*` HTTP requests to `http://localhost:5000`.

---

## 3. Production Deployment Strategy & Gaps

When transitioning Aegis AI to staging and production, the following infrastructure gaps must be addressed:

### 1. Reverse Proxy & Origin Configuration:
- Production deployments must serve both frontend and backend through a unified reverse proxy (e.g. Nginx, Cloudflare, or AWS ALB) or explicitly configure `CORS_ORIGIN`:
  ```text
  CORS_ORIGIN=https://aegis.yourdomain.com
  ```
- **Cookie Security:** The `aegis_refresh_token` cookie requires `secure: true` in production, which mandates that the entire application be served over HTTPS.

### 2. Google Identity Services Production Authorization:
- Google Cloud Console Web Client credentials must authorize the production domain:
  - **Authorized JavaScript origins:** `https://aegis.yourdomain.com`
  - **Authorized redirect URIs:** `https://aegis.yourdomain.com/api/auth/google/callback`

### 3. Production Database Hardening:
- Ensure the production Atlas MongoDB cluster has IP access lists configured (restricting access to backend VPC NAT gateways).
- **Hardening Rule:** The backend must be configured to fail fast rather than falling back to `MongoMemoryServer` if Atlas is unreachable in production.

### 4. Transactional Email Delivery (SMTP):
- Provision a verified SendGrid, AWS SES, or Postmark account to replace the development reset token exposure (`_devResetToken`) with real email delivery.

### 5. Audit Ledger Integrity Guard:
- Ensure that `ENABLE_AUDIT_TAMPER_DEMO` is strictly set to `false` (or omitted) in production environments to prevent unauthorized tamper testing or repair.
