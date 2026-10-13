# Sentinel Govern — Testing & Verification Guide

*Platform Version:* 1.0.0-PROD-CANDIDATE  
*Test Framework:* Node.js Built-in Test Runner (`node --test`)  
*Coverage:* 24 Test Suites | 311 Passing Unit, Security & Integration Tests

---

## 1. Test Architecture Overview

Sentinel Govern utilizes the native Node.js test runner (`node --test`) coupled with `mongodb-memory-server` to provide hermetic, zero-dependency offline test execution.

- **No Mocking of Core Governance Logic:** Gate checks, fairness math (DIR, demographic parity), SHA-256 block hashing, and JWT authorization are executed against real runtime services.
- **Isolated Ephemeral Database:** Every test file initializes an isolated, ephemeral in-memory MongoDB replica, guaranteeing that tests never write to, mutate, or corrupt production databases.
- **Zero Network Flakiness:** Tests do not depend on external internet access or third-party cloud availability.

---

## 2. Test Suite Inventory

The 24 automated test suites located in `backend/tests/`:

1. `admin_access.test.js`: Administrative user management, status toggling, and role modification.
2. `approval_rbac.test.js`: Enforcement of mandatory domain sign-offs and role impersonation prevention.
3. `audit_concurrency.test.js`: High-concurrency sequential mutex queue verification (30 parallel writes with zero duplicate key errors).
4. `audit_demo.test.js`: Production lockout safeguards for tamper simulation and ledger repair endpoints.
5. `audit_ledger.test.js`: Genesis block creation, sequential hashing, and tamper detection.
6. `auth_flow.test.js`: Native signup, onboarding, login, and refresh token rotation.
7. `auth_security.test.js`: JWT expiration, forgery resistance, and Bcrypt security.
8. `comprehensive_security.test.js`: Suite of 28 security controls (CORS, rate limiting, payload limits, parameter validation).
9. `disconnect_safety.test.js`: Graceful database disconnection and resource cleanup.
10. `e2e_verification.test.js`: Full 18-step governance lifecycle flow.
11. `fairness_evaluations.test.js`: Disparate impact ratio, 80% legal rule, and TPR/FPR parity calculations.
12. `incident_deduplication.test.js`: Automated deduplication of repeated drift events to prevent alert fatigue.
13. `incidents_rollback.test.js`: Rollback safety gating (blocking rollback to unapproved candidates).
14. `issues_escalation.test.js`: Internal employee governance issue reporting and escalation.
15. `lifecycle_service.test.js`: Gated 7-stage state machine transition validation.
16. `model_policy_binding.test.js`: Model-specific policy binding with fallback to risk-tier defaults.
17. `policy_engine.test.js`: Multi-metric threshold verification and gate evaluation.
18. `rbac_middleware.test.js`: Server-side role and permission checks.
19. `reports_dossier.test.js`: 10-section regulatory compliance dossier compilation and markdown export.
20. `runtime_monitoring_integration.test.js`: Evidently AI integration, normalized metrics mapping, and zero fake PSI.
21. `security_headers.test.js`: Protective HTTP headers verification.
22. `stale_roles.test.js`: Automatic invalidation of sessions bearing obsolete or legacy roles.
23. `user_lifecycle.test.js`: Transition between `PENDING` and `VERIFIED` verification states.
24. `workload_service.test.js`: Multi-workload health probes and timeouts.

---

## 3. Running Automated Tests

### 3.1 Running the Full Backend Test Suite
From the `backend` directory:
```bash
npm test
```
*Expected Result:* 311 tests passed, 0 failed, duration ~24 seconds.

### 3.2 Running the Frontend Production Build
From the `frontend` directory:
```bash
npm run build
```
*Expected Result:* Vite builds clean production assets in `/dist` in under 1 second.

### 3.3 Offline vs. Live Network Modes
- **Offline / Campus Wi-Fi Mode:** The backend test runner automatically runs completely in memory via `mongodb-memory-server`.
- **Live Cloud Atlas Mode:** When running against MongoDB Atlas, ensure outbound access to port 27017 and DNS SRV resolution is available (e.g., via mobile hotspot or unrestricted network).
