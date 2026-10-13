import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { User } from '../src/models/User.js';
import { AuditLedger } from '../src/models/AuditLedger.js';
import { 
  nativeSignup, 
  nativeLogin, 
  logout, 
  completeOnboarding, 
  getCurrentUser 
} from '../src/controllers/authController.js';
import { 
  getUsers, 
  verifyUser, 
  blockUser, 
  unblockUser,
  updateUserRole 
} from '../src/controllers/adminController.js';
import { 
  authenticateToken, 
  requireActiveUser, 
  requireVerifiedUser, 
  requireRole 
} from '../src/middleware/authMiddleware.js';
import { generateAegisToken } from '../src/services/googleAuthService.js';

let mongoServer;

function mockRes() {
  const res = {
    _statusCode: 200,
    _json: null,
    _cookies: {},
    _clearedCookies: {},
    status(code) { this._statusCode = code; return this; },
    json(data) { this._json = data; return this; },
    cookie(name, val, opts) { this._cookies[name] = { val, opts }; },
    clearCookie(name, opts) { this._clearedCookies[name] = opts; }
  };
  return res;
}

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

test('A & I: New native signup creates an ACTIVE user with PENDING verification', async () => {
  const req = {
    body: {
      name: 'Alex Rivera',
      email: 'alex.rivera@example.com',
      password: 'StrongPassword123!'
    },
    headers: { 'user-agent': 'Mozilla/5.0 TestBrowser' },
    ip: '127.0.0.1'
  };
  const res = mockRes();

  await nativeSignup(req, res);

  assert.equal(res._statusCode, 201);
  assert.equal(res._json.success, true);
  assert.equal(res._json.user.email, 'alex.rivera@example.com');
  assert.equal(res._json.user.status, 'ACTIVE');
  assert.equal(res._json.user.verificationStatus, 'PENDING');
  assert.equal(res._json.user.presence, 'ACTIVE');
  assert.equal(res._json.user.onboardingCompleted, false);

  const dbUser = await User.findOne({ email: 'alex.rivera@example.com' });
  assert.ok(dbUser);
  assert.equal(dbUser.status, 'ACTIVE');
  assert.equal(dbUser.verificationStatus, 'PENDING');
  assert.equal(dbUser.presence, 'ACTIVE');
  assert.equal(dbUser.loginHistory.length, 1);
  assert.equal(dbUser.loginHistory[0].authProvider, 'EMAIL');
});

test('D: Onboarding rejects arbitrary / invalid roles with 400', async () => {
  const user = await User.findOne({ email: 'alex.rivera@example.com' });
  const req = {
    user: { id: user._id.toString(), email: user.email },
    body: {
      role: 'SUPER_GOD_ADMIN', // Invalid role
      department: 'AI / ML',
      team: 'AI Platform'
    }
  };
  const res = mockRes();

  await completeOnboarding(req, res);

  assert.equal(res._statusCode, 400);
  assert.match(res._json.error, /invalid role/i);
});

test('D2: Direct API submission of PLATFORM_ADMIN cannot self-promote (rejected with 403)', async () => {
  const user = await User.findOne({ email: 'alex.rivera@example.com' });
  const req = {
    user: { id: user._id.toString(), email: user.email },
    body: {
      role: 'PLATFORM_ADMIN',
      department: 'AI / ML',
      team: 'AI Platform'
    }
  };
  const res = mockRes();

  await completeOnboarding(req, res);

  assert.equal(res._statusCode, 403);
  assert.match(res._json.error, /cannot be selected during onboarding/i);
  
  // Verify role was not changed in DB
  const dbUser = await User.findById(user._id);
  assert.notEqual(dbUser.role, 'PLATFORM_ADMIN');
});

test('C, E, F, G, H: User completes onboarding with valid role, department, team and team lead', async () => {
  const user = await User.findOne({ email: 'alex.rivera@example.com' });
  const req = {
    user: { id: user._id.toString(), email: user.email },
    body: {
      role: 'ML_LEAD',
      department: 'AI / ML',
      team: 'AI Platform',
      teamLead: 'Dr. Sarah Connor'
    }
  };
  const res = mockRes();

  await completeOnboarding(req, res);

  assert.equal(res._statusCode, 200);
  assert.equal(res._json.success, true);
  assert.equal(res._json.user.role, 'ML_LEAD');
  assert.equal(res._json.user.department, 'AI / ML');
  assert.equal(res._json.user.team, 'AI Platform');
  assert.equal(res._json.user.teamLead, 'Dr. Sarah Connor');
  assert.equal(res._json.user.onboardingCompleted, true);

  // Persistence check in MongoDB
  const updatedDbUser = await User.findById(user._id);
  assert.equal(updatedDbUser.role, 'ML_LEAD');
  assert.equal(updatedDbUser.department, 'AI / ML');
  assert.equal(updatedDbUser.team, 'AI Platform');
  assert.equal(updatedDbUser.teamLead, 'Dr. Sarah Connor');
  assert.equal(updatedDbUser.onboardingCompleted, true);

  // Re-submission protection
  const res2 = mockRes();
  await completeOnboarding(req, res2);
  assert.equal(res2._statusCode, 400);
  assert.match(res2._json.error, /onboarding has already been completed/i);
});

test('J, K, L: Pending user can authenticate and perform allowed read operations', async () => {
  const user = await User.findOne({ email: 'alex.rivera@example.com' });
  
  // requireActiveUser passes for ACTIVE accounts
  const req = { user };
  const res = mockRes();
  let nextCalled = false;
  requireActiveUser(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.equal(res._statusCode, 200);
});

test('M: Pending user is blocked from protected governance mutations by requireVerifiedUser', async () => {
  const user = await User.findOne({ email: 'alex.rivera@example.com' });
  assert.equal(user.verificationStatus, 'PENDING');

  const req = { user };
  const res = mockRes();
  let nextCalled = false;

  requireVerifiedUser(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, false);
  assert.equal(res._statusCode, 403);
  assert.equal(res._json.code, 'VERIFICATION_PENDING');
  assert.match(res._json.error, /awaiting verification/i);
});

test('N, AH: Admin getUsers lists registered users with JSON payload', async () => {
  const req = {};
  const res = mockRes();

  await getUsers(req, res);

  assert.equal(res._statusCode, 200);
  assert.equal(res._json.success, true);
  assert.ok(Array.isArray(res._json.data));
  const alexCard = res._json.data.find(u => u.email === 'alex.rivera@example.com');
  assert.ok(alexCard);
  assert.equal(alexCard.role, 'ML_LEAD');
  assert.equal(alexCard.department, 'AI / ML');
  assert.equal(alexCard.team, 'AI Platform');
  assert.equal(alexCard.verificationStatus, 'PENDING');
  assert.equal(alexCard.presence, 'OFFLINE');
});

test('P, Q, R: Admin verifies user account and user becomes VERIFIED', async () => {
  const user = await User.findOne({ email: 'alex.rivera@example.com' });
  const adminReq = {
    user: { id: new mongoose.Types.ObjectId().toString(), email: 'admin@aegis.corp', role: 'PLATFORM_ADMIN' },
    params: { id: user._id.toString() }
  };
  const res = mockRes();

  await verifyUser(adminReq, res);

  assert.equal(res._statusCode, 200);
  assert.equal(res._json.success, true);
  assert.equal(res._json.user.verificationStatus, 'VERIFIED');
  assert.equal(res._json.user.verifiedBy, 'admin@aegis.corp');

  // Verify in DB
  const verifiedDbUser = await User.findById(user._id);
  assert.equal(verifiedDbUser.verificationStatus, 'VERIFIED');
  assert.ok(verifiedDbUser.verifiedAt);

  // Check AuditLedger
  const audit = await AuditLedger.findOne({ action: 'USER_VERIFIED', entityId: user._id.toString() });
  assert.ok(audit, 'USER_VERIFIED event must be recorded in AuditLedger');
  assert.equal(audit.actor, 'admin@aegis.corp');
});

test('S: Verified user is now permitted to execute protected governance mutations', async () => {
  const verifiedUser = await User.findOne({ email: 'alex.rivera@example.com' });
  assert.equal(verifiedUser.verificationStatus, 'VERIFIED');

  const req = { user: verifiedUser };
  const res = mockRes();
  let nextCalled = false;

  requireVerifiedUser(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, true, 'requireVerifiedUser must pass for verified users');
  assert.equal(res._statusCode, 200);
});

test('V: Logout changes presence to OFFLINE, NOT BLOCKED; loginHistory records logoutAt', async () => {
  const user = await User.findOne({ email: 'alex.rivera@example.com' });
  const req = {
    user: { id: user._id.toString(), email: user.email },
    cookies: {}
  };
  const res = mockRes();

  await logout(req, res);

  assert.equal(res._statusCode, 200);
  assert.equal(res._json.success, true);

  const dbUser = await User.findById(user._id);
  assert.equal(dbUser.presence, 'OFFLINE', 'Presence must be OFFLINE');
  assert.equal(dbUser.status, 'ACTIVE', 'Account status must remain ACTIVE');
  assert.equal(dbUser.verificationStatus, 'VERIFIED');
  assert.ok(dbUser.loginHistory.length >= 1);
  assert.ok(dbUser.loginHistory[dbUser.loginHistory.length - 1].logoutAt, 'logoutAt must be populated');
});

test('W, X, Y, Z, AA, AB: Re-login sets presence to ACTIVE and preserves login history', async () => {
  const req = {
    body: { email: 'alex.rivera@example.com', password: 'StrongPassword123!' },
    headers: { 'user-agent': 'Chrome/128' },
    ip: '192.168.1.50',
    cookies: {}
  };
  const res = mockRes();

  await nativeLogin(req, res);

  assert.equal(res._statusCode, 200);
  assert.equal(res._json.user.presence, 'ACTIVE');

  const dbUser = await User.findOne({ email: 'alex.rivera@example.com' });
  assert.equal(dbUser.presence, 'ACTIVE');
  assert.equal(dbUser.loginHistory.length, 2, 'Should have 2 session entries in history');
  assert.equal(dbUser.loginHistory[1].authProvider, 'EMAIL');
  assert.equal(dbUser.loginHistory[1].ip, '192.168.1.50');
  assert.equal(dbUser.loginHistory[1].logoutAt, null);
  assert.ok(dbUser.lastLoginAt);
});

test('T, U: Admin intentionally blocks/suspends account, stopping protected access', async () => {
  const user = await User.findOne({ email: 'alex.rivera@example.com' });
  const adminReq = {
    user: { id: new mongoose.Types.ObjectId().toString(), email: 'admin@aegis.corp', role: 'PLATFORM_ADMIN' },
    params: { id: user._id.toString() }
  };
  const res = mockRes();

  await blockUser(adminReq, res);

  assert.equal(res._statusCode, 200);
  assert.equal(res._json.user.status, 'SUSPENDED');
  assert.equal(res._json.user.presence, 'OFFLINE');

  const dbUser = await User.findById(user._id);
  assert.equal(dbUser.status, 'SUSPENDED');
  assert.equal(dbUser.presence, 'OFFLINE');

  // requireActiveUser must reject suspended users
  const req = { user: dbUser };
  const rejectRes = mockRes();
  let nextCalled = false;
  requireActiveUser(req, rejectRes, () => { nextCalled = true; });

  assert.equal(nextCalled, false);
  assert.equal(rejectRes._statusCode, 403);
  assert.match(rejectRes._json.error, /suspended/i);

  // Unblock account
  const unblockRes = mockRes();
  await unblockUser(adminReq, unblockRes);
  assert.equal(unblockRes._statusCode, 200);
  assert.equal(unblockRes._json.user.status, 'ACTIVE');

  const unblockedUser = await User.findById(user._id);
  assert.equal(unblockedUser.status, 'ACTIVE');
});
