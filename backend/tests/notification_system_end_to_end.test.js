import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { User } from '../src/models/User.js';
import { Model } from '../src/models/Model.js';
import { ModelVersion } from '../src/models/ModelVersion.js';
import { Notification } from '../src/models/Notification.js';
import { Incident } from '../src/models/Incident.js';
import { Approval } from '../src/models/Approval.js';
import { IssueReport } from '../src/models/IssueReport.js';
import { Policy } from '../src/models/Policy.js';

import * as incidentCtrl from '../src/controllers/incidentController.js';
import * as approvalCtrl from '../src/controllers/approvalController.js';
import * as modelCtrl from '../src/controllers/modelController.js';
import * as adminCtrl from '../src/controllers/adminController.js';
import {
  dispatchNotification,
  getUserNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  sanitizeTargetUrl
} from '../src/services/notificationService.js';
import { executeRollback } from '../src/services/incidentService.js';
import { escalateIssueToIncident } from '../src/services/issueService.js';
import { transitionVersionLifecycle } from '../src/services/lifecycleService.js';

let mongoServer;

let adminUser;
let mlLeadUser1;
let mlLeadUser2;
let govOfficerUser;
let execApproverUser;
let suspendedUser;

let testModel;
let testVersion1;
let testVersion2;

function createMockReqRes({ user = null, body = {}, params = {}, query = {}, headers = {} }) {
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
  await mongoose.connect(mongoServer.getUri());

  // Setup Users across roles
  adminUser = await User.create({
    name: 'Platform Administrator',
    email: 'admin@sentinel.internal',
    role: 'PLATFORM_ADMIN',
    status: 'ACTIVE',
    verificationStatus: 'VERIFIED'
  });

  mlLeadUser1 = await User.create({
    name: 'ML Lead Alpha',
    email: 'ml_lead1@sentinel.internal',
    role: 'ML_LEAD',
    status: 'ACTIVE',
    verificationStatus: 'VERIFIED'
  });

  mlLeadUser2 = await User.create({
    name: 'ML Lead Beta',
    email: 'ml_lead2@sentinel.internal',
    role: 'ML_LEAD',
    status: 'ACTIVE',
    verificationStatus: 'VERIFIED'
  });

  govOfficerUser = await User.create({
    name: 'Governance Officer Primary',
    email: 'gov_officer@sentinel.internal',
    role: 'GOVERNANCE_OFFICER',
    status: 'ACTIVE',
    verificationStatus: 'VERIFIED'
  });

  execApproverUser = await User.create({
    name: 'Executive Approver Chief',
    email: 'exec_approver@sentinel.internal',
    role: 'EXECUTIVE_APPROVER',
    status: 'ACTIVE',
    verificationStatus: 'VERIFIED'
  });

  suspendedUser = await User.create({
    name: 'Suspended Operator',
    email: 'suspended@sentinel.internal',
    role: 'ML_LEAD',
    status: 'SUSPENDED',
    verificationStatus: 'VERIFIED'
  });

  // Setup Governance Policy
  const policy = await Policy.create({
    name: 'Tier-1 High Risk Gate',
    description: 'Mandatory high risk EU AI Act compliance gate',
    framework: 'EU_AI_ACT',
    targetRiskLevel: 'HIGH',
    isActive: true,
    requiredApprovers: ['ML_LEAD', 'GOVERNANCE_OFFICER', 'EXECUTIVE_APPROVER'],
    minimumPassingScore: 80
  });

  // Setup Model & Versions
  testModel = await Model.create({
    name: 'NotificationTestModel',
    description: 'Testing End to End Notification Delivery',
    purpose: 'Notification Verification',
    owner: 'ML Lead Alpha',
    team: 'Risk AI',
    modelType: 'CLASSIFICATION',
    riskLevel: 'HIGH',
    policyId: policy._id,
    lifecycleStatus: 'DRAFT',
    createdBy: mlLeadUser1._id
  });

  testVersion1 = await ModelVersion.create({
    modelId: testModel._id,
    version: 'v1.0',
    changelog: 'Baseline version',
    lifecycleStatus: 'APPROVED',
    policyStatus: 'PASSED',
    approvalStatus: 'APPROVED',
    deploymentStatus: 'IN_PRODUCTION',
    createdBy: mlLeadUser1._id
  });

  testModel.currentProductionVersionId = testVersion1._id;
  testModel.lifecycleStatus = 'IN_PRODUCTION';
  await testModel.save();

  testVersion2 = await ModelVersion.create({
    modelId: testModel._id,
    version: 'v2.0',
    changelog: 'Candidate candidate version',
    lifecycleStatus: 'EVALUATION',
    policyStatus: 'PASSED',
    approvalStatus: 'PENDING_APPROVAL',
    createdBy: mlLeadUser1._id
  });
});

test.after(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

// ─────────────────────────────────────────────────────────────────────────────
// END-TO-END NOTIFICATION SYSTEM TESTS (15 REQUIRED SCENARIOS)
// ─────────────────────────────────────────────────────────────────────────────

test('1. Unauthenticated notification listing is rejected with 401', async () => {
  const { req, res } = createMockReqRes({ user: null });
  await incidentCtrl.getNotifications(req, res);

  assert.equal(res.statusCode, 401);
  assert.equal(res.data.success, false);
});

test('2. Query-string role spoofing cannot access another role notifications', async () => {
  // Create notification specifically for GOVERNANCE_OFFICER
  await dispatchNotification({
    recipientRole: 'GOVERNANCE_OFFICER',
    title: 'Secret Governance Alert',
    message: 'Restricted governance content',
    type: 'POLICY_GATE',
    actor: 'System'
  });

  // mlLeadUser1 tries to query notifications with ?role=GOVERNANCE_OFFICER
  const { req, res } = createMockReqRes({
    user: mlLeadUser1,
    query: { role: 'GOVERNANCE_OFFICER' }
  });

  await incidentCtrl.getNotifications(req, res);
  assert.equal(res.statusCode, 200);

  // Assert ML Lead does NOT receive the Governance Officer notification
  const receivedTitles = res.data.data.map(n => n.title);
  assert.ok(!receivedTitles.includes('Secret Governance Alert'));
});

test('3. A user cannot mark another user notification as read (403 Forbidden)', async () => {
  // Create a notification specifically for ML Lead 1
  const [lead1Notif] = await dispatchNotification({
    recipientUserId: mlLeadUser1._id,
    title: 'Personal Notification for Lead 1',
    message: 'Only Lead 1 can see and modify this',
    type: 'SYSTEM',
    actor: 'System'
  });

  // ML Lead 2 tries to mark ML Lead 1's notification as read
  const { req, res } = createMockReqRes({
    user: mlLeadUser2,
    params: { id: lead1Notif._id.toString() }
  });

  await incidentCtrl.markNotificationRead(req, res);

  assert.equal(res.statusCode, 403);
  assert.equal(res.data.success, false);
  assert.ok(res.data.error.includes('Forbidden') || res.data.error.includes('another user'));

  // Verify notification remains unread
  const refreshed = await Notification.findById(lead1Notif._id);
  assert.equal(refreshed.read, false);
});

test('4. Two users sharing a role have independent per-user read states', async () => {
  // Dispatch role notification to ML_LEAD (both mlLeadUser1 and mlLeadUser2 are active ML_LEAD)
  const notifs = await dispatchNotification({
    recipientRole: 'ML_LEAD',
    title: 'Role Broadcast Alert',
    message: 'Testing independent per-user read states',
    type: 'SYSTEM',
    idempotencyKey: 'test_independent_reads',
    actor: 'System'
  });

  assert.equal(notifs.length, 2);
  const notifLead1 = notifs.find(n => n.userId.toString() === mlLeadUser1._id.toString());
  const notifLead2 = notifs.find(n => n.userId.toString() === mlLeadUser2._id.toString());

  assert.ok(notifLead1);
  assert.ok(notifLead2);
  assert.equal(notifLead1.read, false);
  assert.equal(notifLead2.read, false);

  // ML Lead 1 marks their notification as read
  await markNotificationAsRead(notifLead1._id, mlLeadUser1);

  // Verify ML Lead 1's copy is read, but ML Lead 2's copy remains UNREAD
  const updatedLead1 = await Notification.findById(notifLead1._id);
  const updatedLead2 = await Notification.findById(notifLead2._id);

  assert.equal(updatedLead1.read, true);
  assert.equal(updatedLead2.read, false);
});

test('5. A new model registration event reaches the correct eligible ML Leads', async () => {
  const { req, res } = createMockReqRes({
    user: mlLeadUser1,
    body: {
      name: 'CreditScoringNewModel',
      description: 'New scoring model',
      purpose: 'Credit Risk',
      team: 'Risk',
      modelType: 'CLASSIFICATION',
      riskLevel: 'HIGH'
    }
  });

  await modelCtrl.createModel(req, res);
  assert.equal(res.statusCode, 201);

  // Since mlLeadUser1 was the creator, mlLeadUser2 should receive the notification (creator excluded)
  const lead2Notifs = await getUserNotifications(mlLeadUser2);
  const found = lead2Notifs.notifications.find(n => n.title.includes('Model registered: CreditScoringNewModel'));

  assert.ok(found);
  assert.equal(found.type, 'MODEL_REGISTERED');
  assert.ok(found.targetUrl.startsWith('/app/models/'));
});

test('6. ML Lead approval triggers the next Governance Officer review notification', async () => {
  const { req, res } = createMockReqRes({
    user: mlLeadUser1,
    params: { versionId: testVersion2._id.toString() },
    body: { decision: 'APPROVED', comment: 'Technical sign-off approved' }
  });

  await approvalCtrl.submitApprovalDecision(req, res);
  assert.equal(res.statusCode, 200);

  // Check Governance Officer notifications
  const govNotifs = await getUserNotifications(govOfficerUser);
  const govReviewNotif = govNotifs.notifications.find(n => n.title === 'Governance review requested');

  assert.ok(govReviewNotif);
  assert.ok(govReviewNotif.message.includes('ML Lead approved'));
  assert.equal(govReviewNotif.targetUrl, '/app/approvals');
});

test('7. Executive approval is only requested after technical and governance prerequisites are satisfied', async () => {
  // Before Governance Officer signs off, Executive Approver must NOT have received a sign-off request
  let execNotifs = await getUserNotifications(execApproverUser);
  let execNotif = execNotifs.notifications.find(n => n.title === 'Executive sign-off required' && n.versionId?.toString() === testVersion2._id.toString());
  assert.equal(execNotif, undefined);

  // Now Governance Officer approves
  const { req, res } = createMockReqRes({
    user: govOfficerUser,
    params: { versionId: testVersion2._id.toString() },
    body: { decision: 'APPROVED', comment: 'Governance compliance verified' }
  });

  await approvalCtrl.submitApprovalDecision(req, res);
  assert.equal(res.statusCode, 200);

  // Now Executive Approver MUST receive the sign-off notification
  execNotifs = await getUserNotifications(execApproverUser);
  execNotif = execNotifs.notifications.find(n => n.title === 'Executive sign-off required' && n.versionId?.toString() === testVersion2._id.toString());

  assert.ok(execNotif);
  assert.ok(execNotif.message.includes('prerequisite sign-offs are complete'));
  assert.equal(execNotif.targetUrl, '/app/approvals');
});

test('8. Final approval and rejection reach the appropriate stakeholders', async () => {
  // Part A: Final Approval when Executive Approver signs off
  const { req, res } = createMockReqRes({
    user: execApproverUser,
    params: { versionId: testVersion2._id.toString() },
    body: { decision: 'APPROVED', comment: 'Executive authorization granted' }
  });

  await approvalCtrl.submitApprovalDecision(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.data.data.isFullyApproved, true);

  const leadNotifs = await getUserNotifications(mlLeadUser1);
  const approvedNotif = leadNotifs.notifications.find(n => n.title.includes('Model approved for production'));
  assert.ok(approvedNotif);

  // Part B: Rejection Notification
  const rejectedVersion = await ModelVersion.create({
    modelId: testModel._id,
    version: 'v2.1',
    lifecycleStatus: 'EVALUATION',
    policyStatus: 'PASSED',
    approvalStatus: 'PENDING_APPROVAL',
    createdBy: mlLeadUser1._id
  });

  const { req: rejReq, res: rejRes } = createMockReqRes({
    user: govOfficerUser,
    params: { versionId: rejectedVersion._id.toString() },
    body: { decision: 'REJECTED', comment: 'Disparate impact exceeds statutory limit' }
  });

  await approvalCtrl.submitApprovalDecision(rejReq, rejRes);
  assert.equal(rejRes.statusCode, 200);

  const leadAfterRej = await getUserNotifications(mlLeadUser1);
  const rejNotif = leadAfterRej.notifications.find(n => n.title.includes('Approval rejected') && n.versionId?.toString() === rejectedVersion._id.toString());
  assert.ok(rejNotif);
  assert.ok(rejNotif.message.includes('rejected'));
  assert.ok(rejNotif.message.includes('Disparate impact'));
});

test('9. Drift detection sends notifications and repeated scheduler runs do not duplicate alerts', async () => {
  const incidentNumber = 'INC-TEST-999';

  // Run 1: Create drift incident notifications
  const notifsRun1 = await dispatchNotification({
    recipientRole: 'ML_LEAD',
    title: `[Action Required] Drift Incident ${incidentNumber} Detected`,
    message: 'Statistical drift detected on AMT_INCOME_TOTAL',
    type: 'DRIFT_INCIDENT',
    severity: 'CRITICAL',
    targetUrl: '/app/incidents',
    idempotencyKey: `drift_incident_ml_${incidentNumber}`,
    actor: 'Automated Runtime Drift Detector'
  });

  assert.ok(notifsRun1.length > 0);
  const countAfterRun1 = await Notification.countDocuments({ idempotencyKey: `drift_incident_ml_${incidentNumber}_${mlLeadUser1._id}` });
  assert.equal(countAfterRun1, 1);

  // Run 2: Repeated scheduler execution with identical idempotencyKey
  const notifsRun2 = await dispatchNotification({
    recipientRole: 'ML_LEAD',
    title: `[Action Required] Drift Incident ${incidentNumber} Detected`,
    message: 'Statistical drift detected on AMT_INCOME_TOTAL',
    type: 'DRIFT_INCIDENT',
    severity: 'CRITICAL',
    targetUrl: '/app/incidents',
    idempotencyKey: `drift_incident_ml_${incidentNumber}`,
    actor: 'Automated Runtime Drift Detector'
  });

  // Verify total count did NOT increase
  const countAfterRun2 = await Notification.countDocuments({ idempotencyKey: `drift_incident_ml_${incidentNumber}_${mlLeadUser1._id}` });
  assert.equal(countAfterRun2, 1);
});

test('10. Successful rollback produces expected notifications without altering rollback behavior', async () => {
  const rollbackResult = await executeRollback({
    modelId: testModel._id,
    targetVersionId: testVersion1._id,
    actor: 'ML Lead Alpha',
    role: 'ML_LEAD',
    rationale: 'Remediating drift incident via rollback'
  });

  assert.equal(rollbackResult.success, true);
  assert.equal(rollbackResult.activeVersion, 'v1.0');

  // Verify notifications delivered to ML Lead and Governance Officer
  const govNotifs = await getUserNotifications(govOfficerUser);
  const rollbackNotif = govNotifs.notifications.find(n => n.type === 'ROLLBACK_TRIGGERED');

  assert.ok(rollbackNotif);
  assert.ok(rollbackNotif.title.includes('Emergency rollback executed'));
  assert.equal(rollbackNotif.severity, 'CRITICAL');
  assert.equal(rollbackNotif.targetUrl, '/app/incidents');
});

test('11. Account administration events reach the correct recipients', async () => {
  // Test 11.1 Verify User -> notifies target user
  const unverifiedUser = await User.create({
    name: 'Pending Analyst',
    email: 'analyst@sentinel.internal',
    role: 'GOVERNANCE_OFFICER',
    status: 'ACTIVE',
    verificationStatus: 'PENDING'
  });

  const { req: vReq, res: vRes } = createMockReqRes({
    user: adminUser,
    params: { id: unverifiedUser._id.toString() }
  });
  await adminCtrl.verifyUser(vReq, vRes);
  assert.equal(vRes.statusCode, 200);

  const analystNotifs = await getUserNotifications(unverifiedUser);
  const verifyNotif = analystNotifs.notifications.find(n => n.title === 'Account verified');
  assert.ok(verifyNotif);

  // Test 11.2 Update Role -> notifies target user
  const { req: rReq, res: rRes } = createMockReqRes({
    user: adminUser,
    params: { id: unverifiedUser._id.toString() },
    body: { role: 'EXECUTIVE_APPROVER' }
  });
  await adminCtrl.updateUserRole(rReq, rRes);
  assert.equal(rRes.statusCode, 200);

  const updatedAnalyst = await User.findById(unverifiedUser._id);
  const analystAfterRole = await getUserNotifications(updatedAnalyst);
  const roleNotif = analystAfterRole.notifications.find(n => n.title === 'Governance role updated');
  assert.ok(roleNotif);
  assert.ok(roleNotif.message.includes('EXECUTIVE_APPROVER'));
});

test('12. Inactive or suspended accounts are excluded from recipient delivery', async () => {
  // Try to dispatch directly to suspended user
  const notifs = await dispatchNotification({
    recipientUserId: suspendedUser._id,
    title: 'Suspended User Test',
    message: 'This should not be delivered',
    actor: 'System'
  });

  assert.equal(notifs.length, 0);

  // When broadcasting to ML_LEAD role, suspendedUser must NOT receive it
  const broadcastNotifs = await dispatchNotification({
    recipientRole: 'ML_LEAD',
    title: 'Broadcast Without Suspended',
    message: 'Checking exclusion of suspended users',
    actor: 'System'
  });

  const suspendedReceived = broadcastNotifs.some(n => n.userId.toString() === suspendedUser._id.toString());
  assert.equal(suspendedReceived, false);
});

test('13. Mark-all-as-read affects only the authenticated user notifications', async () => {
  // Create 2 unread notifications for ML Lead 1 and 2 for ML Lead 2
  await dispatchNotification({ recipientUserId: mlLeadUser1._id, title: 'Lead 1 - Alert A', message: 'msg', actor: 'System' });
  await dispatchNotification({ recipientUserId: mlLeadUser1._id, title: 'Lead 1 - Alert B', message: 'msg', actor: 'System' });
  await dispatchNotification({ recipientUserId: mlLeadUser2._id, title: 'Lead 2 - Alert C', message: 'msg', actor: 'System' });
  await dispatchNotification({ recipientUserId: mlLeadUser2._id, title: 'Lead 2 - Alert D', message: 'msg', actor: 'System' });

  // ML Lead 1 marks all as read
  const { req, res } = createMockReqRes({ user: mlLeadUser1 });
  await incidentCtrl.markAllNotificationsRead(req, res);
  assert.equal(res.statusCode, 200);

  // Verify ML Lead 1 has 0 unread
  const lead1Status = await getUserNotifications(mlLeadUser1, { filter: 'unread' });
  assert.equal(lead1Status.unreadCount, 0);

  // Verify ML Lead 2 STILL has unread notifications
  const lead2Status = await getUserNotifications(mlLeadUser2, { filter: 'unread' });
  assert.ok(lead2Status.unreadCount >= 2);
});

test('14. Invalid or external notification destinations cannot cause unsafe navigation', async () => {
  const dangerousUrls = [
    'https://malicious-attacker.com/steal-creds',
    'http://localhost:8080/exploit',
    '//evil.com/phish',
    'javascript:alert(1)',
    'data:text/html,<script>evil()</script>'
  ];

  for (const dangerous of dangerousUrls) {
    const sanitized = sanitizeTargetUrl(dangerous);
    assert.equal(sanitized, '/app', `Should neutralize dangerous URL: ${dangerous}`);
  }

  // Valid internal routes are preserved
  assert.equal(sanitizeTargetUrl('/app/models/123'), '/app/models/123');
  assert.equal(sanitizeTargetUrl('/admin/users'), '/admin/users');
  assert.equal(sanitizeTargetUrl('app/incidents'), '/app/incidents');
});

test('15. Existing legacy notification records remain readable after schema updates', async () => {
  // Create a legacy notification with userId = null and recipientRole = 'GOVERNANCE_OFFICER'
  const legacyDoc = await Notification.create({
    userId: null,
    recipientRole: 'GOVERNANCE_OFFICER',
    title: 'Legacy Model Incident Alert',
    message: 'Created before per-user schema enhancement',
    type: 'DRIFT_INCIDENT',
    severity: 'WARNING',
    read: false
  });

  assert.ok(legacyDoc._id);

  // Governance officer should see legacy notifications matching their role
  const govNotifs = await getUserNotifications(govOfficerUser);
  const foundLegacy = govNotifs.notifications.find(n => n._id.toString() === legacyDoc._id.toString());

  assert.ok(foundLegacy);
  assert.equal(foundLegacy.title, 'Legacy Model Incident Alert');

  // Governance officer can read and mark legacy notification as read
  await markNotificationAsRead(legacyDoc._id, govOfficerUser);
  const refreshed = await Notification.findById(legacyDoc._id);
  assert.equal(refreshed.read, true);
});
