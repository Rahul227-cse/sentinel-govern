import { verifyAegisToken } from '../services/googleAuthService.js';
import { User } from '../models/User.js';
import { hasPermission } from '../config/permissions.js';

/**
 * Authentication Middleware:
 * Validates the Aegis Bearer JWT token on incoming HTTP requests.
 * Attaches the authenticated Mongoose user record to req.user.
 */
export async function authenticateToken(req, res, next) {
  try {
    // Internal system service bypass (restricted strictly to test environment for automated harnesses)
    if (process.env.NODE_ENV === 'test' && req.headers && req.headers['x-governance-internal'] === 'system') {
      req.user = {
        _id: '000000000000000000000000',
        email: 'system@aegis.internal',
        name: 'System Internal',
        role: 'PLATFORM_ADMIN',
        status: 'ACTIVE'
      };
      return next();
    }

    const authHeader = req.headers && req.headers['authorization'];
    const token = authHeader && authHeader.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : null;

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required. No Bearer token provided.'
      });
    }

    let decoded;
    try {
      decoded = verifyAegisToken(token);
    } catch (err) {
      return res.status(401).json({
        success: false,
        error: err.name === 'TokenExpiredError' 
          ? 'Session token expired. Please sign in again.' 
          : 'Invalid authentication token.'
      });
    }

    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Authenticated user no longer exists.'
      });
    }

    // Immediately reject suspended accounts
    if (user.status === 'SUSPENDED') {
      return res.status(403).json({
        success: false,
        error: 'Account suspended. Access revoked. Contact platform administrator.'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: `Authentication failed: ${error.message}`
    });
  }
}

/**
 * Active User Enforcement Middleware:
 * Ensures the authenticated user has an 'ACTIVE' lifecycle status.
 * Rejects 'SUSPENDED' accounts.
 */
export function requireActiveUser(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required. No authenticated user identity found.'
    });
  }

  if (req.user.status === 'SUSPENDED') {
    return res.status(403).json({
      success: false,
      error: 'Account suspended. Access revoked. Contact platform administrator.'
    });
  }

  if (req.user.status === 'PENDING' && req.user.verificationStatus !== 'VERIFIED') {
    return res.status(403).json({
      success: false,
      code: 'VERIFICATION_PENDING',
      error: 'Account pending administrator review. Governance access is not yet activated.'
    });
  }

  next();
}

/**
 * Verified User Enforcement Middleware:
 * Ensures the authenticated user has completed verification by a Platform Administrator.
 * Required for protected governance mutations (model registration, policy edits, approvals, etc.).
 * Allows pending accounts to browse and view allowed read-only data.
 */
export function requireVerifiedUser(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required. No authenticated user identity found.'
    });
  }

  if (req.user.status === 'SUSPENDED') {
    return res.status(403).json({
      success: false,
      error: 'Account suspended. Access revoked. Contact platform administrator.'
    });
  }

  if (req.user.verificationStatus === 'PENDING' || req.user.status === 'PENDING') {
    return res.status(403).json({
      success: false,
      code: 'VERIFICATION_PENDING',
      error: 'Your account is awaiting verification. You can continue viewing Sentinel Govern, but this action becomes available after your account is verified.'
    });
  }

  next();
}

/**
 * Role-Based Access Control (RBAC) Middleware:
 * Verifies that the authenticated active user possesses one of the explicitly authorized roles.
 * PLATFORM_ADMIN does NOT bypass domain roles (ML_LEAD, GOVERNANCE_OFFICER, etc.).
 *
 * @param {string[]|string} allowedRoles - Single role or array of allowed roles
 */
export function requireRole(allowedRoles) {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required. No user context attached.'
      });
    }

    if (req.user.status !== 'ACTIVE') {
      return res.status(403).json({
        success: false,
        error: `Access restricted. User status is ${req.user.status}.`
      });
    }

    // Role check: Caller must possess one of the explicit authorized roles
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: `Forbidden: Action requires role [${roles.join(', ')}]. Current role: ${req.user.role}.`
      });
    }

    next();
  };
}

/**
 * Fine-Grained Permission Enforcement Middleware:
 * Checks whether the user's role is granted the specific permission.
 *
 * @param {string} permission - Permission key from PERMISSIONS
 */
export function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required. No user context attached.'
      });
    }

    if (req.user.status !== 'ACTIVE') {
      return res.status(403).json({
        success: false,
        error: `Access restricted. User status is ${req.user.status}.`
      });
    }

    if (hasPermission(req.user.role, permission)) {
      return next();
    }

    return res.status(403).json({
      success: false,
      error: `Forbidden: Insufficient permissions for "${permission}". Required role capabilities missing.`
    });
  };
}

/**
 * Specific Approval Sign-Off Role Enforcement:
 * Ensures that an approver can only submit a sign-off for their assigned governance role
 * (e.g. a GOVERNANCE_OFFICER cannot sign off as ML_LEAD, and PLATFORM_ADMIN cannot impersonate stakeholders).
 */
export function requireApprovalSignoffRole(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Authentication required.' });
  }

  if (req.user.status !== 'ACTIVE') {
    return res.status(403).json({ success: false, error: `Account status is ${req.user.status}.` });
  }

  const requestedRole = req.body.role;

  // Strict identity matching: You can ONLY sign off for the exact role you are authenticated as.
  if (requestedRole && req.user.role !== requestedRole) {
    return res.status(403).json({
      success: false,
      error: `Forbidden: You are authenticated as [${req.user.role}], but attempted to sign off as [${requestedRole}]. Role impersonation is blocked.`
    });
  }

  next();
}

/**
 * Audit Demo Protection Middleware:
 * Strictly blocks audit tamper simulation and ledger hash repair in production.
 * Only permitted in non-production environments with explicit ENABLE_AUDIT_TAMPER_DEMO=true flag.
 */
export function requireDemoAuditEnabled(req, res, next) {
  const isDev = process.env.NODE_ENV !== 'production';
  const isDemoEnabled = process.env.ENABLE_AUDIT_TAMPER_DEMO === 'true';

  if (!isDev || !isDemoEnabled) {
    return res.status(403).json({
      success: false,
      error: 'Audit tamper simulation and hash repair are strictly disabled in production environments to guarantee immutable ledger integrity.'
    });
  }

  next();
}

/**
 * Optional Authentication Middleware:
 * Inspects for an authorization token; if valid, populates req.user.
 * If not present, proceeds without blocking (useful for public/shared endpoints).
 */
export async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : null;

    if (token) {
      try {
        const decoded = verifyAegisToken(token);
        const user = await User.findById(decoded.userId);
        if (user) {
          req.user = user;
        }
      } catch {
        // Silently continue for optional auth
      }
    }
    next();
  } catch {
    next();
  }
}

/**
 * Ingestion Authentication Middleware:
 * Supports automated runtime pipeline ingestion via 'x-sentinel-api-key'
 * OR interactive ML_LEAD session via Bearer JWT.
 * Server identity remains authoritative; client payload cannot forge actor/role.
 */
export async function authenticateIngestion(req, res, next) {
  const apiKey = req.headers['x-sentinel-api-key'];
  const configuredKey = process.env.SENTINEL_INGESTION_KEY;

  if (apiKey) {
    if (configuredKey && typeof apiKey === 'string' && apiKey === configuredKey) {
      req.user = {
        _id: '000000000000000000000001',
        email: 'runtime-pipeline@sentinel.internal',
        name: 'Runtime Telemetry Ingestion Pipeline',
        role: 'ML_LEAD',
        status: 'ACTIVE',
        verificationStatus: 'VERIFIED'
      };
      return next();
    } else {
      return res.status(401).json({
        success: false,
        error: 'Invalid Sentinel Ingestion API key.'
      });
    }
  }

  // Fallback to standard ML_LEAD JWT auth
  return authenticateToken(req, res, (err) => {
    if (err) return next(err);
    return requireActiveUser(req, res, () => {
      return requireVerifiedUser(req, res, () => {
        return requireRole('ML_LEAD')(req, res, next);
      });
    });
  });
}
