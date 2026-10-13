# Aegis AI — Environment Variables Inventory

This document catalogues all configurable environment variables used by the Aegis AI platform.

> [!CAUTION]
> **Credential Security Policy:** Never commit `.env` files containing raw secrets to source control. All secrets in this document are strictly redacted with `[REDACTED]`.

---

## 1. Backend Environment Configuration (`backend/.env`)

| Variable Name | Required | Type | Default Value | Description & Security Guidelines |
|---|:---:|:---:|---|---|
| `PORT` | Optional | Number | `5000` | Port on which the Express REST API listens. |
| `NODE_ENV` | Required | String | `development` | Environment mode (`development`, `test`, `production`). In production, disables stack traces and enables secure cookie flags. |
| `MONGODB_URI` | Recommended | String | `[REDACTED]` | MongoDB connection string (e.g. `mongodb+srv://<user>:<password>@cluster0.v4pvm60.mongodb.net/ai_govern`). If unset or unreachable, falls back to in-memory DB. |
| `JWT_SECRET` | Required | String | `[REDACTED]` | High-entropy secret key used to cryptographically sign Aegis session JWTs. Generate using: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. In production, default fallback keys throw fatal errors. |
| `JWT_EXPIRES_IN` | Optional | String | `7d` | Access token lifespan (e.g. `15m`, `1h`, `7d`). |
| `CORS_ORIGIN` | Optional | String | `http://localhost:3000` | Comma-delimited list of allowed browser origins for Cross-Origin Resource Sharing. Wildcards with credentials are disallowed. |
| `GOOGLE_CLIENT_ID` | Required for GIS | String | `[REDACTED]` | Google OAuth2 Client ID from Google Cloud Console. Used to verify ID token audience. Format: `<id>.apps.googleusercontent.com`. |
| `GOOGLE_CLIENT_SECRET` | Optional | String | `[REDACTED]` | Google OAuth2 Client Secret (for server-side token exchanges). |
| `BOOTSTRAP_ADMIN_EMAIL` | Recommended | String | `[REDACTED]` | Designates a specific email that automatically receives `PLATFORM_ADMIN` and `VERIFIED` status upon first signup or login. |
| `ENABLE_AUDIT_TAMPER_DEMO` | Optional | Boolean | `false` | Enables `/api/audit/simulate-tamper` and `/api/audit/repair` endpoints. **Must be false in production.** |

---

## 2. Frontend Environment Configuration (`frontend/.env`)

| Variable Name | Required | Type | Default Value | Description & Security Guidelines |
|---|:---:|:---:|---|---|
| `VITE_API_URL` | Optional | String | `/api` | Base URL for REST API calls. In local development, defaults to `/api` which is forwarded to `http://localhost:5000` via Vite proxy. |
| `VITE_GOOGLE_CLIENT_ID` | Required for GIS | String | `[REDACTED]` | Public Google OAuth2 Client ID loaded by the Google Identity Services frontend script to initialize the Sign-In button. |

---

## 3. Configuration Template (.env.example)

### Backend Template (`backend/.env.example`):
```bash
# Server Configuration
PORT=5000
NODE_ENV=development

# MongoDB Database Configuration
MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.v4pvm60.mongodb.net/ai_govern?retryWrites=true&w=majority&appName=Cluster0

# Authentication & Security
JWT_SECRET=[REDACTED]
JWT_EXPIRES_IN=7d

# CORS Allowed Origins
CORS_ORIGIN=http://localhost:3000

# Google OAuth Credentials
GOOGLE_CLIENT_ID=[REDACTED].apps.googleusercontent.com

# Bootstrap Administrator
BOOTSTRAP_ADMIN_EMAIL=admin@example.com

# Audit Demonstration Controls (Must be false in production)
ENABLE_AUDIT_TAMPER_DEMO=false
```

### Frontend Template (`frontend/.env.example`):
```bash
# Frontend Environment Variables
VITE_API_URL=/api

# Google OAuth Client ID
VITE_GOOGLE_CLIENT_ID=[REDACTED].apps.googleusercontent.com
```
