import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { Model } from '../src/models/Model.js';
import { ModelVersion } from '../src/models/ModelVersion.js';
import { User } from '../src/models/User.js';
import { Policy } from '../src/models/Policy.js';
import { AuditLedger } from '../src/models/AuditLedger.js';
import { Approval } from '../src/models/Approval.js';
import { 
  createModel, 
  createModelVersion, 
  transitionLifecycle,
  getModelById 
} from '../src/controllers/modelController.js';
import { submitApprovalDecision } from '../src/controllers/approvalController.js';
import { createPolicy } from '../src/controllers/policyController.js';
import { 
  requireRole, 
  requireActiveUser, 
  requireApprovalSignoffRole 
} from '../src/middleware/authMiddleware.js';

let mongoServer;
let mlLeadUser;
let platformAdminUser;
let employeeUser;
let pendingUser;
let suspendedUser;

test.before(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  mlLeadUser = await User.create({
    email: 'ml_lead@aegis.ai',
    name: 'Dr. Sarah Connor',
    role: 'ML_LEAD',
    status: 'ACTIVE'
  });

  platformAdminUser = await User.create({
    email: 'admin@aegis.ai',
    name: 'Platform Administrator',
    role: 'PLATFORM_ADMIN',
    status: 'ACTIVE'
  });

  employeeUser = await User.create({
    email: 'governance@aegis.ai',
    name: 'John Governance',
    role: 'GOVERNANCE_OFFICER',
    status: 'ACTIVE'
  });

  pendingUser = await User.create({
    email: 'pending@aegis.ai',
    name: 'Pending User',
    role: 'ML_LEAD',
    status: 'PENDING'
  });

  suspendedUser = await User.create({
    email: 'suspended@aegis.ai',
    name: 'Suspended Lead',
    role: 'ML_LEAD',
    status: 'SUSPENDED'
  });
});

test.after(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

function mockResponse() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    }
  };
  return res;
}

// 1. Authenticated ML_LEAD can create a model
test('Model Governance: Authenticated ML_LEAD can create a model with ownership and audit record', async () => {
  const req = {
    user: mlLeadUser,
    body: {
      name: 'Credit Scorer Alpha',
      description: 'Underwriting AI system for retail lending',
      purpose: 'Loan decisioning automation',
      owner: 'Dr. Sarah Connor',
      team: 'Risk Engineering',
      modelType: 'CLASSIFICATION',
      riskLevel: 'HIGH',
      initialVersion: 'v1.0'
    }
  };
  const res = mockResponse();

  await createModel(req, res);

  assert.strictEqual(res.statusCode, 201);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.data.model.name, 'Credit Scorer Alpha');
  assert.strictEqual(res.body.data.model.createdBy.toString(), mlLeadUser._id.toString());
  assert.strictEqual(res.body.data.version.createdBy.toString(), mlLeadUser._id.toString());

  // Verify audit record was created with authenticated ML_LEAD identity
  const audit = await AuditLedger.findOne({
    entityId: res.body.data.model._id,
    action: 'MODEL_CREATED'
  });
  assert.ok(audit, 'Audit record for MODEL_CREATED must exist');
  assert.strictEqual(audit.actor, mlLeadUser.name);
  assert.strictEqual(audit.role, 'ML_LEAD');
});

// 2. PLATFORM_ADMIN cannot create a model
test('Model Governance: PLATFORM_ADMIN is blocked from creating a model by requireRole', async () => {
  const middleware = requireRole('ML_LEAD');
  const req = { user: platformAdminUser };
  const res = mockResponse();
  let nextCalled = false;

  middleware(req, res, () => { nextCalled = true; });

  assert.strictEqual(nextCalled, false);
  assert.strictEqual(res.statusCode, 403);
  assert.match(res.body.error, /forbidden.*ML_LEAD/i);
});

// 3. Non-ML_LEAD cannot create a model
test('Model Governance: Non-ML_LEAD is blocked from creating a model by requireRole', async () => {
  const middleware = requireRole('ML_LEAD');
  const req = { user: employeeUser };
  const res = mockResponse();
  let nextCalled = false;

  middleware(req, res, () => { nextCalled = true; });

  assert.strictEqual(nextCalled, false);
  assert.strictEqual(res.statusCode, 403);
  assert.match(res.body.error, /forbidden.*ML_LEAD/i);
});

// 4. ML_LEAD can create a version
test('Model Governance: ML_LEAD can create a version associated with parent model', async () => {
  const model = await Model.create({
    name: 'Fraud Detection Engine',
    description: 'Real-time transaction fraud scorer',
    purpose: 'Fraud mitigation',
    owner: mlLeadUser.name,
    team: 'Risk Engineering',
    createdBy: mlLeadUser._id
  });

  const req = {
    user: mlLeadUser,
    params: { modelId: model._id.toString() },
    body: {
      version: 'v2.0',
      changelog: 'Added XGBoost tree ensemble with synthetic re-balancing'
    }
  };
  const res = mockResponse();

  await createModelVersion(req, res);

  assert.strictEqual(res.statusCode, 201);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.data.version, 'v2.0');
  assert.strictEqual(res.body.data.modelId.toString(), model._id.toString());
  assert.strictEqual(res.body.data.createdBy.toString(), mlLeadUser._id.toString());

  // Verify audit event
  const audit = await AuditLedger.findOne({
    entityId: res.body.data._id,
    action: 'VERSION_CREATED'
  });
  assert.ok(audit, 'Audit record for VERSION_CREATED must exist');
  assert.strictEqual(audit.actor, mlLeadUser.name);
  assert.strictEqual(audit.role, 'ML_LEAD');
});

// 5. Unauthorized role cannot create a version
test('Model Governance: Unauthorized role cannot create a version', async () => {
  const middleware = requireRole('ML_LEAD');
  const req = { user: platformAdminUser };
  const res = mockResponse();
  let nextCalled = false;

  middleware(req, res, () => { nextCalled = true; });

  assert.strictEqual(nextCalled, false);
  assert.strictEqual(res.statusCode, 403);
});

// 6. Unauthorized lifecycle transition remains rejected
test('Model Governance: Unauthorized lifecycle transition is rejected by role and gate rules', async () => {
  // Role check
  const middleware = requireRole('ML_LEAD');
  const unauthorizedReq = { user: employeeUser };
  const res = mockResponse();
  let nextCalled = false;

  middleware(unauthorizedReq, res, () => { nextCalled = true; });
  assert.strictEqual(nextCalled, false);
  assert.strictEqual(res.statusCode, 403);

  // Lifecycle gate check: Skipping directly to APPROVED
  const model = await Model.create({
    name: 'Gate Test Model',
    description: 'Testing lifecycle gate constraints',
    purpose: 'Testing',
    owner: 'Tester',
    team: 'QA'
  });
  const version = await ModelVersion.create({
    modelId: model._id,
    version: 'v1.0',
    lifecycleStatus: 'DRAFT'
  });

  const transitionReq = {
    user: mlLeadUser,
    params: { versionId: version._id.toString() },
    body: { targetStatus: 'APPROVED' }
  };
  const transitionRes = mockResponse();

  await transitionLifecycle(transitionReq, transitionRes);

  assert.strictEqual(transitionRes.statusCode, 400);
  assert.strictEqual(transitionRes.body.gateBlocked, true);
  assert.match(transitionRes.body.error, /Cannot approve model directly from DRAFT/);
});

// 7. Inactive/pending/suspended users cannot mutate governance
test('Model Governance: Pending and suspended users cannot mutate governance (requireActiveUser 403)', async () => {
  // Pending user
  const pendingReq = { user: pendingUser };
  const pendingRes = mockResponse();
  let pendingNext = false;
  requireActiveUser(pendingReq, pendingRes, () => { pendingNext = true; });
  assert.strictEqual(pendingNext, false);
  assert.strictEqual(pendingRes.statusCode, 403);
  assert.match(pendingRes.body.error, /pending.*review/i);

  // Suspended user
  const suspendedReq = { user: suspendedUser };
  const suspendedRes = mockResponse();
  let suspendedNext = false;
  requireActiveUser(suspendedReq, suspendedRes, () => { suspendedNext = true; });
  assert.strictEqual(suspendedNext, false);
  assert.strictEqual(suspendedRes.statusCode, 403);
  assert.match(suspendedRes.body.error, /suspended/i);
});

// 8. PLATFORM_ADMIN cannot bypass stakeholder approval
test('Model Governance: PLATFORM_ADMIN cannot bypass stakeholder approval or sign for ML_LEAD', async () => {
  const req = {
    user: platformAdminUser,
    body: {
      role: 'ML_LEAD',
      approverName: 'Platform Administrator',
      decision: 'APPROVED'
    }
  };
  const res = mockResponse();
  let nextCalled = false;

  requireApprovalSignoffRole(req, res, () => { nextCalled = true; });

  assert.strictEqual(nextCalled, false);
  assert.strictEqual(res.statusCode, 403);
  assert.match(res.body.error, /impersonation is blocked/i);
});

// 9. PLATFORM_ADMIN cannot receive model approval authority or be configured as a policy approver
test('Model Governance: PLATFORM_ADMIN cannot receive model approval authority or be configured as a policy approver', async () => {
  const model = await Model.create({
    name: 'Admin Governance Restriction Model',
    description: 'Verifies platform admin signoff restrictions',
    purpose: 'Infrastructure automation',
    owner: 'Admin Team',
    team: 'Platform Ops',
    riskLevel: 'HIGH'
  });

  const version = await ModelVersion.create({
    modelId: model._id,
    version: 'v1.0',
    lifecycleStatus: 'PENDING_APPROVAL',
    policyStatus: 'PASSED'
  });

  // Attempting to configure policy with PLATFORM_ADMIN as required approver must fail schema validation
  await assert.rejects(
    async () => {
      await Policy.create({
        name: 'Invalid Platform Admin Policy',
        description: 'Policy attempting to give admin signoff authority',
        targetRiskLevel: 'HIGH',
        requiredApprovers: ['PLATFORM_ADMIN'],
        isActive: true
      });
    },
    /PLATFORM_ADMIN/i
  );

  const req = {
    user: platformAdminUser,
    params: { versionId: version._id.toString() },
    body: {
      role: 'PLATFORM_ADMIN',
      decision: 'APPROVED',
      comment: 'Infrastructure readiness confirmed'
    }
  };
  const res = mockResponse();

  await submitApprovalDecision(req, res);

  assert.strictEqual(res.statusCode, 403);
  assert.strictEqual(res.body.success, false);
  assert.match(res.body.error, /Platform Admin accounts do not possess model approval or sign-off authority/i);
});

// 10. Authenticated actor identity is recorded correctly (ignores forged client payload)
test('Model Governance: Authenticated actor identity is authoritative over forged payload', async () => {
  const model = await Model.create({
    name: 'Forged Identity Defense Test',
    description: 'Ensures client cannot spoof creator/actor',
    purpose: 'Security verification',
    owner: 'Legitimate Owner',
    team: 'Core ML'
  });

  const req = {
    user: mlLeadUser, // Authenticated as Dr. Sarah Connor
    params: { modelId: model._id.toString() },
    body: {
      version: 'v3.0',
      actor: 'Malicious Attacker Spoof', // Forged payload
      role: 'EXECUTIVE_APPROVER'           // Forged role
    }
  };
  const res = mockResponse();

  await createModelVersion(req, res);

  assert.strictEqual(res.statusCode, 201);
  assert.strictEqual(res.body.data.createdBy.toString(), mlLeadUser._id.toString());

  // Check audit ledger recorded genuine authenticated user
  const audit = await AuditLedger.findOne({
    entityId: res.body.data._id,
    action: 'VERSION_CREATED'
  });
  assert.ok(audit);
  assert.strictEqual(audit.actor, mlLeadUser.name);
  assert.strictEqual(audit.role, 'ML_LEAD');
});

// 11. Governance mutation creates an audit record
test('Model Governance: Policy creation creates cryptographic audit record with authenticated actor', async () => {
  const govUser = await User.create({
    email: 'gov_officer@aegis.ai',
    name: 'Marcus Vance',
    role: 'GOVERNANCE_OFFICER',
    status: 'ACTIVE'
  });

  const req = {
    user: govUser,
    body: {
      name: 'EU AI Act High-Risk Standard',
      description: 'Comprehensive compliance gates for Annex III systems',
      targetRiskLevel: 'HIGH',
      requiredApprovers: ['ML_LEAD', 'GOVERNANCE_OFFICER', 'EXECUTIVE_APPROVER']
    }
  };
  const res = mockResponse();

  await createPolicy(req, res);

  assert.strictEqual(res.statusCode, 201);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.data.createdBy.toString(), govUser._id.toString());

  const audit = await AuditLedger.findOne({
    entityId: res.body.data._id,
    action: 'POLICY_CREATED'
  });
  assert.ok(audit, 'Audit record for POLICY_CREATED must exist');
  assert.strictEqual(audit.actor, govUser.name);
  assert.strictEqual(audit.role, 'GOVERNANCE_OFFICER');
  assert.ok(audit.currentHash && audit.currentHash.length === 64, 'Must have SHA-256 hash');
});

// 12. Model details query populates createdBy information
test('Model Governance: getModelById populates createdBy and version createdBy', async () => {
  const model = await Model.create({
    name: 'Population Query Model',
    description: 'Verifying populate for createdBy',
    purpose: 'Metadata audit',
    owner: mlLeadUser.name,
    team: 'Risk',
    createdBy: mlLeadUser._id
  });

  await ModelVersion.create({
    modelId: model._id,
    version: 'v1.0',
    lifecycleStatus: 'DRAFT',
    createdBy: mlLeadUser._id
  });

  const req = { params: { id: model._id.toString() } };
  const res = mockResponse();

  await getModelById(req, res);

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.data.model.createdBy.email, mlLeadUser.email);
  assert.strictEqual(res.body.data.versions[0].createdBy.email, mlLeadUser.email);
});
