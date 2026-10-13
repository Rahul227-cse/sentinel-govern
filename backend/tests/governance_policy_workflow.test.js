import test from 'node:test';
import assert from 'node:assert';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { User } from '../src/models/User.js';
import { Policy } from '../src/models/Policy.js';
import { Model } from '../src/models/Model.js';
import { ModelVersion } from '../src/models/ModelVersion.js';
import { Evaluation } from '../src/models/Evaluation.js';
import * as policyCtrl from '../src/controllers/policyController.js';
import * as modelCtrl from '../src/controllers/modelController.js';
import * as approvalCtrl from '../src/controllers/approvalController.js';

let mongoServer;
let govOfficerUser;
let mlLeadUser;
let execApproverUser;
let platformAdminUser;
let fraudModel;
let fraudVersion;
let fraudEval;

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

test.before(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  govOfficerUser = await User.create({
    name: 'Sarah Governance',
    email: 'sarah.gov@sentinel.internal',
    role: 'GOVERNANCE_OFFICER',
    status: 'ACTIVE',
    verificationStatus: 'VERIFIED'
  });

  mlLeadUser = await User.create({
    name: 'Alex Lead',
    email: 'alex.lead@sentinel.internal',
    role: 'ML_LEAD',
    status: 'ACTIVE',
    verificationStatus: 'VERIFIED'
  });

  execApproverUser = await User.create({
    name: 'Elena Executive',
    email: 'elena.exec@sentinel.internal',
    role: 'EXECUTIVE_APPROVER',
    status: 'ACTIVE',
    verificationStatus: 'VERIFIED'
  });

  platformAdminUser = await User.create({
    name: 'Admin Infrastructure',
    email: 'admin.infra@sentinel.internal',
    role: 'PLATFORM_ADMIN',
    status: 'ACTIVE',
    verificationStatus: 'VERIFIED'
  });

  // Registered fraud model
  fraudModel = await Model.create({
    name: 'Real-Time Fraud Detection & Anomaly Intelligence Platform',
    description: 'Autonomous financial transaction fraud scoring engine with real-time inference',
    purpose: 'Real-time anti-fraud surveillance and risk tier classification',
    owner: 'Dr. Jane Smith',
    team: 'Risk & Fraud Engineering',
    riskLevel: 'HIGH',
    createdBy: mlLeadUser._id
  });

  fraudVersion = await ModelVersion.create({
    modelId: fraudModel._id,
    version: 'v1.0.0',
    changelog: 'Initial production fraud risk classifier release',
    lifecycleStatus: 'DRAFT',
    createdBy: mlLeadUser._id
  });

  fraudEval = await Evaluation.create({
    modelId: fraudModel._id,
    versionId: fraudVersion._id,
    datasetName: 'Fraud Benchmark 2026-Q1',
    sampleCount: 15000,
    dataSource: 'FILE_UPLOAD',
    performanceMetrics: {
      accuracy: 0.94,
      rocAuc: 0.92,
      precision: 0.89,
      recall: 0.87,
      f1: 0.88
    },
    fairnessMetrics: {
      fairnessEvaluated: true,
      disparateImpactRatio: 0.88,
      demographicParityDiff: 0.06,
      protectedAttribute: 'gender'
    },
    evaluatedBy: 'Automated Test Harness',
    evaluatedAt: new Date()
  });

  fraudVersion.latestEvaluationId = fraudEval._id;
  await fraudVersion.save();
});

test.after(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

// ============================================================================
// TASK 2: Role Restrictions & Separation of Duties
// ============================================================================

test('Role Enforcement 1: Policy creation rejects PLATFORM_ADMIN as requiredApprover with HTTP 400', async () => {
  const req = {
    user: govOfficerUser,
    body: {
      name: 'Admin Approver Policy',
      description: 'Attempting to assign Platform Admin signoff authority',
      targetRiskLevel: 'HIGH',
      requiredApprovers: ['PLATFORM_ADMIN', 'ML_LEAD'],
      rules: {
        minDisparateImpact: 0.80,
        minRocAuc: 0.85
      }
    }
  };
  const res = mockResponse();

  await policyCtrl.createPolicy(req, res);

  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.body.success, false);
  assert.match(res.body.error, /Platform Admin cannot receive model approval or sign-off authority/i);
});

test('Role Enforcement 2: Policy creation rejects arbitrary / unknown roles in requiredApprovers', async () => {
  const req = {
    user: govOfficerUser,
    body: {
      name: 'Arbitrary Role Policy',
      description: 'Attempting invalid role',
      targetRiskLevel: 'HIGH',
      requiredApprovers: ['UNAUTHORIZED_ROLE'],
      rules: {
        minDisparateImpact: 0.80
      }
    }
  };
  const res = mockResponse();

  await policyCtrl.createPolicy(req, res);

  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.body.success, false);
  assert.match(res.body.error, /Invalid model approver role/i);
});

test('Role Enforcement 3: Policy creation rejects empty requiredApprovers array', async () => {
  const req = {
    user: govOfficerUser,
    body: {
      name: 'No Approver Policy',
      description: 'Attempting empty approvers',
      targetRiskLevel: 'HIGH',
      requiredApprovers: [],
      rules: {
        minDisparateImpact: 0.80
      }
    }
  };
  const res = mockResponse();

  await policyCtrl.createPolicy(req, res);

  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.body.success, false);
  assert.match(res.body.error, /Policy must specify at least one required model sign-off role/i);
});

test('Role Enforcement 4: PLATFORM_ADMIN submission of model approval is blocked with HTTP 403 Forbidden', async () => {
  // Setup: Version with policyStatus PASSED
  const testVersion = await ModelVersion.create({
    modelId: fraudModel._id,
    version: 'v1.0.1',
    lifecycleStatus: 'PENDING_APPROVAL',
    policyStatus: 'PASSED'
  });

  const req = {
    user: platformAdminUser,
    params: { versionId: testVersion._id.toString() },
    body: {
      role: 'PLATFORM_ADMIN',
      decision: 'APPROVED',
      comment: 'Platform admin attempting model signoff'
    }
  };
  const res = mockResponse();

  await approvalCtrl.submitApprovalDecision(req, res);

  assert.strictEqual(res.statusCode, 403);
  assert.strictEqual(res.body.success, false);
  assert.match(res.body.error, /Platform Admin accounts do not possess model approval or sign-off authority/i);
});

// ============================================================================
// TASK 3: Drift Threshold Validation
// ============================================================================

test('Drift Threshold 1: Policy creation rejects negative maxPsiThreshold with HTTP 400', async () => {
  const req = {
    user: govOfficerUser,
    body: {
      name: 'Negative Drift Policy',
      description: 'Attempting negative drift threshold',
      targetRiskLevel: 'HIGH',
      requiredApprovers: ['ML_LEAD', 'GOVERNANCE_OFFICER'],
      rules: {
        minDisparateImpact: 0.80,
        maxPsiThreshold: -0.25
      }
    }
  };
  const res = mockResponse();

  await policyCtrl.createPolicy(req, res);

  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.body.success, false);
  assert.match(res.body.error, /Invalid drift threshold: maxPsiThreshold must be a positive numeric value/i);
});

test('Drift Threshold 2: Policy creation rejects non-numeric maxPsiThreshold with HTTP 400', async () => {
  const req = {
    user: govOfficerUser,
    body: {
      name: 'NaN Drift Policy',
      description: 'Attempting invalid string drift threshold',
      targetRiskLevel: 'HIGH',
      requiredApprovers: ['ML_LEAD', 'GOVERNANCE_OFFICER'],
      rules: {
        minDisparateImpact: 0.80,
        maxPsiThreshold: 'not-a-number'
      }
    }
  };
  const res = mockResponse();

  await policyCtrl.createPolicy(req, res);

  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.body.success, false);
  assert.match(res.body.error, /Invalid drift threshold: maxPsiThreshold must be a positive numeric value/i);
});

test('Drift Threshold 3: Policy creation rejects zero maxPsiThreshold with HTTP 400', async () => {
  const req = {
    user: govOfficerUser,
    body: {
      name: 'Zero Drift Policy',
      description: 'Attempting zero drift threshold',
      targetRiskLevel: 'HIGH',
      requiredApprovers: ['ML_LEAD', 'GOVERNANCE_OFFICER'],
      rules: {
        minDisparateImpact: 0.80,
        maxPsiThreshold: 0
      }
    }
  };
  const res = mockResponse();

  await policyCtrl.createPolicy(req, res);

  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.body.success, false);
  assert.match(res.body.error, /Invalid drift threshold: maxPsiThreshold must be a positive numeric value/i);
});

test('Drift Threshold 4: Policy creation succeeds with clean gate rules (omitting PSI entirely)', async () => {
  const req = {
    user: govOfficerUser,
    body: {
      name: 'Clean Statistical Governance Policy',
      description: 'Standard policy without misleading PSI fields',
      targetRiskLevel: 'HIGH',
      requiredApprovers: ['ML_LEAD', 'GOVERNANCE_OFFICER', 'EXECUTIVE_APPROVER'],
      rules: {
        minDisparateImpact: 0.80,
        maxDemographicParityDiff: 0.10,
        minRocAuc: 0.85,
        minAccuracy: 0.80
      }
    }
  };
  const res = mockResponse();

  await policyCtrl.createPolicy(req, res);

  assert.strictEqual(res.statusCode, 201);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.data.name, 'Clean Statistical Governance Policy');
  assert.strictEqual(res.body.data.rules.minDisparateImpact, 0.80);
  assert.strictEqual(res.body.data.rules.minAccuracy, 0.80);
});

// ============================================================================
// TASK 4: Policy Creation, Model Selection & Bidirectional Assignment
// ============================================================================

let createdFraudPolicy;

test('Policy Assignment 1: Governance Officer creates policy with fraud model selected under Applicable Models', async () => {
  const req = {
    user: govOfficerUser,
    body: {
      name: 'Fraud Detection High-Risk Governance Policy',
      description: 'Institutional stage-gate thresholds for transaction-level fraud risk models',
      targetRiskLevel: 'HIGH',
      applicableModelIds: [fraudModel._id.toString()],
      requiredApprovers: ['ML_LEAD', 'GOVERNANCE_OFFICER', 'EXECUTIVE_APPROVER'],
      failureAction: 'BLOCK_PROMOTION',
      rules: {
        minDisparateImpact: 0.80,
        maxDemographicParityDiff: 0.10,
        minRocAuc: 0.85,
        minAccuracy: 0.80
      }
    }
  };
  const res = mockResponse();

  await policyCtrl.createPolicy(req, res);

  assert.strictEqual(res.statusCode, 201);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.data.name, 'Fraud Detection High-Risk Governance Policy');
  assert.strictEqual(res.body.data.applicableModels.length, 1);
  assert.strictEqual(String(res.body.data.applicableModels[0]._id), String(fraudModel._id));
  assert.strictEqual(res.body.data.applicableModels[0].name, fraudModel.name);

  createdFraudPolicy = await Policy.findById(res.body.data._id);
  assert.ok(createdFraudPolicy);
  assert.strictEqual(createdFraudPolicy.applicableModelIds.length, 1);
  assert.strictEqual(String(createdFraudPolicy.applicableModelIds[0]), String(fraudModel._id));

  // Verify Model.policyId was updated to point to new policy
  const refreshedModel = await Model.findById(fraudModel._id);
  assert.strictEqual(String(refreshedModel.policyId), String(createdFraudPolicy._id));
});

test('Policy Assignment 2: Model details endpoint returns assigned policy as activePolicy', async () => {
  const req = { params: { id: fraudModel._id.toString() } };
  const res = mockResponse();

  await modelCtrl.getModelById(req, res);

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.success, true);
  assert.ok(res.body.data.activePolicy);
  assert.strictEqual(String(res.body.data.activePolicy._id), String(createdFraudPolicy._id));
  assert.strictEqual(res.body.data.activePolicy.name, 'Fraud Detection High-Risk Governance Policy');
});

test('Policy Assignment 3: Gate check on fraud model version evaluates against assigned policy', async () => {
  const req = {
    user: govOfficerUser,
    params: { versionId: fraudVersion._id.toString() }
  };
  const res = mockResponse();

  await policyCtrl.evaluateGateCheck(req, res);

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.data.overallDecision, 'PASSED');
  assert.strictEqual(res.body.data.policyName, 'Fraud Detection High-Risk Governance Policy');
  assert.strictEqual(res.body.data.gateBreakdown.fairnessGate.status, 'PASSED');
  assert.strictEqual(res.body.data.gateBreakdown.performanceGate.status, 'PASSED');
  assert.deepStrictEqual(res.body.data.requiredApprovers, ['ML_LEAD', 'GOVERNANCE_OFFICER', 'EXECUTIVE_APPROVER']);
});

test('Policy Assignment 4: Policy update correctly updates model scope and unassigns removed models', async () => {
  const secondaryModel = await Model.create({
    name: 'Secondary Fraud Model',
    description: 'Auxiliary fraud model',
    purpose: 'Card fraud scoring',
    owner: 'Alex Lead',
    team: 'Risk Engineering',
    riskLevel: 'HIGH',
    createdBy: mlLeadUser._id
  });

  // Update policy to apply to secondaryModel instead of fraudModel
  const req = {
    user: govOfficerUser,
    params: { id: createdFraudPolicy._id.toString() },
    body: {
      name: 'Fraud Detection High-Risk Governance Policy (Updated Scope)',
      applicableModelIds: [secondaryModel._id.toString()]
    }
  };
  const res = mockResponse();

  await policyCtrl.updatePolicy(req, res);

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.data.applicableModels.length, 1);
  assert.strictEqual(String(res.body.data.applicableModels[0]._id), String(secondaryModel._id));

  // secondaryModel should now have policyId assigned
  const updatedSecondary = await Model.findById(secondaryModel._id);
  assert.strictEqual(String(updatedSecondary.policyId), String(createdFraudPolicy._id));

  // fraudModel should have policyId removed
  const updatedFraud = await Model.findById(fraudModel._id);
  assert.strictEqual(updatedFraud.policyId, null);

  // Restore assignment to fraudModel for subsequent consistency
  await modelCtrl.updateModelPolicy({
    user: govOfficerUser,
    params: { id: fraudModel._id.toString() },
    body: { policyId: createdFraudPolicy._id.toString() }
  }, mockResponse());
});
