import test from 'node:test';
import assert from 'node:assert';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { Model } from '../src/models/Model.js';
import { ModelVersion } from '../src/models/ModelVersion.js';
import { Policy } from '../src/models/Policy.js';
import { Approval } from '../src/models/Approval.js';
import { Incident } from '../src/models/Incident.js';
import { Telemetry } from '../src/models/Telemetry.js';
import { User } from '../src/models/User.js';

import * as telemetryCtrl from '../src/controllers/telemetryController.js';
import * as incidentCtrl from '../src/controllers/incidentController.js';
import * as approvalCtrl from '../src/controllers/approvalController.js';
import * as modelCtrl from '../src/controllers/modelController.js';
import { executeRollback } from '../src/services/incidentService.js';

let mongoServer;
let mlLeadUser;
let execSponsorUser;
let testModel;
let v1Version;
let v2Version;
let customPolicy;

function createMockReqRes({ params = {}, query = {}, body = {}, user = null } = {}) {
  const req = { params, query, body, user };
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

test.before(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  mlLeadUser = await User.create({
    googleId: 'flow-ml-lead-id',
    email: 'flow.lead@aegis.ai',
    name: 'Dr. Lead Flow',
    role: 'ML_LEAD',
    status: 'ACTIVE'
  });

  execSponsorUser = await User.create({
    googleId: 'flow-exec-id',
    email: 'flow.exec@aegis.ai',
    name: 'Evelyn Executive',
    role: 'EXECUTIVE_APPROVER',
    status: 'ACTIVE'
  });

  customPolicy = await Policy.create({
    name: 'Custom Underwriting Policy v2',
    description: 'Model-specific custom governance policy with strict thresholds',
    targetRiskLevel: 'HIGH',
    rules: {
      minDisparateImpact: 0.82,
      maxDisparateImpact: 1.20,
      maxDemographicParityDiff: 0.08,
      minRocAuc: 0.88,
      minAccuracy: 0.82,
      maxPsiThreshold: 0.20
    },
    requiredApprovers: ['ML_LEAD', 'GOVERNANCE_OFFICER', 'EXECUTIVE_APPROVER'],
    failureAction: 'BLOCK_PROMOTION',
    isActive: true
  });

  testModel = await Model.create({
    name: 'Flow Verification Model Alpha',
    description: 'Testing end-to-end governance flow corrections',
    purpose: 'Risk Scoring',
    owner: 'Governance Engineering',
    team: 'AI Safety',
    riskLevel: 'HIGH',
    policyId: customPolicy._id,
    lifecycleStatus: 'IN_PRODUCTION'
  });

  v1Version = await ModelVersion.create({
    modelId: testModel._id,
    version: 'v1.0',
    lifecycleStatus: 'RETIRED',
    deploymentStatus: 'RETIRED',
    policyStatus: 'PASSED',
    approvalStatus: 'APPROVED'
  });

  v2Version = await ModelVersion.create({
    modelId: testModel._id,
    version: 'v2.0',
    lifecycleStatus: 'IN_PRODUCTION',
    deploymentStatus: 'IN_PRODUCTION',
    policyStatus: 'PASSED',
    approvalStatus: 'APPROVED'
  });

  testModel.currentProductionVersionId = v2Version._id;
  await testModel.save();
});

test.after(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

// ============================================================================
// 1. INCIDENT DUPLICATION PREVENTION
// ============================================================================

test('Governance Flow: 1. Repeated drift simulation on active model/version updates existing open incident without creating duplicates', async () => {
  const initialIncidentCount = await Incident.countDocuments({ modelId: testModel._id });

  // 1st Drift simulation
  const { req: req1, res: res1 } = createMockReqRes({
    user: mlLeadUser,
    body: {
      modelId: testModel._id,
      versionId: v2Version._id,
      scenario: 'DRIFTED',
      sampleSize: 2500
    }
  });

  await telemetryCtrl.simulateTelemetryBatch(req1, res1);
  assert.strictEqual(res1.statusCode, 201);
  const inc1 = res1.data.data.incident;
  assert.ok(inc1);
  const inc1Id = String(inc1._id);

  const countAfterFirst = await Incident.countDocuments({ modelId: testModel._id });
  assert.strictEqual(countAfterFirst, initialIncidentCount + 1);

  // 2nd Drift simulation on SAME model and version
  const { req: req2, res: res2 } = createMockReqRes({
    user: mlLeadUser,
    body: {
      modelId: testModel._id,
      versionId: v2Version._id,
      scenario: 'DRIFTED',
      sampleSize: 2500
    }
  });

  await telemetryCtrl.simulateTelemetryBatch(req2, res2);
  assert.strictEqual(res2.statusCode, 201);
  const inc2 = res2.data.data.incident;
  assert.ok(inc2);

  // Must have linked and updated the SAME incident, not created a duplicate
  assert.strictEqual(String(inc2._id), inc1Id);

  const countAfterSecond = await Incident.countDocuments({ modelId: testModel._id });
  assert.strictEqual(countAfterSecond, countAfterFirst, 'Incident count must not increase for recurring drift on open incident');

  // Verify telemetry was bidirectional linked to that same incident
  assert.strictEqual(String(res2.data.data.telemetry.incidentId), inc1Id);
});

// ============================================================================
// 2. STABLE TELEMETRY PRESERVES OPEN INCIDENTS
// ============================================================================

test('Governance Flow: 2. Stable telemetry arriving after drift does NOT delete, erase or close open incidents', async () => {
  const openIncidentsBefore = await Incident.find({
    modelId: testModel._id,
    status: { $in: ['OPEN', 'INVESTIGATING'] }
  });
  assert.ok(openIncidentsBefore.length > 0, 'Must have at least one active incident before test');

  // Ingest healthy / stable batch
  const { req, res } = createMockReqRes({
    user: mlLeadUser,
    body: {
      modelId: testModel._id,
      versionId: v2Version._id,
      scenario: 'STABLE',
      sampleSize: 2000
    }
  });

  await telemetryCtrl.simulateTelemetryBatch(req, res);
  assert.strictEqual(res.statusCode, 201);
  assert.strictEqual(res.data.data.telemetry.driftStatus, 'HEALTHY');

  // Verify open incident still exists and status is unchanged
  const openIncidentsAfter = await Incident.find({
    modelId: testModel._id,
    status: { $in: ['OPEN', 'INVESTIGATING'] }
  });
  assert.strictEqual(openIncidentsAfter.length, openIncidentsBefore.length);
  assert.strictEqual(openIncidentsAfter[0].status, 'OPEN');
});

// ============================================================================
// 3. ROLLBACK TO PREVIOUSLY RETIRED BASELINE VERSION
// ============================================================================

test('Governance Flow: 3. Rollback correctly identifies and promotes retired/deprecated baseline version (v1.0)', async () => {
  const activeIncident = await Incident.findOne({
    modelId: testModel._id,
    status: 'OPEN'
  });
  assert.ok(activeIncident);
  assert.strictEqual(activeIncident.recommendedAction, 'ROLLBACK');
  assert.strictEqual(String(activeIncident.recommendedRollbackVersionId), String(v1Version._id));

  // Execute rollback
  const rollbackResult = await executeRollback({
    incidentId: activeIncident._id,
    modelId: testModel._id,
    targetVersionId: v1Version._id,
    actor: execSponsorUser.name,
    role: execSponsorUser.role,
    rationale: 'Controlled rollback to verified v1.0 baseline'
  });

  assert.strictEqual(rollbackResult.success, true);
  assert.strictEqual(rollbackResult.activeVersion, 'v1.0');

  // Verify state mutations
  const updatedModel = await Model.findById(testModel._id);
  const updatedV1 = await ModelVersion.findById(v1Version._id);
  const updatedV2 = await ModelVersion.findById(v2Version._id);
  const updatedIncident = await Incident.findById(activeIncident._id);

  assert.strictEqual(String(updatedModel.currentProductionVersionId), String(v1Version._id));
  assert.strictEqual(updatedV1.deploymentStatus, 'IN_PRODUCTION');
  assert.strictEqual(updatedV1.lifecycleStatus, 'IN_PRODUCTION');
  assert.strictEqual(updatedV2.deploymentStatus, 'ROLLED_BACK');
  assert.strictEqual(updatedIncident.status, 'MITIGATED');
});

// ============================================================================
// 4. APPROVAL CENTER: COMPLETED APPROVALS QUERY & RETENTION
// ============================================================================

test('Governance Flow: 4. Approval Center returns completed approvals with full sign-off records', async () => {
  // Create version that undergoes multi-stakeholder sign-off
  const approvalModel = await Model.create({
    name: 'Approval Showcase Model',
    description: 'Demonstrating 4-role sign-off completion',
    purpose: 'Signoff Verification',
    owner: 'Compliance Dept',
    team: 'Risk',
    riskLevel: 'HIGH',
    lifecycleStatus: 'PENDING_APPROVAL'
  });

  const approvalVersion = await ModelVersion.create({
    modelId: approvalModel._id,
    version: 'v1.0',
    lifecycleStatus: 'PENDING_APPROVAL',
    policyStatus: 'PASSED',
    approvalStatus: 'PENDING_APPROVAL'
  });

  // Check pending query includes this version
  const { req: pReq, res: pRes } = createMockReqRes({ query: { status: 'pending' } });
  await approvalCtrl.getPendingApprovals(pReq, pRes);
  assert.strictEqual(pRes.statusCode, 200);
  const foundPending = pRes.data.data.find(i => String(i.version._id) === String(approvalVersion._id));
  assert.ok(foundPending, 'Version should appear in pending queue');

  // Sign off by all 3 mandatory roles
  const roles = ['ML_LEAD', 'GOVERNANCE_OFFICER', 'EXECUTIVE_APPROVER'];
  for (const r of roles) {
    const { req: sReq, res: sRes } = createMockReqRes({
      params: { versionId: String(approvalVersion._id) },
      user: { name: `Signer ${r}`, email: `${r.toLowerCase()}@aegis.ai`, role: r },
      body: { decision: 'APPROVED', comment: `Formally signed by ${r}` }
    });
    await approvalCtrl.submitApprovalDecision(sReq, sRes);
    assert.strictEqual(sRes.statusCode, 200);
  }

  // Version should now be APPROVED
  const refreshedVersion = await ModelVersion.findById(approvalVersion._id);
  assert.strictEqual(refreshedVersion.lifecycleStatus, 'APPROVED');
  assert.strictEqual(refreshedVersion.approvalStatus, 'APPROVED');

  // Query completed approvals
  const { req: cReq, res: cRes } = createMockReqRes();
  await approvalCtrl.getCompletedApprovals(cReq, cRes);
  assert.strictEqual(cRes.statusCode, 200);
  const foundCompleted = cRes.data.data.find(i => String(i.version._id) === String(approvalVersion._id));
  assert.ok(foundCompleted, 'Approved version must appear in completed/approved history queue');
  assert.strictEqual(foundCompleted.approvals.length, 3, 'All 3 sign-offs must be present in history');
});

// ============================================================================
// 5. MODEL-SPECIFIC POLICY BINDING
// ============================================================================

test('Governance Flow: 5. getModelById returns model-specific policy when policyId is bound', async () => {
  const { req, res } = createMockReqRes({
    params: { id: String(testModel._id) }
  });

  await modelCtrl.getModelById(req, res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.data.success, true);
  assert.strictEqual(String(res.data.data.activePolicy._id), String(customPolicy._id));
  assert.strictEqual(res.data.data.activePolicy.name, 'Custom Underwriting Policy v2');
});
