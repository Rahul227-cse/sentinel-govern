import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { Model } from '../src/models/Model.js';
import { ModelVersion } from '../src/models/ModelVersion.js';
import { User } from '../src/models/User.js';
import { IssueReport } from '../src/models/IssueReport.js';
import { Incident } from '../src/models/Incident.js';
import { AuditLedger } from '../src/models/AuditLedger.js';
import { PERMISSIONS, hasPermission } from '../src/config/permissions.js';
import { requireRole, requirePermission, requireActiveUser } from '../src/middleware/authMiddleware.js';
import * as issueCtrl from '../src/controllers/issueController.js';
import * as incidentCtrl from '../src/controllers/incidentController.js';
import * as issueService from '../src/services/issueService.js';
import * as incidentService from '../src/services/incidentService.js';
import { verifyAuditChainIntegrity } from '../src/services/auditEngine.js';

let mongoServer;

// Test users
let employee1;
let employee2;
let pendingEmployee;
let suspendedEmployee;
let mlLeadUser;
let governanceOfficerUser;
let execApproverUser;
let platformAdminUser;

// Test governance entities
let testModel;
let v1Approved;
let v2Current;
let v3Failed;

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

  // Create users across all relevant governance roles
  employee1 = await User.create({
    googleId: 'emp-1-google-id',
    email: 'alice.exec@aegis.ai',
    name: 'Alice Reporter',
    role: 'EXECUTIVE_APPROVER',
    status: 'ACTIVE'
  });

  employee2 = await User.create({
    googleId: 'emp-2-google-id',
    email: 'bob.exec@aegis.ai',
    name: 'Bob Reporter',
    role: 'EXECUTIVE_APPROVER',
    status: 'ACTIVE'
  });

  pendingEmployee = await User.create({
    googleId: 'pending-emp-id',
    email: 'charlie.pending@aegis.ai',
    name: 'Charlie Pending',
    role: 'GOVERNANCE_OFFICER',
    status: 'PENDING'
  });

  suspendedEmployee = await User.create({
    googleId: 'suspended-emp-id',
    email: 'dave.suspended@aegis.ai',
    name: 'Dave Suspended',
    role: 'GOVERNANCE_OFFICER',
    status: 'SUSPENDED'
  });

  mlLeadUser = await User.create({
    googleId: 'ml-lead-google-id',
    email: 'lead@aegis.ai',
    name: 'Dr. Jane Lead',
    role: 'ML_LEAD',
    status: 'ACTIVE'
  });

  governanceOfficerUser = await User.create({
    googleId: 'gov-google-id',
    email: 'gov@aegis.ai',
    name: 'Dr. Marcus Governance',
    role: 'GOVERNANCE_OFFICER',
    status: 'ACTIVE'
  });

  execApproverUser = await User.create({
    googleId: 'exec-sponsor-google-id',
    email: 'sponsor@aegis.ai',
    name: 'Sarah Executive',
    role: 'EXECUTIVE_APPROVER',
    status: 'ACTIVE'
  });

  platformAdminUser = await User.create({
    googleId: 'admin-google-id',
    email: 'admin@aegis.ai',
    name: 'Alex Admin',
    role: 'PLATFORM_ADMIN',
    status: 'ACTIVE'
  });

  // Setup test model and versions
  testModel = await Model.create({
    name: 'Credit Risk Scorer v9',
    description: 'Underwriting and credit risk model',
    purpose: 'Underwriting',
    owner: 'Risk Engineering',
    team: 'Credit Risk',
    riskLevel: 'HIGH',
    lifecycleStatus: 'IN_PRODUCTION'
  });

  // v1.0: Valid approved baseline (eligible for rollback)
  v1Approved = await ModelVersion.create({
    modelId: testModel._id,
    version: 'v1.0',
    lifecycleStatus: 'APPROVED',
    deploymentStatus: 'IN_PRODUCTION',
    policyStatus: 'PASSED',
    approvalStatus: 'APPROVED'
  });

  // v2.0: Active production version (with observed issues)
  v2Current = await ModelVersion.create({
    modelId: testModel._id,
    version: 'v2.0',
    lifecycleStatus: 'IN_PRODUCTION',
    deploymentStatus: 'IN_PRODUCTION',
    policyStatus: 'PASSED',
    approvalStatus: 'APPROVED'
  });

  // v3.0: Failed version (ineligible for rollback baseline)
  v3Failed = await ModelVersion.create({
    modelId: testModel._id,
    version: 'v3.0',
    lifecycleStatus: 'EVALUATION',
    deploymentStatus: 'NOT_DEPLOYED',
    policyStatus: 'FAILED',
    approvalStatus: 'REJECTED'
  });

  testModel.currentProductionVersionId = v2Current._id;
  await testModel.save();
});

test.after(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

// ============================================================================
// 1. ISSUE CREATION
// ============================================================================

test('Issue Creation: 1. Active Employee can create an issue report', async () => {
  const { req, res } = createMockReqRes({
    user: employee1,
    body: {
      modelId: testModel._id,
      versionId: v2Current._id,
      issueType: 'BIAS',
      severity: 'HIGH',
      title: 'Disparate rejection rate observed in credit assessment',
      description: 'Customer complaints indicate statistically disproportionate rejection rates for cohort A.'
    }
  });

  await issueCtrl.createIssueReport(req, res);

  assert.strictEqual(res.statusCode, 201);
  assert.strictEqual(res.data.success, true);
  assert.ok(res.data.data.reportNumber.startsWith('ISS-'));
  assert.strictEqual(res.data.data.submittedBy, employee1.name);
  assert.strictEqual(String(res.data.data.submitterUserId), String(employee1._id));
  assert.strictEqual(res.data.data.status, 'SUBMITTED');
  assert.strictEqual(res.data.data.issueType, 'BIAS');
  assert.strictEqual(res.data.data.severity, 'HIGH');
});

test('Issue Creation: 2. Pending Employee cannot create an issue (requireActiveUser blocks with 403)', async () => {
  const middleware = requireActiveUser;
  let nextCalled = false;
  const { req, res } = createMockReqRes({ user: pendingEmployee });

  middleware(req, res, () => { nextCalled = true; });

  assert.strictEqual(nextCalled, false);
  assert.strictEqual(res.statusCode, 403);
  assert.match(res.data.error, /pending/i);
});

test('Issue Creation: 3. Suspended Employee cannot create an issue (requireActiveUser blocks with 403)', async () => {
  const middleware = requireActiveUser;
  let nextCalled = false;
  const { req, res } = createMockReqRes({ user: suspendedEmployee });

  middleware(req, res, () => { nextCalled = true; });

  assert.strictEqual(nextCalled, false);
  assert.strictEqual(res.statusCode, 403);
  assert.match(res.data.error, /suspended/i);
});

test('Issue Creation: 4. Reporter identity comes strictly from authenticated user', async () => {
  const issue = await issueService.createIssueReport({
    modelId: testModel._id,
    versionId: v2Current._id,
    issueType: 'PERFORMANCE',
    severity: 'MEDIUM',
    title: 'Latency spikes observed under peak load',
    description: 'P99 inference latency exceeds SLA during peak hours.',
    user: employee2
  });

  assert.strictEqual(issue.submittedBy, employee2.name);
  assert.strictEqual(String(issue.submitterUserId), String(employee2._id));
});

test('Issue Creation: 5. Forged reporter identity in request body is rejected and cannot overwrite identity', async () => {
  // Attempt to forge another employee's submitterUserId
  const { req, res } = createMockReqRes({
    user: employee1,
    body: {
      modelId: testModel._id,
      versionId: v2Current._id,
      issueType: 'SAFETY',
      title: 'Hallucination in risk report generation',
      description: 'The model fabricated financial ratios in report output.',
      submitterUserId: employee2._id // Spoofed identity!
    }
  });

  await issueCtrl.createIssueReport(req, res);

  assert.strictEqual(res.statusCode, 403);
  assert.strictEqual(res.data.success, false);
  assert.match(res.data.error, /Cannot forge submitter identity/);
});

// ============================================================================
// 2. ISSUE VISIBILITY
// ============================================================================

test('Issue Visibility: 6. Employee can view their own submitted issues', async () => {
  // employee1 queries issues
  const { req, res } = createMockReqRes({ user: employee1 });
  await issueCtrl.getIssueReports(req, res);

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.data.success, true);
  // All returned issues must belong to employee1
  for (const iss of res.data.data) {
    assert.strictEqual(String(iss.submitterUserId), String(employee1._id));
  }
});

test('Issue Visibility: 7. Employee cannot view another employee’s issue by direct ID', async () => {
  // Create an issue owned by employee2
  const issue2 = await issueService.createIssueReport({
    modelId: testModel._id,
    versionId: v2Current._id,
    issueType: 'DATA',
    severity: 'MEDIUM',
    title: 'Unusual missing values in incoming feature batch',
    description: 'Feature batch has 30% nulls in categorical column.',
    user: employee2
  });

  // employee1 attempts to fetch employee2's issue
  const { req, res } = createMockReqRes({
    user: employee1,
    params: { id: issue2._id }
  });

  await issueCtrl.getIssueReportById(req, res);

  assert.strictEqual(res.statusCode, 403);
  assert.strictEqual(res.data.success, false);
  assert.match(res.data.error, /Access denied/);
});

test('Issue Visibility: 8. Unauthorized roles cannot perform restricted issue mutations (requireRole 403)', async () => {
  const middleware = requireRole(['ML_LEAD', 'GOVERNANCE_OFFICER']);

  // Executive Approver attempting domain issue mutation
  let nextCalledExec = false;
  const { req: reqExec, res: resExec } = createMockReqRes({ user: execApproverUser });
  middleware(reqExec, resExec, () => { nextCalledExec = true; });
  assert.strictEqual(nextCalledExec, false);
  assert.strictEqual(resExec.statusCode, 403);

  // Platform Admin attempting domain governance mutation (no blanket bypass)
  let nextCalledAdmin = false;
  const { req: reqAdmin, res: resAdmin } = createMockReqRes({ user: platformAdminUser });
  middleware(reqAdmin, resAdmin, () => { nextCalledAdmin = true; });
  assert.strictEqual(nextCalledAdmin, false);
  assert.strictEqual(resAdmin.statusCode, 403);
});

// ============================================================================
// 3. ISSUE REVIEW
// ============================================================================

test('Issue Review: 9. Authorized governance user can review an issue and update status', async () => {
  // Create a fresh issue
  const issue = await issueService.createIssueReport({
    modelId: testModel._id,
    versionId: v2Current._id,
    issueType: 'BIAS',
    severity: 'HIGH',
    title: 'Cohort variance observation',
    description: 'Evaluation drift observed in minority cohort outcomes.',
    user: employee1
  });

  // ML_LEAD reviews issue and marks UNDER_INVESTIGATION
  const { req, res } = createMockReqRes({
    user: mlLeadUser,
    params: { id: issue._id },
    body: {
      status: 'UNDER_INVESTIGATION',
      resolutionNotes: 'Investigation initiated by ML engineering team.'
    }
  });

  await issueCtrl.updateIssueReport(req, res);

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.data.success, true);
  assert.strictEqual(res.data.data.status, 'UNDER_INVESTIGATION');
  assert.strictEqual(res.data.data.resolutionNotes, 'Investigation initiated by ML engineering team.');
});

test('Issue Review: 10. Unauthorized user (Employee) cannot review or modify an issue', async () => {
  const issue = await issueService.createIssueReport({
    modelId: testModel._id,
    versionId: v2Current._id,
    issueType: 'PERFORMANCE',
    severity: 'LOW',
    title: 'Minor timeout during batch job',
    description: 'Timeout observed once during weekend maintenance window.',
    user: employee1
  });

  const middleware = requireRole(['ML_LEAD', 'GOVERNANCE_OFFICER']);
  let nextCalled = false;
  const { req, res } = createMockReqRes({
    user: execApproverUser,
    params: { id: issue._id },
    body: { status: 'RESOLVED' }
  });

  middleware(req, res, () => { nextCalled = true; });

  assert.strictEqual(nextCalled, false);
  assert.strictEqual(res.statusCode, 403);
});

test('Issue Review: 11. Issue can be escalated only by authorized governance actor', async () => {
  const middleware = requireRole(['ML_LEAD', 'GOVERNANCE_OFFICER']);

  // Executive Approver rejected
  let nextExec = false;
  const { req: r1, res: res1 } = createMockReqRes({ user: execApproverUser });
  middleware(r1, res1, () => { nextExec = true; });
  assert.strictEqual(nextExec, false);
  assert.strictEqual(res1.statusCode, 403);

  // Platform Admin rejected (separation of duties)
  let nextAdmin = false;
  const { req: r2, res: res2 } = createMockReqRes({ user: platformAdminUser });
  middleware(r2, res2, () => { nextAdmin = true; });
  assert.strictEqual(nextAdmin, false);
  assert.strictEqual(res2.statusCode, 403);

  // Governance Officer authorized
  let nextGov = false;
  const { req: r3, res: res3 } = createMockReqRes({ user: governanceOfficerUser });
  middleware(r3, res3, () => { nextGov = true; });
  assert.strictEqual(nextGov, true);
});

// ============================================================================
// 4. INCIDENT CREATION & ESCALATION
// ============================================================================

test('Incident: 12. Authorized escalation creates and links an Incident record', async () => {
  const issue = await issueService.createIssueReport({
    modelId: testModel._id,
    versionId: v2Current._id,
    issueType: 'BIAS',
    severity: 'HIGH',
    title: 'Severe demographic parity breach reported in production',
    description: 'Empirical rejection discrepancy confirmed exceeding statutory fairness threshold.',
    user: employee1
  });

  const { req, res } = createMockReqRes({
    user: governanceOfficerUser,
    params: { id: issue._id },
    body: {
      title: 'Formal Governance Incident: Demographic Parity Breach',
      description: 'Escalated following preliminary verification of employee report.'
    }
  });

  await issueCtrl.escalateIssueToIncident(req, res);

  assert.strictEqual(res.statusCode, 201);
  assert.strictEqual(res.data.success, true);

  const { incident, issue: updatedIssue } = res.data.data;
  assert.ok(incident.incidentNumber.startsWith('INC-'));
  assert.strictEqual(incident.type, 'FAIRNESS_VIOLATION');
  assert.strictEqual(String(incident.modelId), String(testModel._id));
  assert.strictEqual(String(incident.versionId), String(v2Current._id));
  assert.strictEqual(String(incident.issueReportRef), String(issue._id));
  assert.strictEqual(incident.status, 'OPEN');
  // Recommends previous genuinely approved version v1.0
  assert.strictEqual(incident.recommendedAction, 'ROLLBACK');
  assert.strictEqual(String(incident.recommendedRollbackVersionId), String(v1Approved._id));
});

test('Incident: 13. Issue remains traceable to the Incident after escalation', async () => {
  const issue = await issueService.createIssueReport({
    modelId: testModel._id,
    versionId: v2Current._id,
    issueType: 'DRIFT',
    severity: 'HIGH',
    title: 'Input feature shift reported by fraud analytics',
    description: 'Significant population shift detected in external transaction signals.',
    user: employee2
  });

  const result = await issueService.escalateIssueToIncident({
    issueId: issue._id,
    user: mlLeadUser
  });

  // Verify bidirectional linkage
  const refreshedIssue = await IssueReport.findById(issue._id);
  const refreshedIncident = await Incident.findById(result.incident._id);

  assert.strictEqual(refreshedIssue.status, 'ESCALATED_TO_INCIDENT');
  assert.strictEqual(String(refreshedIssue.escalatedIncidentId), String(refreshedIncident._id));
  assert.strictEqual(String(refreshedIncident.issueReportRef), String(refreshedIssue._id));
});

test('Incident: 14. Unauthorized user cannot create or escalate incidents', async () => {
  const issue = await issueService.createIssueReport({
    modelId: testModel._id,
    versionId: v2Current._id,
    issueType: 'SAFETY',
    severity: 'MEDIUM',
    title: 'Model returned unexpected safety advisory',
    description: 'Advisory text was ambiguous in edge cases.',
    user: employee1
  });

  const middleware = requireRole(['ML_LEAD', 'GOVERNANCE_OFFICER']);
  let nextCalled = false;
  const { req, res } = createMockReqRes({
    user: execApproverUser,
    params: { id: issue._id }
  });

  middleware(req, res, () => { nextCalled = true; });

  assert.strictEqual(nextCalled, false);
  assert.strictEqual(res.statusCode, 403);
});

// ============================================================================
// 5. ROLLBACK INTEGRATION & GATING
// ============================================================================

test('Rollback: 15. Governance Officer and Executive Approver cannot execute rollback (requireRole rejects with 403)', async () => {
  const middleware = requireRole('ML_LEAD');
  let nextCalled = false;
  const { req, res } = createMockReqRes({ user: governanceOfficerUser });

  middleware(req, res, () => { nextCalled = true; });

  assert.strictEqual(nextCalled, false);
  assert.strictEqual(res.statusCode, 403);

  // Executive Approver performs business risk sign-off, NOT technical rollback operations
  let nextExec = false;
  const { req: reqExec, res: resExec } = createMockReqRes({ user: execApproverUser });
  middleware(reqExec, resExec, () => { nextExec = true; });
  assert.strictEqual(nextExec, false);
  assert.strictEqual(resExec.statusCode, 403);
});

test('Rollback: 16. Unauthorized role (Platform Admin) cannot execute rollback, ML Lead is permitted', async () => {
  const middleware = requireRole('ML_LEAD');

  // Platform Admin
  let nextAdmin = false;
  const { req: r2, res: res2 } = createMockReqRes({ user: platformAdminUser });
  middleware(r2, res2, () => { nextAdmin = true; });
  assert.strictEqual(nextAdmin, false);
  assert.strictEqual(res2.statusCode, 403);

  // ML Lead is permitted
  let nextLead = false;
  const { req: rLead, res: resLead } = createMockReqRes({ user: mlLeadUser });
  middleware(rLead, resLead, () => { nextLead = true; });
  assert.strictEqual(nextLead, true);
});

test('Rollback: 17. Authorized rollback still uses existing governance gates', async () => {
  // Target version that does not belong to model
  const unrelatedModel = await Model.create({
    name: 'Unrelated Model',
    description: 'Separate',
    purpose: 'Fraud',
    owner: 'Other',
    team: 'Other',
    riskLevel: 'MINIMAL'
  });
  const unrelatedVersion = await ModelVersion.create({
    modelId: unrelatedModel._id,
    version: 'v1.0',
    lifecycleStatus: 'APPROVED',
    deploymentStatus: 'IN_PRODUCTION',
    policyStatus: 'PASSED',
    approvalStatus: 'APPROVED'
  });

  await assert.rejects(
    async () => {
      await incidentService.executeRollback({
        modelId: testModel._id,
        targetVersionId: unrelatedVersion._id,
        actor: mlLeadUser.name,
        role: mlLeadUser.role
      });
    },
    (err) => {
      assert.match(err.message, /Target version does not belong to this model/);
      return true;
    }
  );
});

test('Rollback: 18. Failed/unapproved baseline version cannot be used for rollback', async () => {
  // Attempting rollback to v3Failed (policyStatus: 'FAILED', approvalStatus: 'REJECTED')
  await assert.rejects(
    async () => {
      await incidentService.executeRollback({
        modelId: testModel._id,
        targetVersionId: v3Failed._id,
        actor: mlLeadUser.name,
        role: mlLeadUser.role
      });
    },
    (err) => {
      assert.match(err.message, /ROLLBACK GATE BLOCKED/);
      return true;
    }
  );
});

test('Rollback: 19. Valid approved baseline can still be used for rollback by authorized role', async () => {
  // Create an incident linked to an issue
  const issue = await issueService.createIssueReport({
    modelId: testModel._id,
    versionId: v2Current._id,
    issueType: 'SAFETY',
    severity: 'CRITICAL',
    title: 'Severe model safety anomaly',
    description: 'Model producing unsafe credit recommendations.',
    user: employee1
  });

  const { incident } = await issueService.escalateIssueToIncident({
    issueId: issue._id,
    user: mlLeadUser
  });

  // Execute rollback using ML Lead authorization
  const { req, res } = createMockReqRes({
    user: mlLeadUser,
    body: {
      incidentId: incident._id,
      modelId: testModel._id,
      targetVersionId: v1Approved._id,
      rationale: 'ML Lead technical authorization for immediate safety rollback to v1.0'
    }
  });

  await incidentCtrl.rollbackModel(req, res);

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.data.success, true);
  assert.strictEqual(res.data.data.activeVersion, 'v1.0');

  // Verify database state transitions
  const refreshedModel = await Model.findById(testModel._id);
  const refreshedV1 = await ModelVersion.findById(v1Approved._id);
  const refreshedV2 = await ModelVersion.findById(v2Current._id);
  const refreshedIncident = await Incident.findById(incident._id);

  assert.strictEqual(String(refreshedModel.currentProductionVersionId), String(v1Approved._id));
  assert.strictEqual(refreshedV1.lifecycleStatus, 'IN_PRODUCTION');
  assert.strictEqual(refreshedV1.deploymentStatus, 'IN_PRODUCTION');
  assert.strictEqual(refreshedV2.lifecycleStatus, 'DEPRECATED');
  assert.strictEqual(refreshedV2.deploymentStatus, 'ROLLED_BACK');
  assert.strictEqual(refreshedIncident.status, 'MITIGATED');
});

test('Rollback: 20. Issue submission alone cannot trigger rollback or lifecycle changes', async () => {
  // Record current model state
  const beforeModel = await Model.findById(testModel._id);
  const currentProdVersionBefore = String(beforeModel.currentProductionVersionId);

  // Employee submits a CRITICAL issue
  const issue = await issueService.createIssueReport({
    modelId: testModel._id,
    versionId: beforeModel.currentProductionVersionId,
    issueType: 'SAFETY',
    severity: 'CRITICAL',
    title: 'Emergency report: unexpected bias output',
    description: 'Immediate alert: testing automated containment logic.',
    user: employee1
  });

  // Verify that model and version state are completely UNTOUCHED
  const afterModel = await Model.findById(testModel._id);
  assert.strictEqual(String(afterModel.currentProductionVersionId), currentProdVersionBefore);
  assert.strictEqual(afterModel.lifecycleStatus, beforeModel.lifecycleStatus);

  const activeVersion = await ModelVersion.findById(currentProdVersionBefore);
  assert.strictEqual(activeVersion.lifecycleStatus, 'IN_PRODUCTION');
  assert.strictEqual(activeVersion.deploymentStatus, 'IN_PRODUCTION');
});

// ============================================================================
// 6. AUDIT INTEGRATION
// ============================================================================

test('Audit: 21. Issue creation creates an audit event with authenticated actor', async () => {
  const issue = await issueService.createIssueReport({
    modelId: testModel._id,
    versionId: v1Approved._id,
    issueType: 'PERFORMANCE',
    severity: 'LOW',
    title: 'Audit verification report',
    description: 'Verifying cryptographic audit event generation.',
    user: employee2
  });

  const auditEntry = await AuditLedger.findOne({
    action: 'ISSUE_REPORT_CREATED',
    entityId: String(issue._id)
  });

  assert.ok(auditEntry);
  assert.strictEqual(auditEntry.actor, employee2.name);
  assert.strictEqual(auditEntry.role, 'EXECUTIVE_APPROVER');
  assert.strictEqual(auditEntry.entityType, 'IssueReport');
  assert.strictEqual(auditEntry.payload.reportNumber, issue.reportNumber);
});

test('Audit: 22. Issue escalation creates audit events for both issue and incident', async () => {
  const issue = await issueService.createIssueReport({
    modelId: testModel._id,
    versionId: v1Approved._id,
    issueType: 'BIAS',
    severity: 'HIGH',
    title: 'Fairness audit escalation issue',
    description: 'Testing audit chain during issue-to-incident escalation.',
    user: employee1
  });

  const { incident } = await issueService.escalateIssueToIncident({
    issueId: issue._id,
    user: governanceOfficerUser
  });

  // Check escalation audit event
  const issueAudit = await AuditLedger.findOne({
    action: 'ISSUE_ESCALATED_TO_INCIDENT',
    entityId: String(issue._id)
  });
  assert.ok(issueAudit);
  assert.strictEqual(issueAudit.actor, governanceOfficerUser.name);
  assert.strictEqual(issueAudit.role, 'GOVERNANCE_OFFICER');

  // Check incident creation audit event
  const incidentAudit = await AuditLedger.findOne({
    action: 'INCIDENT_CREATED',
    entityId: String(incident._id)
  });
  assert.ok(incidentAudit);
  assert.strictEqual(incidentAudit.actor, governanceOfficerUser.name);
  assert.strictEqual(incidentAudit.role, 'GOVERNANCE_OFFICER');
  assert.strictEqual(incidentAudit.payload.originatingIssueReport, issue.reportNumber);
});

test('Audit: 23. Incident status mutation creates appropriate audit records', async () => {
  const incident = await Incident.findOne().sort({ createdAt: -1 });
  assert.ok(incident);

  const { req, res } = createMockReqRes({
    user: mlLeadUser,
    params: { id: incident._id },
    body: {
      status: 'INVESTIGATING',
      mitigationNotes: 'Root cause analysis in progress by ML team.'
    }
  });

  await incidentCtrl.updateIncidentStatus(req, res);

  assert.strictEqual(res.statusCode, 200);

  const auditEntry = await AuditLedger.findOne({
    action: 'INCIDENT_STATUS_UPDATED',
    entityId: String(incident._id)
  }).sort({ sequenceNumber: -1 });

  assert.ok(auditEntry);
  assert.strictEqual(auditEntry.actor, mlLeadUser.name);
  assert.strictEqual(auditEntry.role, 'ML_LEAD');
  assert.strictEqual(auditEntry.payload.newStatus, 'INVESTIGATING');
});

test('Audit: 24. Rollback creates signed ROLLBACK_STARTED and ROLLBACK_COMPLETED audit records', async () => {
  const startAudit = await AuditLedger.findOne({
    action: 'ROLLBACK_STARTED',
    entityId: String(testModel._id)
  });
  const completeAudit = await AuditLedger.findOne({
    action: 'ROLLBACK_COMPLETED',
    entityId: String(testModel._id)
  });

  assert.ok(startAudit);
  assert.ok(completeAudit);
  assert.strictEqual(startAudit.role, 'ML_LEAD');
  assert.strictEqual(completeAudit.role, 'ML_LEAD');
});

test('Audit: 25. Complete SHA-256 cryptographic chain integrity verifies successfully', async () => {
  const integrity = await verifyAuditChainIntegrity();

  assert.strictEqual(integrity.valid, true);
  assert.ok(integrity.totalBlocks > 0);
  assert.strictEqual(integrity.brokenAtSequence, null);
});
