import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';

let oauthClient = null;

/**
 * Gets or initializes the Google OAuth2 client.
 */
export function getOAuthClient() {
  return oauthClient || new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
}

/**
 * Sets a custom OAuth2 client (used in testing to mock Google verification).
 * Pass null to restore default client.
 */
export function setOAuthClient(customClient) {
  oauthClient = customClient;
}

/**
 * Cryptographically verifies a Google ID token from Google Identity Services.
 * Validates signature, audience (client ID), issuer, token expiration, and identity claims.
 *
 * @param {string} idToken - The JWT credential returned by Google Identity Services
 * @returns {Promise<object>} The verified identity claims (sub, email, name, picture)
 */
export async function verifyGoogleIdToken(idToken) {
  if (!idToken) {
    throw new Error('Google ID token is required');
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw new Error('GOOGLE_CLIENT_ID is not configured in backend environment');
  }

  const client = getOAuthClient();
  const ticket = await client.verifyIdToken({
    idToken,
    audience: clientId
  });

  const payload = ticket.getPayload();
  if (!payload) {
    throw new Error('Invalid Google ID token payload');
  }

  // Validate audience matches configured Google Client ID
  if (payload.aud && payload.aud !== clientId) {
    throw new Error(`Google ID token audience mismatch: expected "${clientId}", got "${payload.aud}"`);
  }

  // Explicitly verify required identity claims
  const validIssuers = ['accounts.google.com', 'https://accounts.google.com'];
  if (!validIssuers.includes(payload.iss)) {
    throw new Error(`Invalid Google token issuer: ${payload.iss}`);
  }

  if (payload.exp && payload.exp * 1000 <= Date.now()) {
    throw new Error('Google ID token has expired');
  }

  if (!payload.sub) {
    throw new Error('Google ID token missing subject (sub) claim');
  }

  if (!payload.email) {
    throw new Error('Google account has no associated email address');
  }

  return {
    googleId: payload.sub,
    email: payload.email.toLowerCase(),
    name: payload.name || payload.email.split('@')[0],
    avatar: payload.picture || '',
    emailVerified: payload.email_verified === true
  };
}
/**
 * Retrieves the cryptographic secret for Aegis JWT signing/verification.
 * Enforces that a secure JWT_SECRET environment variable is configured in production.
 *
 * @returns {string} Secret key
 */
export function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || (process.env.NODE_ENV === 'production' && secret === 'aegis_dev_secret_fallback_do_not_use_in_prod')) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('FATAL: A secure JWT_SECRET environment variable must be configured in production');
    }
    return 'aegis_dev_secret_fallback_do_not_use_in_prod';
  }
  return secret;
}

/**
 * Issues an Aegis Application JWT session token after successful identity verification.
 *
 * @param {object} user - The Mongoose User document
 * @returns {string} Signed Aegis JWT token
 */
export function generateAegisToken(user) {
  const secret = getJwtSecret();
  const expiresIn = process.env.JWT_EXPIRES_IN || '7d';

  return jwt.sign(
    {
      userId: user._id.toString(),
      email: user.email,
      role: user.role,
      status: user.status,
      organizationId: user.organizationId ? user.organizationId.toString() : null
    },
    secret,
    { expiresIn }
  );
}

/**
 * Verifies an Aegis application JWT.
 *
 * @param {string} token
 * @returns {object} Decoded token payload
 */
export function verifyAegisToken(token) {
  if (!token || typeof token !== 'string') {
    throw new Error('Authentication token must be a non-empty string');
  }
  const secret = getJwtSecret();
  return jwt.verify(token, secret);
}
