import dotenv from 'dotenv';
dotenv.config();
process.env.NODE_ENV = 'test';

import fs from 'fs';
import path from 'path';
// Dynamic imports after setting NODE_ENV='test'
const { connectDB } = await import('../src/config/db.js');
const { default: app } = await import('../src/server.js');
const { Model } = await import('../src/models/Model.js');
const { ModelVersion } = await import('../src/models/ModelVersion.js');
const { Deployment } = await import('../src/models/Deployment.js');
const { Telemetry } = await import('../src/models/Telemetry.js');
const { Incident } = await import('../src/models/Incident.js');
const { AuditLedger } = await import('../src/models/AuditLedger.js');
const { Monitoring } = await import('../src/models/Monitoring.js');
const { verifyAuditChainIntegrity } = await import('../src/services/auditEngine.js');

const EXTERNAL_AI_URL = 'http://127.0.0.1:8000';
const MONITORING_URL = 'http://127.0.0.1:8001';
const VERIFICATION_PORT = 5002;
const SENTINEL_URL = `http://127.0.0.1:${VERIFICATION_PORT}`;
const INGESTION_KEY = process.env.SENTINEL_INGESTION_KEY || 'sentinel_runtime_secret_key_2026';

function parseCsv(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.trim().split(/\r?\n/);
  const headers = lines[0].split(',');
  return lines.slice(1).map(line => {
    const values = line.split(',');
    const obj = {};
    headers.forEach((h, i) => {
      const val = values[i];
      obj[h] = isNaN(Number(val)) ? val : Number(val);
    });
    return obj;
  });
}

async function run() {
  console.log('\n======================================================');
  console.log('🚀 SENTINEL GOVERN - REAL END-TO-END VERIFICATION');
  console.log('======================================================\n');

  // Connect to DB and start HTTP server on verification port
  await connectDB();
  const server = app.listen(VERIFICATION_PORT);
  console.log(`✅ Sentinel Control Plane server listening on ${SENTINEL_URL}`);

  try {
    // 1. Verify Service Health
    console.log('\n--- STEP 1: Verifying Live Service Health ---');
    
    const aiHealth = await fetch(`${EXTERNAL_AI_URL}/health`).then(r => r.json());
    console.log('✅ External AI Service (port 8000):', aiHealth);

    const evdHealth = await fetch(`${MONITORING_URL}/health`).then(r => r.json());
    console.log('✅ Evidently Monitoring Service (port 8001):', evdHealth);

    const sentinelHealth = await fetch(`${SENTINEL_URL}/health`).then(r => r.json());
    console.log('✅ Sentinel Control Plane (port 5000):', sentinelHealth);

    // 2. Setup / Query Model & Versions in Sentinel
    console.log('\n--- STEP 2: Verifying Target Governed Model & Versions ---');
    
    let fraudModel = await Model.findOne({ name: 'Real-Time Fraud Detection & Anomaly Intelligence Platform' });
    if (!fraudModel) {
      fraudModel = await Model.create({
        name: 'Real-Time Fraud Detection & Anomaly Intelligence Platform',
        description: 'Production real-time transaction scoring model with supervised, anomaly, and heuristic risk blend',
        purpose: 'Autonomous fraud detection and anomaly scoring on banking transactions',
        owner: 'MLOps Lead',
        team: 'Risk & Fraud Engineering',
        modelType: 'CLASSIFICATION',
        riskLevel: 'HIGH',
        lifecycleStatus: 'IN_PRODUCTION'
      });
    }

    let v1Baseline = await ModelVersion.findOne({ modelId: fraudModel._id, version: '1.0.0' });
    if (!v1Baseline) {
      v1Baseline = await ModelVersion.create({
        modelId: fraudModel._id,
        version: '1.0.0',
        lifecycleStatus: 'APPROVED',
        approvalStatus: 'APPROVED',
        policyStatus: 'PASSED',
        deploymentStatus: 'RETIRED',
        changelog: 'Approved production baseline version'
      });
    }

    let v2Production = await ModelVersion.findOne({ modelId: fraudModel._id, version: '2.0.0' });
    if (!v2Production) {
      v2Production = await ModelVersion.create({
        modelId: fraudModel._id,
        version: '2.0.0',
        lifecycleStatus: 'IN_PRODUCTION',
        approvalStatus: 'APPROVED',
        policyStatus: 'PASSED',
        deploymentStatus: 'IN_PRODUCTION',
        changelog: 'Active production model receiving live runtime transaction streams'
      });
    }

    fraudModel.currentProductionVersionId = v2Production._id;
    await fraudModel.save();

    let deployment = await Deployment.findOne({ modelId: fraudModel._id, versionId: v2Production._id });
    if (!deployment) {
      deployment = await Deployment.create({
        modelId: fraudModel._id,
        versionId: v2Production._id,
        environment: 'PRODUCTION',
        status: 'ACTIVE',
        endpointUrl: 'http://127.0.0.1:8000/score',
        deployedBy: 'MLOps Lead'
      });
      v2Production.deploymentRef = deployment._id;
      await v2Production.save();
    }

    console.log(`✅ Governed Model: ${fraudModel.name} (ID: ${fraudModel._id})`);
    console.log(`✅ Baseline Version: ${v1Baseline.version} (Status: ${v1Baseline.lifecycleStatus})`);
    console.log(`✅ Production Version: ${v2Production.version} (Status: ${v2Production.lifecycleStatus})`);
    console.log(`✅ Active Deployment: ${deployment.endpointUrl} (Status: ${deployment.status})`);

    // 3. Step 3: Real External AI Scoring
    console.log('\n--- STEP 3: Real External AI Live Scoring ---');
    const sampleTxn = {
      user_id: 'U100042',
      amount: 145.50,
      timestamp: new Date().toISOString(),
      channel: 'CARD_NOT_PRESENT',
      country: 'US',
      merchant_id: 'M7821',
      device_id: 'D2049'
    };

    const scoreResp = await fetch(`${EXTERNAL_AI_URL}/score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sampleTxn)
    });

    if (!scoreResp.ok) {
      throw new Error(`External AI /score failed with HTTP ${scoreResp.status}`);
    }
    const scoreData = await scoreResp.json();
    console.log('✅ Real External AI /score response received:');
    console.log({
      transaction_id: scoreData.transaction_id,
      fraud_risk_score: scoreData.fraud_risk_score,
      decision: scoreData.decision,
      ml_supervised_score: scoreData.ml_supervised_score,
      ml_anomaly_score: scoreData.ml_anomaly_score,
      rule_heuristic_score: scoreData.rule_heuristic_score,
      latency_ms: scoreData.latency_ms
    });

    // 4. Step 4: Healthy Baseline Ingestion
    console.log('\n--- STEP 4: Healthy Baseline Runtime Telemetry Ingestion ---');
    const referenceDataPath = 'D:\\sentinel-monitoring\\reference_data.csv';
    const healthyRecords = parseCsv(referenceDataPath).slice(0, 50);

    const healthyIngestResp = await fetch(`${SENTINEL_URL}/api/telemetry/ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-sentinel-api-key': INGESTION_KEY
      },
      body: JSON.stringify({
        modelId: String(fraudModel._id),
        versionId: String(v2Production._id),
        runtimeRecords: healthyRecords
      })
    });

    const healthyResult = await healthyIngestResp.json();
    console.log(`Status Code: ${healthyIngestResp.status}`);
    console.log('Response Summary:', {
      success: healthyResult.success,
      monitoringSource: healthyResult.data?.telemetry?.monitoringSource,
      driftStatus: healthyResult.data?.telemetry?.driftStatus,
      drift_detected: healthyResult.data?.driftAnalysis?.drift_detected,
      drifted_columns: healthyResult.data?.driftAnalysis?.drifted_columns,
      aggregatePsi: healthyResult.data?.telemetry?.aggregatePsi,
      incidentCreated: Boolean(healthyResult.data?.incident)
    });

    if (healthyResult.data?.telemetry?.driftStatus !== 'HEALTHY') {
      throw new Error('Expected healthy telemetry for baseline reference data');
    }
    if (healthyResult.data?.telemetry?.aggregatePsi !== null) {
      throw new Error('Expected aggregatePsi to strictly remain null for Evidently telemetry');
    }
    if (healthyResult.data?.incident !== null) {
      throw new Error('Expected no incident created for healthy telemetry');
    }
    console.log('✅ HEALTHY BATCH VERIFIED: No false drift, aggregatePsi is strictly null, no incident spawned.');

    // 5. Step 5: Drifted Runtime Ingestion
    console.log('\n--- STEP 5: Drifted Runtime Telemetry Ingestion ---');
    const changedDataPath = 'D:\\sentinel-monitoring\\changed_runtime_data.csv';
    const driftedRecords = parseCsv(changedDataPath).slice(0, 50);

    const driftIngestResp = await fetch(`${SENTINEL_URL}/api/telemetry/ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-sentinel-api-key': INGESTION_KEY
      },
      body: JSON.stringify({
        modelId: String(fraudModel._id),
        versionId: String(v2Production._id),
        runtimeRecords: driftedRecords
      })
    });

    const driftResult = await driftIngestResp.json();
    console.log(`Status Code: ${driftIngestResp.status}`);
    console.log('Response Summary:', {
      success: driftResult.success,
      monitoringSource: driftResult.data?.telemetry?.monitoringSource,
      driftStatus: driftResult.data?.telemetry?.driftStatus,
      drift_detected: driftResult.data?.driftAnalysis?.drift_detected,
      drifted_columns: driftResult.data?.driftAnalysis?.drifted_columns,
      metricsSample: driftResult.data?.driftAnalysis?.metrics?.slice(0, 3),
      aggregatePsi: driftResult.data?.telemetry?.aggregatePsi,
      incidentId: driftResult.data?.incident?._id,
      incidentNumber: driftResult.data?.incident?.incidentNumber,
      incidentSeverity: driftResult.data?.incident?.severity,
      recommendedAction: driftResult.data?.incident?.recommendedAction,
      recommendedRollbackVersionId: driftResult.data?.incident?.recommendedRollbackVersionId
    });

    if (driftResult.data?.telemetry?.driftStatus !== 'DRIFT_DETECTED') {
      throw new Error('Expected drift detected for changed runtime dataset');
    }
    if (!driftResult.data?.incident) {
      throw new Error('Expected incident created for drifted runtime telemetry');
    }
    if (driftResult.data?.telemetry?.aggregatePsi !== null) {
      throw new Error('Expected aggregatePsi to strictly remain null for Evidently telemetry');
    }

    // Verify Telemetry ↔ Incident bidirectional linkage
    const savedTelemetry = await Telemetry.findById(driftResult.data.telemetry._id);
    const savedIncident = await Incident.findById(driftResult.data.incident._id);

    if (String(savedTelemetry.incidentId) !== String(savedIncident._id)) {
      throw new Error('Telemetry document not linked to generated Incident');
    }
    if (String(savedIncident.telemetryRef) !== String(savedTelemetry._id)) {
      throw new Error('Incident document not linked to originating Telemetry');
    }
    console.log('✅ BIDIRECTIONAL LINK VERIFIED: Telemetry ↔ Incident linked.');

    // Verify Lifecycle Safety (No automatic rollback!)
    const currentVersion = await ModelVersion.findById(v2Production._id);
    const currentModel = await Model.findById(fraudModel._id);
    if (currentVersion.lifecycleStatus !== 'IN_PRODUCTION' || currentModel.lifecycleStatus !== 'IN_PRODUCTION') {
      throw new Error('Lifecycle status was mutated automatically! Drift must NEVER automatically change lifecycle.');
    }
    console.log('✅ LIFECYCLE SAFETY VERIFIED: Model status remains IN_PRODUCTION. No automatic state transition occurred.');

    // 6. Step 6: Incident Deduplication Test
    console.log('\n--- STEP 6: Incident Deduplication Verification ---');
    const countBefore = await Incident.countDocuments({ modelId: fraudModel._id, status: 'OPEN' });
    
    const secondDriftResp = await fetch(`${SENTINEL_URL}/api/telemetry/ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-sentinel-api-key': INGESTION_KEY
      },
      body: JSON.stringify({
        modelId: String(fraudModel._id),
        versionId: String(v2Production._id),
        runtimeRecords: driftedRecords
      })
    });
    const secondDriftResult = await secondDriftResp.json();
    const countAfter = await Incident.countDocuments({ modelId: fraudModel._id, status: 'OPEN' });

    if (countBefore !== countAfter) {
      throw new Error(`Incident duplication detected! Before: ${countBefore}, After: ${countAfter}`);
    }
    if (String(secondDriftResult.data?.incident?._id) !== String(savedIncident._id)) {
      throw new Error('Subsequent drift batch failed to link to existing open incident');
    }
    console.log('✅ DEDUPLICATION VERIFIED: Subsequent drifted batch linked to existing incident without duplicating.');

    // 7. Step 7: Audit Ledger Integrity
    console.log('\n--- STEP 7: Audit Ledger Cryptographic Integrity ---');
    const auditVerification = await verifyAuditChainIntegrity();
    console.log('Audit Verification Result:', auditVerification);
    if (!auditVerification.valid) {
      throw new Error(`Audit ledger hash chain broken: ${auditVerification.message}`);
    }
    console.log('✅ AUDIT INTEGRITY VERIFIED: SHA-256 hash chaining remains intact across all blocks.');

    // 8. Step 8: Security and Validation Boundaries
    console.log('\n--- STEP 8: Security & Controlled Errors Verification ---');
    
    // Test 8a: Invalid API key
    const invalidKeyResp = await fetch(`${SENTINEL_URL}/api/telemetry/ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-sentinel-api-key': 'malicious-or-wrong-key'
      },
      body: JSON.stringify({
        modelId: String(fraudModel._id),
        versionId: String(v2Production._id),
        runtimeRecords: healthyRecords
      })
    });
    console.log(`Unauthorized API Key rejection: HTTP ${invalidKeyResp.status} (Expected 401)`);
    if (invalidKeyResp.status !== 401) throw new Error('Failed to reject unauthorized API key with 401');

    // Test 8b: Missing columns
    const malformedResp = await fetch(`${SENTINEL_URL}/api/telemetry/ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-sentinel-api-key': INGESTION_KEY
      },
      body: JSON.stringify({
        modelId: String(fraudModel._id),
        versionId: String(v2Production._id),
        runtimeRecords: [{ transaction_id: 't1', amount: 10 }] // missing fraud_risk_score, latency_ms, etc.
      })
    });
    console.log(`Malformed record rejection: HTTP ${malformedResp.status} (Expected 400)`);
    if (malformedResp.status !== 400) throw new Error('Failed to reject malformed records with 400');

    // 9. Step 9: Verify External Services Status & Evaluation Routes
    console.log('\n--- STEP 9: Verify External AI & Monitoring Bridge Routes ---');
    const statusResp = await fetch(`${SENTINEL_URL}/api/telemetry/services-status`);
    const statusJson = await statusResp.json();
    console.log('✅ Services Status Route Response:', statusJson);
    if (!statusJson.success || !statusJson.data?.fraudAi || !statusJson.data?.evidently) {
      throw new Error('Failed to retrieve valid services status from Sentinel');
    }

    const evalExternalResp = await fetch(`${SENTINEL_URL}/api/telemetry/evaluate-external`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-sentinel-api-key': INGESTION_KEY
      },
      body: JSON.stringify({
        modelId: String(fraudModel._id),
        versionId: String(v2Production._id),
        scenario: 'BASELINE',
        count: 15
      })
    });
    const evalExternalJson = await evalExternalResp.json();
    console.log(`✅ Live External Evaluation Route Response (HTTP ${evalExternalResp.status}):`, {
      success: evalExternalJson.success,
      scoredCount: evalExternalJson.data?.scoredCount,
      driftStatus: evalExternalJson.data?.driftStatus,
      isSyntheticWalkthroughTraffic: evalExternalJson.data?.isSyntheticWalkthroughTraffic
    });
    if (!evalExternalJson.success || evalExternalJson.data?.scoredCount !== 15) {
      throw new Error('evaluate-external failed to score 15 controlled test transactions');
    }

    console.log('\n======================================================');
    console.log('🎉 ALL REAL END-TO-END VERIFICATION CHECKS PASSED!');
    console.log('======================================================\n');
  } finally {
    if (server) server.close();
  }

  process.exit(0);
}

run().catch(err => {
  console.error('\n❌ E2E VERIFICATION FAILED:', err);
  process.exit(1);
});
