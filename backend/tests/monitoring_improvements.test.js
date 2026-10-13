import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { Model } from '../src/models/Model.js';
import { ModelVersion } from '../src/models/ModelVersion.js';
import { User } from '../src/models/User.js';
import { Telemetry } from '../src/models/Telemetry.js';
import { Incident } from '../src/models/Incident.js';
import { AuditLedger } from '../src/models/AuditLedger.js';
import { requireRole, requireActiveUser } from '../src/middleware/authMiddleware.js';
import * as telemetryCtrl from '../src/controllers/telemetryController.js';
import { calculatePSI, evaluateDriftStatus, generateTelemetryBatch } from '../src/services/driftEngine.js';
import { createDriftIncident } from '../src/services/incidentService.js';
import { verifyAuditChainIntegrity } from '../src/services/auditEngine.js';

let mongoServer;

// Users
let mlLeadUser;
let governanceOfficerUser;
let platformAdminUser;
let pendingUser;
let suspendedUser;

// Model & Versions
let testModel;
let v1ApprovedBaseline;
let v2Production;

function createMockReqRes({ user, body = {}, params = {}, query = {} }) {
  const req = {
    user,
    body,
    params,
    query,
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

test.before(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  mlLeadUser = await User.create({
    googleId: 'mon-ml-lead-id',
    email: 'lead.monitoring@aegis.ai',
    name: 'Dr. Jane Lead',
    role: 'ML_LEAD',
    status: 'ACTIVE'
  });

  governanceOfficerUser = await User.create({
    googleId: 'mon-gov-id',
    email: 'gov.monitoring@aegis.ai',
    name: 'Grace Governance',
    role: 'GOVERNANCE_OFFICER',
    status: 'ACTIVE'
  });

  platformAdminUser = await User.create({
    googleId: 'mon-admin-id',
    email: 'admin.platform@aegis.ai',
    name: 'Alex Admin',
    role: 'PLATFORM_ADMIN',
    status: 'ACTIVE'
  });

  pendingUser = await User.create({
    googleId: 'mon-pending-id',
    email: 'pending.user@aegis.ai',
    name: 'Penny Pending',
    role: 'ML_LEAD',
    status: 'PENDING'
  });

  suspendedUser = await User.create({
    googleId: 'mon-suspended-id',
    email: 'suspended.user@aegis.ai',
    name: 'Sam Suspended',
    role: 'ML_LEAD',
    status: 'SUSPENDED'
  });

  testModel = await Model.create({
    name: 'Credit Risk Scorer — Phase 10 Monitored',
    description: 'Monitored production underwriting system',
    purpose: 'Underwriting',
    owner: 'Risk Engineering',
    team: 'Credit Risk',
    riskLevel: 'HIGH',
    lifecycleStatus: 'IN_PRODUCTION'
  });

  v1ApprovedBaseline = await ModelVersion.create({
    modelId: testModel._id,
    version: 'v1.0',
    lifecycleStatus: 'APPROVED',
    deploymentStatus: 'IN_PRODUCTION',
    policyStatus: 'PASSED',
    approvalStatus: 'APPROVED'
  });

  v2Production = await ModelVersion.create({
    modelId: testModel._id,
    version: 'v2.0',
    lifecycleStatus: 'IN_PRODUCTION',
    deploymentStatus: 'IN_PRODUCTION',
    policyStatus: 'PASSED',
    approvalStatus: 'APPROVED'
  });

  testModel.currentProductionVersionId = v2Production._id;
  await testModel.save();
});

test.after(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

// ============================================================================
// 1. DATA MODEL INTEGRITY & BIDIRECTIONAL LINKAGE
// ============================================================================

test('Monitoring Model: 1. Telemetry and Incident schemas support bidirectional reference', async () => {
  const telemetry = await Telemetry.create({
    modelId: testModel._id,
    versionId: v2Production._id,
    batchId: 'BATCH-INIT-001',
    sampleSize: 1000,
    aggregatePsi: 0.04,
    driftStatus: 'HEALTHY'
  });

  assert.strictEqual(telemetry.incidentId, null);

  const incident = await Incident.create({
    incidentNumber: 'INC-INIT-001',
    modelId: testModel._id,
    versionId: v2Production._id,
    type: 'DATA_DRIFT',
    title: 'Initial Drift Test',
    description: 'Testing schema linkages',
    severity: 'MEDIUM',
    telemetryRef: telemetry._id
  });

  telemetry.incidentId = incident._id;
  await telemetry.save();

  const refreshedTelemetry = await Telemetry.findById(telemetry._id).populate('incidentId');
  const refreshedIncident = await Incident.findById(incident._id).populate('telemetryRef');

  assert.strictEqual(String(refreshedTelemetry.incidentId._id), String(incident._id));
  assert.strictEqual(String(refreshedIncident.telemetryRef._id), String(telemetry._id));
});

// ============================================================================
// 2. TELEMETRY → DRIFT DETECTION → INCIDENT CREATION
// ============================================================================

test('Telemetry Pipeline: 2. Stable telemetry records healthy status and does NOT generate incident', async () => {
  const { req, res } = createMockReqRes({
    user: mlLeadUser,
    body: {
      modelId: testModel._id,
      versionId: v2Production._id,
      scenario: 'STABLE',
      sampleSize: 2000
    }
  });

  await telemetryCtrl.simulateTelemetryBatch(req, res);

  assert.strictEqual(res.statusCode, 201);
  assert.strictEqual(res.data.success, true);
  assert.strictEqual(res.data.data.telemetry.driftStatus, 'HEALTHY');
  assert.ok(res.data.data.telemetry.aggregatePsi < 0.10);
  assert.strictEqual(res.data.data.incident, null);
  assert.strictEqual(res.data.data.telemetry.incidentId, null);
});

test('Telemetry Pipeline: 3. Drifted telemetry (PSI >= 0.25) detects drift, records audit, and creates Incident with bidirectional link', async () => {
  const { req, res } = createMockReqRes({
    user: mlLeadUser,
    body: {
      modelId: testModel._id,
      versionId: v2Production._id,
      scenario: 'DRIFTED',
      sampleSize: 2500
    }
  });

  await telemetryCtrl.simulateTelemetryBatch(req, res);

  assert.strictEqual(res.statusCode, 201);
  assert.strictEqual(res.data.success, true);
  assert.strictEqual(res.data.data.telemetry.driftStatus, 'DRIFT_DETECTED');
  assert.ok(res.data.data.telemetry.aggregatePsi >= 0.25);

  const incident = res.data.data.incident;
  assert.ok(incident);
  assert.ok(incident.incidentNumber.startsWith('INC-'));
  assert.strictEqual(incident.type, 'DATA_DRIFT');
  assert.strictEqual(incident.recommendedAction, 'ROLLBACK');
  assert.strictEqual(String(incident.recommendedRollbackVersionId), String(v1ApprovedBaseline._id));

  // Verify bidirectional linkage in persisted records
  const savedTelemetry = await Telemetry.findById(res.data.data.telemetry._id);
  const savedIncident = await Incident.findById(incident._id);

  assert.strictEqual(String(savedTelemetry.incidentId), String(savedIncident._id));
  assert.strictEqual(String(savedIncident.telemetryRef), String(savedTelemetry._id));

  // Verify audit event
  const driftAudit = await AuditLedger.findOne({
    action: 'DRIFT_DETECTED',
    entityId: String(savedTelemetry._id)
  });
  assert.ok(driftAudit);
  assert.strictEqual(driftAudit.actor, mlLeadUser.name);
});

// ============================================================================
// 3. MONITORING OVERVIEW & SIGNAL STATUS RESOLUTION
// ============================================================================

test('Monitoring Overview: 4. Returns model, version, telemetry stream, thresholds, and signalStatus', async () => {
  const { req, res } = createMockReqRes({
    params: { modelId: String(testModel._id) }
  });

  await telemetryCtrl.getMonitoringOverview(req, res);

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.data.success, true);

  const overview = res.data.data;
  assert.strictEqual(overview.model.name, testModel.name);
  assert.strictEqual(overview.version.version, 'v2.0');
  assert.deepStrictEqual(overview.thresholds, { warning: 0.10, incident: 0.25 });
  assert.ok(Array.isArray(overview.recentTrend));
  assert.ok(overview.recentTrend.length > 0);
  assert.ok(Array.isArray(overview.telemetryHistory));

  // Since a drift incident was opened in the previous test, signalStatus should be INCIDENT_ACTIVE
  assert.strictEqual(overview.signalStatus, 'INCIDENT_ACTIVE');
  assert.ok(overview.activeIncidents.length > 0);
});

test('Monitoring Overview: 5. Empty model returns NO_DATA status cleanly without fabricated data', async () => {
  const unmonitoredModel = await Model.create({
    name: 'Unmonitored Model Alpha',
    description: 'Brand new model without inference history',
    purpose: 'Fraud',
    owner: 'Security',
    team: 'SecOps',
    riskLevel: 'LIMITED',
    lifecycleStatus: 'DRAFT'
  });

  const { req, res } = createMockReqRes({
    params: { modelId: String(unmonitoredModel._id) }
  });

  await telemetryCtrl.getMonitoringOverview(req, res);

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.data.success, true);
  assert.strictEqual(res.data.data.signalStatus, 'NO_DATA');
  assert.strictEqual(res.data.data.latestTelemetry, null);
  assert.strictEqual(res.data.data.recentTrend.length, 0);
  assert.strictEqual(res.data.data.telemetryHistory.length, 0);
});

// ============================================================================
// 4. CRITICAL SAFETY & ROLLBACK SEPARATION
// ============================================================================

test('Safety: 6. Drift detection NEVER automatically executes rollback or mutates lifecycle', async () => {
  const modelBefore = await Model.findById(testModel._id);
  const v2Before = await ModelVersion.findById(v2Production._id);
  const v1Before = await ModelVersion.findById(v1ApprovedBaseline._id);

  // Ingest severe drift
  const { req, res } = createMockReqRes({
    user: mlLeadUser,
    body: {
      modelId: testModel._id,
      versionId: v2Production._id,
      scenario: 'DRIFTED'
    }
  });

  await telemetryCtrl.simulateTelemetryBatch(req, res);

  assert.strictEqual(res.statusCode, 201);

  // Model production pointer MUST remain completely untouched
  const modelAfter = await Model.findById(testModel._id);
  const v2After = await ModelVersion.findById(v2Production._id);
  const v1After = await ModelVersion.findById(v1ApprovedBaseline._id);

  assert.strictEqual(String(modelAfter.currentProductionVersionId), String(modelBefore.currentProductionVersionId));
  assert.strictEqual(modelAfter.lifecycleStatus, 'IN_PRODUCTION');

  assert.strictEqual(v2After.lifecycleStatus, 'IN_PRODUCTION');
  assert.strictEqual(v2After.deploymentStatus, 'IN_PRODUCTION');

  assert.strictEqual(v1After.lifecycleStatus, v1Before.lifecycleStatus);
  assert.strictEqual(v1After.deploymentStatus, v1Before.deploymentStatus);
});

// ============================================================================
// 5. RBAC & IDENTITY ENFORCEMENT
// ============================================================================

test('RBAC: 7. Unauthorized roles (Governance Officer, Platform Admin) are blocked from simulating telemetry', async () => {
  const middleware = requireRole('ML_LEAD');

  // Governance Officer
  let nextGov = false;
  const { req: r1, res: res1 } = createMockReqRes({ user: governanceOfficerUser });
  middleware(r1, res1, () => { nextGov = true; });
  assert.strictEqual(nextGov, false);
  assert.strictEqual(res1.statusCode, 403);

  // Platform Admin (Separation of duties)
  let nextAdmin = false;
  const { req: r2, res: res2 } = createMockReqRes({ user: platformAdminUser });
  middleware(r2, res2, () => { nextAdmin = true; });
  assert.strictEqual(nextAdmin, false);
  assert.strictEqual(res2.statusCode, 403);
});

test('RBAC: 8. Pending and suspended users are rejected by requireActiveUser', async () => {
  const middleware = requireActiveUser;

  // Pending user
  let nextPending = false;
  const { req: r1, res: res1 } = createMockReqRes({ user: pendingUser });
  middleware(r1, res1, () => { nextPending = true; });
  assert.strictEqual(nextPending, false);
  assert.strictEqual(res1.statusCode, 403);

  // Suspended user
  let nextSuspended = false;
  const { req: r2, res: res2 } = createMockReqRes({ user: suspendedUser });
  middleware(r2, res2, () => { nextSuspended = true; });
  assert.strictEqual(nextSuspended, false);
  assert.strictEqual(res2.statusCode, 403);
});

test('Audit: 9. Complete cryptographic SHA-256 chain integrity verifies successfully', async () => {
  const integrity = await verifyAuditChainIntegrity();

  assert.strictEqual(integrity.valid, true);
  assert.ok(integrity.totalBlocks > 0);
  assert.strictEqual(integrity.brokenAtSequence, null);
});
