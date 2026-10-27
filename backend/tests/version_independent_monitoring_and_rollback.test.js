import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import { Model } from '../src/models/Model.js';
import { ModelVersion } from '../src/models/ModelVersion.js';
import { Telemetry } from '../src/models/Telemetry.js';
import { Incident } from '../src/models/Incident.js';
import { Monitoring } from '../src/models/Monitoring.js';
import { AuditLedger } from '../src/models/AuditLedger.js';
import { verifyAuditChainIntegrity } from '../src/services/auditEngine.js';
import { executeRollback } from '../src/services/incidentService.js';
import { rollbackModel } from '../src/controllers/incidentController.js';
import { updateModelApiConfig, getModelEndpointConfig } from '../src/controllers/modelController.js';
import { getMonitoringOverview } from '../src/controllers/telemetryController.js';

test('Independent Per-Version Runtime Monitoring & Rollback Test Suite', async (t) => {
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(process.env.MONGODB_URI);
  }

  const model = await Model.findOne({ name: 'CreditLens' });
  assert.ok(model, 'CreditLens model must exist in database');

  const v1 = await ModelVersion.findOne({ modelId: model._id, version: 'v1.0' });
  const v2 = await ModelVersion.findOne({ modelId: model._id, version: 'v2.0' });
  assert.ok(v1 && v2, 'Both v1.0 and v2.0 must exist for CreditLens');

  // Establish pre-rollback test conditions:
  // v2.0 is in production with an active open drift incident, awaiting ML Lead rollback to v1.0
  const existingInc = await Incident.findOne({ modelId: model._id, versionId: v2._id });
  if (existingInc) {
    existingInc.status = 'OPEN';
    existingInc.resolvedAt = null;
    existingInc.resolvedBy = null;
    await existingInc.save();
  }

  model.currentProductionVersionId = v2._id;
  await model.save();

  v2.lifecycleStatus = 'IN_PRODUCTION';
  v2.deploymentStatus = 'IN_PRODUCTION';
  await v2.save();

  v1.policyStatus = 'PASSED';
  v1.approvalStatus = 'APPROVED';
  v1.lifecycleStatus = 'APPROVED';
  v1.deploymentStatus = 'RETIRED';
  await v1.save();

  await Monitoring.updateMany({ modelId: model._id, versionId: v1._id }, { $set: { monitoringStatus: 'PAUSED' } });
  await Monitoring.updateMany({ modelId: model._id, versionId: v2._id }, { $set: { monitoringStatus: 'ACTIVE' } });

  await t.test('1. Preserve Model Default: Version override never overwrites model default endpoint configuration', async () => {
    // Save model default URL
    const originalDefaultUrl = model.apiConfig?.endpointUrl;
    assert.ok(originalDefaultUrl, 'Model must have default endpoint URL');

    // Simulate update to v2.0 override via controller
    const req = {
      params: { id: String(model._id) },
      body: {
        versionId: String(v2._id),
        endpointUrl: 'https://credit-risk-scoring-58zh.onrender.com',
        predictEndpoint: '/score',
        healthEndpoint: '/health',
        method: 'POST',
        requestMapping: { wrapperKey: '', isArray: false, staticFields: null },
        responseMapping: { predictionField: 'probability_of_default' }
      },
      user: { name: 'ML Lead Test', email: 'mllead@sentinel.ai', role: 'ML_LEAD' }
    };

    let responseData = null;
    const res = {
      json: (d) => { responseData = d; },
      status: () => res
    };

    await updateModelApiConfig(req, res);
    assert.equal(responseData?.success, true, 'Version override update must succeed');

    // Reload model and verify model default is untouched
    const reloadedModel = await Model.findById(model._id);
    assert.equal(
      reloadedModel.apiConfig.endpointUrl,
      originalDefaultUrl,
      'Model default endpointUrl must NOT be overwritten by version override'
    );
    assert.equal(
      reloadedModel.apiConfig.predictEndpoint,
      '/predict',
      'Model default predictEndpoint must remain untouched'
    );

    // Verify v2.0 has its own distinct override
    const reloadedV2 = await ModelVersion.findById(v2._id);
    assert.equal(
      reloadedV2.apiConfig.endpointUrl,
      'https://credit-risk-scoring-58zh.onrender.com',
      'v2.0 must store its independent endpoint URL'
    );
    assert.equal(
      reloadedV2.apiConfig.predictEndpoint,
      '/score',
      'v2.0 must store its independent predict endpoint'
    );
  });

  await t.test('2. Independent Overview Scoping: Overview strictly isolates telemetry and incidents by versionId', async () => {
    // Query overview for v1.0
    let v1OverviewData = null;
    await getMonitoringOverview(
      { params: { modelId: String(model._id) }, query: { versionId: String(v1._id) } },
      { json: (d) => { v1OverviewData = d.data; }, status: () => ({ json: () => {} }) }
    );

    assert.ok(v1OverviewData, 'v1.0 overview data must be returned');
    assert.equal(v1OverviewData.version.version, 'v1.0', 'Overview must resolve to v1.0');
    assert.equal(v1OverviewData.signalStatus, 'HEALTHY', 'v1.0 must be HEALTHY');
    assert.equal(v1OverviewData.activeIncidents.length, 0, 'v1.0 must have 0 active incidents');
    assert.ok(v1OverviewData.telemetryHistory.length > 0, 'v1.0 must have historical telemetry');
    assert.ok(
      v1OverviewData.telemetryHistory.every(t => String(t.versionId._id || t.versionId) === String(v1._id)),
      'v1.0 telemetry history must strictly contain only v1.0 records'
    );

    // Query overview for v2.0
    let v2OverviewData = null;
    await getMonitoringOverview(
      { params: { modelId: String(model._id) }, query: { versionId: String(v2._id) } },
      { json: (d) => { v2OverviewData = d.data; }, status: () => ({ json: () => {} }) }
    );

    assert.ok(v2OverviewData, 'v2.0 overview data must be returned');
    assert.equal(v2OverviewData.version.version, 'v2.0', 'Overview must resolve to v2.0');
    assert.equal(v2OverviewData.signalStatus, 'INCIDENT_ACTIVE', 'v2.0 must report INCIDENT_ACTIVE due to drift');
    assert.equal(v2OverviewData.activeIncidents.length, 1, 'v2.0 must have exactly 1 active incident');
    assert.equal(v2OverviewData.activeIncidents[0].incidentNumber, 'INC-001');
    assert.ok(
      v2OverviewData.telemetryHistory.every(t => String(t.versionId._id || t.versionId) === String(v2._id)),
      'v2.0 telemetry history must strictly contain only v2.0 records'
    );

    // Verify both healthy points and drift point exist on v2.0 trend
    const healthyTrendCount = v2OverviewData.recentTrend.filter(t => t.driftStatus === 'HEALTHY').length;
    const driftTrendCount = v2OverviewData.recentTrend.filter(t => t.driftStatus === 'DRIFT_DETECTED').length;
    assert.ok(healthyTrendCount >= 2, 'v2.0 trend must contain at least 2 healthy points');
    assert.ok(driftTrendCount >= 1, 'v2.0 trend must contain at least 1 drift point');
  });

  await t.test('3. Drift Isolation: v2.0 drift incident does not alter v1.0 status or telemetry', async () => {
    const v1Telemetries = await Telemetry.find({ modelId: model._id, versionId: v1._id });
    const v1Drifted = v1Telemetries.filter(t => t.driftStatus === 'DRIFT_DETECTED');
    assert.equal(v1Drifted.length, 0, 'v1.0 must have ZERO drifted telemetries');

    const v1Incidents = await Incident.find({ modelId: model._id, versionId: v1._id, status: { $in: ['OPEN', 'INVESTIGATING'] } });
    assert.equal(v1Incidents.length, 0, 'v1.0 must have ZERO active incidents');
  });

  await t.test('4. Rollback Authorization: Non-ML Lead rejected (403), empty rationale rejected (400)', async () => {
    // 4a. Viewer rejected with 403
    let forbiddenStatusCode = null;
    let forbiddenBody = null;
    const resForbidden = {
      status: (code) => {
        forbiddenStatusCode = code;
        return { json: (b) => { forbiddenBody = b; } };
      }
    };

    await rollbackModel(
      {
        body: {
          modelId: String(model._id),
          targetVersionId: String(v1._id),
          rationale: 'Valid rationale'
        },
        user: { name: 'Governance User', email: 'gov@sentinel.ai', role: 'GOVERNANCE_OFFICER' }
      },
      resForbidden
    );

    assert.equal(forbiddenStatusCode, 403, 'Non-ML Lead must be rejected with HTTP 403');
    assert.equal(forbiddenBody?.success, false);

    // 4b. Empty rationale rejected with 400
    let badRequestStatusCode = null;
    let badRequestBody = null;
    const resBadRequest = {
      status: (code) => {
        badRequestStatusCode = code;
        return { json: (b) => { badRequestBody = b; } };
      }
    };

    await rollbackModel(
      {
        body: {
          modelId: String(model._id),
          targetVersionId: String(v1._id),
          rationale: '   '
        },
        user: { name: 'ML Lead', email: 'mllead@sentinel.ai', role: 'ML_LEAD' }
      },
      resBadRequest
    );

    assert.equal(badRequestStatusCode, 400, 'Empty rationale must be rejected with HTTP 400');
    assert.equal(badRequestBody?.success, false);
  });

  await t.test('5. Rollback Execution: ML Lead rollback restores v1.0, pauses v2.0 stream, preserves history', async () => {
    const inc = await Incident.findOne({ modelId: model._id, versionId: v2._id, status: 'OPEN' });
    assert.ok(inc, 'Open incident must exist on v2.0 for rollback execution');

    let rollbackResult = null;
    const resSuccess = {
      status: () => resSuccess,
      json: (d) => { rollbackResult = d; }
    };

    await rollbackModel(
      {
        body: {
          incidentId: String(inc._id),
          modelId: String(model._id),
          targetVersionId: String(v1._id),
          rationale: 'Mitigating statistical distribution shift on v2.0. Restoring certified baseline v1.0.'
        },
        user: { name: 'Dr. Evelyn Reed (ML Lead)', email: 'mllead@sentinel.ai', role: 'ML_LEAD' }
      },
      resSuccess
    );

    assert.equal(rollbackResult?.success, true, 'Rollback must execute successfully');
    assert.equal(rollbackResult?.data?.activeVersion, 'v1.0');

    // Verify Model production routing
    const updatedModel = await Model.findById(model._id);
    assert.equal(String(updatedModel.currentProductionVersionId), String(v1._id), 'Model production must point to v1.0');

    // Verify Version statuses
    const updatedV1 = await ModelVersion.findById(v1._id);
    const updatedV2 = await ModelVersion.findById(v2._id);
    assert.equal(updatedV1.deploymentStatus, 'IN_PRODUCTION', 'v1.0 deploymentStatus must be IN_PRODUCTION');
    assert.equal(updatedV2.deploymentStatus, 'ROLLED_BACK', 'v2.0 deploymentStatus must be ROLLED_BACK');

    // Verify Incident mitigation
    const updatedInc = await Incident.findById(inc._id);
    assert.equal(updatedInc.status, 'MITIGATED', 'Incident must be marked MITIGATED');
    assert.ok(updatedInc.mitigationNotes.includes('Rolled back to v1.0'), 'Mitigation notes must describe rollback');

    // Verify Monitoring stream statuses
    const monV1 = await Monitoring.findOne({ modelId: model._id, versionId: v1._id });
    const monV2 = await Monitoring.findOne({ modelId: model._id, versionId: v2._id });
    assert.equal(monV1.monitoringStatus, 'ACTIVE', 'v1.0 monitoring stream must be resumed to ACTIVE');
    assert.equal(monV2.monitoringStatus, 'PAUSED', 'v2.0 monitoring stream must be PAUSED');

    // Verify v2.0 historical records are preserved (never deleted)
    const preservedV2Tels = await Telemetry.find({ modelId: model._id, versionId: v2._id });
    assert.equal(preservedV2Tels.length, 3, 'All 3 historical telemetries of v2.0 must be preserved');
  });

  await t.test('6. Audit Ledger Verification: Cryptographic chain remains 100% valid with rollback events recorded', async () => {
    // Verify ROLLBACK_STARTED and ROLLBACK_COMPLETED events
    const startEvent = await AuditLedger.findOne({ action: 'ROLLBACK_STARTED', entityId: model._id }).sort({ sequenceNumber: -1 });
    const compEvent = await AuditLedger.findOne({ action: 'ROLLBACK_COMPLETED', entityId: model._id }).sort({ sequenceNumber: -1 });

    assert.ok(startEvent, 'ROLLBACK_STARTED event must be recorded');
    assert.ok(compEvent, 'ROLLBACK_COMPLETED event must be recorded');
    assert.equal(startEvent.actor, 'Dr. Evelyn Reed (ML Lead)');
    assert.equal(startEvent.role, 'ML_LEAD');

    // Verify full chain integrity
    const chainVerification = await verifyAuditChainIntegrity();
    assert.equal(chainVerification.valid, true, 'Cryptographic audit ledger chain must be 100% valid');
    assert.equal(chainVerification.brokenAtSequence, null, 'No broken sequence permitted');
    console.log(`   Audit Ledger verified: ${chainVerification.totalBlocks} total blocks, chain 100% valid.`);
  });

  await mongoose.disconnect();
});
