import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { User } from '../src/models/User.js';
import { Model } from '../src/models/Model.js';
import { ModelVersion } from '../src/models/ModelVersion.js';
import { IssueReport } from '../src/models/IssueReport.js';
import { Report } from '../src/models/Report.js';
import { AuditLedger } from '../src/models/AuditLedger.js';
import { hashPassword } from '../src/services/nativeAuthService.js';
import {
  generateComplianceDossierPdf,
  generateIssueReportPdf,
  generateIssueReportMarkdown,
  generateDriftReportPdf
} from '../src/services/pdfService.js';
import { compileGovernanceDossier } from '../src/services/reportService.js';
import * as auditCtrl from '../src/controllers/auditController.js';
import * as issueCtrl from '../src/controllers/issueController.js';
import * as reportCtrl from '../src/controllers/reportController.js';
import * as authCtrl from '../src/controllers/authController.js';

let mongoServer;

// Four Governance Roles
let platformAdminUser;
let mlLeadUser;
let governanceOfficerUser;
let executiveApproverUser;

// Restricted / External Test Users
let suspendedUser;
let googleOnlyUser;
let externalAuditorUser; // Role without DOSSIER_EXPORT

// Test Assets
let testModel;
let testVersion;
let testIssueML;
let testIssueAdmin;
let testReport;

function pdfContainsText(pdfBuffer, text) {
  const str = pdfBuffer.toString('latin1');
  if (str.includes(text)) return true;
  const hexMatches = str.match(/<([0-9a-fA-F]+)>/g) || [];
  const decoded = hexMatches.map(h => Buffer.from(h.slice(1, -1), 'hex').toString('latin1')).join('');
  return decoded.includes(text);
}

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

  const initialPasswordHash = await hashPassword('InitialPass123!');

  // 1. Setup All Four Standard Governance Roles
  platformAdminUser = await User.create({
    name: 'Platform Admin',
    email: 'admin@sentinel.internal',
    role: 'PLATFORM_ADMIN',
    status: 'ACTIVE',
    verificationStatus: 'VERIFIED',
    passwordHash: initialPasswordHash,
    authProvider: 'EMAIL',
    loginHistory: [
      { loginAt: new Date(Date.now() - 3600000 * 5), logoutAt: new Date(Date.now() - 3600000 * 4), authProvider: 'EMAIL' },
      { loginAt: new Date(Date.now() - 3600000 * 3), logoutAt: new Date(Date.now() - 3600000 * 2), authProvider: 'EMAIL' },
      { loginAt: new Date(Date.now() - 3600000 * 1), logoutAt: null, authProvider: 'EMAIL' }
    ]
  });

  mlLeadUser = await User.create({
    name: 'Dr. Sarah ML Lead',
    email: 'ml.lead@sentinel.internal',
    role: 'ML_LEAD',
    status: 'ACTIVE',
    verificationStatus: 'VERIFIED',
    passwordHash: initialPasswordHash,
    authProvider: 'EMAIL',
    loginHistory: [
      { loginAt: new Date(Date.now() - 86400000 * 4), logoutAt: new Date(Date.now() - 86400000 * 4 + 3600000), authProvider: 'EMAIL' },
      { loginAt: new Date(Date.now() - 86400000 * 3), logoutAt: new Date(Date.now() - 86400000 * 3 + 3600000), authProvider: 'EMAIL' },
      { loginAt: new Date(Date.now() - 86400000 * 2), logoutAt: new Date(Date.now() - 86400000 * 2 + 3600000), authProvider: 'EMAIL' },
      { loginAt: new Date(Date.now() - 86400000 * 1), logoutAt: new Date(Date.now() - 86400000 * 1 + 3600000), authProvider: 'EMAIL' },
      { loginAt: new Date(), logoutAt: null, authProvider: 'EMAIL' }
    ]
  });

  governanceOfficerUser = await User.create({
    name: 'Grace Officer',
    email: 'governance.officer@sentinel.internal',
    role: 'GOVERNANCE_OFFICER',
    status: 'ACTIVE',
    verificationStatus: 'VERIFIED',
    passwordHash: initialPasswordHash,
    authProvider: 'EMAIL'
  });

  executiveApproverUser = await User.create({
    name: 'Evelyn Executive',
    email: 'exec.approver@sentinel.internal',
    role: 'EXECUTIVE_APPROVER',
    status: 'ACTIVE',
    verificationStatus: 'VERIFIED',
    passwordHash: initialPasswordHash,
    authProvider: 'EMAIL'
  });

  // 2. Suspended & External Users
  suspendedUser = await User.create({
    name: 'Suspended Account',
    email: 'suspended@sentinel.internal',
    role: 'GOVERNANCE_OFFICER',
    status: 'SUSPENDED',
    verificationStatus: 'VERIFIED'
  });

  googleOnlyUser = await User.create({
    name: 'Google SSO User',
    email: 'google.sso@sentinel.internal',
    role: 'GOVERNANCE_OFFICER',
    status: 'ACTIVE',
    verificationStatus: 'VERIFIED',
    googleId: 'google-oauth2-998877',
    authProvider: 'GOOGLE'
  });

  externalAuditorUser = {
    _id: new mongoose.Types.ObjectId(),
    name: 'Guest Auditor',
    email: 'guest@external.org',
    role: 'EXTERNAL_AUDITOR', // role not possessing DOSSIER_EXPORT
    status: 'ACTIVE'
  };

  // 3. Setup Test Model and Version
  testModel = await Model.create({
    name: 'CreditLens Enterprise',
    description: 'High-risk automated credit underwriting and risk assessment engine.',
    purpose: 'Evaluates applicant financial resilience for revolving credit facilities.',
    owner: 'Dr. Sarah ML Lead',
    team: 'Risk Analytics',
    modelType: 'CLASSIFICATION',
    riskLevel: 'HIGH',
    lifecycleStatus: 'IN_PRODUCTION',
    status: 'ACTIVE',
    createdBy: mlLeadUser._id,
    riskAssessment: {
      prohibitedPracticesChecked: true,
      euAiActClassification: 'HIGH',
      safetyImpactRating: 'Significant',
      autonomyLevel: 'Human-in-the-loop',
      assessedAt: new Date(),
      assessedBy: 'Grace Officer'
    }
  });

  testVersion = await ModelVersion.create({
    modelId: testModel._id,
    version: 'v2.0',
    lifecycleState: 'IN_PRODUCTION',
    evaluationGateState: 'PASSED',
    approvalStatus: 'APPROVED',
    runtimeHealthStatus: 'HEALTHY',
    createdBy: mlLeadUser._id
  });

  testModel.currentProductionVersionId = testVersion._id;
  await testModel.save();

  // 4. Setup Issue Reports (one by ML Lead, one by Admin)
  testIssueML = await IssueReport.create({
    reportNumber: 'ISS-0001',
    modelId: testModel._id,
    versionId: testVersion._id,
    submittedBy: mlLeadUser.name,
    submitterUserId: mlLeadUser._id,
    issueType: 'BIAS',
    severity: 'HIGH',
    title: 'Disparate Impact Shift in Age Group Cohort',
    description: 'Underwriting selection rate for age cohort 18-25 shifted below the 0.80 Four-Fifths rule threshold.',
    evidence: [{ name: 'disparate_impact_drift.json', url: 'https://storage/ev/01.json', type: 'application/json' }],
    status: 'UNDER_INVESTIGATION'
  });

  testIssueAdmin = await IssueReport.create({
    reportNumber: 'ISS-0002',
    modelId: testModel._id,
    versionId: testVersion._id,
    submittedBy: platformAdminUser.name,
    submitterUserId: platformAdminUser._id,
    issueType: 'PERFORMANCE',
    severity: 'MEDIUM',
    title: 'Latency Spike on Secondary Inference Worker',
    description: 'Inference p99 latency breached 400ms SLA during market open.',
    status: 'SUBMITTED'
  });

  testReport = await Report.create({
    reportNumber: 'REP-DRIFT-TEST',
    reportType: 'DATA_DRIFT_ANALYSIS',
    title: 'Statistical Distribution Drift Report: Test Model',
    modelId: testModel._id,
    versionId: testVersion._id,
    generatedBy: mlLeadUser.name,
    operationalStatus: 'CRITICAL',
    driftAnalysis: {
      workloadId: 'credit-risk',
      driftedColumns: ['AMT_INCOME', 'AMT_CREDIT'],
      features: [
        { name: 'AMT_INCOME', statisticalMethod: 'ks', pValue: 0.00002, threshold: 0.05, driftDetected: true },
        { name: 'AMT_CREDIT', statisticalMethod: 'ks', pValue: 0.00001, threshold: 0.05, driftDetected: true },
        { name: 'GENDER', statisticalMethod: 'chisquare', pValue: 0.85, threshold: 0.05, driftDetected: false }
      ],
      recordsAnalyzed: 25
    },
    executiveSummary: 'Evidently testing identified statistically significant distribution shift across 2 features.'
  });
});

test.after(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 1: COMPLIANCE DOSSIER A4 PDF EXPORT
// ─────────────────────────────────────────────────────────────────────────────

test('1. Compliance Dossier PDF Generation & Layout', async (t) => {
  await t.test('1.1 Generates valid multi-page A4 PDF buffer with selectable text (%PDF- header)', async () => {
    const dossier = await compileGovernanceDossier({
      modelId: testModel._id,
      versionId: testVersion._id,
      user: mlLeadUser
    });

    const pdfBuffer = await generateComplianceDossierPdf(dossier);
    assert.ok(Buffer.isBuffer(pdfBuffer), 'Must return a Buffer');
    assert.ok(pdfBuffer.length > 2000, 'PDF buffer must contain substantial document content');
    const header = pdfBuffer.slice(0, 5).toString('ascii');
    assert.equal(header, '%PDF-', 'Must start with valid PDF format identifier %PDF-');
  });

  await t.test('1.2 Contains all 10 required dossier sections without clipping or fabrication', async () => {
    const dossier = await compileGovernanceDossier({
      modelId: testModel._id,
      versionId: testVersion._id,
      user: platformAdminUser
    });

    const pdfBuffer = await generateComplianceDossierPdf(dossier);

    // Verify presence of all 10 section headers in PDF byte stream
    assert.ok(pdfContainsText(pdfBuffer, 'AI GOVERNANCE & REGULATORY DOSSIER'), 'Must contain cover title');
    assert.ok(pdfContainsText(pdfBuffer, 'Executive Governance Summary'), 'Must contain executive summary');
    assert.ok(pdfContainsText(pdfBuffer, 'System Description & Model Identity'), 'Must contain Section 1');
    assert.ok(pdfContainsText(pdfBuffer, 'Risk Assessment & Regulatory Alignment'), 'Must contain Section 2');
    assert.ok(pdfContainsText(pdfBuffer, 'Version Lineage & Deployment Record'), 'Must contain Section 3');
    assert.ok(pdfContainsText(pdfBuffer, 'Statistical Fairness & Performance Verification'), 'Must contain Section 4');
    assert.ok(pdfContainsText(pdfBuffer, 'Governance Policy & Stage-Gate Decision'), 'Must contain Section 5');
    assert.ok(pdfContainsText(pdfBuffer, 'Multi-Stakeholder Stage-Gate Sign-off Ledger'), 'Must contain Section 6');
    assert.ok(pdfContainsText(pdfBuffer, 'Production Runtime Monitoring & Drift Signals'), 'Must contain Section 7');
    assert.ok(pdfContainsText(pdfBuffer, 'Operational Incidents & Corrective Actions'), 'Must contain Section 8');
    assert.ok(pdfContainsText(pdfBuffer, 'Employee Issue Reports & Escalations'), 'Must contain Section 9');
    assert.ok(pdfContainsText(pdfBuffer, 'Immutable Cryptographic Audit Signatures'), 'Must contain Section 10');
  });

  await t.test('1.3 Preserves model and version consistently throughout the report', async () => {
    const dossier = await compileGovernanceDossier({
      modelId: testModel._id,
      versionId: testVersion._id,
      user: governanceOfficerUser
    });

    assert.equal(dossier.modelCard.name, 'CreditLens Enterprise');
    assert.equal(dossier.versionDetails.version, 'v2.0');
    assert.equal(dossier.executiveSummary.riskLevel, 'HIGH');
  });
});

test('2. Compliance Dossier RBAC Across All Four Roles', async (t) => {
  const roles = [
    { name: 'Admin', user: platformAdminUser },
    { name: 'ML Lead', user: mlLeadUser },
    { name: 'Governance Officer', user: governanceOfficerUser },
    { name: 'Executive Approver', user: executiveApproverUser }
  ];

  for (const { name, user } of roles) {
    await t.test(`2.${name} is authorized to export Compliance Dossier PDF`, async () => {
      const { req, res } = createMockReqRes({
        user,
        params: { modelId: String(testModel._id), versionId: String(testVersion._id) },
        query: { format: 'pdf' }
      });

      await auditCtrl.exportComplianceDossier(req, res);
      assert.equal(res.statusCode, 200);
      assert.equal(res.headers['Content-Type'], 'application/pdf');
      assert.ok(Buffer.isBuffer(res.data), 'Response body must be a PDF buffer');
    });
  }

  await t.test('2.5 Denies export for suspended users (403 Forbidden)', async () => {
    const { req, res } = createMockReqRes({
      user: suspendedUser,
      params: { modelId: String(testModel._id), versionId: String(testVersion._id) },
      query: { format: 'pdf' }
    });

    await auditCtrl.exportComplianceDossier(req, res);
    assert.equal(res.statusCode, 403);
    assert.match(res.data.error, /Access restricted.*SUSPENDED/);
  });

  await t.test('2.6 Denies export for roles lacking DOSSIER_EXPORT permission (403 Forbidden)', async () => {
    const { req, res } = createMockReqRes({
      user: externalAuditorUser,
      params: { modelId: String(testModel._id), versionId: String(testVersion._id) },
      query: { format: 'pdf' }
    });

    await auditCtrl.exportComplianceDossier(req, res);
    assert.equal(res.statusCode, 403);
    assert.match(res.data.error, /Forbidden: Insufficient permissions/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 2: ISSUE REPORT EXPORT (PDF, MARKDOWN, JSON) & RBAC
// ─────────────────────────────────────────────────────────────────────────────

test('3. Issue Report Export (PDF, Markdown, JSON)', async (t) => {
  await t.test('3.1 Generates valid issue report PDF with metadata and evidence', async () => {
    const issue = await IssueReport.findById(testIssueML._id).populate('modelId').populate('versionId');
    const pdfBuffer = await generateIssueReportPdf(issue);

    assert.ok(Buffer.isBuffer(pdfBuffer));
    assert.equal(pdfBuffer.slice(0, 5).toString('ascii'), '%PDF-');
    assert.ok(pdfContainsText(pdfBuffer, 'GOVERNANCE ISSUE REPORT: ISS-0001'));
    assert.ok(pdfContainsText(pdfBuffer, 'Disparate Impact Shift'));
  });

  await t.test('3.2 Generates valid issue report Markdown export', async () => {
    const issue = await IssueReport.findById(testIssueML._id).populate('modelId').populate('versionId');
    const md = generateIssueReportMarkdown(issue);

    assert.ok(md.includes('# Governance Issue Report: ISS-0001'));
    assert.ok(md.includes('Disparate Impact Shift in Age Group Cohort'));
    assert.ok(md.includes('Underwriting selection rate'));
  });

  await t.test('3.3 Controller export endpoint supports PDF, Markdown, and JSON formats', async () => {
    // PDF format
    const pdfReqRes = createMockReqRes({
      user: mlLeadUser,
      params: { id: String(testIssueML._id) },
      query: { format: 'pdf' }
    });
    await issueCtrl.exportIssueReport(pdfReqRes.req, pdfReqRes.res);
    assert.equal(pdfReqRes.res.statusCode, 200);
    assert.equal(pdfReqRes.res.headers['Content-Type'], 'application/pdf');

    // Markdown format
    const mdReqRes = createMockReqRes({
      user: mlLeadUser,
      params: { id: String(testIssueML._id) },
      query: { format: 'markdown' }
    });
    await issueCtrl.exportIssueReport(mdReqRes.req, mdReqRes.res);
    assert.equal(mdReqRes.res.statusCode, 200);
    assert.equal(mdReqRes.res.headers['Content-Type'], 'text/markdown; charset=utf-8');

    // JSON format
    const jsonReqRes = createMockReqRes({
      user: mlLeadUser,
      params: { id: String(testIssueML._id) },
      query: { format: 'json' }
    });
    await issueCtrl.exportIssueReport(jsonReqRes.req, jsonReqRes.res);
    assert.equal(jsonReqRes.res.statusCode, 200);
    assert.equal(jsonReqRes.res.data.data.reportNumber, 'ISS-0001');
  });
});

test('4. Issue Report RBAC & Access Restrictions Across Roles', async (t) => {
  await t.test('4.1 ML Lead (has ISSUES_MANAGE) can export any issue report', async () => {
    const { req, res } = createMockReqRes({
      user: mlLeadUser,
      params: { id: String(testIssueAdmin._id) }, // Submitted by Admin
      query: { format: 'pdf' }
    });
    await issueCtrl.exportIssueReport(req, res);
    assert.equal(res.statusCode, 200);
  });

  await t.test('4.2 Governance Officer (has ISSUES_MANAGE) can export any issue report', async () => {
    const { req, res } = createMockReqRes({
      user: governanceOfficerUser,
      params: { id: String(testIssueML._id) }, // Submitted by ML Lead
      query: { format: 'pdf' }
    });
    await issueCtrl.exportIssueReport(req, res);
    assert.equal(res.statusCode, 200);
  });

  await t.test('4.3 Executive Approver (no ISSUES_MANAGE) is DENIED exporting another user\'s issue report (403)', async () => {
    const { req, res } = createMockReqRes({
      user: executiveApproverUser,
      params: { id: String(testIssueML._id) }, // Belongs to ML Lead
      query: { format: 'pdf' }
    });
    await issueCtrl.exportIssueReport(req, res);
    assert.equal(res.statusCode, 403);
    assert.match(res.data.error, /Access denied: You can only view your own submitted issue reports/);
  });

  await t.test('4.4 Platform Admin (no ISSUES_MANAGE) can export OWN submitted issue report', async () => {
    const { req, res } = createMockReqRes({
      user: platformAdminUser,
      params: { id: String(testIssueAdmin._id) }, // Belongs to Platform Admin
      query: { format: 'pdf' }
    });
    await issueCtrl.exportIssueReport(req, res);
    assert.equal(res.statusCode, 200);
  });

  await t.test('4.5 Platform Admin (no ISSUES_MANAGE) is DENIED exporting another user\'s issue report (403)', async () => {
    const { req, res } = createMockReqRes({
      user: platformAdminUser,
      params: { id: String(testIssueML._id) }, // Belongs to ML Lead
      query: { format: 'pdf' }
    });
    await issueCtrl.exportIssueReport(req, res);
    assert.equal(res.statusCode, 403);
    assert.match(res.data.error, /Access denied: You can only view your own submitted issue reports/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 3: USER PROFILE & IDENTITY (EDIT PROFILE, CHANGE PASSWORD, ACTIVITY)
// ─────────────────────────────────────────────────────────────────────────────

test('5. User Profile Editing & Mass Assignment Prevention', async (t) => {
  await t.test('5.1 User can update own display name and email address', async () => {
    const { req, res } = createMockReqRes({
      user: mlLeadUser,
      body: {
        name: 'Dr. Sarah Connor ML Lead',
        email: 'sarah.connor@sentinel.internal'
      }
    });

    await authCtrl.updateUserProfile(req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.data.user.name, 'Dr. Sarah Connor ML Lead');
    assert.equal(res.data.user.email, 'sarah.connor@sentinel.internal');

    // Verify persisted in database
    const refreshed = await User.findById(mlLeadUser._id);
    assert.equal(refreshed.name, 'Dr. Sarah Connor ML Lead');
    assert.equal(refreshed.email, 'sarah.connor@sentinel.internal');
  });

  await t.test('5.2 Rejects duplicate email address belonging to another account (409 Conflict)', async () => {
    const { req, res } = createMockReqRes({
      user: mlLeadUser,
      body: {
        email: platformAdminUser.email // Email already in use by Admin
      }
    });

    await authCtrl.updateUserProfile(req, res);
    assert.equal(res.statusCode, 409);
    assert.match(res.data.error, /already in use/);
  });

  await t.test('5.3 Rejects invalid email formatting (400 Bad Request)', async () => {
    const { req, res } = createMockReqRes({
      user: mlLeadUser,
      body: { email: 'not-an-email' }
    });

    await authCtrl.updateUserProfile(req, res);
    assert.equal(res.statusCode, 400);
    assert.match(res.data.error, /valid email address/);
  });

  await t.test('5.4 Rejects name length < 2 or > 80 (400 Bad Request)', async () => {
    const { req, res } = createMockReqRes({
      user: mlLeadUser,
      body: { name: 'A' }
    });

    await authCtrl.updateUserProfile(req, res);
    assert.equal(res.statusCode, 400);
    assert.match(res.data.error, /between 2 and 80 characters/);
  });

  await t.test('5.5 Mass Assignment Protection: User CANNOT alter role, status, or verificationStatus', async () => {
    const { req, res } = createMockReqRes({
      user: mlLeadUser,
      body: {
        name: 'Dr. Sarah Connor',
        role: 'PLATFORM_ADMIN',      // Malicious attempt to elevate role
        status: 'SUSPENDED',         // Malicious attempt to suspend
        verificationStatus: 'PENDING'
      }
    });

    await authCtrl.updateUserProfile(req, res);
    assert.equal(res.statusCode, 200);

    const refreshed = await User.findById(mlLeadUser._id);
    assert.equal(refreshed.role, 'ML_LEAD', 'Role MUST NOT be altered via profile update');
    assert.equal(refreshed.status, 'ACTIVE', 'Status MUST NOT be altered via profile update');
  });

  await t.test('5.6 Cannot modify another user by forging ID in body', async () => {
    const { req, res } = createMockReqRes({
      user: mlLeadUser,
      body: {
        _id: String(platformAdminUser._id),
        userId: String(platformAdminUser._id),
        name: 'Hacked Admin'
      }
    });

    await authCtrl.updateUserProfile(req, res);
    assert.equal(res.statusCode, 200);

    // Verify Platform Admin record is completely untouched
    const adminRefreshed = await User.findById(platformAdminUser._id);
    assert.equal(adminRefreshed.name, 'Platform Admin');
  });
});

test('6. Password Management & Security Policies', async (t) => {
  await t.test('6.1 Changing password requires correct current password and strong new password', async () => {
    const { req, res } = createMockReqRes({
      user: executiveApproverUser,
      body: {
        currentPassword: 'InitialPass123!',
        newPassword: 'SecureNewPassword2026!',
        confirmPassword: 'SecureNewPassword2026!'
      }
    });

    await authCtrl.changePassword(req, res);
    assert.equal(res.statusCode, 200);
    assert.match(res.data.message, /Password changed successfully/);
  });

  await t.test('6.2 Rejects incorrect current password (400 Bad Request)', async () => {
    const { req, res } = createMockReqRes({
      user: executiveApproverUser,
      body: {
        currentPassword: 'WrongPassword!',
        newPassword: 'AnotherPassword999!',
        confirmPassword: 'AnotherPassword999!'
      }
    });

    await authCtrl.changePassword(req, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.data.error, 'Current password is incorrect.');
  });

  await t.test('6.3 Rejects weak new password (missing uppercase/digit/length)', async () => {
    const { req, res } = createMockReqRes({
      user: executiveApproverUser,
      body: {
        currentPassword: 'SecureNewPassword2026!',
        newPassword: 'short',
        confirmPassword: 'short'
      }
    });

    await authCtrl.changePassword(req, res);
    assert.equal(res.statusCode, 400);
    assert.match(res.data.error, /Password must be at least 8 characters/);
  });

  await t.test('6.4 Rejects password change for external Google-only account', async () => {
    const { req, res } = createMockReqRes({
      user: googleOnlyUser,
      body: {
        currentPassword: 'AnyPassword123!',
        newPassword: 'BrandNewPass123!',
        confirmPassword: 'BrandNewPass123!'
      }
    });

    await authCtrl.changePassword(req, res);
    assert.equal(res.statusCode, 400);
    assert.match(res.data.error, /external identity provider/);
  });
});

test('7. Login & Activity History Presentation Logic', async (t) => {
  await t.test('7.1 Slices history to latest 3 records by default in reverse chronological order', () => {
    const history = mlLeadUser.loginHistory;
    assert.equal(history.length, 5);

    const sorted = [...history].sort((a, b) => new Date(b.loginAt) - new Date(a.loginAt));
    const initialThree = sorted.slice(0, 3);

    assert.equal(initialThree.length, 3);
    assert.ok(new Date(initialThree[0].loginAt) >= new Date(initialThree[1].loginAt));
    assert.ok(new Date(initialThree[1].loginAt) >= new Date(initialThree[2].loginAt));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 4: RUNTIME DRIFT & OBSERVABILITY REPORT PDF EXPORT
// ─────────────────────────────────────────────────────────────────────────────

test('8. Runtime Drift & Observability Report PDF, Markdown, and JSON Export', async (t) => {
  await t.test('8.1 Generates valid multi-page A4 PDF buffer with selectable text for drift report', async () => {
    const reportDoc = await Report.findById(testReport._id)
      .populate('modelId')
      .populate('versionId');

    const pdfBuffer = await generateDriftReportPdf(reportDoc);
    assert.ok(Buffer.isBuffer(pdfBuffer));
    assert.ok(pdfBuffer.length > 5000);
    assert.equal(pdfBuffer.slice(0, 5).toString('latin1'), '%PDF-');

    assert.ok(pdfContainsText(pdfBuffer, 'REP-DRIFT-TEST'));
    assert.ok(pdfContainsText(pdfBuffer, 'AMT_INCOME'));
    assert.ok(pdfContainsText(pdfBuffer, 'AMT_CREDIT'));
    assert.ok(pdfContainsText(pdfBuffer, 'DRIFT DETECTED'));
    assert.ok(pdfContainsText(pdfBuffer, 'NIST AI RMF'));
  });

  await t.test('8.2 reportController.exportReport returns valid PDF with attachment headers', async () => {
    const { req, res } = createMockReqRes({
      params: { id: String(testReport._id) },
      query: { format: 'pdf' }
    });

    await reportCtrl.exportReport(req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['Content-Type'], 'application/pdf');
    assert.match(res.headers['Content-Disposition'], /attachment; filename="REP-DRIFT-TEST.pdf"/);
    assert.ok(Buffer.isBuffer(res.data));
    assert.equal(res.data.slice(0, 5).toString('latin1'), '%PDF-');
  });

  await t.test('8.3 reportController.exportReport preserves JSON format export', async () => {
    const { req, res } = createMockReqRes({
      params: { id: String(testReport._id) },
      query: { format: 'json' }
    });

    await reportCtrl.exportReport(req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['Content-Type'], 'application/json; charset=utf-8');
    assert.equal(res.data.reportNumber, 'REP-DRIFT-TEST');
  });

  await t.test('8.4 reportController.exportReport preserves Markdown format export', async () => {
    const { req, res } = createMockReqRes({
      params: { id: String(testReport._id) },
      query: { format: 'markdown' }
    });

    await reportCtrl.exportReport(req, res);
    assert.equal(res.statusCode, 200);
    assert.match(res.headers['Content-Type'], /text\/markdown/);
    assert.ok(typeof res.data === 'string');
    assert.match(res.data, /Evidently/);
  });
});
