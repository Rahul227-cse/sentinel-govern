import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import * as xlsx from 'xlsx';

import { Model } from '../src/models/Model.js';
import { ModelVersion } from '../src/models/ModelVersion.js';
import { User } from '../src/models/User.js';
import { Policy } from '../src/models/Policy.js';
import { Evaluation } from '../src/models/Evaluation.js';
import { AuditLedger } from '../src/models/AuditLedger.js';
import { uploadEvaluation } from '../src/controllers/evaluationController.js';
import { parseAndValidateEvaluationFile } from '../src/services/evaluationImportService.js';
import { requireRole, requireActiveUser } from '../src/middleware/authMiddleware.js';
import { handleFileUpload } from '../src/middleware/uploadMiddleware.js';
import { verifyAuditChainIntegrity } from '../src/services/auditEngine.js';
import { evaluatePolicyGates } from '../src/services/policyEngine.js';

let mongoServer;
let mlLeadUser;
let governanceOfficerUser;
let platformAdminUser;
let execApproverUser;
let pendingUser;
let suspendedUser;

let testModel;
let testVersion;
let testPolicy;

// Helper to create mock request / response objects
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

// Helper to generate CSV buffer
function createCsvBuffer(rows) {
  const csvContent = rows.map(r => r.join(',')).join('\n');
  return Buffer.from(csvContent, 'utf-8');
}

// Helper to generate XLSX buffer
function createXlsxBuffer(rows) {
  const worksheet = xlsx.utils.aoa_to_sheet(rows);
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, worksheet, 'Evaluations');
  return xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

test.before(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  mlLeadUser = await User.create({
    email: 'ml_lead@aegis.ai',
    name: 'Dr. Sarah Connor',
    role: 'ML_LEAD',
    status: 'ACTIVE'
  });

  governanceOfficerUser = await User.create({
    email: 'gov@aegis.ai',
    name: 'Grace Governance',
    role: 'GOVERNANCE_OFFICER',
    status: 'ACTIVE'
  });

  platformAdminUser = await User.create({
    email: 'admin@aegis.ai',
    name: 'Platform Administrator',
    role: 'PLATFORM_ADMIN',
    status: 'ACTIVE'
  });

  execApproverUser = await User.create({
    email: 'exec@aegis.ai',
    name: 'Victoria Approver',
    role: 'EXECUTIVE_APPROVER',
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

  testPolicy = await Policy.create({
    name: 'Strict Fair Lending Policy',
    description: 'Statutory non-discrimination policy',
    targetRiskLevel: 'HIGH',
    rules: {
      minDisparateImpact: 0.80,
      maxDemographicParityDiff: 0.10,
      minAccuracy: 0.75,
      minPrecision: 0.70,
      minRecall: 0.70,
      minRocAuc: 0.70
    },
    requiredApprovers: ['ML_LEAD', 'GOVERNANCE_OFFICER'],
    isActive: true
  });

  testModel = await Model.create({
    name: 'Production Credit Underwriter',
    description: 'Credit assessment model',
    purpose: 'Consumer credit risk assessment and automated loan decisioning',
    owner: 'Dr. Sarah Connor',
    team: 'Risk Analytics',
    riskLevel: 'HIGH',
    lifecycleStatus: 'EVALUATION',
    registeredBy: mlLeadUser._id
  });

  testVersion = await ModelVersion.create({
    modelId: testModel._id,
    version: '1.0.0',
    description: 'Initial candidate release',
    lifecycleStatus: 'DRAFT',
    policyStatus: 'PENDING',
    registeredBy: mlLeadUser._id
  });
});

test.after(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

// =========================================================================
// 1. AUTHENTICATION & RBAC AUTHORIZATION
// =========================================================================

test('RBAC: Authenticated ML_LEAD can access evaluation upload route', () => {
  const middleware = requireRole(['ML_LEAD', 'GOVERNANCE_OFFICER']);
  const req = { user: mlLeadUser };
  let passed = false;
  middleware(req, {}, () => { passed = true; });
  assert.strictEqual(passed, true);
});

test('RBAC: Authenticated GOVERNANCE_OFFICER can access evaluation upload route', () => {
  const middleware = requireRole(['ML_LEAD', 'GOVERNANCE_OFFICER']);
  const req = { user: governanceOfficerUser };
  let passed = false;
  middleware(req, {}, () => { passed = true; });
  assert.strictEqual(passed, true);
});

test('RBAC: PLATFORM_ADMIN cannot execute evaluation import (no blanket bypass)', () => {
  const middleware = requireRole(['ML_LEAD', 'GOVERNANCE_OFFICER']);
  const { req, res } = createMockReqRes({ user: platformAdminUser });
  let passed = false;
  middleware(req, res, () => { passed = true; });
  assert.strictEqual(passed, false);
  assert.strictEqual(res.statusCode, 403);
  assert.ok(res.data.error.includes('Forbidden') || res.data.error.includes('requires role'));
});

test('RBAC: EXECUTIVE_APPROVER cannot execute technical evaluation import', () => {
  const middleware = requireRole(['ML_LEAD', 'GOVERNANCE_OFFICER']);
  const { req, res } = createMockReqRes({ user: execApproverUser });
  let passed = false;
  middleware(req, res, () => { passed = true; });
  assert.strictEqual(passed, false);
  assert.strictEqual(res.statusCode, 403);
});

test('User Status: PENDING user is rejected', () => {
  const middleware = requireActiveUser;
  const { req, res } = createMockReqRes({ user: pendingUser });
  let passed = false;
  middleware(req, res, () => { passed = true; });
  assert.strictEqual(passed, false);
  assert.strictEqual(res.statusCode, 403);
  assert.ok(res.data.error.includes('pending') || res.data.error.includes('review'));
});

test('User Status: SUSPENDED user is rejected', () => {
  const middleware = requireActiveUser;
  const { req, res } = createMockReqRes({ user: suspendedUser });
  let passed = false;
  middleware(req, res, () => { passed = true; });
  assert.strictEqual(passed, false);
  assert.strictEqual(res.statusCode, 403);
  assert.ok(res.data.error.includes('suspended'));
});

// =========================================================================
// 2. FILE VALIDATION & PARSING
// =========================================================================

test('File Validation: Valid CSV is parsed correctly', () => {
  const rows = [
    ['actual', 'predicted', 'gender'],
    ...Array(20).fill([1, 1, 'Male']),
    ...Array(20).fill([0, 0, 'Male']),
    ...Array(20).fill([1, 1, 'Female']),
    ...Array(20).fill([0, 0, 'Female'])
  ];
  const buffer = createCsvBuffer(rows);
  const result = parseAndValidateEvaluationFile({ buffer, filename: 'test.csv' });
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.sampleCount, 80);
  assert.strictEqual(result.fairnessMetrics.protectedAttribute, 'gender');
  assert.strictEqual(result.fairnessMetrics.fairnessEvaluated, true);
  assert.strictEqual(result.performanceMetrics.accuracy, 1.0);
});

test('File Validation: Valid XLSX is parsed correctly', () => {
  const rows = [
    ['actual', 'predicted', 'gender'],
    ...Array(15).fill([1, 1, 'Male']),
    ...Array(15).fill([0, 0, 'Male']),
    ...Array(15).fill([1, 1, 'Female']),
    ...Array(15).fill([0, 0, 'Female'])
  ];
  const buffer = createXlsxBuffer(rows);
  const result = parseAndValidateEvaluationFile({ buffer, filename: 'test.xlsx' });
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.sampleCount, 60);
  assert.strictEqual(result.fairnessMetrics.protectedAttribute, 'gender');
  assert.strictEqual(result.fairnessMetrics.fairnessEvaluated, true);
});

test('File Validation: Unsupported file extension is rejected', () => {
  const result = parseAndValidateEvaluationFile({ buffer: Buffer.from('{}'), filename: 'dataset.json' });
  assert.ok(result.error);
  assert.ok(result.error.includes('Unsupported file extension'));
});

test('File Validation: Empty file is rejected', () => {
  const result = parseAndValidateEvaluationFile({ buffer: Buffer.from(''), filename: 'empty.csv' });
  assert.ok(result.error);
  assert.ok(result.error.includes('empty'));
});

test('File Validation: Missing required columns (actual / predicted) is rejected', () => {
  const rows = [
    ['feature1', 'feature2', 'gender'],
    ...Array(15).fill([1, 2, 'Male'])
  ];
  const buffer = createCsvBuffer(rows);
  const result = parseAndValidateEvaluationFile({ buffer, filename: 'missing_cols.csv' });
  assert.ok(result.error);
  assert.ok(result.error.includes('Missing required column'));
});

test('File Validation: Invalid data rows (non-binary labels) are rejected', () => {
  const rows = [
    ['actual', 'predicted'],
    ['unknown_label', 1],
    ...Array(15).fill([1, 1])
  ];
  const buffer = createCsvBuffer(rows);
  const result = parseAndValidateEvaluationFile({ buffer, filename: 'invalid_rows.csv' });
  assert.ok(result.error);
  assert.ok(result.error.includes('binary labels') || result.error.includes('Invalid classification'));
});

// =========================================================================
// 3. PERFORMANCE & FAIRNESS METRICS COMPUTATION
// =========================================================================

test('Metrics: Correct performance metrics are computed for valid data', () => {
  // 30 TP, 10 FP, 10 FN, 30 TN -> total 80
  // accuracy = (30+30)/80 = 0.75
  // precision = 30 / (30+10) = 0.75
  // recall = 30 / (30+10) = 0.75
  // f1 = 0.75
  const rows = [
    ['actual', 'predicted'],
    ...Array(30).fill([1, 1]),
    ...Array(10).fill([0, 1]),
    ...Array(10).fill([1, 0]),
    ...Array(30).fill([0, 0])
  ];
  const buffer = createCsvBuffer(rows);
  const result = parseAndValidateEvaluationFile({ buffer, filename: 'perf.csv' });

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.sampleCount, 80);
  assert.strictEqual(result.performanceMetrics.accuracy, 0.75);
  assert.strictEqual(result.performanceMetrics.precision, 0.75);
  assert.strictEqual(result.performanceMetrics.recall, 0.75);
  assert.strictEqual(result.performanceMetrics.f1, 0.75);
  // Binary-only input must not fabricate an ROC-AUC value
  assert.strictEqual(result.performanceMetrics.rocAuc, null);
});

test('Metrics: Conventional ROC-AUC is computed correctly when continuous prediction scores are provided', () => {
  const rows = [
    ['actual', 'predicted', 'probability'],
    ...Array(30).fill([1, 1, 0.92]),
    ...Array(10).fill([0, 1, 0.65]),
    ...Array(10).fill([1, 0, 0.35]),
    ...Array(30).fill([0, 0, 0.08])
  ];
  const buffer = createCsvBuffer(rows);
  const result = parseAndValidateEvaluationFile({ buffer, filename: 'perf_with_probs.csv' });

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.sampleCount, 80);
  assert.ok(result.performanceMetrics.rocAuc !== null);
  assert.ok(result.performanceMetrics.rocAuc >= 0 && result.performanceMetrics.rocAuc <= 1.0);
  assert.ok(result.performanceMetrics.rocAuc > 0.80);
});

test('Metrics: Statutory fairness metrics are calculated when protected attributes present', () => {
  // Privileged (Male): 50 samples, 35 positive predictions -> selection rate = 0.70
  // Unprivileged (Female): 50 samples, 30 positive predictions -> selection rate = 0.60
  // Disparate Impact Ratio = 0.60 / 0.70 = 0.857 -> ~0.86
  const rows = [
    ['actual', 'predicted', 'gender'],
    ...Array(35).fill([1, 1, 'Male']),
    ...Array(15).fill([0, 0, 'Male']),
    ...Array(30).fill([1, 1, 'Female']),
    ...Array(20).fill([0, 0, 'Female'])
  ];
  const buffer = createCsvBuffer(rows);
  const result = parseAndValidateEvaluationFile({
    buffer,
    filename: 'fairness.csv',
    protectedAttribute: 'gender',
    privilegedGroup: 'Male',
    unprivilegedGroup: 'Female'
  });

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.fairnessMetrics.fairnessEvaluated, true);
  assert.strictEqual(result.fairnessMetrics.disparateImpactRatio, 0.8571);
  assert.strictEqual(result.fairnessMetrics.demographicParityDiff, 0.1);
  assert.ok(result.fairnessMetrics.equalizedOdds !== undefined);
});

test('Metrics: Datasets without protected attributes do NOT fabricate fairness results', () => {
  const rows = [
    ['actual', 'predicted'],
    ...Array(20).fill([1, 1]),
    ...Array(20).fill([0, 0])
  ];
  const buffer = createCsvBuffer(rows);
  const result = parseAndValidateEvaluationFile({ buffer, filename: 'no_fairness.csv' });

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.hasFairness, false);
  assert.strictEqual(result.fairnessMetrics.fairnessEvaluated, false);
  assert.strictEqual(result.fairnessMetrics.protectedAttribute, 'NONE');
});

// =========================================================================
// 4. MODEL VERSION & POLICY ENGINE INTEGRATION
// =========================================================================

test('Policy: Evaluation import passing policy gates updates ModelVersion to PASSED', async () => {
  // Construct dataset that passes Strict Fair Lending Policy:
  // minDisparateImpact: 0.80, minAccuracy: 0.75, minRocAuc: 0.70
  const rows = [
    ['actual', 'predicted', 'probability', 'gender'],
    ...Array(35).fill([1, 1, 0.95, 'Male']),
    ...Array(15).fill([0, 0, 0.05, 'Male']),
    ...Array(30).fill([1, 1, 0.90, 'Female']),
    ...Array(20).fill([0, 0, 0.10, 'Female'])
  ];
  const buffer = createCsvBuffer(rows);

  const file = {
    buffer,
    originalname: 'compliant_credit_eval.csv',
    mimetype: 'text/csv',
    size: buffer.length
  };

  const { req, res } = createMockReqRes({
    user: mlLeadUser,
    file,
    params: { versionId: testVersion._id.toString() },
    body: {
      protectedAttribute: 'gender',
      privilegedGroup: 'Male',
      unprivilegedGroup: 'Female'
    }
  });

  await uploadEvaluation(req, res);

  assert.strictEqual(res.statusCode, 201);
  assert.strictEqual(res.data.success, true);
  assert.strictEqual(res.data.data.policyDecision.passed, true);
  assert.strictEqual(res.data.data.evaluation.fairnessMetrics.disparateImpactRatio, 0.8571);
  assert.ok(res.data.data.evaluation.performanceMetrics.rocAuc >= 0.70);
  assert.ok(res.data.data.evaluation.performanceMetrics.rocAuc <= 1.0);

  // Verify ModelVersion record in database
  const updatedVersion = await ModelVersion.findById(testVersion._id);
  assert.strictEqual(updatedVersion.policyStatus, 'PASSED');
  assert.strictEqual(updatedVersion.lifecycleStatus, 'EVALUATION');

  // Verify Evaluation record
  const savedEval = await Evaluation.findById(res.data.data.evaluation._id);
  assert.strictEqual(savedEval.versionId.toString(), testVersion._id.toString());
  assert.strictEqual(savedEval.dataSource, 'FILE_UPLOAD');
  assert.strictEqual(savedEval.uploadedFileMeta.filename, 'compliant_credit_eval.csv');
  assert.strictEqual(savedEval.evaluatedBy, 'Dr. Sarah Connor');
});

test('Policy: Evaluation import failing policy gate blocks deployment and marks version FAILED', async () => {
  // Construct biased dataset with DIR < 0.80 (e.g. Male: 70%, Female: 50% -> DIR = 0.71)
  const rows = [
    ['actual', 'predicted', 'gender'],
    ...Array(35).fill([1, 1, 'Male']),
    ...Array(15).fill([0, 0, 'Male']),
    ...Array(25).fill([1, 1, 'Female']),
    ...Array(25).fill([0, 0, 'Female'])
  ];
  const buffer = createCsvBuffer(rows);

  const file = {
    buffer,
    originalname: 'biased_credit_eval.csv',
    mimetype: 'text/csv',
    size: buffer.length
  };

  const { req, res } = createMockReqRes({
    user: mlLeadUser,
    file,
    params: { versionId: testVersion._id.toString() },
    body: {
      protectedAttribute: 'gender',
      privilegedGroup: 'Male',
      unprivilegedGroup: 'Female'
    }
  });

  await uploadEvaluation(req, res);

  assert.strictEqual(res.statusCode, 201);
  assert.strictEqual(res.data.data.policyDecision.passed, false);
  assert.ok(res.data.data.policyDecision.reasons.some(r => r.includes('Disparate Impact')));

  const updatedVersion = await ModelVersion.findById(testVersion._id);
  assert.strictEqual(updatedVersion.policyStatus, 'FAILED');
  assert.strictEqual(updatedVersion.lifecycleStatus, 'EVALUATION');
  assert.notStrictEqual(updatedVersion.lifecycleStatus, 'APPROVED');
  assert.notStrictEqual(updatedVersion.lifecycleStatus, 'IN_PRODUCTION');
});

test('Policy: Missing protected attribute on statutory policy blocks gate with clear violation', async () => {
  // Dataset has no protected attributes, but policy requires minDisparateImpact >= 0.80
  const rows = [
    ['actual', 'predicted'],
    ...Array(30).fill([1, 1]),
    ...Array(30).fill([0, 0])
  ];
  const buffer = createCsvBuffer(rows);

  const file = {
    buffer,
    originalname: 'no_fairness_eval.csv',
    mimetype: 'text/csv',
    size: buffer.length
  };

  const { req, res } = createMockReqRes({
    user: mlLeadUser,
    file,
    params: { versionId: testVersion._id.toString() }
  });

  await uploadEvaluation(req, res);

  assert.strictEqual(res.statusCode, 201);
  assert.strictEqual(res.data.data.policyDecision.passed, false);
  assert.ok(res.data.data.policyDecision.reasons.some(r => r.includes('Fairness Gate Blocked: Dataset does not contain protected attributes')));
});

test('Policy: Binary-only evaluation upload strictly blocks gate when policy requires minimum ROC-AUC', async () => {
  // Dataset contains valid labels and protected attributes, but lacks continuous scores/probabilities
  const rows = [
    ['actual', 'predicted', 'gender'],
    ...Array(35).fill([1, 1, 'Male']),
    ...Array(15).fill([0, 0, 'Male']),
    ...Array(30).fill([1, 1, 'Female']),
    ...Array(20).fill([0, 0, 'Female'])
  ];
  const buffer = createCsvBuffer(rows);

  const file = {
    buffer,
    originalname: 'binary_only_eval.csv',
    mimetype: 'text/csv',
    size: buffer.length
  };

  const { req, res } = createMockReqRes({
    user: mlLeadUser,
    file,
    params: { versionId: testVersion._id.toString() },
    body: {
      protectedAttribute: 'gender',
      privilegedGroup: 'Male',
      unprivilegedGroup: 'Female'
    }
  });

  await uploadEvaluation(req, res);

  assert.strictEqual(res.statusCode, 201);
  assert.strictEqual(res.data.success, true);
  // Evaluation persisted with null rocAuc
  assert.strictEqual(res.data.data.evaluation.performanceMetrics.rocAuc, null);
  // Gate must FAIL because minRocAuc = 0.70 is required by testPolicy
  assert.strictEqual(res.data.data.policyDecision.passed, false);
  assert.ok(res.data.data.policyDecision.reasons.some(r => r.includes('ROC-AUC evidence is unavailable')));

  const updatedVersion = await ModelVersion.findById(testVersion._id);
  assert.strictEqual(updatedVersion.policyStatus, 'FAILED');
});

test('File Validation: Invalid prediction scores (non-numeric or outside 0-1) are rejected with error', () => {
  const rows = [
    ['actual', 'predicted', 'probability'],
    ['1', '1', 'not_a_number'],
    ...Array(15).fill([1, 1, 0.9])
  ];
  const buffer = createCsvBuffer(rows);
  const result = parseAndValidateEvaluationFile({ buffer, filename: 'bad_scores.csv' });
  assert.ok(result.error);
  assert.ok(result.error.includes('Invalid prediction score/probability'));
});

// =========================================================================
// 5. SECURITY, OWNERSHIP & AUDIT INTEGRITY
// =========================================================================

test('Security: Evaluator identity cannot be spoofed by client-supplied payload', async () => {
  const rows = [
    ['actual', 'predicted'],
    ...Array(20).fill([1, 1]),
    ...Array(20).fill([0, 0])
  ];
  const buffer = createCsvBuffer(rows);

  const file = {
    buffer,
    originalname: 'spoof_test.csv',
    mimetype: 'text/csv',
    size: buffer.length
  };

  const { req, res } = createMockReqRes({
    user: mlLeadUser, // Authenticated identity
    file,
    params: { versionId: testVersion._id.toString() },
    body: {
      actor: 'Arbitrary Spoofed User',
      role: 'PLATFORM_ADMIN',
      evaluatedBy: 'Fake Evaluator'
    }
  });

  await uploadEvaluation(req, res);

  assert.strictEqual(res.statusCode, 201);
  assert.strictEqual(res.data.data.evaluation.evaluatedBy, 'Dr. Sarah Connor');
  assert.notStrictEqual(res.data.data.evaluation.evaluatedBy, 'Arbitrary Spoofed User');
});

test('Security: Nonexistent ModelVersion returns 404', async () => {
  const fakeId = new mongoose.Types.ObjectId();
  const rows = [
    ['actual', 'predicted'],
    ...Array(20).fill([1, 1])
  ];
  const buffer = createCsvBuffer(rows);

  const file = {
    buffer,
    originalname: 'test.csv',
    mimetype: 'text/csv',
    size: buffer.length
  };

  const { req, res } = createMockReqRes({
    user: mlLeadUser,
    file,
    params: { versionId: fakeId.toString() }
  });

  await uploadEvaluation(req, res);

  assert.strictEqual(res.statusCode, 404);
  assert.ok(res.data.error.includes('ModelVersion not found'));
});

test('Audit: Evaluation mutation creates audit events and maintains SHA-256 chain', async () => {
  // Fetch audit log entries for evaluation
  const auditEntries = await AuditLedger.find({
    action: 'EVALUATION_COMPLETED'
  }).sort({ timestamp: 1 });

  assert.ok(auditEntries.length >= 1, 'Should contain audit ledger events for evaluation');

  const evalAudit = auditEntries[auditEntries.length - 1];
  assert.ok(evalAudit, 'EVALUATION_COMPLETED audit event must exist');
  assert.strictEqual(evalAudit.actor, 'Dr. Sarah Connor');
  assert.strictEqual(evalAudit.role, 'ML_LEAD');

  // Verify full SHA-256 chain integrity
  const chainCheck = await verifyAuditChainIntegrity();
  assert.strictEqual(chainCheck.valid, true, 'SHA-256 audit ledger cryptographic chaining must remain valid');
});

// =========================================================================
// 6. ARCHITECTURAL RECONCILIATION & BACKWARD COMPATIBILITY
// =========================================================================

test('Backward Compatibility: Legacy pre-Phase-8 evaluation with protected attributes passes policy gate', () => {
  // Pre-Phase-8 evaluation record: fairnessEvaluated is undefined, protectedAttribute is present
  const legacyEval = {
    datasetName: 'Legacy Validation Suite v1.0',
    sampleCount: 10000,
    performanceMetrics: { accuracy: 0.82, precision: 0.80, recall: 0.80, f1: 0.80, rocAuc: 0.85 },
    fairnessMetrics: {
      protectedAttribute: 'gender',
      privilegedGroup: 'Male',
      unprivilegedGroup: 'Female',
      disparateImpactRatio: 0.86,
      demographicParityDiff: 0.08
      // fairnessEvaluated is explicitly undefined in pre-Phase-8 records
    }
  };

  const decision = evaluatePolicyGates({
    policy: testPolicy,
    evaluation: legacyEval,
    modelVersion: testVersion,
    model: testModel
  });

  assert.strictEqual(decision.passed, true);
  assert.strictEqual(decision.gateBreakdown.fairnessGate.status, 'PASSED');
});

test('Backward Compatibility: Legacy pre-Phase-8 evaluation without protected attributes cleanly fails fairness policy', () => {
  // Pre-Phase-8 record where protectedAttribute was NONE and fairnessEvaluated was undefined
  const legacyEvalNoFairness = {
    datasetName: 'Legacy Benchmark No Protected Attribute',
    sampleCount: 5000,
    performanceMetrics: { accuracy: 0.85, precision: 0.80, recall: 0.80, f1: 0.80, rocAuc: 0.85 },
    fairnessMetrics: {
      protectedAttribute: 'NONE',
      privilegedGroup: 'N/A',
      unprivilegedGroup: 'N/A',
      disparateImpactRatio: 0,
      demographicParityDiff: 0
    }
  };

  const decision = evaluatePolicyGates({
    policy: testPolicy,
    evaluation: legacyEvalNoFairness,
    modelVersion: testVersion,
    model: testModel
  });

  assert.strictEqual(decision.passed, false);
  assert.strictEqual(decision.gateBreakdown.fairnessGate.status, 'FAILED');
  assert.ok(decision.reasons.some(r => r.includes('Fairness Gate Blocked: Dataset does not contain protected attributes')));
});

test('Policy Compatibility: Policy without fairness requirements passes evaluations missing protected attributes', () => {
  const perfOnlyPolicy = {
    name: 'Performance Only Policy',
    targetRiskLevel: 'HIGH',
    rules: {
      minAccuracy: 0.70,
      minRocAuc: 0.65
      // No minDisparateImpact or maxDemographicParityDiff
    },
    requiredApprovers: ['ML_LEAD']
  };

  const evalNoFairness = {
    datasetName: 'Operational Performance Test',
    sampleCount: 2000,
    performanceMetrics: { accuracy: 0.88, precision: 0.85, recall: 0.84, f1: 0.84, rocAuc: 0.86 },
    fairnessMetrics: {
      protectedAttribute: 'NONE',
      fairnessEvaluated: false
    }
  };

  const decision = evaluatePolicyGates({
    policy: perfOnlyPolicy,
    evaluation: evalNoFairness,
    modelVersion: testVersion,
    model: testModel
  });

  assert.strictEqual(decision.passed, true);
  assert.strictEqual(decision.gateBreakdown.fairnessGate.status, 'PASSED');
});

test('Lifecycle Safety: Evaluation upload cannot promote version to APPROVED or bypass approval/deployment gates', async () => {
  const versionRecord = await ModelVersion.findById(testVersion._id);
  // Version must remain in EVALUATION state and must NOT be marked APPROVED or IN_PRODUCTION
  assert.strictEqual(versionRecord.lifecycleStatus, 'EVALUATION');
  assert.notStrictEqual(versionRecord.lifecycleStatus, 'APPROVED');
  assert.notStrictEqual(versionRecord.lifecycleStatus, 'IN_PRODUCTION');
  assert.notStrictEqual(versionRecord.approvalStatus, 'APPROVED');
  assert.strictEqual(versionRecord.deploymentStatus, 'NOT_DEPLOYED');
});
