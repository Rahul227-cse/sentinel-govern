# Aegis AI — Core Continuation Rules for AI Agents

All AI coding assistants (Antigravity, Claude, Codex, etc.) continuing development on Aegis AI must adhere strictly to these 13 non-negotiable operational rules.

---

### Rule 1: Inspect the Repository Before Modifying Code
Never assume a file, function, schema field, or endpoint exists merely because documentation or a past conversation mentions it. Use file inspection tools to verify the active implementation before planning changes.

### Rule 2: Never Trust Historical Documentation Over Code Evidence
Treat historical project handoffs as context, not current truth. When a contradiction arises between past conversational handoffs and active code, the repository implementation is the authoritative source of truth.

### Rule 3: Do Not Invent APIs, Schemas, Permissions, or Test Results
Never fabricate API responses, invent nonexistent Mongoose fields, or hallucinate test pass counts. If an area lacks implementation, explicitly classify it as `NOT ESTABLISHED` or `PLANNED`.

### Rule 4: Backend Authorization is Strictly Authoritative
Never accept role, status, or identity claims from client request bodies or custom headers. All authorization checks must derive exclusively from `req.user` verified via JWT Bearer authentication.

### Rule 5: Never Make Platform Administrator a Blanket Superuser
Platform Administrators oversee users, accounts, and system configuration. They must **never** be granted permissions to create models, submit approval sign-offs, or execute rollbacks, preserving statutory separation of duties.

### Rule 6: Never Allow Client Role Switching to Override Authenticated Roles
Client-side persona switching is restricted to unauthenticated demo flows. Once a user authenticates, their verified backend role in `RoleContext.jsx` is locked and cannot be overridden by frontend state.

### Rule 7: Never Expose Credentials or Secrets
Never log, print, commit, or return raw passwords, private keys, database credentials, or JWT signing secrets. Use `[REDACTED]` in all documentation, test logs, and error responses.

### Rule 8: Do Not Rename Backend Enums for UI Cosmetic Adjustments
Never rename schema enums (such as `DEPRECATED` vs `RETIRED`) merely to alter text displayed on screen. Cosmetic adjustments belong exclusively in frontend formatter utilities.

### Rule 9: Do Not Introduce Duplicate APIs for Existing Capabilities
Before creating a new endpoint, verify whether an existing route in [API_REFERENCE.md](file:///d:/Projects/ai%20govern/docs/API_REFERENCE.md) already fulfills the functional requirement. Prevent API fragmentation.

### Rule 10: Do Not Replace Backend-Driven Data with Hardcoded Mock Values
Do not replace live API data fetching with hardcoded static objects to make a feature appear functional. Maintain end-to-end data integrity across Mongoose, Express, and React.

### Rule 11: Preserve Triad UI States (Loading, Empty, Error)
Every data-driven view in the frontend must maintain all three essential UI states: `<LoadingSkeleton />` during fetch, `<EmptyState />` for zero-record collections, and `<ErrorState />` with a retry handler on failure.

### Rule 12: Address Root Causes, Not Superficial Symptoms
When resolving frontend or backend defects, investigate broader structural patterns (such as layout mounting or session hydration) rather than applying isolated, superficial patches that risk regressions.

### Rule 13: Mandatory Verification & Documentation Protocol
After completing code modifications:
1. Run backend automated tests (`npm test` in `backend/`). All 260 tests must pass.
2. Run frontend production build (`npm run build` in `frontend/`).
3. Run frontend linter (`npm run lint` in `frontend/`).
4. Update affected files in `docs/` and log entries in `docs/CHANGELOG.md`.
