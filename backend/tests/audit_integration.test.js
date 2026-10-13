import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { Model } from '../src/models/Model.js';
import { ModelVersion } from '../src/models/ModelVersion.js';
import { User } from '../src/models/User.js';
import { Evaluation } from '../src/models/Evaluation.js';
import { Policy } from '../src/models/Policy.js';
import { Approval } from '../src/models/Approval.js';
import { Telemetry } from '../src/models/Telemetry.js';
import { Incident } from '../src/models/Incident.js';
import { IssueReport } from '../src/models/IssueReport.js';
import { AuditLedger } from '../src/models/AuditLedger.js';

import {
  recordAuditEvent,
  verifyAuditChainIntegrity,
  simulateTamperOnBlock,
  repairAuditChain,
  computeBlockHash
} from '../src/services/auditEngine.js';

import * as auditCtrl from '../src/controllers/auditController.js';
import * as modelCtrl from '../src/controllers/modelController.js';
import * as evalCtrl from '../src/controllers/evaluationController.js';
import * as policyCtrl from '../src/controllers/policyController.js';
import * as approvalCtrl from '../src/controllers/approvalController.js';
import * as telemetryCtrl from '../src/controllers/telemetryController.js';
import * as incidentCtrl from '../src/controllers/incidentController.js';
import * as issueCtrl from '../src/controllers/issueController.js';
import * as adminCtrl from '../src/controllers/adminController.js';
import { requireDemoAuditEnabled, requireRole, requireActiveUser } from '../src/middleware/authMiddleware.js';

let mongoServer;

// Users
let platformAdminUser;
let pendingAdminUser;
let suspendedAdminUser;
let mlLeadUser;
let governanceOfficerUser;
let executiveApproverUser;

function createMockReqRes({ user, body = {}, params = {}, query = {}, headers = {} } = {}) {
  const req = {
    user,
    body,
    params,
    query,
    headers,
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
    setHeader(name, val) {
      this.headers[name] = val;
      return this;
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

  // Setup Users
  platformAdminUser = await User.create({
    googleId: 'google-admin-12',
    email: 'admin@aegis.enterprise',
    name: 'Ada Lovelace',
    role: 'PLATFORM_ADMIN',
    status: 'ACTIVE'
  });

  pendingAdminUser = await User.create({
    googleId: 'google-pending-admin-12',
    email: 'pending_admin@aegis.enterprise',
    name: 'Pending Admin',
    role: 'PLATFORM_ADMIN',
    status: 'PENDING'
  });

  suspendedAdminUser = await User.create({
    googleId: 'google-suspended-admin-12',
    email: 'suspended_admin@aegis.enterprise',
    name: 'Suspended Admin',
    role: 'PLATFORM_ADMIN',
    status: 'SUSPENDED'
  });

  mlLeadUser = await User.create({
    googleId: 'google-ml-12',
    email: 'mllead@aegis.enterprise',
    name: 'Dr. Alan Turing',
    role: 'ML_LEAD',
    status: 'ACTIVE'
  });

  governanceOfficerUser = await User.create({
    googleId: 'google-gov-12',
    email: 'gov@aegis.enterprise',
    name: 'Simone de Beauvoir',
    role: 'GOVERNANCE_OFFICER',
    status: 'ACTIVE'
  });

  executiveApproverUser = await User.create({
    googleId: 'google-exec-12',
    email: 'exec@aegis.enterprise',
    name: 'Katherine Johnson',
    role: 'EXECUTIVE_APPROVER',
    status: 'ACTIVE'
  });
});

test.after(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

test('Audit Engine: 1. Genesis block initializes with 64 zero previousHash and sequence 0', async () => {
  const block = await recordAuditEvent({
    actor: mlLeadUser.name,
    role: mlLeadUser.role,
    action: 'MODEL_CREATED',
    entityType: 'AIModel',
    entityId: new mongoose.Types.ObjectId(),
    payload: { note: 'Genesis record test' }
  });

  assert.equal(block.sequenceNumber, 0);
  assert.equal(block.previousHash, '0'.repeat(64));
  assert.equal(block.currentHash.length, 64);

  const verification = await verifyAuditChainIntegrity();
  assert.equal(verification.valid, true);
  assert.equal(verification.totalBlocks, 1);
});

test('Audit Engine: 2. Subsequent blocks form unbroken sequential SHA-256 hash chain', async () => {
  const b1 = await recordAuditEvent({
    actor: mlLeadUser.name,
    role: mlLeadUser.role,
    action: 'VERSION_CREATED',
    entityType: 'ModelVersion',
    entityId: new mongoose.Types.ObjectId(),
    payload: { version: '1.0.0' }
  });

  assert.equal(b1.sequenceNumber, 1);
  const genesis = await AuditLedger.findOne({ sequenceNumber: 0 });
  assert.equal(b1.previousHash, genesis.currentHash);

  const b2 = await recordAuditEvent({
    actor: governanceOfficerUser.name,
    role: governanceOfficerUser.role,
    action: 'EVALUATION_COMPLETED',
    entityType: 'Evaluation',
    entityId: new mongoose.Types.ObjectId(),
    payload: { accuracy: 0.94 }
  });

  assert.equal(b2.sequenceNumber, 2);
  assert.equal(b2.previousHash, b1.currentHash);

  const verification = await verifyAuditChainIntegrity();
  assert.equal(verification.valid, true);
  assert.equal(verification.totalBlocks, 3);
  assert.equal(verification.brokenAtSequence, null);
});

test('Audit Actor Authority: 3. req.user is authoritative over forged actor and role', async () => {
  const { req, res } = createMockReqRes({
    user: mlLeadUser,
    body: {
      name: 'Underwriting Risk Predictor',
      description: 'Production credit model',
      purpose: 'Credit risk assessment and lending scoring',
      team: 'Risk Engineering',
      useCase: 'Credit Underwriting',
      riskLevel: 'HIGH',
      // Attacker attempts to forge actor identity and role in body
      actor: 'Imposter Hacker',
      role: 'PLATFORM_ADMIN',
      userId: 'forged-user-id'
    }
  });

  await modelCtrl.createModel(req, res);
  assert.equal(res.statusCode, 201);

  const createdModelId = res.data.data.model._id;
  const auditEntry = await AuditLedger.findOne({
    action: 'MODEL_CREATED',
    entityId: createdModelId
  });

  assert.ok(auditEntry);
  assert.equal(auditEntry.actor, mlLeadUser.name);
  assert.equal(auditEntry.role, mlLeadUser.role);
  assert.notEqual(auditEntry.actor, 'Imposter Hacker');
  assert.notEqual(auditEntry.role, 'PLATFORM_ADMIN');
  assert.equal(auditEntry.payload.modelId, String(createdModelId));
  assert.equal(auditEntry.payload.modelName, 'Underwriting Risk Predictor');
});

test('Audit Traceability: 4. Version creation records authoritative modelId and versionId', async () => {
  const model = await Model.findOne({ name: 'Underwriting Risk Predictor' });
  assert.ok(model);

  const { req, res } = createMockReqRes({
    user: mlLeadUser,
    params: { modelId: model._id.toString() },
    body: {
      version: '1.1.0',
      changelog: 'Iteration with fairness adjustments',
      // Forged actor attempts
      actor: 'Fake Actor',
      role: 'EXECUTIVE_APPROVER'
    }
  });

  await modelCtrl.createModelVersion(req, res);
  assert.equal(res.statusCode, 201);

  const versionId = res.data.data._id;
  const auditEntry = await AuditLedger.findOne({
    action: 'VERSION_CREATED',
    entityId: versionId
  });

  assert.ok(auditEntry);
  assert.equal(auditEntry.actor, mlLeadUser.name);
  assert.equal(auditEntry.role, 'ML_LEAD');
  assert.equal(auditEntry.payload.modelId, String(model._id));
  assert.equal(auditEntry.payload.versionId, String(versionId));
  assert.equal(auditEntry.payload.version, '1.1.0');
});

test('Audit Traceability: 5. Lifecycle transitions record LIFECYCLE_TRANSITION with full traceability', async () => {
  const model = await Model.findOne({ name: 'Underwriting Risk Predictor' });
  const version = await ModelVersion.findOne({ modelId: model._id, version: '1.1.0' });
  assert.ok(version);

  const { req, res } = createMockReqRes({
    user: mlLeadUser,
    params: { versionId: version._id.toString() },
    body: {
      targetStatus: 'UNDER_REVIEW',
      rationale: 'Moving to initial technical review'
    }
  });

  await modelCtrl.transitionLifecycle(req, res);
  assert.equal(res.statusCode, 200);

  const auditEntry = await AuditLedger.findOne({
    action: 'LIFECYCLE_TRANSITION',
    entityId: version._id
  });

  assert.ok(auditEntry);
  assert.equal(auditEntry.actor, mlLeadUser.name);
  assert.equal(auditEntry.role, 'ML_LEAD');
  assert.equal(auditEntry.payload.modelId, String(model._id));
  assert.equal(auditEntry.payload.versionId, String(version._id));
  assert.equal(auditEntry.payload.previousStatus, 'DRAFT');
  assert.equal(auditEntry.payload.newStatus, 'UNDER_REVIEW');
  assert.equal(auditEntry.payload.rationale, 'Moving to initial technical review');
});

test('Audit Traceability: 6. Issue creation and escalation record traceable audit records', async () => {
  const model = await Model.findOne({ name: 'Underwriting Risk Predictor' });
  const version = await ModelVersion.findOne({ modelId: model._id, version: '1.1.0' });

  // 1. User creates issue
  const { req: issueReq, res: issueRes } = createMockReqRes({
    user: executiveApproverUser,
    body: {
      title: 'Observed demographic scoring disparity',
      description: 'Underwriting loan approval disparate across demographic groups',
      issueType: 'BIAS',
      severity: 'HIGH',
      modelId: model._id.toString(),
      versionId: version._id.toString(),
      // Forged reporter
      reportedBy: 'forged@malicious.com'
    }
  });

  await issueCtrl.createIssueReport(issueReq, issueRes);
  assert.equal(issueRes.statusCode, 201);

  const issueId = issueRes.data.data._id;
  const issueAudit = await AuditLedger.findOne({
    action: 'ISSUE_REPORT_CREATED',
    entityId: issueId
  });

  assert.ok(issueAudit);
  assert.equal(issueAudit.actor, executiveApproverUser.name);
  assert.equal(issueAudit.role, 'EXECUTIVE_APPROVER');
  assert.equal(issueAudit.payload.modelId, String(model._id));
  assert.equal(issueAudit.payload.versionId, String(version._id));
  assert.equal(issueAudit.payload.issueId, String(issueId));

  // 2. Governance role escalates issue to incident
  const { req: escReq, res: escRes } = createMockReqRes({
    user: governanceOfficerUser,
    params: { id: issueId.toString() },
    body: {
      severity: 'HIGH',
      incidentDescription: 'Escalated due to high fairness disparity in credit evaluations'
    }
  });

  await issueCtrl.escalateIssueToIncident(escReq, escRes);
  assert.equal(escRes.statusCode, 201);

  const escAudit = await AuditLedger.findOne({
    action: 'ISSUE_ESCALATED_TO_INCIDENT',
    entityId: issueId
  });

  assert.ok(escAudit);
  assert.equal(escAudit.actor, governanceOfficerUser.name);
  assert.equal(escAudit.role, 'GOVERNANCE_OFFICER');
  assert.equal(escAudit.payload.modelId, String(model._id));
  assert.equal(escAudit.payload.versionId, String(version._id));
  const targetIncidentId = escAudit.payload.escalatedIncidentId || escAudit.payload.incidentId;
  assert.ok(targetIncidentId);

  const incAudit = await AuditLedger.findOne({
    action: 'INCIDENT_CREATED',
    entityId: targetIncidentId
  });
  assert.ok(incAudit);
  assert.equal(incAudit.actor, governanceOfficerUser.name);
  assert.equal(incAudit.payload.modelId, String(model._id));
  assert.equal(incAudit.payload.versionId, String(version._id));
});

test('Audit Query API: 7. getAuditLedger supports modelId, versionId, and entityId filters', async () => {
  const model = await Model.findOne({ name: 'Underwriting Risk Predictor' });
  const version = await ModelVersion.findOne({ modelId: model._id, version: '1.1.0' });

  // Filter by modelId
  const { req: req1, res: res1 } = createMockReqRes({
    query: { modelId: model._id.toString() }
  });
  await auditCtrl.getAuditLedger(req1, res1);
  assert.equal(res1.statusCode, 200);
  assert.ok(res1.data.count > 0);
  for (const record of res1.data.data) {
    const matchesModel = String(record.entityId) === String(model._id) || String(record.payload?.modelId) === String(model._id);
    assert.ok(matchesModel, `Record ${record.action} must correlate to modelId`);
  }

  // Filter by versionId
  const { req: req2, res: res2 } = createMockReqRes({
    query: { versionId: version._id.toString() }
  });
  await auditCtrl.getAuditLedger(req2, res2);
  assert.equal(res2.statusCode, 200);
  assert.ok(res2.data.count > 0);
  for (const record of res2.data.data) {
    const matchesVersion = String(record.entityId) === String(version._id) || String(record.payload?.versionId) === String(version._id);
    assert.ok(matchesVersion, `Record ${record.action} must correlate to versionId`);
  }
});

test('Audit Cryptographic Integrity: 8. Chain verification passes for untouched ledger', async () => {
  const verification = await verifyAuditChainIntegrity();
  assert.equal(verification.valid, true);
  assert.ok(verification.totalBlocks >= 5);
  assert.equal(verification.brokenAtSequence, null);
});

test('Audit Cryptographic Integrity: 9. Tampering with any historical block is detected immediately', async () => {
  // Tamper with block #1
  const originalBlock1 = await AuditLedger.findOne({ sequenceNumber: 1 });
  const originalPayload = originalBlock1.payload;

  await simulateTamperOnBlock(1, {
    maliciousOverwrite: true,
    unauthorizedPrivilegeEscalation: 'Root Admin Injected'
  });

  const checkTampered = await verifyAuditChainIntegrity();
  assert.equal(checkTampered.valid, false, 'Chain verification must fail on tampered block');
  assert.equal(checkTampered.brokenAtSequence, 1, 'Verification must isolate sequence #1 as broken');

  // Restore block 1 payload to restore legitimate chain
  const computedHash = computeBlockHash(
    originalBlock1.previousHash,
    originalBlock1.timestamp,
    originalBlock1.actor,
    originalBlock1.action,
    originalPayload
  );
  await AuditLedger.updateOne(
    { sequenceNumber: 1 },
    { $set: { payload: originalPayload, currentHash: computedHash } }
  );

  const checkRestored = await verifyAuditChainIntegrity();
  assert.equal(checkRestored.valid, true, 'Restored ledger must pass verification');
});

test('Audit User Lifecycle: 10. Admin role change records ROLE_ASSIGNED audit event', async () => {
  const targetUser = await User.create({
    googleId: 'target-user-audit',
    email: 'newhire@aegis.enterprise',
    name: 'Alan Kay',
    role: 'GOVERNANCE_OFFICER',
    status: 'ACTIVE'
  });

  const { req, res } = createMockReqRes({
    user: platformAdminUser,
    params: { id: targetUser._id.toString() },
    body: { role: 'ML_LEAD' }
  });

  await adminCtrl.updateUserRole(req, res);
  assert.equal(res.statusCode, 200);

  const audit = await AuditLedger.findOne({
    action: 'ROLE_ASSIGNED',
    entityId: targetUser._id
  });

  assert.ok(audit);
  assert.equal(audit.actor, platformAdminUser.email);
  assert.equal(audit.role, 'PLATFORM_ADMIN');
  assert.equal(audit.payload.assignedRole, 'ML_LEAD');
});

test('Audit Demo Protection: 11. requireDemoAuditEnabled strictly blocks production access', () => {
  const origNodeEnv = process.env.NODE_ENV;
  const origFlag = process.env.ENABLE_AUDIT_TAMPER_DEMO;

  try {
    // 1. In production, always blocked regardless of flag
    process.env.NODE_ENV = 'production';
    process.env.ENABLE_AUDIT_TAMPER_DEMO = 'true';

    let calledNext = false;
    const { req: pReq, res: pRes } = createMockReqRes();
    requireDemoAuditEnabled(pReq, pRes, () => { calledNext = true; });

    assert.equal(calledNext, false);
    assert.equal(pRes.statusCode, 403);
    assert.ok(pRes.data.error.includes('strictly disabled in production'));

    // 2. In development without ENABLE_AUDIT_TAMPER_DEMO=true, blocked
    process.env.NODE_ENV = 'development';
    process.env.ENABLE_AUDIT_TAMPER_DEMO = 'false';

    calledNext = false;
    const { req: dReq, res: dRes } = createMockReqRes();
    requireDemoAuditEnabled(dReq, dRes, () => { calledNext = true; });

    assert.equal(calledNext, false);
    assert.equal(dRes.statusCode, 403);

    // 3. In development WITH ENABLE_AUDIT_TAMPER_DEMO=true, allowed
    process.env.ENABLE_AUDIT_TAMPER_DEMO = 'true';
    calledNext = false;
    const { req: okReq, res: okRes } = createMockReqRes();
    requireDemoAuditEnabled(okReq, okRes, () => { calledNext = true; });

    assert.equal(calledNext, true);
  } finally {
    process.env.NODE_ENV = origNodeEnv;
    process.env.ENABLE_AUDIT_TAMPER_DEMO = origFlag;
  }
});

test('Audit Traceability: 12. Evaluation run and gate check record traceable audit events', async () => {
  const model = await Model.findOne({ name: 'Underwriting Risk Predictor' });
  const version = await ModelVersion.findOne({ modelId: model._id, version: '1.1.0' });

  // Ensure active policy exists
  await Policy.create({
    name: 'Standard Fair Lending Policy',
    description: 'Governance policy for high risk underwriting models',
    targetRiskLevel: 'HIGH',
    isActive: true,
    minAccuracy: 0.80,
    minDisparateImpactRatio: 0.80,
    maxDemographicParityDifference: 0.15,
    requiredApprovers: ['GOVERNANCE_OFFICER', 'ML_LEAD', 'EXECUTIVE_APPROVER']
  });

  // Evaluation Run
  const { req: evalReq, res: evalRes } = createMockReqRes({
    user: mlLeadUser,
    params: { versionId: version._id.toString() },
    body: {
      metrics: {
        accuracy: 0.95,
        precision: 0.93,
        recall: 0.92,
        f1Score: 0.925,
        aucRoc: 0.96
      },
      fairnessMetrics: {
        disparateImpactRatio: 0.88,
        demographicParityDiff: 0.05,
        equalizedOddsDiff: 0.04
      }
    }
  });

  await evalCtrl.runEvaluation(evalReq, evalRes);
  assert.equal(evalRes.statusCode, 201);

  const evaluationId = evalRes.data.data.evaluation._id;
  const evalAudit = await AuditLedger.findOne({
    action: 'EVALUATION_COMPLETED',
    entityId: evaluationId
  });

  assert.ok(evalAudit);
  assert.equal(evalAudit.actor, mlLeadUser.name);
  assert.equal(evalAudit.payload.modelId, String(model._id));
  assert.equal(evalAudit.payload.versionId, String(version._id));
});

test('Audit Traceability: 13. Stakeholder approvals record traceable APPROVAL_GRANTED with req.user', async () => {
  const model = await Model.findOne({ name: 'Underwriting Risk Predictor' });
  const version = await ModelVersion.findOne({ modelId: model._id, version: '1.1.0' });

  const { req, res } = createMockReqRes({
    user: governanceOfficerUser,
    params: { versionId: version._id.toString() },
    body: {
      decision: 'APPROVED',
      comments: 'Fairness criteria satisfied under review standards',
      // Forged actor fields
      actor: 'Hacker User',
      role: 'PLATFORM_ADMIN'
    }
  });

  await approvalCtrl.submitApprovalDecision(req, res);
  assert.equal(res.statusCode, 200);

  const appAudit = await AuditLedger.findOne({
    action: 'APPROVAL_GRANTED',
    'payload.versionId': String(version._id)
  });

  assert.ok(appAudit);
  assert.equal(appAudit.actor, governanceOfficerUser.name);
  assert.equal(appAudit.role, 'GOVERNANCE_OFFICER');
  assert.equal(appAudit.payload.modelId, String(model._id));
  assert.equal(appAudit.payload.versionId, String(version._id));
});

test('Audit Traceability: 14. Telemetry drift detection records DRIFT_DETECTED audit event', async () => {
  const model = await Model.findOne({ name: 'Underwriting Risk Predictor' });
  const version = await ModelVersion.findOne({ modelId: model._id, version: '1.1.0' });

  // Simulate drift batch (scenario: 'DRIFTED')
  const { req, res } = createMockReqRes({
    user: mlLeadUser,
    body: {
      modelId: model._id.toString(),
      versionId: version._id.toString(),
      scenario: 'DRIFTED'
    }
  });

  await telemetryCtrl.simulateTelemetryBatch(req, res);
  assert.equal(res.statusCode, 201);

  const driftAudit = await AuditLedger.findOne({
    action: 'DRIFT_DETECTED',
    'payload.modelId': String(model._id)
  });

  assert.ok(driftAudit);
  assert.equal(driftAudit.actor, mlLeadUser.name);
  assert.equal(driftAudit.payload.modelId, String(model._id));
  assert.equal(driftAudit.payload.versionId, String(version._id));
});

test('Audit Cryptographic Integrity: 15. Ledger remains 100% valid after all multi-step lifecycle mutations', async () => {
  const verification = await verifyAuditChainIntegrity();
  assert.equal(verification.valid, true);
  assert.ok(verification.totalBlocks >= 10);
  assert.equal(verification.brokenAtSequence, null);

  // Verify all blocks are strictly linked
  const allBlocks = await AuditLedger.find().sort({ sequenceNumber: 1 });
  for (let i = 1; i < allBlocks.length; i++) {
    assert.equal(
      allBlocks[i].previousHash,
      allBlocks[i - 1].currentHash,
      `Block #${i} previousHash must match Block #${i - 1} currentHash`
    );
    assert.equal(allBlocks[i].sequenceNumber, i);
  }
});

// Helper to execute route guard pipeline: [requireActiveUser, requireDemoAuditEnabled, requireRole('PLATFORM_ADMIN')]
function runAuditAdminPipeline(req, res) {
  let passed = false;
  requireActiveUser(req, res, () => {
    requireDemoAuditEnabled(req, res, () => {
      requireRole('PLATFORM_ADMIN')(req, res, () => {
        passed = true;
      });
    });
  });
  return passed;
}

test('Audit RBAC: 16. PLATFORM_ADMIN can use demo tamper when non-production and ENABLE_AUDIT_TAMPER_DEMO=true', async () => {
  const origNodeEnv = process.env.NODE_ENV;
  const origFlag = process.env.ENABLE_AUDIT_TAMPER_DEMO;

  try {
    process.env.NODE_ENV = 'development';
    process.env.ENABLE_AUDIT_TAMPER_DEMO = 'true';

    const { req, res } = createMockReqRes({
      user: platformAdminUser,
      body: { sequenceNumber: 0 }
    });

    const passed = runAuditAdminPipeline(req, res);
    assert.equal(passed, true, 'PLATFORM_ADMIN must pass route guards when demo mode is active');

    // Controller execution
    await auditCtrl.simulateTamper(req, res);
    assert.equal(res.statusCode, 200);
    assert.ok(res.data.tamperedBlock);
  } finally {
    process.env.NODE_ENV = origNodeEnv;
    process.env.ENABLE_AUDIT_TAMPER_DEMO = origFlag;
  }
});

test('Audit RBAC: 17. PLATFORM_ADMIN can use demo repair under the same conditions', async () => {
  const origNodeEnv = process.env.NODE_ENV;
  const origFlag = process.env.ENABLE_AUDIT_TAMPER_DEMO;

  try {
    process.env.NODE_ENV = 'development';
    process.env.ENABLE_AUDIT_TAMPER_DEMO = 'true';

    const { req, res } = createMockReqRes({
      user: platformAdminUser
    });

    const passed = runAuditAdminPipeline(req, res);
    assert.equal(passed, true, 'PLATFORM_ADMIN must pass route guards for repair');

    // Controller execution
    await auditCtrl.repairAuditLedger(req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.data.data.valid, true);
  } finally {
    process.env.NODE_ENV = origNodeEnv;
    process.env.ENABLE_AUDIT_TAMPER_DEMO = origFlag;
  }
});

test('Audit RBAC: 18. GOVERNANCE_OFFICER receives HTTP 403 for simulate-tamper', async () => {
  const origNodeEnv = process.env.NODE_ENV;
  const origFlag = process.env.ENABLE_AUDIT_TAMPER_DEMO;

  try {
    process.env.NODE_ENV = 'development';
    process.env.ENABLE_AUDIT_TAMPER_DEMO = 'true';

    const { req, res } = createMockReqRes({
      user: governanceOfficerUser,
      body: { sequenceNumber: 0 }
    });

    const passed = runAuditAdminPipeline(req, res);
    assert.equal(passed, false, 'GOVERNANCE_OFFICER must be rejected by PLATFORM_ADMIN role guard');
    assert.equal(res.statusCode, 403);
    assert.ok(res.data.error.includes('Forbidden: Action requires role [PLATFORM_ADMIN]'));
  } finally {
    process.env.NODE_ENV = origNodeEnv;
    process.env.ENABLE_AUDIT_TAMPER_DEMO = origFlag;
  }
});

test('Audit RBAC: 19. GOVERNANCE_OFFICER receives HTTP 403 for repair', async () => {
  const origNodeEnv = process.env.NODE_ENV;
  const origFlag = process.env.ENABLE_AUDIT_TAMPER_DEMO;

  try {
    process.env.NODE_ENV = 'development';
    process.env.ENABLE_AUDIT_TAMPER_DEMO = 'true';

    const { req, res } = createMockReqRes({
      user: governanceOfficerUser
    });

    const passed = runAuditAdminPipeline(req, res);
    assert.equal(passed, false, 'GOVERNANCE_OFFICER must be rejected for repair');
    assert.equal(res.statusCode, 403);
    assert.ok(res.data.error.includes('Forbidden: Action requires role [PLATFORM_ADMIN]'));
  } finally {
    process.env.NODE_ENV = origNodeEnv;
    process.env.ENABLE_AUDIT_TAMPER_DEMO = origFlag;
  }
});

test('Audit RBAC: 20. EXECUTIVE_APPROVER receives HTTP 403 for simulate-tamper and repair', async () => {
  const origNodeEnv = process.env.NODE_ENV;
  const origFlag = process.env.ENABLE_AUDIT_TAMPER_DEMO;

  try {
    process.env.NODE_ENV = 'development';
    process.env.ENABLE_AUDIT_TAMPER_DEMO = 'true';

    // 1. simulate-tamper
    const { req: tReq, res: tRes } = createMockReqRes({ user: executiveApproverUser });
    assert.equal(runAuditAdminPipeline(tReq, tRes), false);
    assert.equal(tRes.statusCode, 403);

    // 2. repair
    const { req: rReq, res: rRes } = createMockReqRes({ user: executiveApproverUser });
    assert.equal(runAuditAdminPipeline(rReq, rRes), false);
    assert.equal(rRes.statusCode, 403);
  } finally {
    process.env.NODE_ENV = origNodeEnv;
    process.env.ENABLE_AUDIT_TAMPER_DEMO = origFlag;
  }
});

test('Audit RBAC: 21. Pending and suspended users remain blocked from demo audit controls', async () => {
  const origNodeEnv = process.env.NODE_ENV;
  const origFlag = process.env.ENABLE_AUDIT_TAMPER_DEMO;

  try {
    process.env.NODE_ENV = 'development';
    process.env.ENABLE_AUDIT_TAMPER_DEMO = 'true';

    // Pending admin
    const { req: pReq, res: pRes } = createMockReqRes({ user: pendingAdminUser });
    assert.equal(runAuditAdminPipeline(pReq, pRes), false);
    assert.equal(pRes.statusCode, 403);
    assert.ok(pRes.data.error.includes('pending'));

    // Suspended admin
    const { req: sReq, res: sRes } = createMockReqRes({ user: suspendedAdminUser });
    assert.equal(runAuditAdminPipeline(sReq, sRes), false);
    assert.equal(sRes.statusCode, 403);
    assert.ok(sRes.data.error.includes('suspended'));
  } finally {
    process.env.NODE_ENV = origNodeEnv;
    process.env.ENABLE_AUDIT_TAMPER_DEMO = origFlag;
  }
});

test('Audit RBAC: 22. Production environment strictly blocks simulate-tamper and repair even for PLATFORM_ADMIN', async () => {
  const origNodeEnv = process.env.NODE_ENV;
  const origFlag = process.env.ENABLE_AUDIT_TAMPER_DEMO;

  try {
    process.env.NODE_ENV = 'production';
    process.env.ENABLE_AUDIT_TAMPER_DEMO = 'true';

    const { req, res } = createMockReqRes({ user: platformAdminUser });
    const passed = runAuditAdminPipeline(req, res);

    assert.equal(passed, false);
    assert.equal(res.statusCode, 403);
    assert.ok(res.data.error.includes('strictly disabled in production'));
  } finally {
    process.env.NODE_ENV = origNodeEnv;
    process.env.ENABLE_AUDIT_TAMPER_DEMO = origFlag;
  }
});

test('Audit RBAC: 23. ENABLE_AUDIT_TAMPER_DEMO=false strictly blocks simulate-tamper and repair even for PLATFORM_ADMIN', async () => {
  const origNodeEnv = process.env.NODE_ENV;
  const origFlag = process.env.ENABLE_AUDIT_TAMPER_DEMO;

  try {
    process.env.NODE_ENV = 'development';
    process.env.ENABLE_AUDIT_TAMPER_DEMO = 'false';

    const { req, res } = createMockReqRes({ user: platformAdminUser });
    const passed = runAuditAdminPipeline(req, res);

    assert.equal(passed, false);
    assert.equal(res.statusCode, 403);
    assert.ok(res.data.error.includes('strictly disabled in production'));
  } finally {
    process.env.NODE_ENV = origNodeEnv;
    process.env.ENABLE_AUDIT_TAMPER_DEMO = origFlag;
  }
});

test('Audit RBAC: 24. Final audit-chain integrity verifies 100% valid after test executions', async () => {
  const verification = await verifyAuditChainIntegrity();
  assert.equal(verification.valid, true);
  assert.equal(verification.brokenAtSequence, null);
});
