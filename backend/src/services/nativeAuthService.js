/**
 * nativeAuthService.js
 *
 * Handles email/password authentication for AEGIS AI native sign-in:
 *   - Bcrypt password hashing and comparison
 *   - Secure opaque refresh token generation and storage (stored as SHA-256 hashes)
 *   - Refresh token rotation and revocation
 *   - Password reset token lifecycle
 *
 * Architecture notes:
 *   - Access token  — short-lived Aegis JWT (see googleAuthService.generateAegisToken)
 *   - Refresh token — long-lived opaque random token stored HttpOnly in cookie,
 *                     stored as a SHA-256 hash in the User.refreshTokens array
 *   - Remember Me   — controls refresh token TTL (30 days vs 1 day)
 */

import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const BCRYPT_ROUNDS = 12;
const REFRESH_TOKEN_BYTES = 48;

// Refresh token TTLs
const REFRESH_TTL_REMEMBER  = 30 * 24 * 60 * 60 * 1000; // 30 days
const REFRESH_TTL_SESSION   =  1 * 24 * 60 * 60 * 1000; //  1 day

// Password reset token TTL
const RESET_TOKEN_TTL_MS    = 60 * 60 * 1000; // 1 hour

/**
 * Hashes a plaintext password using bcrypt.
 * @param {string} password
 * @returns {Promise<string>}
 */
export async function hashPassword(password) {
  if (!password || typeof password !== 'string') {
    throw new Error('Password must be a non-empty string');
  }
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/**
 * Compares a plaintext password against a stored bcrypt hash.
 * @param {string} password
 * @param {string} hash
 * @returns {Promise<boolean>}
 */
export async function comparePassword(password, hash) {
  if (!password || !hash) return false;
  return bcrypt.compare(password, hash);
}

/**
 * Generates a cryptographically secure opaque refresh token.
 * Returns both the raw token (for the cookie) and its SHA-256 hash (for storage).
 *
 * @param {boolean} rememberMe - If true, token lives 30 days; else 1 day
 * @returns {{ rawToken: string, tokenHash: string, expiresAt: Date }}
 */
export function generateRefreshToken(rememberMe = false) {
  const rawToken = crypto.randomBytes(REFRESH_TOKEN_BYTES).toString('hex');
  const tokenHash = hashToken(rawToken);
  const ttl = rememberMe ? REFRESH_TTL_REMEMBER : REFRESH_TTL_SESSION;
  const expiresAt = new Date(Date.now() + ttl);
  return { rawToken, tokenHash, expiresAt };
}

/**
 * SHA-256 hashes a token for safe database storage.
 * @param {string} rawToken
 * @returns {string}
 */
export function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Adds a refresh token hash entry to a User document (max 10 concurrent sessions).
 * Evicts the oldest token when the limit is reached.
 * Saves the user document.
 *
 * @param {import('../models/User.js').User} user
 * @param {{ tokenHash: string, expiresAt: Date }} tokenEntry
 */
export async function storeRefreshToken(user, tokenEntry) {
  // Evict expired tokens
  const now = new Date();
  user.refreshTokens = (user.refreshTokens || []).filter(t => t.expiresAt > now);

  // Enforce max concurrent sessions
  if (user.refreshTokens.length >= 10) {
    user.refreshTokens.sort((a, b) => a.createdAt - b.createdAt);
    user.refreshTokens.splice(0, 1); // evict oldest
  }

  user.refreshTokens.push({ tokenHash: tokenEntry.tokenHash, expiresAt: tokenEntry.expiresAt });
  await user.save();
}

/**
 * Validates an incoming raw refresh token against stored hashes.
 * Returns the matching token entry if valid, or null otherwise.
 *
 * @param {import('../models/User.js').User} user - Must be fetched with +refreshTokens
 * @param {string} rawToken
 * @returns {{ tokenHash: string, expiresAt: Date } | null}
 */
export function findValidRefreshToken(user, rawToken) {
  if (!rawToken || !user?.refreshTokens?.length) return null;
  const incoming = hashToken(rawToken);
  const now = new Date();
  return user.refreshTokens.find(t => t.tokenHash === incoming && t.expiresAt > now) || null;
}

/**
 * Rotates a refresh token: removes the old hash entry and stores a new one.
 * This limits the window of token replay attacks.
 *
 * @param {import('../models/User.js').User} user - Must be fetched with +refreshTokens
 * @param {string} oldTokenHash
 * @param {{ tokenHash: string, expiresAt: Date }} newTokenEntry
 */
export async function rotateRefreshToken(user, oldTokenHash, newTokenEntry) {
  user.refreshTokens = (user.refreshTokens || []).filter(t => t.tokenHash !== oldTokenHash);
  user.refreshTokens.push({ tokenHash: newTokenEntry.tokenHash, expiresAt: newTokenEntry.expiresAt });
  await user.save();
}

/**
 * Revokes a single refresh token by its hash.
 * @param {import('../models/User.js').User} user - Must be fetched with +refreshTokens
 * @param {string} rawToken
 */
export async function revokeRefreshToken(user, rawToken) {
  const hash = hashToken(rawToken);
  user.refreshTokens = (user.refreshTokens || []).filter(t => t.tokenHash !== hash);
  await user.save();
}

/**
 * Revokes ALL refresh tokens for a user (e.g. on suspicious activity or explicit logout-all).
 * @param {import('../models/User.js').User} user - Must be fetched with +refreshTokens
 */
export async function revokeAllRefreshTokens(user) {
  user.refreshTokens = [];
  await user.save();
}

/**
 * Generates a secure password reset token (for emailed links).
 * Returns the raw token (for the URL) and its SHA-256 hash (for database storage).
 *
 * @returns {{ rawToken: string, tokenHash: string, expiresAt: Date }}
 */
export function generatePasswordResetToken() {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
  return { rawToken, tokenHash, expiresAt };
}

/**
 * Validates incoming password strength.
 * Requirements: at least 8 characters, 1 uppercase, 1 lowercase, 1 digit.
 *
 * @param {string} password
 * @returns {{ valid: boolean, message?: string }}
 */
export function validatePasswordStrength(password) {
  if (!password || typeof password !== 'string') {
    return { valid: false, message: 'Password is required.' };
  }
  if (password.length < 8) {
    return { valid: false, message: 'Password must be at least 8 characters long.' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one uppercase letter.' };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one lowercase letter.' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one digit.' };
  }
  return { valid: true };
}
