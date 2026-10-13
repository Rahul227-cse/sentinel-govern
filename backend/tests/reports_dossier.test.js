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
import { recordAuditEvent, verifyAuditChainIntegrity } from '../src/services/auditEngine.js';
import { compileGovernanceDossier, generateDossierMarkdown } from '../src/services/reportService.js';
import * as auditCtrl from '../src/controllers/auditController.js';

let mongoServer;

// Users
let platformAdminUser;
let mlLeadUser;
let governanceOfficerUser;
let executiveApproverUser;
let unauthorizedUser;
let pendingUser;
let suspendedUser;

// Models & Versions
let populatedModel;
let v1Version;
let v2Version;
let blankModel;
let blankVersion;

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
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);

  // Setup Users across all 6 roles
  platformAdminUser = await User.create({
    name: 'Admin User',
    email: 'admin@aegis.ai',
    role: 'PLATFORM_ADMIN',
    status: 'ACTIVE'
  });

  mlLeadUser = await User.create({
    name: 'Dr. Sarah ML',
    email: 'sarah.ml@aegis.ai',
    role: 'ML_LEAD',
    status: 'ACTIVE'
  });

  governanceOfficerUser = await User.create({
    name: 'Grace Governance',
    email: 'grace.governance@aegis.ai',
    role: 'GOVERNANCE_OFFICER',
    status: 'ACTIVE'
  });

  executiveApproverUser = await User.create({
    name: 'Evelyn Exec',
    email: 'evelyn.exec@aegis.ai',
    role: 'EXECUTIVE_APPROVER',
    status: 'ACTIVE'
  });

  unauthorizedUser = {
    name: 'Bob Employee',
    email: 'bob.employee@aegis.ai',
    role: 'UNAUTHORIZED_ROLE',
    status: 'ACTIVE'
  };

  pendingUser = await User.create({
    name: 'Pat Pending',
    email: 'pat.pending@aegis.ai',
    role: 'GOVERNANCE_OFFICER',
    status: 'PENDING'
  });

  suspendedUser = await User.create({
    name: 'Sam Suspended',
    email: 'sam.suspended@aegis.ai',
    role: 'GOVERNANCE_OFFICER',
    status: 'SUSPENDED'
  });

  // Setup Populated Model
  populatedModel = await Model.create({
    name: 'RiskLens Credit Assessor',
    description: 'Automated consumer credit underwriting and risk scoring engine.',
    purpose: 'Evaluates applicant financial resilience for revolving credit facilities.',
    owner: 'Dr. Sarah ML',
    team: 'Risk Analytics',
    modelType: 'CLASSIFICATION',
    riskLevel: 'HIGH',
    lifecycleStatus: 'IN_PRODUCTION',
    intendedUsers: ['Credit Officers', 'Underwriting Team'],
    protectedAttributes: ['gender', 'age', 'zip_code'],
    createdBy: mlLeadUser._id,
    riskAssessment: {
      prohibitedPracticesChecked: true,
      euAiActClassification: 'HIGH',
      safetyImpactRating: 'Significant',
      autonomyLevel: 'Human-in-the-loop',
      frameworkAlignment: ['EU_AI_ACT_ANNEX_III', 'NIST_AI_RMF_GOVERN'],
      assessmentNotes: 'Annex III high-risk assessment completed. Strict demographic parity monitored.'
    }
  });

  v1Version = await ModelVersion.create({
    modelId: populatedModel._id,
    version: 'v1.0',
    changelog: 'Initial validated credit scoring release',
    lifecycleStatus: 'APPROVED',
    deploymentStatus: 'NOT_DEPLOYED',
    evaluationStatus: 'EVALUATED_PASS',
    policyStatus: 'PASSED',
    approvalStatus: 'APPROVED',
    trainingDatasetInfo: {
      name: 'Credit Historical 2024',
      sampleCount: 50000,
      featureCount: 28,
      dataHash: 'sha256-abc123v1'
    },
    createdBy: mlLeadUser._id
  });

  v2Version = await ModelVersion.create({
    modelId: populatedModel._id,
    version: 'v2.0',
    changelog: 'Enhanced tree-based model with debiasing reweighting',
    lifecycleStatus: 'IN_PRODUCTION',
    deploymentStatus: 'IN_PRODUCTION',
    evaluationStatus: 'EVALUATED_PASS',
    policyStatus: 'PASSED',
    approvalStatus: 'APPROVED',
    trainingDatasetInfo: {
      name: 'Credit Historical 2025',
      sampleCount: 75000,
      featureCount: 32,
      dataHash: 'sha256-xyz789v2'
    },
    deployedAt: new Date('2026-02-01'),
    createdBy: mlLeadUser._id
  });

  populatedModel.currentProductionVersionId = v2Version._id;
  await populatedModel.save();

  // Create Policy
  const policy = await Policy.create({
    name: 'High Risk Consumer Lending Policy',
    description: 'Mandatory fairness and safety thresholds under EU AI Act Annex III',
    targetRiskLevel: 'HIGH',
    rules: {
      minDisparateImpact: 0.80,
      maxDemographicParityDiff: 0.10,
      minRocAuc: 0.85,
      minAccuracy: 0.80,
      maxPsiThreshold: 0.25
    },
    requiredApprovers: ['ML_LEAD', 'GOVERNANCE_OFFICER', 'EXECUTIVE_APPROVER'],
    failureAction: 'BLOCK_PROMOTION'
  });

  // Create Evaluations for v2
  const eval1 = await Evaluation.create({
    modelId: populatedModel._id,
    versionId: v2Version._id,
    datasetName: 'Lending Benchmark 2025-Q1',
    sampleCount: 15000,
    dataSource: 'FILE_UPLOAD',
    uploadedFileMeta: {
      filename: 'benchmark_q1_eval.csv',
      rowCount: 15000,
      fileType: 'text/csv',
      uploadedAt: new Date('2026-01-15')
    },
    performanceMetrics: {
      accuracy: 0.892,
      precision: 0.875,
      recall: 0.860,
      f1: 0.867,
      rocAuc: 0.924
    },
    fairnessMetrics: {
      protectedAttribute: 'gender',
      privilegedGroup: 'Male',
      unprivilegedGroup: 'Female',
      disparateImpactRatio: 0.884,
      demographicParityDiff: 0.045,
      fairnessEvaluated: true
    },
    evaluatedBy: 'Automated Evaluation Engine',
    evaluatorId: mlLeadUser._id
  });

  // Create Approvals for v2
  await Approval.create({
    modelId: populatedModel._id,
    versionId: v2Version._id,
    role: 'ML_LEAD',
    approverName: mlLeadUser.name,
    userId: mlLeadUser._id,
    decision: 'APPROVED',
    comment: 'Model accuracy and stability meet production gating criteria.',
    decidedAt: new Date('2026-01-20')
  });

  await Approval.create({
    modelId: populatedModel._id,
    versionId: v2Version._id,
    role: 'GOVERNANCE_OFFICER',
    approverName: governanceOfficerUser.name,
    userId: governanceOfficerUser._id,
    decision: 'APPROVED',
    comment: 'Disparate impact ratio 0.884 satisfies the policy-defined fairness threshold (>= 0.80).',

    decidedAt: new Date('2026-01-21')
  });

  await Approval.create({
    modelId: populatedModel._id,
    versionId: v2Version._id,
    role: 'EXECUTIVE_APPROVER',
    approverName: executiveApproverUser.name,
    userId: executiveApproverUser._id,
    decision: 'APPROVED',
    comment: 'EU AI Act conformity requirements satisfied. Documented in dossier.',
    decidedAt: new Date('2026-01-22')
  });

  // Create Telemetry for v2
  const telemetry = await Telemetry.create({
    modelId: populatedModel._id,
    versionId: v2Version._id,
    batchId: 'BATCH-2026-02-001',
    sampleSize: 5000,
    aggregatePsi: 0.078,
    driftStatus: 'HEALTHY',
    features: [
      { name: 'debt_to_income', psi: 0.045, driftDetected: false },
      { name: 'credit_history_months', psi: 0.062, driftDetected: false }
    ],
    performanceTelemetry: {
      predictionVolume: 12450,
      avgLatencyMs: 28,
      errorRate: 0.001
    }
  });

  // Create Incident linked to v2
  const incident = await Incident.create({
    incidentNumber: 'INC-2026-001',
    modelId: populatedModel._id,
    versionId: v2Version._id,
    type: 'DATA_DRIFT',
    title: 'Minor seasonal drift observed in debt-to-income distribution',
    description: 'Drift resolved within expected confidence band after market adjustment.',
    severity: 'MEDIUM',
    status: 'MITIGATED',
    recommendedAction: 'INVESTIGATE',
    recommendedRollbackVersionId: v1Version._id,
    telemetryRef: telemetry._id
  });

  // Create Issue Report linked to model & version
  const issue = await IssueReport.create({
    reportNumber: 'ISSUE-2026-0001',
    modelId: populatedModel._id,
    versionId: v2Version._id,
    submittedBy: governanceOfficerUser.name,
    submitterUserId: governanceOfficerUser._id,
    issueType: 'BIAS',
    severity: 'MEDIUM',
    title: 'Verification inquiry regarding geographic proxy variables',
    description: 'Checking zip code correlation against demographic parity.',
    status: 'RESOLVED',
    resolutionNotes: 'Verified: zip code proxies neutralized in feature weights.'
  });

  // Create Audit records
  await recordAuditEvent({
    actor: mlLeadUser.name,
    role: mlLeadUser.role,
    action: 'MODEL_CREATED',
    entityType: 'Model',
    entityId: populatedModel._id,
    payload: { modelId: populatedModel._id, modelName: populatedModel.name }
  });

  await recordAuditEvent({
    actor: mlLeadUser.name,
    role: mlLeadUser.role,
    action: 'VERSION_CREATED',
    entityType: 'ModelVersion',
    entityId: v2Version._id,
    payload: { modelId: populatedModel._id, versionId: v2Version._id, version: v2Version.version }
  });

  // Setup Blank Model (for empty state testing)
  blankModel = await Model.create({
    name: 'Blank Candidate Model',
    description: 'Newly registered model with no evaluations or history.',
    purpose: 'Draft placeholder for upcoming exploratory pipeline.',
    owner: 'Dr. Sarah ML',
    team: 'Exploratory Lab',
    modelType: 'OTHER',
    riskLevel: 'LIMITED',
    lifecycleStatus: 'DRAFT',
    createdBy: mlLeadUser._id
  });

  blankVersion = await ModelVersion.create({
    modelId: blankModel._id,
    version: 'v0.1-alpha',
    lifecycleStatus: 'DRAFT',
    deploymentStatus: 'NOT_DEPLOYED',
    evaluationStatus: 'NOT_EVALUATED',
    policyStatus: 'PENDING',
    approvalStatus: 'NOT_REQUESTED',
    createdBy: mlLeadUser._id
  });
});

test.after(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

test('Dossier: 1. Full dossier compiles with complete server-authoritative evidence across all 10 sections', async () => {
  const dossier = await compileGovernanceDossier({
    modelId: populatedModel._id,
    versionId: v2Version._id,
    user: mlLeadUser
  });

  // Executive summary
  assert.ok(dossier.executiveSummary, 'Must contain executiveSummary');
  assert.equal(dossier.executiveSummary.riskLevel, 'HIGH');
  assert.equal(dossier.executiveSummary.policyStatus, 'PASSED');
  assert.equal(dossier.executiveSummary.approvalStatus, 'APPROVED');
  assert.equal(dossier.executiveSummary.monitoringStatus, 'HEALTHY');
  assert.equal(dossier.executiveSummary.auditIntegrity, 'VALID');

  // Model identity
  assert.equal(dossier.modelCard.name, 'RiskLens Credit Assessor');
  assert.equal(dossier.modelCard.owner, 'Dr. Sarah ML');
  assert.equal(dossier.modelCard.riskLevel, 'HIGH');
  assert.deepEqual(dossier.modelCard.protectedAttributes, ['gender', 'age', 'zip_code']);

  // Version lineage
  assert.equal(dossier.versionDetails.version, 'v2.0');
  assert.equal(dossier.versionDetails.isProduction, true);
  assert.equal(dossier.versionDetails.dataset.name, 'Credit Historical 2025');

  // Available versions list
  assert.equal(dossier.availableVersions.length, 2);

  // Evaluation evidence
  assert.equal(dossier.evaluations.length, 1);
  assert.equal(dossier.evaluations[0].datasetName, 'Lending Benchmark 2025-Q1');
  assert.equal(dossier.evaluations[0].dataSource, 'FILE_UPLOAD');
  assert.equal(dossier.evaluations[0].performanceMetrics.accuracy, 0.892);
  assert.equal(dossier.evaluations[0].fairnessMetrics.disparateImpactRatio, 0.884);

  // Policy evidence
  assert.ok(dossier.governancePolicy);
  assert.equal(dossier.governancePolicy.name, 'High Risk Consumer Lending Policy');
  assert.equal(dossier.governancePolicy.rules.minDisparateImpact, 0.80);

  // Approval evidence & stage-gate summary
  assert.equal(dossier.approvals.length, 3);
  assert.equal(dossier.approvalStatusSummary.isFullyApproved, true);
  assert.equal(dossier.approvalStatusSummary.approvedRoles.length, 3);

  // Monitoring evidence
  assert.ok(dossier.monitoringEvidence.latestTelemetry);
  assert.equal(dossier.monitoringEvidence.latestTelemetry.batchId, 'BATCH-2026-02-001');
  assert.equal(dossier.monitoringEvidence.latestTelemetry.driftStatus, 'HEALTHY');
  assert.equal(dossier.monitoringEvidence.latestTelemetry.aggregatePsi, 0.078);

  // Incidents evidence & traceability
  assert.equal(dossier.incidents.length, 1);
  assert.equal(dossier.incidents[0].incidentNumber, 'INC-2026-001');
  assert.equal(dossier.incidents[0].status, 'MITIGATED');

  // Issue reports evidence
  assert.equal(dossier.issueReports.length, 1);
  assert.equal(dossier.issueReports[0].reportNumber, 'ISSUE-2026-0001');

  // Audit ledger evidence
  assert.ok(dossier.auditLogSummary.length >= 2);
  assert.equal(dossier.dossierMetadata.cryptographicChainIntegrity, 'VALID');

  // Regulatory Disclaimers
  assert.ok(dossier.disclaimers.legalNotice.includes('Not an official legal certification'));
});

test('Dossier: 2. Empty states strictly avoid fabrication of metrics or approvals', async () => {
  const dossier = await compileGovernanceDossier({
    modelId: blankModel._id,
    versionId: blankVersion._id,
    user: mlLeadUser
  });

  // Verify evaluations are empty, NOT fabricated
  assert.equal(dossier.evaluations.length, 0, 'Evaluations must be empty');
  assert.equal(dossier.executiveSummary.evaluationPassed, false);

  // Verify approvals are empty, NOT fabricated
  assert.equal(dossier.approvals.length, 0, 'Approvals must be empty');
  assert.equal(dossier.approvalStatusSummary.isFullyApproved, false);

  // Verify telemetry is null, NOT fabricated
  assert.equal(dossier.monitoringEvidence.latestTelemetry, null, 'Telemetry must be null');
  assert.equal(dossier.executiveSummary.monitoringStatus, 'NO_DATA');

  // Verify incidents & issues are empty
  assert.equal(dossier.incidents.length, 0, 'Incidents must be empty');
  assert.equal(dossier.issueReports.length, 0, 'Issue reports must be empty');
});

test('Dossier: 3. RBAC authorizes governance roles (PLATFORM_ADMIN, ML_LEAD, GOVERNANCE_OFFICER, EXECUTIVE_APPROVER)', async () => {
  const authorizedUsers = [
    platformAdminUser,
    mlLeadUser,
    governanceOfficerUser,
    executiveApproverUser
  ];

  for (const u of authorizedUsers) {
    const dossier = await compileGovernanceDossier({
      modelId: populatedModel._id,
      user: u
    });
    assert.ok(dossier, `User with role ${u.role} must be authorized to view dossier`);
    assert.equal(dossier.modelCard.name, 'RiskLens Credit Assessor');
  }
});

test('Dossier: 4. RBAC rejects unauthorized role with 403 Forbidden', async () => {
  await assert.rejects(
    async () => {
      await compileGovernanceDossier({
        modelId: populatedModel._id,
        user: unauthorizedUser
      });
    },
    (err) => {
      assert.equal(err.statusCode, 403);
      assert.ok(err.message.includes('dossier:view'), 'Error must specify dossier:view capability missing');
      return true;
    }
  );
});

test('Dossier: 5. RBAC rejects PENDING and SUSPENDED accounts with 403 Forbidden', async () => {
  await assert.rejects(
    async () => {
      await compileGovernanceDossier({
        modelId: populatedModel._id,
        user: pendingUser
      });
    },
    (err) => {
      assert.equal(err.statusCode, 403);
      assert.ok(err.message.includes('PENDING'));
      return true;
    }
  );

  await assert.rejects(
    async () => {
      await compileGovernanceDossier({
        modelId: populatedModel._id,
        user: suspendedUser
      });
    },
    (err) => {
      assert.equal(err.statusCode, 403);
      assert.ok(err.message.includes('SUSPENDED'));
      return true;
    }
  );
});

test('Dossier: 6. Lifecycle Safety: Generating or viewing dossier NEVER mutates model or version state', async () => {
  const modelBefore = await Model.findById(populatedModel._id);
  const versionBefore = await ModelVersion.findById(v2Version._id);
  const auditCountBefore = await AuditLedger.countDocuments();
  const incidentCountBefore = await Incident.countDocuments();

  // Call controller
  const { req, res } = createMockReqRes({
    user: mlLeadUser,
    params: { modelId: populatedModel._id, versionId: v2Version._id }
  });
  await auditCtrl.exportComplianceDossier(req, res);

  assert.equal(res.statusCode, 200);

  const modelAfter = await Model.findById(populatedModel._id);
  const versionAfter = await ModelVersion.findById(v2Version._id);
  const auditCountAfter = await AuditLedger.countDocuments();
  const incidentCountAfter = await Incident.countDocuments();

  assert.equal(modelAfter.lifecycleStatus, modelBefore.lifecycleStatus);
  assert.equal(versionAfter.lifecycleStatus, versionBefore.lifecycleStatus);
  assert.equal(versionAfter.deploymentStatus, versionBefore.deploymentStatus);
  assert.equal(versionAfter.approvalStatus, versionBefore.approvalStatus);
  assert.equal(versionAfter.policyStatus, versionBefore.policyStatus);
  assert.equal(auditCountAfter, auditCountBefore, 'Audit count must remain identical (read-only)');
  assert.equal(incidentCountAfter, incidentCountBefore, 'Incident count must remain identical');
});

test('Dossier: 7. Markdown export generates compliant documentation artifact with legal notices', async () => {
  const { req, res } = createMockReqRes({
    user: governanceOfficerUser,
    params: { modelId: populatedModel._id, versionId: v2Version._id },
    query: { format: 'markdown' }
  });

  await auditCtrl.exportComplianceDossier(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['Content-Type'], 'text/markdown; charset=utf-8');
  assert.ok(typeof res.data === 'string', 'Markdown response must be a formatted string');
  assert.ok(res.data.includes('# AI Governance & Technical Documentation Dossier'));
  assert.ok(res.data.includes('## Executive Governance Summary'));
  assert.ok(res.data.includes('## 1. System Identity & Model Card'));
  assert.ok(res.data.includes('## 4. Statistical Performance & Fairness Evaluations'));
  assert.ok(res.data.includes('## 6. Multi-Stakeholder Stage-Gate Sign-Off Ledger'));
  assert.ok(res.data.includes('## 7. Production Runtime Monitoring & Drift Signals'));
  assert.ok(res.data.includes('Not an official legal certification'));
});

test('Dossier: 8. Targeted version lookup returns exact requested version evidence', async () => {
  const dossierV1 = await compileGovernanceDossier({
    modelId: populatedModel._id,
    versionId: v1Version._id,
    user: mlLeadUser
  });

  assert.equal(dossierV1.versionDetails.version, 'v1.0');
  assert.equal(dossierV1.versionDetails.isProduction, false);
  assert.equal(dossierV1.versionDetails.dataset.name, 'Credit Historical 2024');

  const dossierV2 = await compileGovernanceDossier({
    modelId: populatedModel._id,
    versionId: v2Version._id,
    user: mlLeadUser
  });

  assert.equal(dossierV2.versionDetails.version, 'v2.0');
  assert.equal(dossierV2.versionDetails.isProduction, true);
  assert.equal(dossierV2.versionDetails.dataset.name, 'Credit Historical 2025');
});

test('Dossier: 9. Complete SHA-256 cryptographic chain integrity verifies successfully', async () => {
  const integrity = await verifyAuditChainIntegrity();
  assert.equal(integrity.valid, true, 'Cryptographic ledger chain must verify as valid');
});
