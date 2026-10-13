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
import { Monitoring } from '../src/models/Monitoring.js';
import { Deployment } from '../src/models/Deployment.js';

import { authenticateIngestion } from '../src/middleware/authMiddleware.js';
import { generateAegisToken } from '../src/services/googleAuthService.js';
import * as telemetryCtrl from '../src/controllers/telemetryController.js';
import { ingestRuntimeTelemetryBatch } from '../src/services/runtimeMonitoringService.js';
import { verifyAuditChainIntegrity } from '../src/services/auditEngine.js';

let mongoServer;
let mlLeadUser;
let governanceUser;
let testModel;
let v1ApprovedBaseline;
let v2Production;

const VALID_SAMPLE_RECORDS = Array.from({ length: 25 }, (_, i) => ({
  transaction_id: `txn_${i + 1}`,
  user_id: `user_${(i % 5) + 1}`,
  amount: 100 + i * 10,
  timestamp: new Date().toISOString(),
  channel: 'web',
  country: 'US',
  merchant_id: 'merchant_99',
  device_id: 'device_01',
  fraud_risk_score: 0.15 + (i * 0.005),
  ml_supervised_score: 0.12 + (i * 0.004),
  ml_anomaly_score: 0.08 + (i * 0.003),
  rule_heuristic_score: 0.20,
  latency_ms: 18.5
}));

function createMockReqRes({ user, body = {}, params = {}, query = {}, headers = {} }) {
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

  process.env.SENTINEL_INGESTION_KEY = 'test-ingestion-secret-key-12345';
  process.env.MONITORING_SERVICE_URL = 'http://127.0.0.1:8001';

  // Seed users
  mlLeadUser = await User.create({
    name: 'Lead Data Scientist',
    email: 'lead@sentinel.internal',
    passwordHash: 'hashed_pw',
    role: 'ML_LEAD',
    status: 'ACTIVE',
    verificationStatus: 'VERIFIED'
  });

  governanceUser = await User.create({
    name: 'Governance Auditor',
    email: 'gov@sentinel.internal',
    passwordHash: 'hashed_pw',
    role: 'GOVERNANCE_OFFICER',
    status: 'ACTIVE',
    verificationStatus: 'VERIFIED'
  });

  // Seed model and versions
  testModel = await Model.create({
    name: 'Fraud Anomaly Detection System',
    description: 'Real-time production fraud risk classification engine',
    purpose: 'Real-time automated transaction scoring and anomaly detection',
    owner: mlLeadUser.name,
    team: 'Risk & Fraud Engineering',
    riskLevel: 'HIGH',
    lifecycleStatus: 'IN_PRODUCTION'
  });

  v1ApprovedBaseline = await ModelVersion.create({
    modelId: testModel._id,
    version: '1.0.0',
    lifecycleStatus: 'APPROVED',
    approvalStatus: 'APPROVED',
    policyStatus: 'PASSED',
    changelog: 'Initial approved baseline release'
  });

  v2Production = await ModelVersion.create({
    modelId: testModel._id,
    version: '2.0.0',
    lifecycleStatus: 'IN_PRODUCTION',
    approvalStatus: 'APPROVED',
    changelog: 'Live production release undergoing real runtime monitoring'
  });

  testModel.currentProductionVersionId = v2Production._id;
  await testModel.save();
});

test.after(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

test('1. Evidently response parsing: normalizes statistics and extracts drift indicators without fabricating PSI', async () => {
  const originalFetch = global.fetch;
  try {
    global.fetch = async (url, options) => {
      assert.ok(url.includes('/analyze-drift'));
      return {
        ok: true,
        status: 200,
        json: async () => ({
          status: 'success',
          monitoring_source: 'EVIDENTLY',
          drift_detected: true,
          drifted_columns: ['fraud_risk_score', 'ml_supervised_score'],
          records_analyzed: 25,
          threshold: 0.05,
          metrics: [
            {
              column: 'fraud_risk_score',
              method: 'K-S',
              p_value: 0.000012,
              threshold: 0.05,
              drift_detected: true
            },
            {
              column: 'ml_supervised_score',
              method: 'chi-square',
              p_value: 0.0003,
              threshold: 0.05,
              drift_detected: true
            },
            {
              column: 'rule_heuristic_score',
              method: 'Z-test',
              p_value: 0.85,
              threshold: 0.05,
              drift_detected: false
            }
          ]
        })
      };
    };

    const result = await ingestRuntimeTelemetryBatch({
      modelId: testModel._id.toString(),
      versionId: v2Production._id.toString(),
      runtimeRecords: VALID_SAMPLE_RECORDS,
      actor: mlLeadUser
    });

    assert.equal(result.telemetry.monitoringSource, 'EVIDENTLY');
    assert.equal(result.telemetry.driftStatus, 'DRIFT_DETECTED');
    assert.deepEqual(result.telemetry.driftedColumns, ['fraud_risk_score', 'ml_supervised_score']);
    assert.equal(result.telemetry.aggregatePsi, null); // Strictly null

    const fraudFeature = result.telemetry.features.find(f => f.name === 'fraud_risk_score');
    assert.ok(fraudFeature);
    assert.equal(fraudFeature.statisticalMethod, 'K-S');
    assert.equal(fraudFeature.pValue, 0.000012);
    assert.equal(fraudFeature.driftDetected, true);
    assert.equal(fraudFeature.psi, null);
  } finally {
    global.fetch = originalFetch;
  }
});

test('2. Runtime ingestion success: stores Telemetry document with correct metadata and performance metrics', async () => {
  const originalFetch = global.fetch;
  try {
    global.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'success',
        monitoring_source: 'EVIDENTLY',
        drift_detected: false,
        drifted_columns: [],
        records_analyzed: 25,
        threshold: 0.05,
        metrics: [
          { column: 'fraud_risk_score', method: 'K-S', p_value: 0.42, threshold: 0.05, drift_detected: false }
        ]
      })
    });

    const { req, res } = createMockReqRes({
      user: mlLeadUser,
      body: {
        modelId: testModel._id.toString(),
        versionId: v2Production._id.toString(),
        runtimeRecords: VALID_SAMPLE_RECORDS
      }
    });

    await telemetryCtrl.ingestRuntimeTelemetry(req, res);
    assert.equal(res.statusCode, 201);
    assert.equal(res.data.success, true);
    assert.equal(res.data.data.telemetry.monitoringSource, 'EVIDENTLY');
    assert.equal(res.data.data.telemetry.sampleSize, 25);
    assert.ok(res.data.data.telemetry.performanceTelemetry.avgLatencyMs > 0);
    assert.ok(res.data.data.telemetry.performanceTelemetry.errorRate >= 0);
  } finally {
    global.fetch = originalFetch;
  }
});

test('3. Runtime ingestion with drift: creates an Incident and updates Monitoring doc with EVIDENTLY method', async () => {
  const originalFetch = global.fetch;
  try {
    global.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'success',
        monitoring_source: 'EVIDENTLY',
        drift_detected: true,
        drifted_columns: ['fraud_risk_score'],
        records_analyzed: 25,
        threshold: 0.05,
        metrics: [
          { column: 'fraud_risk_score', method: 'K-S', p_value: 0.0001, threshold: 0.05, drift_detected: true }
        ]
      })
    });

    const { req, res } = createMockReqRes({
      user: mlLeadUser,
      body: {
        modelId: testModel._id.toString(),
        versionId: v2Production._id.toString(),
        runtimeRecords: VALID_SAMPLE_RECORDS
      }
    });

    await telemetryCtrl.ingestRuntimeTelemetry(req, res);
    assert.equal(res.statusCode, 201);
    assert.equal(res.data.data.telemetry.driftStatus, 'DRIFT_DETECTED');
    assert.ok(res.data.data.incident);
    assert.equal(res.data.data.incident.type, 'DATA_DRIFT');
    assert.ok(res.data.data.incident.description.includes('statistically significant'));
    assert.equal(res.data.data.incident.metricsSnapshot.source, 'EVIDENTLY');

    // Check Monitoring record updated
    const monitoringDoc = await Monitoring.findOne({ modelId: testModel._id });
    assert.ok(monitoringDoc);
    assert.equal(monitoringDoc.driftMethod, 'EVIDENTLY');
    assert.equal(monitoringDoc.driftDetected, true);
    assert.equal(monitoringDoc.latestPsi, null);
  } finally {
    global.fetch = originalFetch;
  }
});

test('4. Runtime ingestion with no drift: healthy telemetry does not create false incident', async () => {
  const originalFetch = global.fetch;
  try {
    const preCount = await Incident.countDocuments();
    global.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'success',
        monitoring_source: 'EVIDENTLY',
        drift_detected: false,
        drifted_columns: [],
        records_analyzed: 25,
        threshold: 0.05,
        metrics: []
      })
    });

    const { req, res } = createMockReqRes({
      user: mlLeadUser,
      body: {
        modelId: testModel._id.toString(),
        versionId: v2Production._id.toString(),
        runtimeRecords: VALID_SAMPLE_RECORDS
      }
    });

    await telemetryCtrl.ingestRuntimeTelemetry(req, res);
    assert.equal(res.statusCode, 201);
    assert.equal(res.data.data.telemetry.driftStatus, 'HEALTHY');
    assert.equal(res.data.data.incident, null);

    const postCount = await Incident.countDocuments();
    assert.equal(postCount, preCount, 'No new incident should be created on healthy data');
  } finally {
    global.fetch = originalFetch;
  }
});

test('5. Monitoring service unavailable: returns controlled HTTP 503 without saving corrupt telemetry', async () => {
  const originalFetch = global.fetch;
  try {
    global.fetch = async () => {
      throw new Error('Connection refused: connect ECONNREFUSED 127.0.0.1:8001');
    };

    const telemetryCountBefore = await Telemetry.countDocuments();
    const incidentCountBefore = await Incident.countDocuments();

    const { req, res } = createMockReqRes({
      user: mlLeadUser,
      body: {
        modelId: testModel._id.toString(),
        versionId: v2Production._id.toString(),
        runtimeRecords: VALID_SAMPLE_RECORDS
      }
    });

    await telemetryCtrl.ingestRuntimeTelemetry(req, res);
    assert.equal(res.statusCode, 503);
    assert.equal(res.data.success, false);
    assert.equal(res.data.code, 'MONITORING_SERVICE_UNAVAILABLE');

    const telemetryCountAfter = await Telemetry.countDocuments();
    const incidentCountAfter = await Incident.countDocuments();
    assert.equal(telemetryCountAfter, telemetryCountBefore, 'Must not create corrupt telemetry on 503');
    assert.equal(incidentCountAfter, incidentCountBefore, 'Must not create false incident on 503');
  } finally {
    global.fetch = originalFetch;
  }
});

test('6. Missing runtime columns: rejects malformed records with HTTP 400', async () => {
  const invalidRecords = [
    { transaction_id: 'txn_1', user_id: 'u1' } // Missing fraud_risk_score, latency_ms, etc.
  ];

  const { req, res } = createMockReqRes({
    user: mlLeadUser,
    body: {
      modelId: testModel._id.toString(),
      versionId: v2Production._id.toString(),
      runtimeRecords: invalidRecords
    }
  });

  await telemetryCtrl.ingestRuntimeTelemetry(req, res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.data.success, false);
  assert.ok(res.data.error.includes('missing required monitored column'));
});

test('7. Invalid model/version: rejects nonexistent entities with HTTP 404', async () => {
  const fakeId = new mongoose.Types.ObjectId().toString();

  const { req, res } = createMockReqRes({
    user: mlLeadUser,
    body: {
      modelId: fakeId,
      versionId: v2Production._id.toString(),
      runtimeRecords: VALID_SAMPLE_RECORDS
    }
  });

  await telemetryCtrl.ingestRuntimeTelemetry(req, res);
  assert.equal(res.statusCode, 404);
  assert.equal(res.data.success, false);
});

test('8. Unauthorized user: GOVERNANCE_OFFICER role is blocked from runtime ingestion with HTTP 403', async () => {
  const token = generateAegisToken(governanceUser);
  const { req, res } = createMockReqRes({
    headers: { authorization: `Bearer ${token}` },
    body: {
      modelId: testModel._id.toString(),
      versionId: v2Production._id.toString(),
      runtimeRecords: VALID_SAMPLE_RECORDS
    }
  });

  let nextCalled = false;
  await authenticateIngestion(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
});

test('9. API-key ingestion: valid x-sentinel-api-key authenticates pipeline, invalid key yields HTTP 401', async () => {
  // Test invalid key
  const invalidReqRes = createMockReqRes({
    headers: { 'x-sentinel-api-key': 'wrong-unauthorized-key' },
    body: {}
  });

  let invalidNext = false;
  await authenticateIngestion(invalidReqRes.req, invalidReqRes.res, () => { invalidNext = true; });
  assert.equal(invalidNext, false);
  assert.equal(invalidReqRes.res.statusCode, 401);

  // Test valid key
  const validReqRes = createMockReqRes({
    headers: { 'x-sentinel-api-key': 'test-ingestion-secret-key-12345' },
    body: {}
  });

  let validNext = false;
  await authenticateIngestion(validReqRes.req, validReqRes.res, () => { validNext = true; });
  assert.equal(validNext, true);
  assert.equal(validReqRes.req.user.role, 'ML_LEAD');
  assert.equal(validReqRes.req.user.email, 'runtime-pipeline@sentinel.internal');
});

test('10. No fake PSI for Evidently telemetry: aggregatePsi is null and not fabricated', async () => {
  const originalFetch = global.fetch;
  try {
    global.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'success',
        monitoring_source: 'EVIDENTLY',
        drift_detected: false,
        drifted_columns: [],
        records_analyzed: 25,
        threshold: 0.05,
        metrics: [
          { column: 'fraud_risk_score', method: 'K-S', p_value: 0.55, threshold: 0.05, drift_detected: false }
        ]
      })
    });

    const result = await ingestRuntimeTelemetryBatch({
      modelId: testModel._id.toString(),
      versionId: v2Production._id.toString(),
      runtimeRecords: VALID_SAMPLE_RECORDS,
      actor: mlLeadUser
    });

    const savedDoc = await Telemetry.findById(result.telemetry._id);
    assert.equal(savedDoc.aggregatePsi, null, 'aggregatePsi must strictly remain null');
    assert.equal(savedDoc.monitoringSource, 'EVIDENTLY');
  } finally {
    global.fetch = originalFetch;
  }
});

test('11. Incident creation on Evidently drift: sets correct severity, type, and recommended rollback version', async () => {
  const originalFetch = global.fetch;
  try {
    global.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'success',
        monitoring_source: 'EVIDENTLY',
        drift_detected: true,
        drifted_columns: ['fraud_risk_score', 'ml_supervised_score', 'ml_anomaly_score'],
        records_analyzed: 25,
        threshold: 0.05,
        metrics: [
          { column: 'fraud_risk_score', method: 'K-S', p_value: 0.000001, threshold: 0.05, drift_detected: true },
          { column: 'ml_supervised_score', method: 'chi-square', p_value: 0.00002, threshold: 0.05, drift_detected: true },
          { column: 'ml_anomaly_score', method: 'K-S', p_value: 0.000005, threshold: 0.05, drift_detected: true }
        ]
      })
    });

    const result = await ingestRuntimeTelemetryBatch({
      modelId: testModel._id.toString(),
      versionId: v2Production._id.toString(),
      runtimeRecords: VALID_SAMPLE_RECORDS,
      actor: mlLeadUser
    });

    assert.ok(result.incident);
    assert.equal(result.incident.severity, 'HIGH'); // Multiple high-impact drifted columns
    assert.equal(result.incident.type, 'DATA_DRIFT');
    assert.equal(result.incident.recommendedAction, 'ROLLBACK');
    assert.equal(result.incident.recommendedRollbackVersionId.toString(), v1ApprovedBaseline._id.toString());
  } finally {
    global.fetch = originalFetch;
  }
});

test('12. Incident deduplication: subsequent drifted batch links to existing open incident', async () => {
  const originalFetch = global.fetch;
  try {
    global.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'success',
        monitoring_source: 'EVIDENTLY',
        drift_detected: true,
        drifted_columns: ['fraud_risk_score'],
        records_analyzed: 25,
        threshold: 0.05,
        metrics: [
          { column: 'fraud_risk_score', method: 'K-S', p_value: 0.00001, threshold: 0.05, drift_detected: true }
        ]
      })
    });

    const batch1 = await ingestRuntimeTelemetryBatch({
      modelId: testModel._id.toString(),
      versionId: v2Production._id.toString(),
      runtimeRecords: VALID_SAMPLE_RECORDS,
      actor: mlLeadUser
    });

    const incidentCountAfter1 = await Incident.countDocuments({ modelId: testModel._id, status: 'OPEN' });

    const batch2 = await ingestRuntimeTelemetryBatch({
      modelId: testModel._id.toString(),
      versionId: v2Production._id.toString(),
      runtimeRecords: VALID_SAMPLE_RECORDS,
      actor: mlLeadUser
    });

    const incidentCountAfter2 = await Incident.countDocuments({ modelId: testModel._id, status: 'OPEN' });

    assert.equal(incidentCountAfter1, incidentCountAfter2, 'Should deduplicate and not create a redundant incident');
    assert.equal(batch1.incident._id.toString(), batch2.incident._id.toString());
  } finally {
    global.fetch = originalFetch;
  }
});

test('13. Audit record creation: runtime telemetry events are cryptographically hashed and chained', async () => {
  const originalFetch = global.fetch;
  try {
    global.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'success',
        monitoring_source: 'EVIDENTLY',
        drift_detected: false,
        drifted_columns: [],
        records_analyzed: 25,
        threshold: 0.05,
        metrics: []
      })
    });

    await ingestRuntimeTelemetryBatch({
      modelId: testModel._id.toString(),
      versionId: v2Production._id.toString(),
      runtimeRecords: VALID_SAMPLE_RECORDS,
      actor: mlLeadUser
    });

    const auditEntry = await AuditLedger.findOne({ action: 'TELEMETRY_INGESTED' }).sort({ createdAt: -1 });
    assert.ok(auditEntry);
    assert.equal(auditEntry.payload.monitoringSource, 'EVIDENTLY');
    assert.ok(auditEntry.currentHash);

    const verification = await verifyAuditChainIntegrity();
    assert.equal(verification.valid, true, 'Audit cryptographic ledger chain must remain valid');
  } finally {
    global.fetch = originalFetch;
  }
});

test('14. Existing simulation still works: /api/telemetry/simulate continues computing PSI and scenarios', async () => {
  const { req, res } = createMockReqRes({
    user: mlLeadUser,
    body: {
      modelId: testModel._id.toString(),
      versionId: v2Production._id.toString(),
      scenario: 'DRIFTED'
    }
  });

  await telemetryCtrl.simulateTelemetryBatch(req, res);
  assert.equal(res.statusCode, 201);
  assert.equal(res.data.success, true);
  assert.equal(res.data.data.telemetry.monitoringSource, 'SIMULATION');
  assert.ok(typeof res.data.data.telemetry.aggregatePsi === 'number');
  assert.ok(res.data.data.telemetry.aggregatePsi >= 0.25);
  assert.equal(res.data.data.telemetry.driftStatus, 'DRIFT_DETECTED');
});

test('15. Existing rollback safety still works: drift detection never automatically modifies model lifecycle state', async () => {
  const preVersion = await ModelVersion.findById(v2Production._id);
  const preModel = await Model.findById(testModel._id);

  assert.equal(preVersion.lifecycleStatus, 'IN_PRODUCTION');
  assert.equal(preModel.lifecycleStatus, 'IN_PRODUCTION');

  const originalFetch = global.fetch;
  try {
    global.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'success',
        monitoring_source: 'EVIDENTLY',
        drift_detected: true,
        drifted_columns: ['fraud_risk_score'],
        records_analyzed: 25,
        threshold: 0.05,
        metrics: [
          { column: 'fraud_risk_score', method: 'K-S', p_value: 0.000001, threshold: 0.05, drift_detected: true }
        ]
      })
    });

    await ingestRuntimeTelemetryBatch({
      modelId: testModel._id.toString(),
      versionId: v2Production._id.toString(),
      runtimeRecords: VALID_SAMPLE_RECORDS,
      actor: mlLeadUser
    });

    const postVersion = await ModelVersion.findById(v2Production._id);
    const postModel = await Model.findById(testModel._id);

    // Lifecycle state MUST remain IN_PRODUCTION; no automatic state mutation
    assert.equal(postVersion.lifecycleStatus, 'IN_PRODUCTION', 'Version status must not automatically change on drift');
    assert.equal(postModel.lifecycleStatus, 'IN_PRODUCTION', 'Model status must not automatically change on drift');
  } finally {
    global.fetch = originalFetch;
  }
});

test('16. External AI Adapter: transforms score response and labels synthetic walkthrough traffic', async () => {
  const { generateSyntheticWalkthroughTransactions, scoreTransactionsBatch } = await import('../src/services/externalAiAdapter.js');
  
  const txns = generateSyntheticWalkthroughTransactions({ scenario: 'BASELINE', count: 10 });
  assert.equal(txns.length, 10);
  assert.ok(txns[0].user_id);
  assert.ok(txns[0].amount > 0);
  assert.equal(txns[0].isSyntheticWalkthroughTraffic, true);

  const originalFetch = global.fetch;
  try {
    global.fetch = async (url, opts) => {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          transaction_id: 'TXN-TEST-100',
          fraud_risk_score: 0.12,
          decision: 'ALLOW',
          ml_supervised_score: 0.08,
          ml_anomaly_score: 0.05,
          rule_heuristic_score: 0.0,
          reasons: ['Normal transaction profile'],
          top_shap_features: [{ feature: 'amount', value: 45.0, shap_contribution: -1.2 }],
          latency_ms: 18.5
        })
      };
    };

    const scored = await scoreTransactionsBatch(txns.slice(0, 3));
    assert.equal(scored.length, 3);
    assert.equal(scored[0].transaction_id, 'TXN-TEST-100');
    assert.equal(scored[0].fraud_risk_score, 0.12);
    assert.equal(scored[0].ml_supervised_score, 0.08);
    assert.equal(scored[0].latency_ms, 18.5);
  } finally {
    global.fetch = originalFetch;
  }
});

test('17. Monitoring services status: returns health check results for external AI and Evidently', async () => {
  const originalFetch = global.fetch;
  try {
    global.fetch = async (url) => {
      if (url.includes(':8000')) {
        return { ok: true, status: 200, json: async () => ({ status: 'ok', model_loaded: true }) };
      }
      if (url.includes(':8001')) {
        return { ok: true, status: 200, json: async () => ({ status: 'ok', service: 'sentinel-monitoring' }) };
      }
      return { ok: false, status: 404 };
    };

    const req = { user: mlLeadUser };
    let resStatus = 200;
    let resData = null;
    const res = {
      status: (code) => { resStatus = code; return res; },
      json: (data) => { resData = data; return res; }
    };

    await telemetryCtrl.getMonitoringServicesStatus(req, res);
    assert.equal(resData.success, true);
    assert.equal(resData.data.allHealthy, true);
    assert.equal(resData.data.externalAi.status, 'HEALTHY');
    assert.equal(resData.data.monitoring.status, 'HEALTHY');
  } finally {
    global.fetch = originalFetch;
  }
});

test('18. evaluateExternalAiTelemetry: scores synthetic traffic and ingests real Evidently monitoring results', async () => {
  const originalFetch = global.fetch;
  try {
    global.fetch = async (url, opts) => {
      if (url.includes(':8000/health')) {
        return { ok: true, status: 200, json: async () => ({ status: 'ok', model_loaded: true }) };
      }
      if (url.includes(':8000/score')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            transaction_id: 'TXN-SCORE-REAL',
            fraud_risk_score: 0.85,
            decision: 'CHALLENGE',
            ml_supervised_score: 0.82,
            ml_anomaly_score: 0.79,
            rule_heuristic_score: 0.5,
            reasons: ['Elevated risk in demo batch'],
            top_shap_features: [],
            latency_ms: 24.5
          })
        };
      }
      if (url.includes(':8001/analyze-drift')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: 'completed',
            monitoring_source: 'EVIDENTLY',
            drift_detected: true,
            drifted_columns: ['fraud_risk_score'],
            records_analyzed: 5,
            threshold: 0.05,
            metrics: [
              { column: 'fraud_risk_score', method: 'chi-square', p_value: 0.0001, threshold: 0.05, drift_detected: true },
              { column: 'latency_ms', method: 'K-S', p_value: 0.45, threshold: 0.05, drift_detected: false }
            ],
            report: 'runtime_drift_report.html'
          })
        };
      }
      return { ok: false, status: 500 };
    };

    const req = {
      user: mlLeadUser,
      body: {
        modelId: testModel._id.toString(),
        versionId: v2Production._id.toString(),
        scenario: 'DRIFTED',
        count: 5
      }
    };
    let resStatus = 200;
    let resData = null;
    const res = {
      status: (code) => { resStatus = code; return res; },
      json: (data) => { resData = data; return res; }
    };

    await telemetryCtrl.evaluateExternalAiTelemetry(req, res);
    assert.equal(resStatus, 201);
    assert.equal(resData.success, true);
    assert.equal(resData.data.isSyntheticWalkthroughTraffic, true);
    assert.equal(resData.data.scoredCount, 5);
    assert.equal(resData.data.monitoringSource, 'EVIDENTLY');
    assert.equal(resData.data.driftDetected, true);
    assert.deepEqual(resData.data.driftedColumns, ['fraud_risk_score']);
  } finally {
    global.fetch = originalFetch;
  }
});

test('19. evaluateExternalAiTelemetry: returns controlled 503 if External AI service is unavailable', async () => {
  const originalFetch = global.fetch;
  try {
    global.fetch = async (url) => {
      if (url.includes(':8000/health')) {
        throw new Error('connect ECONNREFUSED 127.0.0.1:8000');
      }
      return { ok: true, status: 200, json: async () => ({}) };
    };

    const req = {
      user: mlLeadUser,
      body: {
        modelId: testModel._id.toString(),
        versionId: v2Production._id.toString()
      }
    };
    let resStatus = 200;
    let resData = null;
    const res = {
      status: (code) => { resStatus = code; return res; },
      json: (data) => { resData = data; return res; }
    };

    await telemetryCtrl.evaluateExternalAiTelemetry(req, res);
    assert.equal(resStatus, 503);
    assert.equal(resData.success, false);
    assert.equal(resData.code, 'EXTERNAL_AI_UNAVAILABLE');
  } finally {
    global.fetch = originalFetch;
  }
});
