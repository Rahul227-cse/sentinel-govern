import test from 'node:test';
import assert from 'node:assert';
import mongoose from 'mongoose';

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
} from '../src/services/nativeAuthService.js';
import { User } from '../src/models/User.js';
import { generateAegisToken } from '../src/services/googleAuthService.js';

import { MongoMemoryServer } from 'mongodb-memory-server';

let mongoServer;

test.before(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

test.after(async () => {
  await mongoose.disconnect();
  if (mongoServer) {
    await mongoServer.stop();
  }
});

// ─── Mock request/response helpers ───────────────────────────────────────────

function mockRes() {
  const res = {
    _statusCode: 200,
    _json: null,
    _cookies: {},
    _clearedCookies: {},
    status(code) { this._statusCode = code; return this; },
    json(data)   { this._json = data; return this; },
    cookie(name, value, opts) { this._cookies[name] = { value, opts }; return this; },
    clearCookie(name, opts)   { this._clearedCookies[name] = opts; return this; }
  };
  return res;
}

// ─── 1. nativeAuthService Unit Tests ─────────────────────────────────────────

test('nativeAuthService: hashPassword produces a bcrypt hash', async () => {
  const hash = await hashPassword('SecurePass1');
  assert.ok(hash.startsWith('$2'), 'Expected a bcrypt hash');
  assert.notStrictEqual(hash, 'SecurePass1');
});

test('nativeAuthService: comparePassword succeeds for correct password', async () => {
  const hash = await hashPassword('SecurePass1');
  const valid = await comparePassword('SecurePass1', hash);
  assert.strictEqual(valid, true);
});

test('nativeAuthService: comparePassword fails for wrong password', async () => {
  const hash = await hashPassword('SecurePass1');
  const valid = await comparePassword('WrongPass99', hash);
  assert.strictEqual(valid, false);
});

test('nativeAuthService: validatePasswordStrength rejects short password', () => {
  const result = validatePasswordStrength('Ab1');
  assert.strictEqual(result.valid, false);
  assert.match(result.message, /8 characters/i);
});

test('nativeAuthService: validatePasswordStrength rejects no uppercase', () => {
  const result = validatePasswordStrength('lowercase1');
  assert.strictEqual(result.valid, false);
  assert.match(result.message, /uppercase/i);
});

test('nativeAuthService: validatePasswordStrength rejects no digit', () => {
  const result = validatePasswordStrength('NoDigitHere');
  assert.strictEqual(result.valid, false);
  assert.match(result.message, /digit/i);
});

test('nativeAuthService: validatePasswordStrength accepts valid password', () => {
  const result = validatePasswordStrength('StrongPass1');
  assert.strictEqual(result.valid, true);
});

test('nativeAuthService: generateRefreshToken produces unique raw tokens', () => {
  const t1 = generateRefreshToken(false);
  const t2 = generateRefreshToken(false);
  assert.notStrictEqual(t1.rawToken, t2.rawToken);
  assert.ok(t1.expiresAt instanceof Date);
});

test('nativeAuthService: remember-me token has longer TTL than session token', () => {
  const session  = generateRefreshToken(false);
  const remember = generateRefreshToken(true);
  assert.ok(remember.expiresAt > session.expiresAt);
});

test('nativeAuthService: hashToken is deterministic', () => {
  const raw = 'some-random-token-abc123';
  assert.strictEqual(hashToken(raw), hashToken(raw));
});

test('nativeAuthService: generatePasswordResetToken produces 1-hour expiry', () => {
  const { expiresAt } = generatePasswordResetToken();
  const diff = expiresAt - Date.now();
  // Approximately 60 minutes (within 5-second margin)
  assert.ok(diff > 55 * 60 * 1000 && diff <= 60 * 60 * 1000 + 1000);
});

// ─── 2. Refresh Token Storage Tests ──────────────────────────────────────────

test('nativeAuthService: storeRefreshToken adds entry to user document', async () => {
  const user = await User.create({
    email: `refresh-test-${Date.now()}@example.com`,
    name: 'Refresh Tester',
    role: 'GOVERNANCE_OFFICER',
    status: 'ACTIVE'
  });

  const fullUser = await User.findById(user._id).select('+refreshTokens');
  const { rawToken, tokenHash, expiresAt } = generateRefreshToken(false);
  await storeRefreshToken(fullUser, { tokenHash, expiresAt });

  const updated = await User.findById(user._id).select('+refreshTokens');
  assert.strictEqual(updated.refreshTokens.length, 1);
  assert.strictEqual(updated.refreshTokens[0].tokenHash, tokenHash);
});

test('nativeAuthService: findValidRefreshToken returns entry for valid raw token', async () => {
  const user = await User.create({
    email: `find-rt-${Date.now()}@example.com`,
    name: 'Find RT',
    role: 'GOVERNANCE_OFFICER',
    status: 'ACTIVE'
  });

  const fullUser = await User.findById(user._id).select('+refreshTokens');
  const { rawToken, tokenHash, expiresAt } = generateRefreshToken(false);
  await storeRefreshToken(fullUser, { tokenHash, expiresAt });

  const refreshed = await User.findById(user._id).select('+refreshTokens');
  const found = findValidRefreshToken(refreshed, rawToken);
  assert.ok(found, 'Should find the valid token entry');
  assert.strictEqual(found.tokenHash, tokenHash);
});

test('nativeAuthService: findValidRefreshToken returns null for wrong token', async () => {
  const user = await User.create({
    email: `null-rt-${Date.now()}@example.com`,
    name: 'Null RT',
    role: 'GOVERNANCE_OFFICER',
    status: 'ACTIVE'
  });

  const fullUser = await User.findById(user._id).select('+refreshTokens');
  const { tokenHash, expiresAt } = generateRefreshToken(false);
  await storeRefreshToken(fullUser, { tokenHash, expiresAt });

  const refreshed = await User.findById(user._id).select('+refreshTokens');
  const found = findValidRefreshToken(refreshed, 'totally-wrong-token');
  assert.strictEqual(found, null);
});

test('nativeAuthService: revokeRefreshToken removes the specific token', async () => {
  const user = await User.create({
    email: `revoke-rt-${Date.now()}@example.com`,
    name: 'Revoke RT',
    role: 'GOVERNANCE_OFFICER',
    status: 'ACTIVE'
  });

  const fullUser = await User.findById(user._id).select('+refreshTokens');
  const { rawToken, tokenHash, expiresAt } = generateRefreshToken(false);
  await storeRefreshToken(fullUser, { tokenHash, expiresAt });

  const withToken = await User.findById(user._id).select('+refreshTokens');
  await revokeRefreshToken(withToken, rawToken);

  const afterRevoke = await User.findById(user._id).select('+refreshTokens');
  assert.strictEqual(afterRevoke.refreshTokens.length, 0);
});

test('nativeAuthService: revokeAllRefreshTokens clears all sessions', async () => {
  const user = await User.create({
    email: `revoke-all-${Date.now()}@example.com`,
    name: 'Revoke All',
    role: 'GOVERNANCE_OFFICER',
    status: 'ACTIVE'
  });

  const fullUser = await User.findById(user._id).select('+refreshTokens');
  // Store two tokens
  for (let i = 0; i < 2; i++) {
    const { tokenHash, expiresAt } = generateRefreshToken(false);
    await storeRefreshToken(fullUser, { tokenHash, expiresAt });
  }

  const withTokens = await User.findById(user._id).select('+refreshTokens');
  await revokeAllRefreshTokens(withTokens);

  const afterRevoke = await User.findById(user._id).select('+refreshTokens');
  assert.strictEqual(afterRevoke.refreshTokens.length, 0);
});

// ─── 3. Native Signup API Tests ───────────────────────────────────────────────

test('Native Signup: Rejects missing name with 400', async () => {
  const { nativeSignup } = await import('../src/controllers/authController.js');
  const req = { body: { email: 'user@test.com', password: 'StrongPass1' } };
  const res = mockRes();
  await nativeSignup(req, res);
  assert.strictEqual(res._statusCode, 400);
  assert.strictEqual(res._json.success, false);
  assert.match(res._json.error, /name/i);
});

test('Native Signup: Rejects invalid email with 400', async () => {
  const { nativeSignup } = await import('../src/controllers/authController.js');
  const req = { body: { name: 'Test User', email: 'not-an-email', password: 'StrongPass1' } };
  const res = mockRes();
  await nativeSignup(req, res);
  assert.strictEqual(res._statusCode, 400);
  assert.strictEqual(res._json.success, false);
});

test('Native Signup: Rejects weak password with 400', async () => {
  const { nativeSignup } = await import('../src/controllers/authController.js');
  const req = { body: { name: 'Test User', email: 'weak@test.com', password: 'weak' } };
  const res = mockRes();
  await nativeSignup(req, res);
  assert.strictEqual(res._statusCode, 400);
  assert.strictEqual(res._json.success, false);
});

test('Native Signup: Creates GOVERNANCE_OFFICER + PENDING for normal user', async () => {
  const { nativeSignup } = await import('../src/controllers/authController.js');
  const req = { body: { name: 'Normal User', email: 'normal@test.com', password: 'StrongPass1' } };
  const res = mockRes();
  await nativeSignup(req, res);
  assert.strictEqual(res._statusCode, 201);
  assert.strictEqual(res._json.success, true);
  assert.strictEqual(res._json.user.role, 'GOVERNANCE_OFFICER');
  assert.strictEqual(res._json.user.status, 'ACTIVE');
  assert.strictEqual(res._json.user.verificationStatus, 'PENDING');
  assert.ok(res._json.token, 'Should issue an access token');
});

test('Native Signup: Duplicate email rejected with 409', async () => {
  const { nativeSignup } = await import('../src/controllers/authController.js');
  const req1 = { body: { name: 'User One', email: 'dup@test.com', password: 'StrongPass1' } };
  await nativeSignup(req1, mockRes());

  const req2 = { body: { name: 'User Two', email: 'dup@test.com', password: 'StrongPass1' } };
  const res2 = mockRes();
  await nativeSignup(req2, res2);
  assert.strictEqual(res2._statusCode, 409);
  assert.strictEqual(res2._json.success, false);
});

test('Native Signup: Bootstrap admin email gets PLATFORM_ADMIN + ACTIVE', async () => {
  process.env.BOOTSTRAP_ADMIN_EMAIL = 'native-bootstrap@test.com';
  const { nativeSignup } = await import('../src/controllers/authController.js');
  const req = { body: { name: 'Bootstrap Admin', email: 'native-bootstrap@test.com', password: 'StrongPass1' } };
  const res = mockRes();
  await nativeSignup(req, res);
  assert.strictEqual(res._statusCode, 201);
  assert.strictEqual(res._json.user.role, 'PLATFORM_ADMIN');
  assert.strictEqual(res._json.user.status, 'ACTIVE');
  delete process.env.BOOTSTRAP_ADMIN_EMAIL;
});

test('Native Signup: passwordHash is NEVER returned in user response', async () => {
  const { nativeSignup } = await import('../src/controllers/authController.js');
  const req = { body: { name: 'Safe User', email: 'safe@test.com', password: 'StrongPass1' } };
  const res = mockRes();
  await nativeSignup(req, res);
  assert.ok(!('passwordHash' in (res._json.user || {})), 'passwordHash must not be in user response');
});

// ─── 4. Native Login API Tests ────────────────────────────────────────────────

test('Native Login: Succeeds with correct credentials and issues refresh cookie', async () => {
  // Setup: create a user
  const { nativeSignup, nativeLogin } = await import('../src/controllers/authController.js');
  await nativeSignup(
    { body: { name: 'Login Test', email: 'login@test.com', password: 'StrongPass1' } },
    mockRes()
  );

  const req = {
    body: { email: 'login@test.com', password: 'StrongPass1', rememberMe: false },
    cookies: {}
  };
  const res = mockRes();
  await nativeLogin(req, res);

  assert.strictEqual(res._statusCode, 200);
  assert.strictEqual(res._json.success, true);
  assert.ok(res._json.token, 'Should issue access token');
  assert.ok(res._cookies['aegis_refresh_token'], 'Should set refresh cookie');
});

test('Native Login: Rejects wrong password with 401', async () => {
  const { nativeLogin } = await import('../src/controllers/authController.js');
  const req = {
    body: { email: 'login@test.com', password: 'WrongPass99' },
    cookies: {}
  };
  const res = mockRes();
  await nativeLogin(req, res);
  assert.strictEqual(res._statusCode, 401);
  assert.strictEqual(res._json.success, false);
  // Generic message must not reveal whether user exists
  assert.match(res._json.error, /invalid email or password/i);
});

test('Native Login: Non-existent user returns same error as wrong password (enumeration prevention)', async () => {
  const { nativeLogin } = await import('../src/controllers/authController.js');
  const req = {
    body: { email: 'doesnotexist@test.com', password: 'StrongPass1' },
    cookies: {}
  };
  const res = mockRes();
  await nativeLogin(req, res);
  assert.strictEqual(res._statusCode, 401);
  assert.match(res._json.error, /invalid email or password/i);
});

test('Native Login: Suspended user is blocked with 403', async () => {
  // Create and suspend a user
  const user = await User.create({
    email: 'suspended-native@test.com',
    name: 'Suspended',
    passwordHash: await hashPassword('StrongPass1'),
    role: 'GOVERNANCE_OFFICER',
    status: 'SUSPENDED'
  });

  const { nativeLogin } = await import('../src/controllers/authController.js');
  const req = {
    body: { email: 'suspended-native@test.com', password: 'StrongPass1' },
    cookies: {}
  };
  const res = mockRes();
  await nativeLogin(req, res);
  assert.strictEqual(res._statusCode, 403);
  assert.match(res._json.error, /suspended/i);
});

test('Native Login: PENDING user can log in (PENDING status checked at route level, not login)', async () => {
  // Pending users CAN authenticate (they get a token), but are blocked by requireActiveUser on protected routes
  const { nativeSignup, nativeLogin } = await import('../src/controllers/authController.js');
  await nativeSignup(
    { body: { name: 'Pending Native', email: 'pending-native@test.com', password: 'StrongPass1' } },
    mockRes()
  );
  const req = {
    body: { email: 'pending-native@test.com', password: 'StrongPass1' },
    cookies: {}
  };
  const res = mockRes();
  await nativeLogin(req, res);
  assert.strictEqual(res._statusCode, 200);
  assert.strictEqual(res._json.user.status, 'ACTIVE');
  assert.strictEqual(res._json.user.verificationStatus, 'PENDING');
});

test('Native Login: Remember-me cookie has longer TTL than session', async () => {
  const { nativeSignup, nativeLogin } = await import('../src/controllers/authController.js');
  await nativeSignup(
    { body: { name: 'RememberMe User', email: 'remember@test.com', password: 'StrongPass1' } },
    mockRes()
  );

  // Session login
  const reqSession = {
    body: { email: 'remember@test.com', password: 'StrongPass1', rememberMe: false },
    cookies: {}
  };
  const resSession = mockRes();
  await nativeLogin(reqSession, resSession);

  // Remember me login
  const reqRemember = {
    body: { email: 'remember@test.com', password: 'StrongPass1', rememberMe: true },
    cookies: {}
  };
  const resRemember = mockRes();
  await nativeLogin(reqRemember, resRemember);

  const sessionExp  = resSession._cookies['aegis_refresh_token'].opts.expires;
  const rememberExp = resRemember._cookies['aegis_refresh_token'].opts.expires;

  assert.ok(rememberExp > sessionExp, 'Remember-me cookie should expire later');
});

// ─── 5. Token Refresh Tests ───────────────────────────────────────────────────

test('Token Refresh: Valid cookie issues new access token and rotates cookie', async () => {
  const { nativeSignup, nativeLogin, refreshAccessToken } = await import('../src/controllers/authController.js');

  await nativeSignup(
    { body: { name: 'Refresh User', email: 'refresh@test.com', password: 'StrongPass1' } },
    mockRes()
  );

  const loginRes = mockRes();
  await nativeLogin({ body: { email: 'refresh@test.com', password: 'StrongPass1' }, cookies: {} }, loginRes);
  const rawCookie = loginRes._cookies['aegis_refresh_token'].value;

  const refreshReq = { cookies: { aegis_refresh_token: rawCookie } };
  const refreshRes = mockRes();
  await refreshAccessToken(refreshReq, refreshRes);

  assert.strictEqual(refreshRes._statusCode, 200);
  assert.ok(refreshRes._json.token, 'Should issue new access token');
  // Cookie should be rotated (new cookie set)
  assert.ok(refreshRes._cookies['aegis_refresh_token'], 'Should set rotated cookie');
  // New cookie value should differ from original
  assert.notStrictEqual(
    refreshRes._cookies['aegis_refresh_token'].value,
    rawCookie,
    'Refresh token should rotate on each use'
  );
});

test('Token Refresh: Missing cookie returns 401', async () => {
  const { refreshAccessToken } = await import('../src/controllers/authController.js');
  const req = { cookies: {} };
  const res = mockRes();
  await refreshAccessToken(req, res);
  assert.strictEqual(res._statusCode, 401);
  assert.strictEqual(res._json.success, false);
});

test('Token Refresh: Invalid token returns 401 and clears cookie', async () => {
  const { refreshAccessToken } = await import('../src/controllers/authController.js');
  const req = { cookies: { aegis_refresh_token: 'totally-invalid-token-12345' } };
  const res = mockRes();
  await refreshAccessToken(req, res);
  assert.strictEqual(res._statusCode, 401);
  assert.ok(res._clearedCookies['aegis_refresh_token'], 'Should clear invalid cookie');
});

// ─── 6. Forgot/Reset Password Tests ──────────────────────────────────────────

test('Forgot Password: Always returns 200 regardless of whether email exists', async () => {
  const { forgotPassword } = await import('../src/controllers/authController.js');
  const req = { body: { email: 'doesnotexist@test.com' } };
  const res = mockRes();
  await forgotPassword(req, res);
  assert.strictEqual(res._statusCode, 200);
  assert.strictEqual(res._json.success, true);
});

test('Forgot Password: Returns dev token for native user in non-production', async () => {
  const { nativeSignup, forgotPassword } = await import('../src/controllers/authController.js');
  await nativeSignup(
    { body: { name: 'Reset User', email: 'reset@test.com', password: 'StrongPass1' } },
    mockRes()
  );

  process.env.NODE_ENV = 'test'; // ensure non-production
  const req = { body: { email: 'reset@test.com' } };
  const res = mockRes();
  await forgotPassword(req, res);
  assert.strictEqual(res._statusCode, 200);
  assert.ok(res._json._devResetToken, 'Dev reset token should be present in test environment');
});

test('Reset Password: Consumes valid token and updates password', async () => {
  const { nativeSignup, forgotPassword, resetPassword } = await import('../src/controllers/authController.js');

  await nativeSignup(
    { body: { name: 'PWReset User', email: 'pwreset@test.com', password: 'OldPass123' } },
    mockRes()
  );

  const forgotRes = mockRes();
  await forgotPassword({ body: { email: 'pwreset@test.com' } }, forgotRes);
  const resetToken = forgotRes._json._devResetToken;
  assert.ok(resetToken, 'Dev token required for this test');

  const resetReq = { body: { token: resetToken, password: 'NewPass456' }, cookies: {} };
  const resetRes = mockRes();
  await resetPassword(resetReq, resetRes);
  assert.strictEqual(resetRes._statusCode, 200);
  assert.strictEqual(resetRes._json.success, true);
  assert.match(resetRes._json.message, /reset successfully/i);
});

test('Reset Password: Invalid token returns 400', async () => {
  const { resetPassword } = await import('../src/controllers/authController.js');
  const req = { body: { token: 'invalid-token-xyz', password: 'NewPass456' }, cookies: {} };
  const res = mockRes();
  await resetPassword(req, res);
  assert.strictEqual(res._statusCode, 400);
  assert.strictEqual(res._json.success, false);
});

test('Reset Password: Rejects weak new password', async () => {
  const { nativeSignup, forgotPassword, resetPassword } = await import('../src/controllers/authController.js');

  await nativeSignup(
    { body: { name: 'Weak Reset', email: 'weakreset@test.com', password: 'StrongPass1' } },
    mockRes()
  );
  const forgotRes = mockRes();
  await forgotPassword({ body: { email: 'weakreset@test.com' } }, forgotRes);
  const resetToken = forgotRes._json._devResetToken;

  const req = { body: { token: resetToken, password: 'weak' }, cookies: {} };
  const res = mockRes();
  await resetPassword(req, res);
  assert.strictEqual(res._statusCode, 400);
  assert.match(res._json.error, /password/i);
});

// ─── 7. Logout Tests ─────────────────────────────────────────────────────────

test('Logout: Clears refresh cookie and succeeds', async () => {
  const { nativeSignup, nativeLogin, logout } = await import('../src/controllers/authController.js');

  await nativeSignup(
    { body: { name: 'Logout User', email: 'logouttest@test.com', password: 'StrongPass1' } },
    mockRes()
  );
  const loginRes = mockRes();
  await nativeLogin({ body: { email: 'logouttest@test.com', password: 'StrongPass1' }, cookies: {} }, loginRes);
  const rawCookie = loginRes._cookies['aegis_refresh_token'].value;

  const logoutReq = { cookies: { aegis_refresh_token: rawCookie } };
  const logoutRes = mockRes();
  await logout(logoutReq, logoutRes);

  assert.strictEqual(logoutRes._json.success, true);
  assert.ok(logoutRes._clearedCookies['aegis_refresh_token'], 'Cookie should be cleared on logout');

  // Token should be revoked — refresh should now fail
  const { refreshAccessToken } = await import('../src/controllers/authController.js');
  const refreshRes = mockRes();
  await refreshAccessToken({ cookies: { aegis_refresh_token: rawCookie } }, refreshRes);
  assert.strictEqual(refreshRes._statusCode, 401);
});

test('Logout: Succeeds even without a cookie (Google-only users)', async () => {
  const { logout } = await import('../src/controllers/authController.js');
  const req = { cookies: {} };
  const res = mockRes();
  await logout(req, res);
  assert.strictEqual(res._json.success, true);
});

// ─── 8. Security Tests ────────────────────────────────────────────────────────

test('Security: Native login does not expose passwordHash in response', async () => {
  const { nativeLogin } = await import('../src/controllers/authController.js');
  const req = {
    body: { email: 'login@test.com', password: 'StrongPass1' },
    cookies: {}
  };
  const res = mockRes();
  await nativeLogin(req, res);
  const userObj = res._json.user || {};
  assert.ok(!('passwordHash' in userObj), 'passwordHash must never appear in API response');
  assert.ok(!('refreshTokens' in userObj), 'refreshTokens must never appear in API response');
});

test('Security: Client-supplied role in signup body cannot elevate role', async () => {
  const { nativeSignup } = await import('../src/controllers/authController.js');
  const req = {
    body: {
      name: 'Attacker',
      email: 'attacker@test.com',
      password: 'StrongPass1',
      role: 'PLATFORM_ADMIN',  // injected by attacker
      status: 'ACTIVE'          // injected by attacker
    }
  };
  const res = mockRes();
  await nativeSignup(req, res);
  // Must be rejected or clamped to GOVERNANCE_OFFICER + PENDING
  if (res._statusCode === 201) {
    assert.strictEqual(res._json.user.role, 'GOVERNANCE_OFFICER');
    assert.strictEqual(res._json.user.status, 'ACTIVE');
    assert.strictEqual(res._json.user.verificationStatus, 'PENDING');
  }
});

test('Security: Refresh token rotation invalidates old token', async () => {
  const { nativeSignup, nativeLogin, refreshAccessToken } = await import('../src/controllers/authController.js');

  await nativeSignup(
    { body: { name: 'Rotation User', email: 'rotation@test.com', password: 'StrongPass1' } },
    mockRes()
  );
  const loginRes = mockRes();
  await nativeLogin({ body: { email: 'rotation@test.com', password: 'StrongPass1' }, cookies: {} }, loginRes);
  const originalCookie = loginRes._cookies['aegis_refresh_token'].value;

  // Use original token once
  const r1 = mockRes();
  await refreshAccessToken({ cookies: { aegis_refresh_token: originalCookie } }, r1);
  assert.strictEqual(r1._statusCode, 200);

  // Use original token again (should fail after rotation)
  const r2 = mockRes();
  await refreshAccessToken({ cookies: { aegis_refresh_token: originalCookie } }, r2);
  assert.strictEqual(r2._statusCode, 401, 'Old refresh token must be invalidated after rotation');
});

test('Cleanup: Complete', async () => {
  assert.ok(true, 'All native auth tests complete');
});
