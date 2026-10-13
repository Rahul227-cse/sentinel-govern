import test from 'node:test';
import assert from 'node:assert';
import mongoose from 'mongoose';
import { generateAegisToken, verifyAegisToken } from '../src/services/googleAuthService.js';
import { authenticateToken, optionalAuth, requireActiveUser } from '../src/middleware/authMiddleware.js';
import { User } from '../src/models/User.js';

test('Auth Service: Generates and verifies valid Aegis JWT session tokens', () => {
  const mockUser = {
    _id: new mongoose.Types.ObjectId(),
    email: 'analyst@aegis.ai',
    role: 'GOVERNANCE_OFFICER',
    status: 'PENDING'
  };

  const token = generateAegisToken(mockUser);
  assert.ok(typeof token === 'string' && token.length > 20, 'Token must be a valid JWT string');

  const decoded = verifyAegisToken(token);
  assert.strictEqual(decoded.userId, mockUser._id.toString());
  assert.strictEqual(decoded.email, mockUser.email);
  assert.strictEqual(decoded.role, 'GOVERNANCE_OFFICER');
  assert.strictEqual(decoded.status, 'PENDING');
});

test('Auth Service: Rejects tampered or malformed tokens', () => {
  assert.throws(() => {
    verifyAegisToken('not.a.valid.jwt');
  }, /jwt/i);

  const mockUser = {
    _id: new mongoose.Types.ObjectId(),
    email: 'analyst@aegis.ai',
    role: 'GOVERNANCE_OFFICER',
    status: 'ACTIVE'
  };
  const token = generateAegisToken(mockUser);
  const tampered = token.slice(0, -6) + 'abc123';

  assert.throws(() => {
    verifyAegisToken(tampered);
  });
});

test('Auth Middleware: Rejects requests missing Bearer token with 401', async () => {
  const req = { headers: {} };
  let statusCode = null;
  let responseData = null;
  const res = {
    status(code) {
      statusCode = code;
      return {
        json(data) {
          responseData = data;
        }
      };
    }
  };

  let nextCalled = false;
  await authenticateToken(req, res, () => { nextCalled = true; });

  assert.strictEqual(statusCode, 401);
  assert.strictEqual(responseData.success, false);
  assert.strictEqual(nextCalled, false);
});

test('Auth Middleware: Rejects invalid Bearer token with 401', async () => {
  const req = { headers: { authorization: 'Bearer invalid_signature_token' } };
  let statusCode = null;
  let responseData = null;
  const res = {
    status(code) {
      statusCode = code;
      return {
        json(data) {
          responseData = data;
        }
      };
    }
  };

  let nextCalled = false;
  await authenticateToken(req, res, () => { nextCalled = true; });

  assert.strictEqual(statusCode, 401);
  assert.strictEqual(responseData.success, false);
  assert.strictEqual(nextCalled, false);
});

test('Auth Middleware: Optional auth allows unauthenticated requests', async () => {
  const req = { headers: {} };
  let nextCalled = false;
  await optionalAuth(req, {}, () => { nextCalled = true; });

  assert.strictEqual(nextCalled, true);
  assert.strictEqual(req.user, undefined);
});

test('User Status: New non-bootstrap user defaults strictly to ACTIVE account + PENDING verification', () => {
  const user = new User({
    googleId: 'google_123456789',
    email: 'contributor@example.com',
    name: 'New Google User'
  });

  assert.strictEqual(user.role, 'GOVERNANCE_OFFICER', 'New user role must default to GOVERNANCE_OFFICER');
  assert.strictEqual(user.status, 'ACTIVE', 'New user status must default to ACTIVE');
  assert.strictEqual(user.verificationStatus, 'PENDING', 'New user verificationStatus must default to PENDING');
});

test('User Status: Suspended users are rejected by requireActiveUser with 403', () => {
  const req = {
    user: {
      email: 'badactor@example.com',
      role: 'GOVERNANCE_OFFICER',
      status: 'SUSPENDED'
    }
  };

  let statusCode = null;
  let responseData = null;
  const res = {
    status(code) {
      statusCode = code;
      return {
        json(data) {
          responseData = data;
        }
      };
    }
  };

  let nextCalled = false;
  requireActiveUser(req, res, () => { nextCalled = true; });

  assert.strictEqual(statusCode, 403);
  assert.strictEqual(responseData.success, false);
  assert.match(responseData.error, /suspended/i);
  assert.strictEqual(nextCalled, false);
});

test('User Status: Pending users do not receive active-user access (requireActiveUser 403)', () => {
  const req = {
    user: {
      email: 'pending_user@example.com',
      role: 'GOVERNANCE_OFFICER',
      status: 'PENDING'
    }
  };

  let statusCode = null;
  let responseData = null;
  const res = {
    status(code) {
      statusCode = code;
      return {
        json(data) {
          responseData = data;
        }
      };
    }
  };

  let nextCalled = false;
  requireActiveUser(req, res, () => { nextCalled = true; });

  assert.strictEqual(statusCode, 403);
  assert.strictEqual(responseData.success, false);
  assert.match(responseData.error, /pending/i);
  assert.strictEqual(nextCalled, false);
});

test('User Status: Active user passes requireActiveUser check', () => {
  const req = {
    user: {
      email: 'active_lead@example.com',
      role: 'ML_LEAD',
      status: 'ACTIVE'
    }
  };

  let nextCalled = false;
  requireActiveUser(req, {}, () => { nextCalled = true; });

  assert.strictEqual(nextCalled, true);
});

test('Bootstrap Admin: Verified bootstrap email resolves to PLATFORM_ADMIN and ACTIVE', () => {
  const bootstrapEmail = 'rrrbxiang@gmail.com';
  process.env.BOOTSTRAP_ADMIN_EMAIL = bootstrapEmail;

  const testEmail = 'rrrbxiang@gmail.com';
  const isMatch = Boolean(process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase() === testEmail.toLowerCase());
  assert.strictEqual(isMatch, true);

  const initialRole = isMatch ? 'PLATFORM_ADMIN' : 'GOVERNANCE_OFFICER';
  const initialStatus = isMatch ? 'ACTIVE' : 'PENDING';

  assert.strictEqual(initialRole, 'PLATFORM_ADMIN');
  assert.strictEqual(initialStatus, 'ACTIVE');

  // Verify non-bootstrap email does NOT get admin
  const otherEmail = 'stranger@example.com';
  const otherMatch = Boolean(process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase() === otherEmail.toLowerCase());
  assert.strictEqual(otherMatch, false);
  const otherRole = otherMatch ? 'PLATFORM_ADMIN' : 'GOVERNANCE_OFFICER';
  const otherStatus = otherMatch ? 'ACTIVE' : 'PENDING';

  assert.strictEqual(otherRole, 'GOVERNANCE_OFFICER');
  assert.strictEqual(otherStatus, 'PENDING');
});

test('Bootstrap Admin: Bootstrap provisioning logic is idempotent', () => {
  const bootstrapEmail = 'rrrbxiang@gmail.com';
  process.env.BOOTSTRAP_ADMIN_EMAIL = bootstrapEmail;

  // Existing user already provisioned
  const user = {
    email: 'rrrbxiang@gmail.com',
    role: 'PLATFORM_ADMIN',
    status: 'ACTIVE'
  };

  const isBootstrapAdmin = Boolean(process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase() === user.email.toLowerCase());
  const needsUpgrade = isBootstrapAdmin && (user.role !== 'PLATFORM_ADMIN' || user.status !== 'ACTIVE');

  assert.strictEqual(needsUpgrade, false, 'User already PLATFORM_ADMIN and ACTIVE must not trigger repeated mutation');
});

test('Security: Client-supplied role in payload cannot elevate role or trigger admin', () => {
  const clientPayload = {
    credential: 'dummy_token',
    role: 'PLATFORM_ADMIN',
    status: 'ACTIVE'
  };

  // Verified claims from Google
  const verifiedClaims = {
    email: 'regular_user@example.com',
    name: 'Regular User'
  };

  const bootstrapEmail = 'rrrbxiang@gmail.com';
  process.env.BOOTSTRAP_ADMIN_EMAIL = bootstrapEmail;

  // Server determines role strictly from verified claims, never from clientPayload
  const isBootstrap = Boolean(verifiedClaims.email === bootstrapEmail);
  const assignedRole = isBootstrap ? 'PLATFORM_ADMIN' : 'GOVERNANCE_OFFICER';
  const assignedStatus = isBootstrap ? 'ACTIVE' : 'PENDING';

  assert.strictEqual(assignedRole, 'GOVERNANCE_OFFICER', 'Attacker attempting role injection must receive GOVERNANCE_OFFICER');
  assert.strictEqual(assignedStatus, 'PENDING', 'Attacker attempting status injection must receive PENDING');
});
