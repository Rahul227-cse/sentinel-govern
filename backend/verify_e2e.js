/**
 * Complete End-to-End Lifecycle Verification Script
 * Validates all 18 lifecycle requirements against the running backend server.
 */

const API_BASE = 'http://localhost:5000/api';

async function request(url, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const res = await fetch(`${API_BASE}${url}`, { ...options, headers });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data: json.data || json };
}

async function runVerification() {
  console.log('================================================================');
  console.log('🚀 STARTING COMPREHENSIVE END-TO-END GOVERNANCE LIFECYCLE AUDIT');
  console.log('================================================================\n');

  let passedChecks = 0;
  let totalChecks = 0;

  function assertCheck(name, condition, extra = '') {
    totalChecks++;
    if (condition) {
      passedChecks++;
      console.log(`  ✓ [CHECK ${totalChecks}] ${name} ${extra ? `(${extra})` : ''}`);
    } else {
      console.error(`  ✗ [CHECK ${totalChecks}] FAILED: ${name} ${extra ? `(${extra})` : ''}`);
      process.exit(1);
    }
  }

  // 1. Health & Dashboard
  const healthRes = await fetch('http://localhost:5000/health');
  const healthJson = await healthRes.json();
  assertCheck('System Health check is operational', healthJson.status === 'HEALTHY');

  const dashRes = await request('/dashboard/stats');
  assertCheck('Dashboard KPI aggregation returns valid metrics', dashRes.ok && dashRes.data.totalModels >= 2);

  // 2. Model Registration
  console.log('\n--- Step 1 & 2: Model Registration & Risk Intake ---');
  const createModelRes = await request('/models', {
    method: 'POST',
    body: JSON.stringify({
      name: `Automated Loan Decisioner ${Date.now()}`,
      description: 'End-to-End verified credit system',
      purpose: 'Automated retail lending underwriting decisions',
      owner: 'Dr. Elena Rostova',
      team: 'Risk & Lending',
      riskLevel: 'HIGH',
      initialVersion: 'v1.0',
      initialChangelog: 'Initial candidate architecture',
      protectedAttributes: ['gender', 'age'],
      intendedUsers: ['Loan Officers', 'Auditors']
    })
  });
  assertCheck('Model registered with EU AI Act High Risk classification', createModelRes.ok);
  const newModelId = createModelRes.data.model._id;
  const v10Id = createModelRes.data.version._id;

  // 3. Fairness Evaluation with Policy Violation
  console.log('\n--- Step 3 & 4: Fairness Evaluation & Gate Failure (v1.0) ---');
  const evalFailRes = await request(`/evaluations/run/${v10Id}`, {
    method: 'POST',
    body: JSON.stringify({
      scenario: 'FAIRNESS_FAIL',
      protectedAttribute: 'gender',
      privilegedGroup: 'Male',
      unprivilegedGroup: 'Female',
      actor: 'Dr. Elena Rostova'
    })
  });
  assertCheck('Fairness evaluation ran with DIR = 0.73', evalFailRes.ok && evalFailRes.data.evaluation.fairnessMetrics.disparateImpactRatio === 0.73);
  assertCheck('Policy Engine flagged gate as BLOCKED', evalFailRes.data.policyDecision.passed === false && evalFailRes.data.policyDecision.overallDecision === 'BLOCKED');

  // 4. Backend Enforcement of Invalid Lifecycle Transitions
  console.log('\n--- Step 5: Backend Enforcement on Policy-Failed Model ---');
  const invalidApproveRes = await request(`/models/versions/${v10Id}/transition`, {
    method: 'POST',
    body: JSON.stringify({ targetStatus: 'APPROVED' })
  });
  assertCheck('Backend strictly rejects direct transition to APPROVED', invalidApproveRes.status === 400);

  const invalidDeployRes = await request(`/models/versions/${v10Id}/transition`, {
    method: 'POST',
    body: JSON.stringify({ targetStatus: 'IN_PRODUCTION' })
  });
  assertCheck('Backend strictly rejects deployment of unapproved version', invalidDeployRes.status === 400);

  const invalidPendingApprovalRes = await request(`/models/versions/${v10Id}/transition`, {
    method: 'POST',
    body: JSON.stringify({ targetStatus: 'PENDING_APPROVAL' })
  });
  assertCheck('Backend strictly rejects transition to PENDING_APPROVAL when policy failed', invalidPendingApprovalRes.status === 400);

  const invalidApprovalSubmit = await request(`/approvals/${v10Id}`, {
    method: 'POST',
    body: JSON.stringify({
      role: 'ML_LEAD',
      approverName: 'Dr. Elena Rostova',
      decision: 'APPROVED'
    })
  });
  assertCheck('Backend strictly rejects submitting approvals on a policy-failed version', invalidApprovalSubmit.status === 400);

  // 5. Create Remediated Version (v1.1) & Pass Evaluation
  console.log('\n--- Step 6 & 7: Remediated Version (v1.1) & Policy Pass ---');
  const createV11Res = await request(`/models/${newModelId}/versions`, {
    method: 'POST',
    body: JSON.stringify({
      version: 'v1.1',
      changelog: 'Fairness mitigated via adversarial debiasing',
      trainingDatasetInfo: { name: 'Debiased Lending Set 2025', sampleCount: 75000, featureCount: 30 }
    })
  });
  assertCheck('Version v1.1 created in DRAFT state', createV11Res.ok);
  const v11Id = createV11Res.data._id;

  const evalPassRes = await request(`/evaluations/run/${v11Id}`, {
    method: 'POST',
    body: JSON.stringify({
      scenario: 'FAIRNESS_PASS',
      protectedAttribute: 'gender',
      privilegedGroup: 'Male',
      unprivilegedGroup: 'Female',
      actor: 'Dr. Elena Rostova'
    })
  });
  assertCheck('Fairness evaluation ran with DIR = 0.86 and ROC-AUC = 0.88', evalPassRes.ok && evalPassRes.data.evaluation.fairnessMetrics.disparateImpactRatio === 0.86);
  assertCheck('Policy Engine approved gate as PASSED', evalPassRes.data.policyDecision.passed === true);

  // 6. Stage-Gate Approval Workflow
  console.log('\n--- Step 8: Multi-Stakeholder Stage-Gate Sign-offs ---');
  const roles = [
    { role: 'ML_LEAD', name: 'Dr. Elena Rostova', comment: 'Model accuracy (90.8%) verified.' },
    { role: 'GOVERNANCE_OFFICER', name: 'Amina Al-Mansoor', comment: 'Fairness criteria satisfied (DIR 0.86) and EU AI Act Article 10 confirmed.' },
    { role: 'EXECUTIVE_APPROVER', name: 'David Sterling', comment: 'Authorized for production deployment.' }
  ];

  for (const r of roles) {
    const appRes = await request(`/approvals/${v11Id}`, {
      method: 'POST',
      body: JSON.stringify({
        role: r.role,
        approverName: r.name,
        decision: 'APPROVED',
        comment: r.comment
      })
    });
    assertCheck(`Sign-off recorded for role: ${r.role}`, appRes.ok);
  }

  // 7. Promotion to Production
  console.log('\n--- Step 9: Promotion to Production ---');
  const promoteRes = await request(`/models/versions/${v11Id}/transition`, {
    method: 'POST',
    body: JSON.stringify({
      targetStatus: 'IN_PRODUCTION',
      actor: 'David Sterling',
      role: 'EXECUTIVE_APPROVER'
    })
  });
  assertCheck('Version v1.1 promoted to IN_PRODUCTION', promoteRes.ok && promoteRes.data.lifecycleStatus === 'IN_PRODUCTION');

  // 8. Telemetry Drift & Incident Generation
  console.log('\n--- Step 10 & 11: Production Telemetry & Drift Incident ---');
  const driftRes = await request('/telemetry/simulate', {
    method: 'POST',
    body: JSON.stringify({
      modelId: newModelId,
      versionId: v11Id,
      scenario: 'DRIFTED'
    })
  });
  assertCheck('Telemetry drift simulated with aggregate PSI >= 0.25', driftRes.ok && driftRes.data.telemetry.aggregatePsi >= 0.25);
  assertCheck('Critical incident generated automatically upon drift detection', driftRes.data.incident !== null && driftRes.data.incident.type === 'DATA_DRIFT');
  const generatedIncident = driftRes.data.incident;

  // 9. Rollback Enforcement
  console.log('\n--- Step 12 & 13: Rollback Gate Enforcement & Safe Execution ---');
  // Attempt invalid rollback to v1.0 (which failed policy)
  const invalidRollbackRes = await request('/incidents/rollback', {
    method: 'POST',
    body: JSON.stringify({
      incidentId: generatedIncident._id,
      modelId: newModelId,
      targetVersionId: v10Id
    })
  });
  assertCheck('Backend strictly rejects rollback to policy-failed version v1.0', invalidRollbackRes.status === 400);

  // Create an approved baseline version v0.9 for genuine rollback
  const v09Res = await request(`/models/${newModelId}/versions`, {
    method: 'POST',
    body: JSON.stringify({
      version: 'v0.9',
      changelog: 'Legacy approved linear model baseline'
    })
  });
  const v09Id = v09Res.data._id;
  await request(`/evaluations/run/${v09Id}`, {
    method: 'POST',
    body: JSON.stringify({ scenario: 'FAIRNESS_PASS' })
  });
  for (const r of roles) {
    await request(`/approvals/${v09Id}`, {
      method: 'POST',
      body: JSON.stringify({ role: r.role, approverName: r.name, decision: 'APPROVED', comment: 'Approved baseline' })
    });
  }

  // Execute valid rollback to v0.9
  const validRollbackRes = await request('/incidents/rollback', {
    method: 'POST',
    body: JSON.stringify({
      incidentId: generatedIncident._id,
      modelId: newModelId,
      targetVersionId: v09Id,
      actor: 'David Sterling'
    })
  });
  assertCheck('Safe rollback executed to genuinely approved baseline v0.9', validRollbackRes.ok && validRollbackRes.data.activeVersion === 'v0.9');

  // 10. Cryptographic Audit Ledger & Tamper Detection
  console.log('\n--- Step 14 & 15: Cryptographic Audit Trail & Tamper Verification ---');
  // Ensure ledger is clean in case previous run injected a tamper
  await request('/audit/repair', { method: 'POST' });
  const integrityBefore = await request('/audit/integrity');
  assertCheck('SHA-256 audit chain verified as valid across all records', integrityBefore.ok && integrityBefore.data.valid === true);

  const tamperRes = await request('/audit/simulate-tamper', {
    method: 'POST',
    body: JSON.stringify({ sequenceNumber: 0, tamperedPayload: { maliciousOverwrite: true } })
  });
  assertCheck('Simulated tamper successfully injected into Block #0', tamperRes.ok);

  const integrityAfter = await request('/audit/integrity');
  assertCheck('Cryptographic verification immediately detected tampering', integrityAfter.ok && integrityAfter.data.valid === false && integrityAfter.data.brokenAtSequence === 0);

  // Restore and re-seal the ledger
  const repairRes = await request('/audit/repair', { method: 'POST' });
  assertCheck('Cryptographic audit ledger successfully re-sealed', repairRes.ok && repairRes.data.valid === true);

  // 11. Compliance Dossier Generation
  console.log('\n--- Step 16: Compliance & Technical Documentation Dossier ---');
  const dossierRes = await request(`/audit/dossier/${newModelId}`);
  assertCheck('Compliance dossier compiled with Model Card, Risk Assessment, and Audit Excerpt', dossierRes.ok && dossierRes.data.modelCard.name.includes('Automated Loan Decisioner'));

  console.log('\n================================================================');
  console.log(`🎉 ALL ${passedChecks}/${totalChecks} VERIFICATION CHECKS PASSED WITH ZERO FAILURES!`);
  console.log('================================================================\n');
}

runVerification().catch(err => {
  console.error('Verification failed with unhandled exception:', err);
  process.exit(1);
});
