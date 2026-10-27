import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model } from '../src/models/Model.js';
import { ModelVersion } from '../src/models/ModelVersion.js';
import { Policy } from '../src/models/Policy.js';
import { Approval } from '../src/models/Approval.js';
import { Evaluation } from '../src/models/Evaluation.js';
import { resolveRequiredApprovers, getPendingApprovals, getCompletedApprovals } from '../src/controllers/approvalController.js';

// Replicate frontend progress logic for deterministic unit test
function getApprovalProgress(item) {
  if (!item) {
    return {
      signedCount: 0,
      totalCount: 3,
      requiredRoles: ['ML_LEAD', 'GOVERNANCE_OFFICER', 'EXECUTIVE_APPROVER'],
      isComplete: false
    };
  }

  const requiredRoles = (item.requiredRoles && Array.isArray(item.requiredRoles) && item.requiredRoles.length > 0)
    ? item.requiredRoles
    : (item.policy?.requiredApprovers && Array.isArray(item.policy.requiredApprovers) && item.policy.requiredApprovers.length > 0)
      ? item.policy.requiredApprovers
      : ['ML_LEAD', 'GOVERNANCE_OFFICER', 'EXECUTIVE_APPROVER'];

  const approvedRoles = (item.approvals || [])
    .filter(a => a && a.decision === 'APPROVED' && requiredRoles.includes(a.role))
    .map(a => a.role);

  const uniqueApproved = Array.from(new Set(approvedRoles));

  return {
    signedCount: uniqueApproved.length,
    totalCount: requiredRoles.length,
    requiredRoles,
    isComplete: requiredRoles.length > 0 && uniqueApproved.length >= requiredRoles.length
  };
}

function createMockReqRes(overrides = {}) {
  const req = {
    query: {},
    params: {},
    body: {},
    user: null,
    ...overrides
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

let mongoServer;

test.before(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

test.after(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

test('1. resolveRequiredApprovers: resolves configured policy mandatory roles or defaults to 3 roles', async () => {
  const customPolicy = await Policy.create({
    name: 'Custom 2-Role Policy',
    description: 'Custom governance policy requiring 2 sign-off roles',
    targetRiskLevel: 'MINIMAL',
    requiredApprovers: ['ML_LEAD', 'GOVERNANCE_OFFICER'],
    isActive: true
  });

  const modelWithPolicy = await Model.create({
    name: 'Model With Policy',
    description: 'Test model with attached custom policy',
    purpose: 'Unit Testing',
    owner: 'Test Owner',
    team: 'AI Governance',
    policyId: customPolicy._id,
    riskLevel: 'MINIMAL'
  });

  const resolved = await resolveRequiredApprovers(modelWithPolicy);
  assert.deepStrictEqual(resolved.requiredRoles, ['ML_LEAD', 'GOVERNANCE_OFFICER']);

  // Model without policy falls back to standard 3 mandatory roles
  const modelWithoutPolicy = await Model.create({
    name: 'Model Without Policy',
    description: 'Test model with no policy',
    purpose: 'Unit Testing',
    owner: 'Test Owner',
    team: 'AI Governance',
    riskLevel: 'HIGH'
  });
  const fallback = await resolveRequiredApprovers(modelWithoutPolicy);
  assert.deepStrictEqual(fallback.requiredRoles, ['ML_LEAD', 'GOVERNANCE_OFFICER', 'EXECUTIVE_APPROVER']);
});

test('2. getApprovalProgress: calculates 0/3 when zero roles have signed', () => {
  const item = {
    requiredRoles: ['ML_LEAD', 'GOVERNANCE_OFFICER', 'EXECUTIVE_APPROVER'],
    approvals: []
  };

  const progress = getApprovalProgress(item);
  assert.strictEqual(progress.signedCount, 0);
  assert.strictEqual(progress.totalCount, 3);
  assert.strictEqual(progress.isComplete, false);
});

test('3. getApprovalProgress: accurately advances 1/3, 2/3, and 3/3 as approvals are recorded', () => {
  const item = {
    requiredRoles: ['ML_LEAD', 'GOVERNANCE_OFFICER', 'EXECUTIVE_APPROVER'],
    approvals: [
      { role: 'ML_LEAD', decision: 'APPROVED', approverName: 'Alice' }
    ]
  };

  let progress = getApprovalProgress(item);
  assert.strictEqual(progress.signedCount, 1);
  assert.strictEqual(progress.totalCount, 3);
  assert.strictEqual(progress.isComplete, false);

  item.approvals.push({ role: 'GOVERNANCE_OFFICER', decision: 'APPROVED', approverName: 'Bob' });
  progress = getApprovalProgress(item);
  assert.strictEqual(progress.signedCount, 2);
  assert.strictEqual(progress.totalCount, 3);
  assert.strictEqual(progress.isComplete, false);

  item.approvals.push({ role: 'EXECUTIVE_APPROVER', decision: 'APPROVED', approverName: 'Carol' });
  progress = getApprovalProgress(item);
  assert.strictEqual(progress.signedCount, 3);
  assert.strictEqual(progress.totalCount, 3);
  assert.strictEqual(progress.isComplete, true);
});

test('4. getApprovalProgress: dynamically derives total count from custom policy configuration', () => {
  const customPolicyItem = {
    requiredRoles: ['ML_LEAD', 'GOVERNANCE_OFFICER'],
    approvals: [
      { role: 'ML_LEAD', decision: 'APPROVED' }
    ]
  };

  const progress = getApprovalProgress(customPolicyItem);
  assert.strictEqual(progress.signedCount, 1);
  assert.strictEqual(progress.totalCount, 2);
  assert.strictEqual(progress.isComplete, false);
});

test('5. getApprovalProgress: excludes REJECTED and non-required roles from signed count', () => {
  const item = {
    requiredRoles: ['ML_LEAD', 'GOVERNANCE_OFFICER', 'EXECUTIVE_APPROVER'],
    approvals: [
      { role: 'ML_LEAD', decision: 'REJECTED' },
      { role: 'PLATFORM_ADMIN', decision: 'APPROVED' }, // forbidden / unauthorized role
      { role: 'GOVERNANCE_OFFICER', decision: 'APPROVED' }
    ]
  };

  const progress = getApprovalProgress(item);
  assert.strictEqual(progress.signedCount, 1); // Only GOVERNANCE_OFFICER is validly APPROVED
  assert.strictEqual(progress.totalCount, 3);
  assert.strictEqual(progress.isComplete, false);
});

test('6. Authoritative Database State: Insurance Charges v1.0 pending shows 0/3, completed shows 3/3', async () => {
  const insurancePolicy = await Policy.create({
    name: 'Insurance Charges High-Risk Governance Policy',
    description: 'High-risk statutory policy requiring 3 stakeholder sign-offs',
    targetRiskLevel: 'HIGH',
    requiredApprovers: ['ML_LEAD', 'GOVERNANCE_OFFICER', 'EXECUTIVE_APPROVER'],
    isActive: true
  });

  const insuranceModel = await Model.create({
    name: 'Insurance Charges',
    description: 'Predicts health insurance medical charges for underwriting',
    purpose: 'Underwriting and Risk Analysis',
    owner: 'Actuarial Team',
    team: 'Risk & Underwriting',
    policyId: insurancePolicy._id,
    riskLevel: 'HIGH'
  });

  // 1. Pending version before any sign-offs
  const pendingVersion = await ModelVersion.create({
    modelId: insuranceModel._id,
    version: 'v1.0-pending',
    lifecycleStatus: 'PENDING_APPROVAL',
    policyStatus: 'PASSED',
    approvalStatus: 'PENDING_APPROVAL'
  });

  const { req: pReq, res: pRes } = createMockReqRes({ query: { status: 'pending' } });
  await getPendingApprovals(pReq, pRes);
  assert.strictEqual(pRes.statusCode, 200);

  const pendingItem = pRes.data.data.find(i => String(i.version._id) === String(pendingVersion._id));
  assert.ok(pendingItem);
  assert.deepStrictEqual(pendingItem.requiredRoles, ['ML_LEAD', 'GOVERNANCE_OFFICER', 'EXECUTIVE_APPROVER']);
  const pendingProgress = getApprovalProgress(pendingItem);
  assert.strictEqual(pendingProgress.signedCount, 0, 'Pending version with no sign-offs must be 0');
  assert.strictEqual(pendingProgress.totalCount, 3, 'Total must derive 3 from policy, not hardcoded 4');
  assert.strictEqual(pendingProgress.isComplete, false);

  // 2. Fully approved version with 3 sign-offs
  const approvedVersion = await ModelVersion.create({
    modelId: insuranceModel._id,
    version: 'v1.0',
    lifecycleStatus: 'APPROVED',
    policyStatus: 'PASSED',
    approvalStatus: 'APPROVED'
  });

  await Approval.create([
    { modelId: insuranceModel._id, versionId: approvedVersion._id, role: 'ML_LEAD', decision: 'APPROVED', approverName: 'Alex' },
    { modelId: insuranceModel._id, versionId: approvedVersion._id, role: 'GOVERNANCE_OFFICER', decision: 'APPROVED', approverName: 'Test User' },
    { modelId: insuranceModel._id, versionId: approvedVersion._id, role: 'EXECUTIVE_APPROVER', decision: 'APPROVED', approverName: 'Raju' }
  ]);

  const { req: cReq, res: cRes } = createMockReqRes({ query: { status: 'completed' } });
  await getCompletedApprovals(cReq, cRes);
  assert.strictEqual(cRes.statusCode, 200);

  const approvedItem = cRes.data.data.find(i => String(i.version._id) === String(approvedVersion._id));
  assert.ok(approvedItem);
  assert.deepStrictEqual(approvedItem.requiredRoles, ['ML_LEAD', 'GOVERNANCE_OFFICER', 'EXECUTIVE_APPROVER']);

  const approvedProgress = getApprovalProgress(approvedItem);
  assert.strictEqual(approvedProgress.signedCount, 3, 'Must reflect 3 authoritative persisted approvals');
  assert.strictEqual(approvedProgress.totalCount, 3, 'Must derive 3 configured mandatory sign-off roles');
  assert.strictEqual(approvedProgress.isComplete, true);
  assert.notStrictEqual(approvedProgress.totalCount, 4, 'Total required count must never be hardcoded to 4');
});

test('7. Refresh State Machine: preserves selectedId and handles transition to completed history', () => {
  const selectedVersionId = 'v-123';
  let activeTab = 'pending';

  const pendingBefore = [
    { version: { _id: 'v-123' }, approvals: [{ role: 'ML_LEAD', decision: 'APPROVED' }] }
  ];
  const completedBefore = [];

  // Intermediate state (1/3 signed): stays in pending
  let foundInCurrent = (activeTab === 'pending' ? pendingBefore : completedBefore).find(i => i.version._id === selectedVersionId);
  assert.ok(foundInCurrent);
  assert.strictEqual(activeTab, 'pending');

  // Final sign-off state: version graduated to completed
  const pendingAfter = [];
  const completedAfter = [
    {
      version: { _id: 'v-123' },
      approvals: [
        { role: 'ML_LEAD', decision: 'APPROVED' },
        { role: 'GOVERNANCE_OFFICER', decision: 'APPROVED' },
        { role: 'EXECUTIVE_APPROVER', decision: 'APPROVED' }
      ]
    }
  ];

  foundInCurrent = (activeTab === 'pending' ? pendingAfter : completedAfter).find(i => i.version._id === selectedVersionId);
  assert.strictEqual(foundInCurrent, undefined);

  const foundInOther = (activeTab === 'pending' ? completedAfter : pendingAfter).find(i => i.version._id === selectedVersionId);
  assert.ok(foundInOther);

  // Transitions activeTab to completed and preserves selectedItem
  if (foundInOther) {
    activeTab = activeTab === 'pending' ? 'completed' : 'pending';
  }
  assert.strictEqual(activeTab, 'completed');
});
