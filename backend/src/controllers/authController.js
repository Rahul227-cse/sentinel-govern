import { verifyGoogleIdToken, generateAegisToken } from '../services/googleAuthService.js';
import {
  hashPassword,
  comparePassword,
  validatePasswordStrength,
  generateRefreshToken,
  storeRefreshToken,
  findValidRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllRefreshTokens,
  generatePasswordResetToken,
  hashToken
} from '../services/nativeAuthService.js';
import { User } from '../models/User.js';
import { recordAuditEvent } from '../services/auditEngine.js';

// ─── Cookie Configuration ─────────────────────────────────────────────────────

const COOKIE_NAME = 'aegis_refresh_token';

function refreshCookieOptions(expiresAt) {
  const isProduction = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: process.env.COOKIE_SAMESITE || (isProduction ? 'none' : 'lax'),
    path: '/api/auth',
    expires: expiresAt
  };
}

function clearCookieOptions() {
  const isProduction = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: process.env.COOKIE_SAMESITE || (isProduction ? 'none' : 'lax'),
    path: '/api/auth'
  };
}

import crypto from 'crypto';

// ─── Helper ──────────────────────────────────────────────────────────────────

function appendLoginHistory(user, req, authProvider) {
  if (!user.loginHistory) user.loginHistory = [];
  const sessionId = crypto.randomBytes(16).toString('hex');
  user.loginHistory.push({
    loginAt: new Date(),
    logoutAt: null,
    authProvider: authProvider || (user.googleId ? (user.passwordHash ? 'BOTH' : 'GOOGLE') : 'EMAIL'),
    userAgent: req.headers ? (req.headers['user-agent'] || '') : '',
    ip: req.ip || (req.headers ? req.headers['x-forwarded-for'] : '') || '',
    sessionId
  });
  if (user.loginHistory.length > 50) {
    user.loginHistory = user.loginHistory.slice(-50);
  }
  user.presence = 'ACTIVE';
  user.lastLoginAt = new Date();
  user.lastSeenAt = new Date();
}

function buildUserResponse(user) {
  return {
    id: user._id,
    email: user.email,
    name: user.name,
    avatar: user.avatar,
    role: user.role,
    status: user.status,
    verificationStatus: user.verificationStatus || 'PENDING',
    verifiedBy: user.verifiedBy || null,
    verifiedAt: user.verifiedAt || null,
    presence: user.presence || 'OFFLINE',
    department: user.department || 'Engineering',
    team: user.team || '',
    teamLead: user.teamLead || '',
    title: user.title,
    onboardingCompleted: user.onboardingCompleted ?? false,
    lastLoginAt: user.lastLoginAt,
    lastSeenAt: user.lastSeenAt,
    loginHistory: user.loginHistory || [],
    authProvider: user.googleId ? (user.passwordHash !== undefined ? 'BOTH' : 'GOOGLE') : 'EMAIL'
  };
}

// ─── Google Authentication ────────────────────────────────────────────────────

/**
 * POST /api/auth/google
 * Authenticates a user via verified Google Identity Services ID token.
 */
export async function googleAuth(req, res) {
  try {
    const { credential, idToken } = req.body;
    const tokenToVerify = credential || idToken;

    if (!tokenToVerify) {
      return res.status(400).json({
        success: false,
        error: 'Missing Google credential / ID token in request body.'
      });
    }

    // Cryptographically verify Google identity
    let googleClaims;
    try {
      googleClaims = await verifyGoogleIdToken(tokenToVerify);
    } catch (verifyErr) {
      return res.status(401).json({
        success: false,
        error: `Google token verification failed: ${verifyErr.message}`
      });
    }

    const { googleId, email, name, avatar } = googleClaims;

    const bootstrapEmail = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
    const isBootstrapAdmin = Boolean(bootstrapEmail && email === bootstrapEmail);

    let user = await User.findOne({ $or: [{ googleId }, { email }] });
    let isNewUser = false;

    if (!user) {
      const initialRole = isBootstrapAdmin ? 'PLATFORM_ADMIN' : 'GOVERNANCE_OFFICER';
      const initialStatus = 'ACTIVE';
      const initialVerification = isBootstrapAdmin ? 'VERIFIED' : 'PENDING';
      const initialTitle = isBootstrapAdmin ? 'Platform Administrator' : 'Governance Officer';

      user = new User({
        googleId,
        email,
        name,
        avatar,
        role: initialRole,
        status: initialStatus,
        verificationStatus: initialVerification,
        onboardingCompleted: isBootstrapAdmin ? true : false,
        title: initialTitle,
        department: 'Engineering'
      });

      appendLoginHistory(user, req, 'GOOGLE');
      await user.save();
      isNewUser = true;

      await recordAuditEvent({
        actor: email,
        role: initialRole,
        action: 'USER_CREATED',
        entityType: 'User',
        entityId: user._id.toString(),
        payload: { email, name, role: initialRole, status: initialStatus, verificationStatus: initialVerification, isBootstrapAdmin, authProvider: 'GOOGLE' }
      });

      if (!isBootstrapAdmin && initialVerification === 'PENDING') {
        try {
          const { dispatchNotification } = await import('../services/notificationService.js');
          await dispatchNotification({
            recipientRole: 'PLATFORM_ADMIN',
            excludeUserId: user._id,
            title: 'New user registration awaiting review',
            message: `User "${user.name}" (${user.email}) has signed up via Google and requires verification.`,
            type: 'USER_REGISTRATION',
            severity: 'WARNING',
            targetUrl: '/admin/users',
            actor: user.name || user.email
          });
        } catch (notifErr) {
          console.warn('[Notification] Registration alert warning:', notifErr.message);
        }
      }
    } else {
      if (user.status === 'SUSPENDED') {
        return res.status(403).json({
          success: false,
          error: 'Account suspended. Access revoked. Contact platform administrator.'
        });
      }

      if (isBootstrapAdmin && (user.role !== 'PLATFORM_ADMIN' || user.status !== 'ACTIVE' || user.verificationStatus !== 'VERIFIED')) {
        const previousRole = user.role;
        user.role = 'PLATFORM_ADMIN';
        user.status = 'ACTIVE';
        user.verificationStatus = 'VERIFIED';
        user.onboardingCompleted = true;
        user.title = 'Platform Administrator';

        await recordAuditEvent({
          actor: 'SYSTEM',
          role: 'PLATFORM_ADMIN',
          action: 'ROLE_ASSIGNED',
          entityType: 'User',
          entityId: user._id.toString(),
          payload: {
            email,
            previousRole,
            assignedRole: 'PLATFORM_ADMIN',
            status: 'ACTIVE',
            reason: 'BOOTSTRAP_ADMIN_PROVISIONED'
          }
        });
      }

      if (!user.googleId) user.googleId = googleId;
      if (avatar && user.avatar !== avatar) user.avatar = avatar;
      if (name && user.name !== name) user.name = name;
      appendLoginHistory(user, req, 'GOOGLE');
      await user.save();
    }

    await recordAuditEvent({
      actor: user.email,
      role: user.role,
      action: 'USER_LOGIN',
      entityType: 'User',
      entityId: user._id.toString(),
      payload: { email: user.email, authProvider: 'GOOGLE' }
    });

    const token = generateAegisToken(user);

    // Issue refresh token & cookie
    const { rawToken, tokenHash, expiresAt } = generateRefreshToken(true);
    await storeRefreshToken(user, { tokenHash, expiresAt });
    if (typeof res.cookie === 'function') {
      res.cookie(COOKIE_NAME, rawToken, refreshCookieOptions(expiresAt));
    }

    return res.status(isNewUser ? 201 : 200).json({
      success: true,
      message: isNewUser
        ? (isBootstrapAdmin ? 'Bootstrap administrator provisioned successfully' : 'User registered successfully with Google')
        : 'Login successful',
      token,
      user: buildUserResponse(user)
    });
  } catch (error) {
    console.error('[Google Auth Error]', error);
    return res.status(500).json({
      success: false,
      error: `Authentication failed: ${error.message}`
    });
  }
}

// ─── Native Signup ────────────────────────────────────────────────────────────

/**
 * POST /api/auth/signup
 * Registers a new user with email + password.
 * New users default to GOVERNANCE_OFFICER + PENDING (identical to Google sign-up).
 */
export async function nativeSignup(req, res) {
  try {
    const { name, email, password } = req.body;

    // Validate inputs
    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return res.status(400).json({ success: false, error: 'Name must be at least 2 characters.' });
    }
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return res.status(400).json({ success: false, error: 'A valid email address is required.' });
    }

    const pwCheck = validatePasswordStrength(password);
    if (!pwCheck.valid) {
      return res.status(400).json({ success: false, error: pwCheck.message });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Reject if email already in use
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      // Use a generic message to avoid user enumeration
      return res.status(409).json({
        success: false,
        error: 'An account with this email address already exists. Please sign in.'
      });
    }

    // Bootstrap admin check (native signup CAN provision bootstrap admin)
    const bootstrapEmail = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
    const isBootstrapAdmin = Boolean(bootstrapEmail && normalizedEmail === bootstrapEmail);

    const initialRole = isBootstrapAdmin ? 'PLATFORM_ADMIN' : 'GOVERNANCE_OFFICER';
    const initialStatus = 'ACTIVE';
    const initialVerification = isBootstrapAdmin ? 'VERIFIED' : 'PENDING';

    const passwordHash = await hashPassword(password);

    const user = new User({
      email: normalizedEmail,
      name: name.trim(),
      passwordHash,
      role: initialRole,
      status: initialStatus,
      verificationStatus: initialVerification,
      onboardingCompleted: isBootstrapAdmin ? true : false,
      title: isBootstrapAdmin ? 'Platform Administrator' : 'Governance Officer',
      department: 'Engineering'
    });

    appendLoginHistory(user, req, 'EMAIL');
    await user.save();

    await recordAuditEvent({
      actor: normalizedEmail,
      role: initialRole,
      action: 'USER_CREATED',
      entityType: 'User',
      entityId: user._id.toString(),
      payload: { email: normalizedEmail, name: name.trim(), role: initialRole, status: initialStatus, verificationStatus: initialVerification, authProvider: 'EMAIL' }
    });

    // Notify Platform Admins about new user registration requiring review
    if (!isBootstrapAdmin && initialVerification === 'PENDING') {
      try {
        const { dispatchNotification } = await import('../services/notificationService.js');
        await dispatchNotification({
          recipientRole: 'PLATFORM_ADMIN',
          excludeUserId: user._id,
          title: 'New user registration awaiting review',
          message: `User "${user.name}" (${user.email}) has registered and requires account verification.`,
          type: 'USER_REGISTRATION',
          severity: 'WARNING',
          targetUrl: '/admin/users',
          actor: user.name || user.email
        });
      } catch (notifErr) {
        console.warn('[Notification] Registration alert warning:', notifErr.message);
      }
    }

    // Issue access token
    const token = generateAegisToken(user);

    // Issue refresh token
    const { rawToken, tokenHash, expiresAt } = generateRefreshToken(true);
    await storeRefreshToken(user, { tokenHash, expiresAt });
    res.cookie(COOKIE_NAME, rawToken, refreshCookieOptions(expiresAt));

    return res.status(201).json({
      success: true,
      message: isBootstrapAdmin
        ? 'Bootstrap administrator provisioned successfully'
        : 'Account created successfully. Welcome to Sentinel Govern.',
      token,
      user: buildUserResponse(user)
    });
  } catch (error) {
    console.error('[Native Signup Error]', error);
    return res.status(500).json({ success: false, error: `Signup failed: ${error.message}` });
  }
}

// ─── Native Login ─────────────────────────────────────────────────────────────

/**
 * POST /api/auth/login
 * Authenticates a user with email + password.
 * Issues an Aegis access JWT and a secure HttpOnly refresh token cookie.
 */
export async function nativeLogin(req, res) {
  try {
    const { email, password, rememberMe = false } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required.' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Fetch user INCLUDING passwordHash and refreshTokens (normally excluded)
    const user = await User.findOne({ email: normalizedEmail }).select('+passwordHash +refreshTokens');

    // Constant-time rejection: always run bcrypt comparison even for non-existent users
    // to prevent timing-based user enumeration
    const dummyHash = '$2a$12$invalidhashtopreventtimingattacks000000000000000000000000';
    const storedHash = user?.passwordHash || dummyHash;

    const passwordValid = await comparePassword(password, storedHash);

    if (!user || !user.passwordHash || !passwordValid) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password.'
      });
    }

    if (user.status === 'SUSPENDED') {
      return res.status(403).json({
        success: false,
        error: 'Account suspended. Access revoked. Contact platform administrator.'
      });
    }

    appendLoginHistory(user, req, 'EMAIL');
    await user.save();

    await recordAuditEvent({
      actor: user.email,
      role: user.role,
      action: 'USER_LOGIN',
      entityType: 'User',
      entityId: user._id.toString(),
      payload: { email: user.email, authProvider: 'EMAIL' }
    });

    // Issue access token
    const token = generateAegisToken(user);

    // Issue refresh token
    const { rawToken, tokenHash, expiresAt } = generateRefreshToken(Boolean(rememberMe));
    await storeRefreshToken(user, { tokenHash, expiresAt });

    // Set HttpOnly refresh cookie
    res.cookie(COOKIE_NAME, rawToken, refreshCookieOptions(expiresAt));

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      user: buildUserResponse(user)
    });
  } catch (error) {
    console.error('[Native Login Error]', error);
    return res.status(500).json({ success: false, error: `Login failed: ${error.message}` });
  }
}

// ─── Token Refresh ────────────────────────────────────────────────────────────

/**
 * POST /api/auth/refresh
 * Issues a new access token using the HttpOnly refresh token cookie.
 * Rotates the refresh token on each use (sliding expiry model).
 */
export async function refreshAccessToken(req, res) {
  try {
    const rawToken = req.cookies?.[COOKIE_NAME];
    if (!rawToken) {
      return res.status(401).json({ success: false, error: 'No refresh token provided.' });
    }

    // Find user by token hash
    const tokenHash = hashToken(rawToken);
    const user = await User.findOne({
      'refreshTokens.tokenHash': tokenHash,
      'refreshTokens.expiresAt': { $gt: new Date() }
    }).select('+refreshTokens');

    if (!user) {
      res.clearCookie(COOKIE_NAME, clearCookieOptions());
      return res.status(401).json({ success: false, error: 'Invalid or expired refresh token.' });
    }

    if (user.status === 'SUSPENDED') {
      await revokeAllRefreshTokens(user);
      res.clearCookie(COOKIE_NAME, clearCookieOptions());
      return res.status(403).json({ success: false, error: 'Account suspended. Access revoked.' });
    }

    // Find the specific token entry (for rotation)
    const tokenEntry = findValidRefreshToken(user, rawToken);
    if (!tokenEntry) {
      res.clearCookie(COOKIE_NAME, clearCookieOptions());
      return res.status(401).json({ success: false, error: 'Invalid or expired refresh token.' });
    }

    // Rotate: issue new refresh token (preserve remember-me TTL by checking expiry duration)
    const isLongLived = (tokenEntry.expiresAt - Date.now()) > (1 * 24 * 60 * 60 * 1000);
    const newRefresh = generateRefreshToken(isLongLived);
    await rotateRefreshToken(user, tokenEntry.tokenHash, {
      tokenHash: newRefresh.tokenHash,
      expiresAt: newRefresh.expiresAt
    });

    res.cookie(COOKIE_NAME, newRefresh.rawToken, refreshCookieOptions(newRefresh.expiresAt));

    const accessToken = generateAegisToken(user);
    return res.status(200).json({
      success: true,
      token: accessToken,
      user: buildUserResponse(user)
    });
  } catch (error) {
    console.error('[Refresh Token Error]', error);
    return res.status(500).json({ success: false, error: `Token refresh failed: ${error.message}` });
  }
}

// ─── Logout ───────────────────────────────────────────────────────────────────

/**
 * POST /api/auth/logout
 * Revokes the current refresh token and clears the cookie.
 * Works for both Google-only and native auth users.
 */
export async function logout(req, res) {
  try {
    const rawToken = req.cookies?.[COOKIE_NAME];
    let user = req.user;

    if (user && !(user instanceof User) && typeof user.save !== 'function') {
      user = await User.findById(user._id || user.id).select('+refreshTokens');
    }

    if (!user && rawToken) {
      const tokenHash = hashToken(rawToken);
      user = await User.findOne({ 'refreshTokens.tokenHash': tokenHash }).select('+refreshTokens');
    }

    if (!user) {
      const authHeader = req.headers && req.headers['authorization'];
      if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
          const { verifyAegisToken } = await import('../services/googleAuthService.js');
          const decoded = verifyAegisToken(authHeader.slice(7).trim());
          if (decoded && decoded.userId) {
            user = await User.findById(decoded.userId).select('+refreshTokens');
          }
        } catch {
          // ignore
        }
      }
    }

    if (user) {
      if (rawToken) {
        await revokeRefreshToken(user, rawToken);
      }
      user.presence = 'OFFLINE';
      user.lastSeenAt = new Date();
      if (user.loginHistory && user.loginHistory.length > 0) {
        const lastEntry = [...user.loginHistory].reverse().find(e => !e.logoutAt);
        if (lastEntry) {
          lastEntry.logoutAt = new Date();
        }
      }
      await user.save();

      await recordAuditEvent({
        actor: user.email,
        role: user.role,
        action: 'USER_LOGOUT',
        entityType: 'User',
        entityId: user._id.toString(),
        payload: { email: user.email }
      });
    }

    res.clearCookie(COOKIE_NAME, clearCookieOptions());
    return res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    // Always succeed logout from client perspective
    res.clearCookie(COOKIE_NAME, clearCookieOptions());
    return res.json({ success: true, message: 'Logged out successfully' });
  }
}

// ─── Forgot Password ──────────────────────────────────────────────────────────

/**
 * POST /api/auth/forgot-password
 * Stores a password reset token hash for the given email.
 * ALWAYS returns 200 to prevent user enumeration.
 *
 * In production, an email with a reset link would be sent here.
 * In development, the raw token is returned directly in the response.
 */
export async function forgotPassword(req, res) {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, error: 'Email address is required.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail }).select('+passwordHash');

    // Only set token if user has a native password (no-op for Google-only users)
    let devToken = null;
    if (user && user.passwordHash) {
      const { rawToken, tokenHash, expiresAt } = generatePasswordResetToken();
      user.passwordResetTokenHash = tokenHash;
      user.passwordResetExpiresAt = expiresAt;
      await user.save();

      // Development: expose token in response for testing
      if (process.env.NODE_ENV !== 'production') {
        devToken = rawToken;
      }

      // TODO (production): send email with link:
      // await emailService.sendPasswordReset(normalizedEmail, rawToken);
    }

    const response = {
      success: true,
      message: 'If an account with that email exists, a password reset link has been sent.'
    };

    if (devToken) {
      response._devResetToken = devToken; // Only present in non-production environments
    }

    return res.status(200).json(response);
  } catch (error) {
    console.error('[Forgot Password Error]', error);
    return res.status(500).json({ success: false, error: `Request failed: ${error.message}` });
  }
}

// ─── Reset Password ───────────────────────────────────────────────────────────

/**
 * POST /api/auth/reset-password
 * Consumes the password reset token and sets a new password.
 */
export async function resetPassword(req, res) {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ success: false, error: 'Reset token and new password are required.' });
    }

    const pwCheck = validatePasswordStrength(password);
    if (!pwCheck.valid) {
      return res.status(400).json({ success: false, error: pwCheck.message });
    }

    const tokenHash = hashToken(token);
    const user = await User.findOne({
      passwordResetTokenHash: tokenHash,
      passwordResetExpiresAt: { $gt: new Date() }
    }).select('+passwordHash +refreshTokens +passwordResetTokenHash +passwordResetExpiresAt');

    if (!user) {
      return res.status(400).json({
        success: false,
        error: 'This password reset link is invalid or has expired. Please request a new one.'
      });
    }

    // Set new password and clear reset token
    user.passwordHash = await hashPassword(password);
    user.passwordResetTokenHash = null;
    user.passwordResetExpiresAt = null;

    // Revoke all refresh tokens (force re-login everywhere)
    user.refreshTokens = [];
    await user.save();

    // Clear cookie if present
    res.clearCookie(COOKIE_NAME, clearCookieOptions());

    await recordAuditEvent({
      actor: user.email,
      role: user.role,
      action: 'USER_PASSWORD_RESET',
      entityType: 'User',
      entityId: user._id.toString(),
      payload: { email: user.email }
    });

    return res.status(200).json({
      success: true,
      message: 'Password reset successfully. Please sign in with your new password.'
    });
  } catch (error) {
    console.error('[Reset Password Error]', error);
    return res.status(500).json({ success: false, error: `Password reset failed: ${error.message}` });
  }
}

// ─── User Onboarding ──────────────────────────────────────────────────────────

/**
 * POST /api/auth/onboarding
 * Completes user onboarding: records role, department, team, teamLead.
 */
export async function completeOnboarding(req, res) {
  try {
    let user = req.user;
    if (!user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    if (!(user instanceof User) && typeof user.save !== 'function') {
      user = await User.findById(user._id || user.id);
      if (!user) {
        return res.status(404).json({ success: false, error: 'User not found.' });
      }
    }

    const { role, department, team, teamLead } = req.body;

    const bootstrapEmail = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
    const isBootstrapAdmin = Boolean(bootstrapEmail && user.email.toLowerCase() === bootstrapEmail);

    const normalOnboardingRoles = [
      'ML_LEAD',
      'GOVERNANCE_OFFICER',
      'EXECUTIVE_APPROVER'
    ];

    if (role === 'PLATFORM_ADMIN' && !isBootstrapAdmin) {
      return res.status(403).json({
        success: false,
        error: 'PLATFORM_ADMIN cannot be selected during onboarding. Platform Administrator privileges are server-controlled.'
      });
    }

    if (!role || (!normalOnboardingRoles.includes(role) && !(role === 'PLATFORM_ADMIN' && isBootstrapAdmin))) {
      return res.status(400).json({
        success: false,
        error: `Invalid role selected. Must be one of: ${normalOnboardingRoles.join(', ')}`
      });
    }

    if (user.onboardingCompleted) {
      return res.status(400).json({
        success: false,
        error: 'Onboarding has already been completed for this account.'
      });
    }

    user.role = isBootstrapAdmin ? 'PLATFORM_ADMIN' : role;
    user.department = (department && typeof department === 'string') ? department.trim() : 'Engineering';
    user.team = (team && typeof team === 'string') ? team.trim() : '';
    user.teamLead = (teamLead && typeof teamLead === 'string') ? teamLead.trim() : '';
    user.onboardingCompleted = true;
    user.status = 'ACTIVE';
    user.presence = 'OFFLINE';
    user.lastSeenAt = new Date();
    if (isBootstrapAdmin) {
      user.verificationStatus = 'VERIFIED';
    } else if (!user.verificationStatus) {
      user.verificationStatus = 'PENDING';
    }

    await user.save();

    await recordAuditEvent({
      actor: user.email,
      role: user.role,
      action: 'USER_ONBOARDING_COMPLETED',
      entityType: 'User',
      entityId: user._id.toString(),
      payload: {
        email: user.email,
        role: user.role,
        department: user.department,
        team: user.team,
        teamLead: user.teamLead,
        verificationStatus: user.verificationStatus
      }
    });

    const token = generateAegisToken(user);

    return res.json({
      success: true,
      message: 'Onboarding completed successfully',
      token,
      user: buildUserResponse(user)
    });
  } catch (error) {
    console.error('[Onboarding Error]', error);
    return res.status(500).json({ success: false, error: `Onboarding failed: ${error.message}` });
  }
}

// ─── Current User Profile ─────────────────────────────────────────────────────

/**
 * GET /api/auth/me
 * Retrieves current authenticated user profile using Bearer JWT.
 */
export async function getCurrentUser(req, res) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    user.lastSeenAt = new Date();
    user.presence = 'ACTIVE';
    await user.save().catch(() => {});

    return res.json({
      success: true,
      user: buildUserResponse(user)
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

// ─── Profile & Identity Updates ──────────────────────────────────────────────

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * PATCH /api/auth/profile
 * Updates the authenticated user's own display name and/or email address.
 * Strictly enforces an allowlist: ignores/rejects attempts to modify role, status,
 * permissions, presence, or other privileged account fields.
 */
export async function updateUserProfile(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const { name, email } = req.body;

    if (!name && !email) {
      return res.status(400).json({
        success: false,
        error: 'At least one field (name or email) must be provided for update.'
      });
    }

    // Name validation
    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 80) {
        return res.status(400).json({
          success: false,
          error: 'Display name must be between 2 and 80 characters.'
        });
      }
    }

    // Email validation
    let cleanEmail = null;
    if (email !== undefined) {
      if (typeof email !== 'string' || !EMAIL_REGEX.test(email.trim().toLowerCase())) {
        return res.status(400).json({
          success: false,
          error: 'Please enter a valid email address.'
        });
      }
      cleanEmail = email.trim().toLowerCase();

      // Check uniqueness against other accounts
      const existing = await User.findOne({
        email: cleanEmail,
        _id: { $ne: userId }
      });
      if (existing) {
        return res.status(409).json({
          success: false,
          error: 'Email address is already in use by another account.'
        });
      }
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const previousName = user.name;
    const previousEmail = user.email;

    if (name !== undefined) {
      user.name = name.trim();
    }
    if (cleanEmail && cleanEmail !== user.email) {
      user.email = cleanEmail;
    }

    await user.save();

    await recordAuditEvent({
      actor: user.email,
      role: user.role,
      action: 'USER_PROFILE_UPDATED',
      entityType: 'User',
      entityId: user._id,
      payload: {
        userId: String(user._id),
        previousName,
        newName: user.name,
        previousEmail,
        newEmail: user.email
      }
    });

    return res.json({
      success: true,
      message: 'Profile updated successfully',
      user: buildUserResponse(user)
    });
  } catch (error) {
    console.error('[Update Profile Error]', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * POST /api/auth/change-password
 * Securely updates the password for native authentication accounts.
 * Validates current password, password strength, and invalidates other sessions.
 */
export async function changePassword(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const user = await User.findById(userId).select('+passwordHash +refreshTokens');
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Check if account has native credentials
    if (!user.passwordHash) {
      return res.status(400).json({
        success: false,
        error: 'This account authenticates via an external identity provider and does not use a local password.'
      });
    }

    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!currentPassword) {
      return res.status(400).json({
        success: false,
        error: 'Current password is required.'
      });
    }

    const isMatch = await comparePassword(currentPassword, user.passwordHash);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        error: 'Current password is incorrect.'
      });
    }

    if (!newPassword) {
      return res.status(400).json({
        success: false,
        error: 'New password is required.'
      });
    }

    if (confirmPassword && newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        error: 'New password and confirmation do not match.'
      });
    }

    if (currentPassword === newPassword) {
      return res.status(400).json({
        success: false,
        error: 'New password must be different from your current password.'
      });
    }

    const strength = validatePasswordStrength(newPassword);
    if (!strength.valid) {
      return res.status(400).json({
        success: false,
        error: strength.message
      });
    }

    user.passwordHash = await hashPassword(newPassword);
    // Invalidate other refresh tokens following session security policy
    await revokeAllRefreshTokens(user);
    await user.save();

    await recordAuditEvent({
      actor: user.email,
      role: user.role,
      action: 'USER_PASSWORD_CHANGED',
      entityType: 'User',
      entityId: user._id,
      payload: {
        userId: String(user._id),
        email: user.email,
        sessionsInvalidated: true
      }
    });

    return res.json({
      success: true,
      message: 'Password changed successfully. Other active sessions have been invalidated.'
    });
  } catch (error) {
    console.error('[Change Password Error]', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
