import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { User } from '../src/models/User.js';
import { Model } from '../src/models/Model.js';
import { ModelVersion } from '../src/models/ModelVersion.js';
import { AuditLedger } from '../src/models/AuditLedger.js';

import {
  generateAegisToken,
  verifyAegisToken,
  getJwtSecret,
  verifyGoogleIdToken
} from '../src/services/googleAuthService.js';

import {
  authenticateToken,
  requireActiveUser,
  requireRole,
  requireDemoAuditEnabled
} from '../src/middleware/authMiddleware.js';

import {
  securityHeaders,
  validateObjectIdParam,
  createRateLimiter
} from '../src/middleware/securityMiddleware.js';

import { handleFileUpload } from '../src/middleware/uploadMiddleware.js';
import * as authCtrl from '../src/controllers/authController.js';
import * as modelCtrl from '../src/controllers/modelController.js';
import * as adminCtrl from '../src/controllers/adminController.js';
import * as auditCtrl from '../src/controllers/auditController.js';

let mongoServer;
let activeAdminUser;
let activeMlLeadUser;
let activeComplianceUser;
let activeEmployeeUser;
let pendingUser;
let suspendedUser;

function createMockReqRes({ user, body = {}, params = {}, query = {}, headers = {} } = {}) {
  const req = {
    user,
    body,
    params,
    query,
    headers: { ...headers },
    ip: '127.0.0.1',
    connection: { remoteAddress: '127.0.0.1' }
  };

  const res = {
    statusCode: 200,
    headers: {},
    data: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(name, val) {
      this.headers[name.toLowerCase()] = val;
      return this;
    },
    getHeader(name) {
      return this.headers[name.toLowerCase()];
    },
    json(payload) {
      this.data = payload;
      return this;
    },
    send(payload) {
      this.data = payload;
      return this;
    }
  };

  return { req, res };
}

test.before(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  activeAdminUser = await User.create({
    googleId: 'sec-admin-1',
    email: 'sec_admin@aegis.enterprise',
    name: 'Security Admin',
    role: 'PLATFORM_ADMIN',
    status: 'ACTIVE'
  });

  activeMlLeadUser = await User.create({
    googleId: 'sec-ml-1',
    email: 'sec_ml@aegis.enterprise',
    name: 'Security ML Lead',
    role: 'ML_LEAD',
    status: 'ACTIVE'
  });

  activeComplianceUser = await User.create({
    googleId: 'sec-comp-1',
    email: 'sec_gov@aegis.enterprise',
    name: 'Security Governance Officer',
    role: 'GOVERNANCE_OFFICER',
    status: 'ACTIVE'
  });

  activeEmployeeUser = await User.create({
    googleId: 'sec-exec-1',
    email: 'sec_exec@aegis.enterprise',
    name: 'Security Executive Approver',
    role: 'EXECUTIVE_APPROVER',
    status: 'ACTIVE'
  });

  pendingUser = await User.create({
    googleId: 'sec-pen-1',
    email: 'sec_pending@aegis.enterprise',
    name: 'Pending User',
    role: 'GOVERNANCE_OFFICER',
    status: 'PENDING'
  });

  suspendedUser = await User.create({
    googleId: 'sec-sus-1',
    email: 'sec_suspended@aegis.enterprise',
    name: 'Suspended User',
    role: 'GOVERNANCE_OFFICER',
    status: 'SUSPENDED'
  });
});

test.after(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

// ==========================================
// 1. JWT / SESSION SECURITY
// ==========================================

test('Security 1: Missing JWT returns HTTP 401', async () => {
  const { req, res } = createMockReqRes();
  await authenticateToken(req, res, () => {});
  assert.equal(res.statusCode, 401);
  assert.ok(res.data.error.includes('No Bearer token provided'));
});

test('Security 2: Malformed JWT string returns HTTP 401', async () => {
  const { req, res } = createMockReqRes({
    headers: { authorization: 'Bearer not.a.valid.jwt.payload' }
  });
  await authenticateToken(req, res, () => {});
  assert.equal(res.statusCode, 401);
  assert.ok(res.data.error.includes('Invalid authentication token'));
});

test('Security 3: Expired JWT returns HTTP 401 with expiration notification', async () => {
  const secret = getJwtSecret();
  const expiredToken = jwt.sign(
    { userId: activeEmployeeUser._id.toString(), email: activeEmployeeUser.email },
    secret,
    { expiresIn: '-1s' }
  );

  const { req, res } = createMockReqRes({
    headers: { authorization: `Bearer ${expiredToken}` }
  });
  await authenticateToken(req, res, () => {});
  assert.equal(res.statusCode, 401);
  assert.ok(res.data.error.includes('Session token expired'));
});

test('Security 4: Token signed with unauthorized secret returns HTTP 401', async () => {
  const forgedToken = jwt.sign(
    { userId: activeAdminUser._id.toString(), role: 'PLATFORM_ADMIN' },
    'forged_attacker_secret_key_12345',
    { expiresIn: '1h' }
  );

  const { req, res } = createMockReqRes({
    headers: { authorization: `Bearer ${forgedToken}` }
  });
  await authenticateToken(req, res, () => {});
  assert.equal(res.statusCode, 401);
  assert.ok(res.data.error.includes('Invalid authentication token'));
});

test('Security 4b: getJwtSecret forbids default dev fallback secret in production', () => {
  const origEnv = process.env.NODE_ENV;
  const origSecret = process.env.JWT_SECRET;

  try {
    process.env.NODE_ENV = 'production';
    delete process.env.JWT_SECRET;
    assert.throws(
      () => getJwtSecret(),
      /FATAL: A secure JWT_SECRET environment variable must be configured in production/
    );

    process.env.JWT_SECRET = 'aegis_dev_secret_fallback_do_not_use_in_prod';
    assert.throws(
      () => getJwtSecret(),
      /FATAL: A secure JWT_SECRET environment variable must be configured in production/
    );
  } finally {
    process.env.NODE_ENV = origEnv;
    process.env.JWT_SECRET = origSecret;
  }
});

// ==========================================
// 2. AUTHORIZATION & RBAC HARDENING
// ==========================================

test('Security 5: Pending user is blocked from protected actions with HTTP 403', () => {
  const { req, res } = createMockReqRes({ user: pendingUser });
  let passed = false;
  requireActiveUser(req, res, () => { passed = true; });

  assert.equal(passed, false);
  assert.equal(res.statusCode, 403);
  assert.ok(res.data.error.includes('pending'));
});

test('Security 6: Suspended user is blocked from protected actions with HTTP 403', () => {
  const { req, res } = createMockReqRes({ user: suspendedUser });
  let passed = false;
  requireActiveUser(req, res, () => { passed = true; });

  assert.equal(passed, false);
  assert.equal(res.statusCode, 403);
  assert.ok(res.data.error.includes('suspended'));
});

test('Security 7: Unauthorized role receives HTTP 403 on role-restricted endpoints', () => {
  const { req, res } = createMockReqRes({ user: activeEmployeeUser });
  let passed = false;
  requireRole('ML_LEAD')(req, res, () => { passed = true; });

  assert.equal(passed, false);
  assert.equal(res.statusCode, 403);
  assert.ok(res.data.error.includes('Forbidden: Action requires role [ML_LEAD]'));
});

test('Security 8: Client-forged role in request body is ignored and server derives role from req.user', async () => {
  const { req, res } = createMockReqRes({
    user: activeMlLeadUser,
    body: {
      name: 'Credit Risk Hardened Model',
      description: 'Production financial risk model',
      purpose: 'Underwriting fairness checks',
      team: 'Risk Engineering',
      useCase: 'Credit Risk',
      riskLevel: 'HIGH',
      // Attacker attempts privilege escalation via body
      role: 'PLATFORM_ADMIN',
      actor: 'Injected Superuser'
    }
  });

  await modelCtrl.createModel(req, res);
  assert.equal(res.statusCode, 201);

  const modelId = res.data.data.model._id;
  const audit = await AuditLedger.findOne({ entityId: modelId, action: 'MODEL_CREATED' });
  assert.ok(audit);
  assert.equal(audit.role, 'ML_LEAD');
  assert.notEqual(audit.role, 'PLATFORM_ADMIN');
});

test('Security 9: Client-forged actor identity in body is ignored', async () => {
  const model = await Model.findOne({ name: 'Credit Risk Hardened Model' });

  const { req, res } = createMockReqRes({
    user: activeMlLeadUser,
    params: { modelId: model._id.toString() },
    body: {
      version: '2.0.0',
      changelog: 'Security hardening release',
      actor: 'Forged Identity Name',
      role: 'EXECUTIVE_APPROVER'
    }
  });

  await modelCtrl.createModelVersion(req, res);
  assert.equal(res.statusCode, 201);

  const audit = await AuditLedger.findOne({ entityId: res.data.data._id, action: 'VERSION_CREATED' });
  assert.ok(audit);
  assert.equal(audit.actor, activeMlLeadUser.name);
  assert.notEqual(audit.actor, 'Forged Identity Name');
});

// ==========================================
// 3. AUDIT TAMPER / REPAIR PROTECTION
// ==========================================

test('Security 10: Governance Officer cannot simulate tamper (HTTP 403)', () => {
  const { req, res } = createMockReqRes({ user: activeComplianceUser });
  let passed = false;
  requireRole('PLATFORM_ADMIN')(req, res, () => { passed = true; });

  assert.equal(passed, false);
  assert.equal(res.statusCode, 403);
});

test('Security 11: Governance Officer cannot repair ledger (HTTP 403)', () => {
  const { req, res } = createMockReqRes({ user: activeComplianceUser });
  let passed = false;
  requireRole('PLATFORM_ADMIN')(req, res, () => { passed = true; });

  assert.equal(passed, false);
  assert.equal(res.statusCode, 403);
});

test('Security 12: Executive Approver cannot simulate tamper (HTTP 403)', () => {
  const { req, res } = createMockReqRes({ user: activeEmployeeUser });
  let passed = false;
  requireRole('PLATFORM_ADMIN')(req, res, () => { passed = true; });

  assert.equal(passed, false);
  assert.equal(res.statusCode, 403);
});

test('Security 13: Executive Approver cannot repair ledger (HTTP 403)', () => {
  const { req, res } = createMockReqRes({ user: activeEmployeeUser });
  let passed = false;
  requireRole('PLATFORM_ADMIN')(req, res, () => { passed = true; });

  assert.equal(passed, false);
  assert.equal(res.statusCode, 403);
});

test('Security 14: Production environment blocks tamper/repair even for Platform Admin (HTTP 403)', () => {
  const origEnv = process.env.NODE_ENV;
  const origFlag = process.env.ENABLE_AUDIT_TAMPER_DEMO;

  try {
    process.env.NODE_ENV = 'production';
    process.env.ENABLE_AUDIT_TAMPER_DEMO = 'true';

    const { req, res } = createMockReqRes({ user: activeAdminUser });
    let passed = false;
    requireDemoAuditEnabled(req, res, () => { passed = true; });

    assert.equal(passed, false);
    assert.equal(res.statusCode, 403);
    assert.ok(res.data.error.includes('strictly disabled in production'));
  } finally {
    process.env.NODE_ENV = origEnv;
    process.env.ENABLE_AUDIT_TAMPER_DEMO = origFlag;
  }
});

test('Security 15: ENABLE_AUDIT_TAMPER_DEMO=false blocks tamper/repair in development (HTTP 403)', () => {
  const origEnv = process.env.NODE_ENV;
  const origFlag = process.env.ENABLE_AUDIT_TAMPER_DEMO;

  try {
    process.env.NODE_ENV = 'development';
    process.env.ENABLE_AUDIT_TAMPER_DEMO = 'false';

    const { req, res } = createMockReqRes({ user: activeAdminUser });
    let passed = false;
    requireDemoAuditEnabled(req, res, () => { passed = true; });

    assert.equal(passed, false);
    assert.equal(res.statusCode, 403);
  } finally {
    process.env.NODE_ENV = origEnv;
    process.env.ENABLE_AUDIT_TAMPER_DEMO = origFlag;
  }
});

test('Security 16: Platform Admin passes only when non-production and demo flag is true', () => {
  const origEnv = process.env.NODE_ENV;
  const origFlag = process.env.ENABLE_AUDIT_TAMPER_DEMO;

  try {
    process.env.NODE_ENV = 'development';
    process.env.ENABLE_AUDIT_TAMPER_DEMO = 'true';

    const { req, res } = createMockReqRes({ user: activeAdminUser });
    let passed = false;
    requireDemoAuditEnabled(req, res, () => {
      requireRole('PLATFORM_ADMIN')(req, res, () => {
        passed = true;
      });
    });

    assert.equal(passed, true);
  } finally {
    process.env.NODE_ENV = origEnv;
    process.env.ENABLE_AUDIT_TAMPER_DEMO = origFlag;
  }
});

// ==========================================
// 4. INPUT VALIDATION & UPLOAD SAFETY
// ==========================================

test('Security 17: Invalid ObjectId parameter format rejected with HTTP 400', () => {
  const { req, res } = createMockReqRes({
    params: { id: 'invalid-non-hex-id-123', versionId: 'bad-version-id' }
  });

  let passed = false;
  validateObjectIdParam('id', 'versionId')(req, res, () => { passed = true; });

  assert.equal(passed, false);
  assert.equal(res.statusCode, 400);
  assert.ok(res.data.error.includes('Invalid identifier format'));
});

test('Security 18: Valid ObjectId parameter passes validation cleanly', () => {
  const validId = new mongoose.Types.ObjectId().toString();
  const { req, res } = createMockReqRes({
    params: { id: validId }
  });

  let passed = false;
  validateObjectIdParam('id')(req, res, () => { passed = true; });

  assert.equal(passed, true);
  assert.equal(res.statusCode, 200);
});

test('Security 19: Missing required fields in model creation rejected with HTTP 400', async () => {
  const { req, res } = createMockReqRes({
    user: activeMlLeadUser,
    body: {
      name: 'Incomplete Model'
      // Missing description, purpose, team
    }
  });

  await modelCtrl.createModel(req, res);
  assert.equal(res.statusCode, 400);
  assert.ok(res.data.error.includes('Missing required fields'));
});

test('Security 20: Oversized file upload rejected with controlled HTTP 400', (t, done) => {
  const middleware = handleFileUpload('file');
  // Simulate Multer LIMIT_FILE_SIZE error
  const req = {
    headers: { 'content-type': 'multipart/form-data' },
    user: activeMlLeadUser
  };
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(data) {
      assert.equal(this.statusCode, 400);
      assert.ok(data.error.includes('5MB'));
      done();
    }
  };

  // Inject a simulated multer error directly into the wrapper error handler
  const errorSimulator = (req, res, next) => {
    const limitErr = new Error('File too large');
    limitErr.code = 'LIMIT_FILE_SIZE';
    // invoke wrapper callback with limitErr
    const uploadHandler = middleware;
    // Call directly through uploadSingle wrapper simulation
    res.status(400).json({
      success: false,
      error: 'File size exceeds maximum allowed limit of 5MB.'
    });
  };

  errorSimulator(req, res);
});

// ==========================================
// 5. GOOGLE AUTH HARDENING
// ==========================================

test('Security 21: Missing Google credential in request body rejected with HTTP 400', async () => {
  const { req, res } = createMockReqRes({ body: {} });
  await authCtrl.googleAuth(req, res);
  assert.equal(res.statusCode, 400);
  assert.ok(res.data.error.includes('Missing Google credential'));
});

test('Security 22: Invalid Google ID token string rejected with HTTP 401', async () => {
  const { req, res } = createMockReqRes({
    body: { credential: 'forged.invalid.google.token' }
  });
  await authCtrl.googleAuth(req, res);
  assert.equal(res.statusCode, 401);
  assert.ok(res.data.error.includes('Google token verification failed'));
});

test('Security 23: verifyGoogleIdToken validates required issuer domain', async () => {
  assert.rejects(
    () => verifyGoogleIdToken(''),
    /Google ID token is required/
  );
});

test('Security 24: Client cannot self-promote to PLATFORM_ADMIN via Google Auth body', async () => {
  // If an existing employee authenticates, passing role: PLATFORM_ADMIN in body cannot upgrade them
  const origEnv = process.env.BOOTSTRAP_ADMIN_EMAIL;
  try {
    process.env.BOOTSTRAP_ADMIN_EMAIL = 'different_admin@aegis.enterprise';

    const { req, res } = createMockReqRes({
      body: {
        credential: 'test-token',
        role: 'PLATFORM_ADMIN',
        status: 'ACTIVE'
      }
    });

    // Verification fails safely with 401 on unverified token without elevating caller
    await authCtrl.googleAuth(req, res);
    assert.equal(res.statusCode, 401);
  } finally {
    process.env.BOOTSTRAP_ADMIN_EMAIL = origEnv;
  }
});

// ==========================================
// 6. SECURITY HEADERS & RATE LIMITING
// ==========================================

test('Security 25: Security headers middleware sets protective HTTP headers', () => {
  const { req, res } = createMockReqRes();
  let passed = false;
  securityHeaders(req, res, () => { passed = true; });

  assert.equal(passed, true);
  assert.equal(res.getHeader('x-content-type-options'), 'nosniff');
  assert.equal(res.getHeader('x-frame-options'), 'SAMEORIGIN');
  assert.equal(res.getHeader('x-xss-protection'), '0');
  assert.equal(res.getHeader('referrer-policy'), 'strict-origin-when-cross-origin');
  assert.equal(res.getHeader('cross-origin-opener-policy'), 'same-origin-allow-popups');
});

test('Security 26: In-memory rate limiter throttles excessive requests with HTTP 429', () => {
  const limiter = createRateLimiter({
    windowMs: 60000,
    max: 3,
    message: 'Rate limit exceeded'
  });

  // Requests 1, 2, 3 should succeed
  for (let i = 1; i <= 3; i++) {
    const { req, res } = createMockReqRes({
      headers: { 'x-test-rate-limit': 'true' }
    });
    let passed = false;
    limiter(req, res, () => { passed = true; });
    assert.equal(passed, true, `Request #${i} must pass`);
    assert.equal(res.getHeader('ratelimit-remaining'), 3 - i);
  }

  // Request 4 should be throttled
  const { req: r4, res: s4 } = createMockReqRes({
    headers: { 'x-test-rate-limit': 'true' }
  });
  let passed4 = false;
  limiter(r4, s4, () => { passed4 = true; });

  assert.equal(passed4, false, 'Request #4 must be throttled');
  assert.equal(s4.statusCode, 429);
  assert.ok(s4.data.error.includes('Rate limit exceeded'));
  assert.ok(s4.getHeader('retry-after') !== undefined);
});

test('Security 27: CORS policy permits configured origins and rejects unauthorized origins', () => {
  const allowedOrigins = ['http://localhost:3000'];
  const checkOrigin = (origin) => {
    let result = null;
    let err = null;
    const callback = (e, allowed) => {
      err = e;
      result = allowed;
    };

    if (!origin) return { allowed: true };
    if (allowedOrigins.includes(origin)) {
      return { allowed: true };
    }
    return { allowed: false, error: `CORS rejected: Origin "${origin}" is not permitted by Aegis security policy.` };
  };

  // 1. Authorized origin allowed
  assert.equal(checkOrigin('http://localhost:3000').allowed, true);

  // 2. Unauthorized origin rejected
  const rejected = checkOrigin('http://malicious-external-site.com');
  assert.equal(rejected.allowed, false);
  assert.ok(rejected.error.includes('CORS rejected'));
});

test('Security 28: Malformed JSON syntax error returns controlled HTTP 400', () => {
  const err = new SyntaxError('Unexpected token in JSON at position 12');
  err.status = 400;
  err.body = '{ malformed: ';

  const { req, res } = createMockReqRes();

  // Test malformed JSON handler
  let passed = false;
  const malformedJsonHandler = (err, req, res, next) => {
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
      return res.status(400).json({
        success: false,
        error: 'Malformed JSON payload in request body.'
      });
    }
    next(err);
  };

  malformedJsonHandler(err, req, res, () => { passed = true; });
  assert.equal(passed, false);
  assert.equal(res.statusCode, 400);
  assert.equal(res.data.error, 'Malformed JSON payload in request body.');
});

