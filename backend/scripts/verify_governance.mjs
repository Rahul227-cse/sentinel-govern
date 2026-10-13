import assert from 'node:assert/strict';

const BASE_URL = 'http://localhost:5000/api';

async function runVerification() {
  console.log('=== SENTINEL GOVERN E2E VERIFICATION ===\n');

  // 1. Check all 4 workloads health
  console.log('1. Checking /api/telemetry/workloads...');
  const workloadsRes = await fetch(`${BASE_URL}/telemetry/workloads`).then(r => r.json());
  assert.equal(workloadsRes.success, true);
  console.log('   - Fraud AI:', workloadsRes.data.fraud.status, `(${workloadsRes.data.fraud.responseTimeMs}ms)`);
  console.log('   - Credit Risk:', workloadsRes.data.creditRisk.status, `(${workloadsRes.data.creditRisk.responseTimeMs}ms)`);
  console.log('   - Insurance Charges:', workloadsRes.data.insurance.status, `(${workloadsRes.data.insurance.responseTimeMs}ms)`);
  console.log('   - Customer Churn:', workloadsRes.data.churn.status, `(Reason: ${workloadsRes.data.churn.message})`);

  // 2. Scheduler status
  console.log('\n2. Checking /api/telemetry/scheduler/status...');
  const schedulerRes = await fetch(`${BASE_URL}/telemetry/scheduler/status`).then(r => r.json());
  assert.equal(schedulerRes.success, true);
  console.log('   - Scheduler Status:', schedulerRes.data.status);
  console.log('   - Scheduler Mode:', schedulerRes.data.mode);
  console.log('   - Batch Size:', schedulerRes.data.batchSize);

  // 3. Authenticate with runtime ingestion key
  console.log('\n3. Authenticating with ingestion authorization...');
  const authHeaders = {
    'Content-Type': 'application/json',
    'x-sentinel-api-key': 'sentinel_runtime_secret_key_2026'
  };
  console.log('   - Ingestion key configured (x-sentinel-api-key)');

  // 4. Trigger controlled batch on Fraud Detection AI (DRIFTED)
  console.log('\n4. Triggering DRIFTED batch on fraud-detection...');
  const fraudTrigger = await fetch(`${BASE_URL}/telemetry/scheduler/trigger`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ workloadId: 'fraud-detection', scenario: 'DRIFTED', count: 25 })
  }).then(r => r.json());
  assert.equal(fraudTrigger.success, true);
  console.log('   - Fraud batch success:', fraudTrigger.success);
  console.log('   - Evidently Drift Status:', fraudTrigger.data?.driftStatus);
  console.log('   - Drifted Columns:', fraudTrigger.data?.driftedColumns);
  console.log('   - Linked Incident:', fraudTrigger.data?.incident?.incidentNumber || 'Existing INC-001 deduplicated');

  // 5. Trigger controlled batch on Credit Risk Scoring (BASELINE)
  console.log('\n5. Triggering BASELINE batch on credit-risk...');
  const creditTrigger = await fetch(`${BASE_URL}/telemetry/scheduler/trigger`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ workloadId: 'credit-risk', scenario: 'BASELINE', count: 25 })
  }).then(r => r.json());
  assert.equal(creditTrigger.success, true);
  console.log('   - Credit batch success:', creditTrigger.success);
  console.log('   - Evidently Drift Status:', creditTrigger.data?.driftStatus);
  console.log('   - Drifted Columns:', creditTrigger.data?.driftedColumns);

  // 6. Trigger controlled batch on Insurance Charges (DRIFTED)
  console.log('\n6. Triggering DRIFTED batch on insurance-charges...');
  const insuranceTrigger = await fetch(`${BASE_URL}/telemetry/scheduler/trigger`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ workloadId: 'insurance-charges', scenario: 'DRIFTED', count: 25 })
  }).then(r => r.json());
  assert.equal(insuranceTrigger.success, true);
  console.log('   - Insurance batch success:', insuranceTrigger.success);
  console.log('   - Evidently Drift Status:', insuranceTrigger.data?.driftStatus);
  console.log('   - Drifted Columns:', insuranceTrigger.data?.driftedColumns);

  // 7. Check Reports List
  console.log('\n7. Checking /api/reports...');
  const reportsRes = await fetch(`${BASE_URL}/reports`).then(r => r.json());
  assert.equal(reportsRes.success, true);
  console.log(`   - Total Governance Reports: ${reportsRes.count}`);
  const latestReport = reportsRes.data[0];
  console.log('   - Latest Report:', latestReport.reportNumber, `(${latestReport.workloadId})`);

  // 8. Check Report Details & Markdown Export
  console.log(`\n8. Checking /api/reports/${latestReport._id} and export...`);
  const reportDetail = await fetch(`${BASE_URL}/reports/${latestReport._id}`).then(r => r.json());
  assert.equal(reportDetail.success, true);
  console.log('   - Report Title:', reportDetail.data.title);
  console.log('   - Monitored Features Count:', reportDetail.data.driftAnalysis?.features?.length);
  
  const mdExport = await fetch(`${BASE_URL}/reports/${latestReport._id}/export?format=markdown`).then(r => r.text());
  assert.ok(mdExport.includes('SENTINEL GOVERN'));
  assert.ok(mdExport.includes('Evidently 0.7.23'));
  console.log('   - Markdown export verified (Length:', mdExport.length, 'chars)');

  // 9. Version Comparison on Governed Models
  console.log('\n9. Checking /api/models/:modelId/versions/compare...');
  const modelsRes = await fetch(`${BASE_URL}/models`).then(r => r.json());
  const modelsList = modelsRes.data || modelsRes;
  const fraudModel = modelsList.find(m => /Fraud/i.test(m.name)) || modelsList[0];
  
  if (fraudModel) {
    const compareRes = await fetch(`${BASE_URL}/models/${fraudModel._id}/versions/compare`).then(r => r.json());
    assert.equal(compareRes.success, true);
    console.log(`   - Model: ${compareRes.data.model.name}`);
    console.log(`   - Registered Versions: ${compareRes.data.versions.length}`);
    compareRes.data.versions.forEach(v => {
      console.log(`     * Version ${v.version} [${v.deploymentStatus}] - Accuracy: ${v.metrics?.accuracy ?? 'N/A'}, Rollback Eligible: ${v.isRollbackEligible}`);
    });
  }

  // 10. Pause and Resume Scheduler
  console.log('\n10. Testing scheduler pause and resume...');
  const pauseRes = await fetch(`${BASE_URL}/telemetry/scheduler/pause`, {
    method: 'POST',
    headers: authHeaders
  }).then(r => r.json());
  assert.equal(pauseRes.success, true);
  console.log('   - Paused status:', pauseRes.data.status);

  const resumeRes = await fetch(`${BASE_URL}/telemetry/scheduler/resume`, {
    method: 'POST',
    headers: authHeaders
  }).then(r => r.json());
  assert.equal(resumeRes.success, true);
  console.log('   - Resumed status:', resumeRes.data.status);

  console.log('\n=== ALL E2E VERIFICATIONS SUCCEEDED CLEANLY ===\n');
}

runVerification().catch(err => {
  console.error('E2E Verification Error:', err);
  process.exit(1);
});
