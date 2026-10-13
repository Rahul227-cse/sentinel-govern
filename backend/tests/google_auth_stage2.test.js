import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { User } from '../src/models/User.js';
import { googleAuth, getCurrentUser } from '../src/controllers/authController.js';
import {
  verifyGoogleIdToken,
  generateAegisToken,
  verifyAegisToken,
  setOAuthClient
} from '../src/services/googleAuthService.js';
import { authenticateToken } from '../src/middleware/authMiddleware.js';

let mongoServer;
const TEST_CLIENT_ID = 'test-client-id-aegis.apps.googleusercontent.com';
const WRONG_CLIENT_ID = 'wrong-client-id.apps.googleusercontent.com';

function createMockReqRes({ body = {}, headers = {}, user = null } = {}) {
  const req = {
    body,
    headers: { ...headers },
    user,
    ip: '127.0.0.1'
  };

  const res = {
    statusCode: 200,
    headers: {},
    data: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.data = payload;
      return this;
    }
  };

  return { req, res };
}

test.before(async () => {
  process.env.NODE_ENV = 'test';
  process.env.GOOGLE_CLIENT_ID = TEST_CLIENT_ID;
  process.env.JWT_SECRET = 'aegis_test_jwt_secret_key_1234567890';
  process.env.JWT_EXPIRES_IN = '1h';

  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

test.after(async () => {
  setOAuthClient(null);
  await mongoose.disconnect();
  if (mongoServer) {
    await mongoServer.stop();
  }
});

// ==============================================================================
// 1. VALID GOOGLE TOKEN VERIFICATION
// ==============================================================================

test('1. Valid Google Token: Cryptographically verified and returns identity claims', async () => {
  const mockPayload = {
    iss: 'https://accounts.google.com',
    aud: TEST_CLIENT_ID,
    sub: 'google_sub_1001',
    email: 'valid.governance.lead@example.com',
    name: 'Elena Rostova',
    picture: 'https://lh3.googleusercontent.com/a/photo123',
    email_verified: true,
    exp: Math.floor(Date.now() / 1000) + 3600
  };

  setOAuthClient({
    verifyIdToken: async ({ idToken, audience }) => {
      assert.equal(audience, TEST_CLIENT_ID);
      assert.equal(idToken, 'valid_google_token_123');
      return {
        getPayload: () => mockPayload
      };
    }
  });

  const claims = await verifyGoogleIdToken('valid_google_token_123');
  assert.equal(claims.googleId, 'google_sub_1001');
  assert.equal(claims.email, 'valid.governance.lead@example.com');
  assert.equal(claims.name, 'Elena Rostova');
  assert.equal(claims.avatar, 'https://lh3.googleusercontent.com/a/photo123');
  assert.equal(claims.emailVerified, true);
});

// ==============================================================================
// 2. INVALID GOOGLE TOKEN REJECTION
// ==============================================================================

test('2. Invalid Google Token: Rejects invalid signature or malformed token with 401', async () => {
  setOAuthClient({
    verifyIdToken: async () => {
      throw new Error('Invalid token signature / token has been tampered with');
    }
  });

  const { req, res } = createMockReqRes({
    body: { credential: 'corrupted_or_forged_token' }
  });

  await googleAuth(req, res);
  assert.equal(res.statusCode, 401);
  assert.equal(res.data.success, false);
  assert.match(res.data.error, /Google token verification failed/i);
});

// ==============================================================================
// 3. WRONG GOOGLE AUDIENCE / CLIENT ID REJECTION
// ==============================================================================

test('3. Wrong Google Audience: Rejects token issued for another client ID with 401', async () => {
  const mismatchedPayload = {
    iss: 'https://accounts.google.com',
    aud: WRONG_CLIENT_ID,
    sub: 'google_sub_attacker',
    email: 'attacker@evil.com',
    exp: Math.floor(Date.now() / 1000) + 3600
  };

  setOAuthClient({
    verifyIdToken: async () => {
      return {
        getPayload: () => mismatchedPayload
      };
    }
  });

  const { req, res } = createMockReqRes({
    body: { credential: 'token_for_wrong_audience' }
  });

  await googleAuth(req, res);
  assert.equal(res.statusCode, 401);
  assert.equal(res.data.success, false);
  assert.match(res.data.error, /audience mismatch/i);
});

// ==============================================================================
// 4. EXPIRED GOOGLE TOKEN REJECTION
// ==============================================================================

test('4. Expired Token: Rejects expired Google ID token with 401', async () => {
  const expiredPayload = {
    iss: 'https://accounts.google.com',
    aud: TEST_CLIENT_ID,
    sub: 'google_sub_expired',
    email: 'expired.user@example.com',
    exp: Math.floor(Date.now() / 1000) - 60 // expired 60 seconds ago
  };

  setOAuthClient({
    verifyIdToken: async () => {
      return {
        getPayload: () => expiredPayload
      };
    }
  });

  const { req, res } = createMockReqRes({
    body: { credential: 'expired_google_token' }
  });

  await googleAuth(req, res);
  assert.equal(res.statusCode, 401);
  assert.equal(res.data.success, false);
  assert.match(res.data.error, /expired/i);
});

// ==============================================================================
// 5. NEW GOOGLE USER CREATION
// ==============================================================================

test('5. New Google User Creation: Creates user with default GOVERNANCE_OFFICER + PENDING and returns 201', async () => {
  const newUserPayload = {
    iss: 'https://accounts.google.com',
    aud: TEST_CLIENT_ID,
    sub: 'google_sub_brand_new_2001',
    email: 'new.engineer@aegis-test.com',
    name: 'New Engineer',
    picture: 'https://lh3.googleusercontent.com/a/new_pic',
    exp: Math.floor(Date.now() / 1000) + 3600
  };

  setOAuthClient({
    verifyIdToken: async () => ({ getPayload: () => newUserPayload })
  });

  const { req, res } = createMockReqRes({
    body: { credential: 'valid_new_user_token' }
  });

  await googleAuth(req, res);
  assert.equal(res.statusCode, 201);
  assert.equal(res.data.success, true);
  assert.ok(res.data.token, 'Must return signed Aegis JWT token');
  assert.equal(res.data.user.email, 'new.engineer@aegis-test.com');
  assert.equal(res.data.user.role, 'GOVERNANCE_OFFICER', 'New user role must default to GOVERNANCE_OFFICER');
  assert.equal(res.data.user.status, 'ACTIVE', 'New user status must default to ACTIVE');
  assert.equal(res.data.user.verificationStatus, 'PENDING', 'New user verificationStatus must default to PENDING');

  // Verify in MongoDB
  const savedUser = await User.findOne({ googleId: 'google_sub_brand_new_2001' });
  assert.ok(savedUser, 'User must exist in database');
  assert.equal(savedUser.email, 'new.engineer@aegis-test.com');
  assert.equal(savedUser.role, 'GOVERNANCE_OFFICER');
  assert.equal(savedUser.status, 'ACTIVE');
  assert.equal(savedUser.verificationStatus, 'PENDING');
  assert.ok(savedUser.createdAt instanceof Date);
  assert.ok(savedUser.updatedAt instanceof Date);
});

// ==============================================================================
// 6. EXISTING GOOGLE USER LOGIN
// ==============================================================================

test('6. Existing Google User Login: Authenticates existing user with HTTP 200 without duplication', async () => {
  // Setup pre-existing approved ML_LEAD in database
  const existingUser = await User.create({
    googleId: 'google_sub_existing_3001',
    email: 'existing.lead@aegis-test.com',
    name: 'Existing Lead',
    role: 'ML_LEAD',
    status: 'ACTIVE',
    title: 'Lead ML Engineer'
  });

  const loginPayload = {
    iss: 'https://accounts.google.com',
    aud: TEST_CLIENT_ID,
    sub: 'google_sub_existing_3001',
    email: 'existing.lead@aegis-test.com',
    name: 'Existing Lead',
    picture: 'https://lh3.googleusercontent.com/a/updated_avatar',
    exp: Math.floor(Date.now() / 1000) + 3600
  };

  setOAuthClient({
    verifyIdToken: async () => ({ getPayload: () => loginPayload })
  });

  const { req, res } = createMockReqRes({
    body: { credential: 'valid_existing_token' }
  });

  await googleAuth(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.data.success, true);
  assert.equal(res.data.user.id.toString(), existingUser._id.toString());
  assert.equal(res.data.user.role, 'ML_LEAD', 'Preserves established ML_LEAD governance role');
  assert.equal(res.data.user.status, 'ACTIVE');

  // Check lastLoginAt updated
  const reloaded = await User.findById(existingUser._id);
  assert.ok(reloaded.lastLoginAt instanceof Date);
  assert.equal(reloaded.avatar, 'https://lh3.googleusercontent.com/a/updated_avatar');
});

// ==============================================================================
// 7. DUPLICATE GOOGLE ACCOUNT PREVENTION
// ==============================================================================

test('7. Duplicate Account Prevention: Does NOT create duplicate user when same account logs in again', async () => {
  const countBefore = await User.countDocuments();

  const userPayload = {
    iss: 'https://accounts.google.com',
    aud: TEST_CLIENT_ID,
    sub: 'google_sub_existing_3001',
    email: 'existing.lead@aegis-test.com',
    exp: Math.floor(Date.now() / 1000) + 3600
  };

  setOAuthClient({
    verifyIdToken: async () => ({ getPayload: () => userPayload })
  });

  const { req, res } = createMockReqRes({
    body: { credential: 'repeat_token' }
  });

  await googleAuth(req, res);
  assert.equal(res.statusCode, 200);

  const countAfter = await User.countDocuments();
  assert.equal(countAfter, countBefore, 'Database user count must remain unchanged');
});

// ==============================================================================
// 8. AEGIS ROLE REMAINS SERVER-CONTROLLED
// ==============================================================================

test('8. Aegis Role Separation: Client-supplied role and status parameters are completely ignored', async () => {
  const forgedPayload = {
    iss: 'https://accounts.google.com',
    aud: TEST_CLIENT_ID,
    sub: 'google_sub_injection_4001',
    email: 'injected.role@aegis-test.com',
    name: 'Role Injector',
    exp: Math.floor(Date.now() / 1000) + 3600
  };

  setOAuthClient({
    verifyIdToken: async () => ({ getPayload: () => forgedPayload })
  });

  // Attacker sends role: 'PLATFORM_ADMIN' and status: 'ACTIVE' in request body
  const { req, res } = createMockReqRes({
    body: {
      credential: 'valid_token_attacker',
      role: 'PLATFORM_ADMIN',
      status: 'ACTIVE'
    }
  });

  await googleAuth(req, res);
  assert.equal(res.statusCode, 201);
  assert.equal(res.data.user.role, 'GOVERNANCE_OFFICER', 'Server must enforce default GOVERNANCE_OFFICER role');
  assert.equal(res.data.user.status, 'ACTIVE', 'Server must enforce default ACTIVE status');
  assert.equal(res.data.user.verificationStatus, 'PENDING', 'Server must enforce default PENDING verificationStatus');

  const inDb = await User.findOne({ googleId: 'google_sub_injection_4001' });
  assert.equal(inDb.role, 'GOVERNANCE_OFFICER', 'Role in MongoDB must not be elevated');
  assert.equal(inDb.status, 'ACTIVE', 'Status in MongoDB must not be elevated');
  assert.equal(inDb.verificationStatus, 'PENDING', 'VerificationStatus in MongoDB must not be elevated');
});

// ==============================================================================
// 9. UNAUTHENTICATED API REQUEST REJECTION
// ==============================================================================

test('9. Unauthenticated API Request: Rejection with 401 when no token or invalid token provided', async () => {
  // Case A: Missing Authorization header
  {
    const { req, res } = createMockReqRes({ headers: {} });
    let nextCalled = false;
    await authenticateToken(req, res, () => { nextCalled = true; });
    assert.equal(res.statusCode, 401);
    assert.equal(res.data.success, false);
    assert.match(res.data.error, /No Bearer token provided/i);
    assert.equal(nextCalled, false);
  }

  // Case B: Invalid / tampered Bearer token
  {
    const { req, res } = createMockReqRes({
      headers: { authorization: 'Bearer completely_bogus_token' }
    });
    let nextCalled = false;
    await authenticateToken(req, res, () => { nextCalled = true; });
    assert.equal(res.statusCode, 401);
    assert.equal(res.data.success, false);
    assert.match(res.data.error, /Invalid authentication token/i);
    assert.equal(nextCalled, false);
  }
});

// ==============================================================================
// 10. AUTHENTICATED API REQUEST ACCEPTANCE
// ==============================================================================

test('10. Authenticated API Request Acceptance: Accepts valid Aegis Bearer token and attaches req.user', async () => {
  // Create an active governance officer in MongoDB
  const officer = await User.create({
    googleId: 'google_sub_officer_5001',
    email: 'governance.officer@aegis-test.com',
    name: 'Marcus Vance',
    role: 'GOVERNANCE_OFFICER',
    status: 'ACTIVE',
    title: 'Governance Officer'
  });

  // Generate valid Aegis JWT
  const token = generateAegisToken(officer);
  assert.ok(token);

  // Authenticate middleware
  const { req, res } = createMockReqRes({
    headers: { authorization: `Bearer ${token}` }
  });

  let nextCalled = false;
  await authenticateToken(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, true, 'Middleware must call next() for valid Aegis token');
  assert.ok(req.user, 'req.user must be attached');
  assert.equal(req.user._id.toString(), officer._id.toString());
  assert.equal(req.user.role, 'GOVERNANCE_OFFICER');

  // Verify /api/auth/me controller
  const meRes = createMockReqRes().res;
  await getCurrentUser(req, meRes);
  assert.equal(meRes.statusCode, 200);
  assert.equal(meRes.data.success, true);
  assert.equal(meRes.data.user.email, 'governance.officer@aegis-test.com');
  assert.equal(meRes.data.user.role, 'GOVERNANCE_OFFICER');
});
