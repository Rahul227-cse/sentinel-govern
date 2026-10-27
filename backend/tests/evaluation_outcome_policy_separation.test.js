import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { Model } from '../src/models/Model.js';
import { ModelVersion } from '../src/models/ModelVersion.js';
import { User } from '../src/models/User.js';
import { Policy } from '../src/models/Policy.js';
import { Evaluation } from '../src/models/Evaluation.js';
import { uploadEvaluation } from '../src/controllers/evaluationController.js';
import { transitionVersionLifecycle } from '../src/services/lifecycleService.js';
import { evaluateEvaluationOutcome } from '../src/services/policyEngine.js';

let mongoServer;
let mlLeadUser;

function createMockReqRes({ user, file, body = {}, params = {} }) {
  const req = {
    user,
    file,
    body,
    params,
    ip: '127.0.0.1'
  };

  const res = {
    statusCode: 200,
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

function createCsvBuffer(rows) {
  const csvContent = rows.map(r => r.join(',')).join('\n');
  return Buffer.from(csvContent, 'utf-8');
}

test.before(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  mlLeadUser = await User.create({
    email: 'alex_lead@sentinel.ai',
    name: 'Alex',
    role: 'ML_LEAD',
    status: 'ACTIVE'
  });
});

test.after(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

test('1. Successful metric calculation with NO assigned policy: evaluationStatus is EVALUATED_PASS, policyStatus is FAILED (blocked)', async () => {
  const modelNoPolicy = await Model.create({
    name: 'CreditLens Unpolicied',
    description: 'Credit scoring model without assigned governance policy',
    purpose: 'Assess consumer loan default risk',
    owner: 'Alex',
    team: 'Risk Analytics',
    riskLevel: 'HIGH',
    policyId: null,
    applicablePolicyIds: []
  });

  const versionNoPolicy = await ModelVersion.create({
    modelId: modelNoPolicy._id,
    version: 'v1.0',
    lifecycleStatus: 'DRAFT',
    evaluationStatus: 'NOT_EVALUATED',
    policyStatus: 'PENDING'
  });

  // Perfectly balanced 100% accurate dataset (matches CreditLens synthetic demo)
  const rows = [
    ['actual', 'predicted', 'probability', 'gender'],
    ...Array(6).fill([0, 0, 0.05, 'Male']),
    ...Array(4).fill([1, 1, 0.85, 'Male']),
    ...Array(6).fill([0, 0, 0.05, 'Female']),
    ...Array(4).fill([1, 1, 0.85, 'Female'])
  ];
  const buffer = createCsvBuffer(rows);
  const file = { buffer, originalname: 'creditlens_demo_synthetic.csv', mimetype: 'text/csv', size: buffer.length };

  const { req, res } = createMockReqRes({
    user: mlLeadUser,
    file,
    params: { versionId: versionNoPolicy._id.toString() },
    body: { protectedAttribute: 'gender', privilegedGroup: 'Male', unprivilegedGroup: 'Female' }
  });

  await uploadEvaluation(req, res);

  assert.strictEqual(res.statusCode, 201);
  assert.strictEqual(res.data.success, true);

  const updatedVersion = await ModelVersion.findById(versionNoPolicy._id);
  // Evaluation execution succeeded and measured results met evaluation criteria:
  assert.strictEqual(updatedVersion.evaluationStatus, 'EVALUATED_PASS');
  // Institutional policy compliance is BLOCKED due to missing policy:
  assert.strictEqual(updatedVersion.policyStatus, 'FAILED');
  assert.strictEqual(updatedVersion.latestPolicyEvaluation.overallDecision, 'BLOCKED');
  assert.strictEqual(updatedVersion.latestPolicyEvaluation.noPolicyAssigned, true);
  assert.ok(updatedVersion.latestPolicyEvaluation.reasons.some(r => r.includes('No governance policy assigned')));
});

test('2. Genuine evaluation failure: poor metrics yield EVALUATED_FAIL even if calculation succeeds', async () => {
  const modelNoPolicy = await Model.create({
    name: 'Biased Predictor',
    description: 'Model with severe demographic disparity',
    purpose: 'Assess consumer loan default risk',
    owner: 'Alex',
    team: 'Risk Analytics',
    riskLevel: 'HIGH',
    policyId: null,
    applicablePolicyIds: []
  });

  const version = await ModelVersion.create({
    modelId: modelNoPolicy._id,
    version: 'v1.0',
    lifecycleStatus: 'DRAFT',
    evaluationStatus: 'NOT_EVALUATED',
    policyStatus: 'PENDING'
  });

  // Severe disparate impact: Male selection rate 80%, Female selection rate 20% -> DIR = 0.25 (<< 0.80)
  const rows = [
    ['actual', 'predicted', 'gender'],
    ...Array(8).fill([1, 1, 'Male']),
    ...Array(2).fill([0, 0, 'Male']),
    ...Array(2).fill([1, 1, 'Female']),
    ...Array(8).fill([0, 0, 'Female'])
  ];
  const buffer = createCsvBuffer(rows);
  const file = { buffer, originalname: 'biased_test.csv', mimetype: 'text/csv', size: buffer.length };

  const { req, res } = createMockReqRes({
    user: mlLeadUser,
    file,
    params: { versionId: version._id.toString() },
    body: { protectedAttribute: 'gender', privilegedGroup: 'Male', unprivilegedGroup: 'Female' }
  });

  await uploadEvaluation(req, res);

  assert.strictEqual(res.statusCode, 201);
  const updatedVersion = await ModelVersion.findById(version._id);
  // Measured evaluation metrics failed statutory fairness criteria:
  assert.strictEqual(updatedVersion.evaluationStatus, 'EVALUATED_FAIL');
  assert.strictEqual(updatedVersion.policyStatus, 'FAILED');
});

test('3. Policy assigned and PASSED: both evaluationStatus is EVALUATED_PASS and policyStatus is PASSED', async () => {
  const policy = await Policy.create({
    name: 'Standard Fair Lending Policy',
    description: 'Statutory non-discrimination policy',
    targetRiskLevel: 'HIGH',
    rules: {
      minDisparateImpact: 0.80,
      maxDemographicParityDiff: 0.10,
      minAccuracy: 0.80,
      minRocAuc: 0.70
    },
    requiredApprovers: ['ML_LEAD', 'GOVERNANCE_OFFICER'],
    isActive: true
  });

  const modelWithPolicy = await Model.create({
    name: 'Compliant Credit Underwriter',
    description: 'Fully governed credit risk model',
    purpose: 'Consumer credit evaluation and automated underwriting',
    owner: 'Alex',
    team: 'Risk Analytics',
    riskLevel: 'HIGH',
    policyId: policy._id
  });

  const version = await ModelVersion.create({
    modelId: modelWithPolicy._id,
    version: 'v1.0',
    lifecycleStatus: 'DRAFT',
    evaluationStatus: 'NOT_EVALUATED',
    policyStatus: 'PENDING'
  });

  // Compliant dataset meeting policy rules
  const rows = [
    ['actual', 'predicted', 'probability', 'gender'],
    ...Array(35).fill([1, 1, 0.90, 'Male']),
    ...Array(15).fill([0, 0, 0.10, 'Male']),
    ...Array(30).fill([1, 1, 0.88, 'Female']),
    ...Array(20).fill([0, 0, 0.12, 'Female'])
  ];
  const buffer = createCsvBuffer(rows);
  const file = { buffer, originalname: 'compliant_test.csv', mimetype: 'text/csv', size: buffer.length };

  const { req, res } = createMockReqRes({
    user: mlLeadUser,
    file,
    params: { versionId: version._id.toString() },
    body: { protectedAttribute: 'gender', privilegedGroup: 'Male', unprivilegedGroup: 'Female' }
  });

  await uploadEvaluation(req, res);

  assert.strictEqual(res.statusCode, 201);
  const updatedVersion = await ModelVersion.findById(version._id);
  assert.strictEqual(updatedVersion.evaluationStatus, 'EVALUATED_PASS');
  assert.strictEqual(updatedVersion.policyStatus, 'PASSED');
  assert.strictEqual(updatedVersion.latestPolicyEvaluation.overallDecision, 'PASSED');
});

test('4. Policy assigned but FAILED: evaluationStatus is EVALUATED_FAIL when metrics violate policy rules', async () => {
  const policy = await Policy.create({
    name: 'High Accuracy Policy',
    description: 'Requires high accuracy and fairness',
    targetRiskLevel: 'HIGH',
    rules: {
      minDisparateImpact: 0.80,
      minAccuracy: 0.90
    },
    requiredApprovers: ['ML_LEAD'],
    isActive: true
  });

  const modelWithPolicy = await Model.create({
    name: 'Low Accuracy Underwriter',
    description: 'Model failing accuracy threshold',
    purpose: 'Consumer credit evaluation',
    owner: 'Alex',
    team: 'Risk Analytics',
    riskLevel: 'HIGH',
    policyId: policy._id
  });

  const version = await ModelVersion.create({
    modelId: modelWithPolicy._id,
    version: 'v1.0',
    lifecycleStatus: 'DRAFT',
    evaluationStatus: 'NOT_EVALUATED',
    policyStatus: 'PENDING'
  });

  // Accuracy: 60% (fails minAccuracy: 0.90)
  const rows = [
    ['actual', 'predicted', 'gender'],
    ...Array(30).fill([1, 1, 'Male']),
    ...Array(20).fill([0, 1, 'Male']), // 20 errors
    ...Array(30).fill([1, 1, 'Female']),
    ...Array(20).fill([0, 1, 'Female']) // 20 errors
  ];
  const buffer = createCsvBuffer(rows);
  const file = { buffer, originalname: 'low_accuracy.csv', mimetype: 'text/csv', size: buffer.length };

  const { req, res } = createMockReqRes({
    user: mlLeadUser,
    file,
    params: { versionId: version._id.toString() },
    body: { protectedAttribute: 'gender', privilegedGroup: 'Male', unprivilegedGroup: 'Female' }
  });

  await uploadEvaluation(req, res);

  assert.strictEqual(res.statusCode, 201);
  const updatedVersion = await ModelVersion.findById(version._id);
  assert.strictEqual(updatedVersion.evaluationStatus, 'EVALUATED_FAIL');
  assert.strictEqual(updatedVersion.policyStatus, 'FAILED');
  assert.strictEqual(updatedVersion.latestPolicyEvaluation.overallDecision, 'BLOCKED');
});

test('5. Lifecycle Gate: Promotion to PENDING_APPROVAL and deployment remain strictly BLOCKED when policy is unmet', async () => {
  const modelNoPolicy = await Model.create({
    name: 'Gate Blocked Underwriter',
    description: 'Model tested for lifecycle gate compliance',
    purpose: 'Consumer credit evaluation',
    owner: 'Alex',
    team: 'Risk Analytics',
    riskLevel: 'HIGH'
  });

  // Version with evaluationStatus: EVALUATED_PASS but policyStatus: FAILED (e.g. unpolicied model)
  const version = await ModelVersion.create({
    modelId: modelNoPolicy._id,
    version: 'v1.0',
    lifecycleStatus: 'EVALUATION',
    evaluationStatus: 'EVALUATED_PASS',
    policyStatus: 'FAILED',
    latestPolicyEvaluation: {
      passed: false,
      overallDecision: 'BLOCKED',
      reasons: ['No governance policy assigned to model "Gate Blocked Underwriter"']
    }
  });

  // Attempting to advance to PENDING_APPROVAL must be rejected by lifecycle service
  await assert.rejects(
    async () => {
      await transitionVersionLifecycle({
        versionId: version._id,
        targetStatus: 'PENDING_APPROVAL',
        actor: 'Alex',
        role: 'ML_LEAD'
      });
    },
    /GOVERNANCE GATE BLOCKED/
  );

  // Attempting direct promotion to APPROVED must also be rejected
  await assert.rejects(
    async () => {
      await transitionVersionLifecycle({
        versionId: version._id,
        targetStatus: 'APPROVED',
        actor: 'Alex',
        role: 'ML_LEAD'
      });
    },
    /Cannot approve model directly from EVALUATION/
  );

  // Version remains in EVALUATION and deploymentStatus is NOT_DEPLOYED
  const checkVersion = await ModelVersion.findById(version._id);
  assert.strictEqual(checkVersion.lifecycleStatus, 'EVALUATION');
  assert.strictEqual(checkVersion.deploymentStatus, 'NOT_DEPLOYED');
});

test('6. Non-evaluation governance failure: Prohibited risk level marks policyStatus FAILED while preserving EVALUATED_PASS', async () => {
  const policy = await Policy.create({
    name: 'Prohibited Practices Policy',
    description: 'Enforces EU AI Act prohibited practices',
    targetRiskLevel: 'UNACCEPTABLE',
    rules: { minAccuracy: 0.80 },
    requiredApprovers: ['GOVERNANCE_OFFICER'],
    isActive: true
  });

  const prohibitedModel = await Model.create({
    name: 'Prohibited Social Scoring System',
    description: 'Article 5 prohibited system',
    purpose: 'General citizen social scoring',
    owner: 'Alex',
    team: 'Risk Analytics',
    riskLevel: 'UNACCEPTABLE',
    policyId: policy._id
  });

  const version = await ModelVersion.create({
    modelId: prohibitedModel._id,
    version: 'v1.0',
    lifecycleStatus: 'DRAFT',
    evaluationStatus: 'NOT_EVALUATED',
    policyStatus: 'PENDING'
  });

  // Balanced metric scores across demographic groups with probabilities
  const rows = [
    ['actual', 'predicted', 'probability', 'gender'],
    ...Array(25).fill([1, 1, 0.90, 'Male']),
    ...Array(25).fill([0, 0, 0.10, 'Male']),
    ...Array(25).fill([1, 1, 0.90, 'Female']),
    ...Array(25).fill([0, 0, 0.10, 'Female'])
  ];
  const buffer = createCsvBuffer(rows);
  const file = { buffer, originalname: 'prohibited_eval.csv', mimetype: 'text/csv', size: buffer.length };

  const { req, res } = createMockReqRes({
    user: mlLeadUser,
    file,
    params: { versionId: version._id.toString() },
    body: { protectedAttribute: 'gender', privilegedGroup: 'Male', unprivilegedGroup: 'Female' }
  });

  await uploadEvaluation(req, res);

  assert.strictEqual(res.statusCode, 201);
  const updatedVersion = await ModelVersion.findById(version._id);
  // Evaluation metrics measured 100% accuracy (passes evaluation criteria):
  assert.strictEqual(updatedVersion.evaluationStatus, 'EVALUATED_PASS');
  // Governance policy fails because system is classified as UNACCEPTABLE risk:
  assert.strictEqual(updatedVersion.policyStatus, 'FAILED');
  assert.strictEqual(updatedVersion.latestPolicyEvaluation.overallDecision, 'BLOCKED');
  assert.ok(updatedVersion.latestPolicyEvaluation.reasons.some(r => r.includes('UNACCEPTABLE RISK')));
});
