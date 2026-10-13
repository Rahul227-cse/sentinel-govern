import test from 'node:test';
import assert from 'node:assert';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { User } from '../src/models/User.js';
import { Policy } from '../src/models/Policy.js';
import { Model } from '../src/models/Model.js';
import { ModelVersion } from '../src/models/ModelVersion.js';
import { Approval } from '../src/models/Approval.js';
import { Incident } from '../src/models/Incident.js';
import { getDashboardStats } from '../src/controllers/dashboardController.js';

let mongoServer;
let mlLeadUser;
let govUser;
let execUser;
let adminUser;

test.before(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  mlLeadUser = await User.create({
    name: 'Lead ML Engineer',
    email: 'ml.lead@enterprise.ai',
    role: 'ML_LEAD',
    status: 'ACTIVE',
    verificationStatus: 'VERIFIED'
  });

  govUser = await User.create({
    name: 'Chief Governance Officer',
    email: 'gov.officer@enterprise.ai',
    role: 'GOVERNANCE_OFFICER',
    status: 'ACTIVE',
    verificationStatus: 'VERIFIED'
  });

  execUser = await User.create({
    name: 'Executive Approver',
    email: 'exec.approver@enterprise.ai',
    role: 'EXECUTIVE_APPROVER',
    status: 'ACTIVE',
    verificationStatus: 'VERIFIED'
  });

  adminUser = await User.create({
    name: 'Platform Administrator',
    email: 'admin@enterprise.ai',
    role: 'PLATFORM_ADMIN',
    status: 'ACTIVE',
    verificationStatus: 'VERIFIED'
  });
});

test.after(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

test('1. Clean/empty database returns all 0 counts and empty queues', async () => {
  const req = { user: mlLeadUser };
  let jsonResult = null;
  const res = {
    json: (payload) => {
      jsonResult = payload;
      return payload;
    },
    status: () => res
  };

  await getDashboardStats(req, res);

  assert.strictEqual(jsonResult.success, true);
  const data = jsonResult.data;

  assert.strictEqual(data.totalModels, 0);
  assert.strictEqual(data.productionModels, 0);
  assert.strictEqual(data.modelsInGovernance, 0);
  assert.strictEqual(data.pendingApprovals, 0);
  assert.strictEqual(data.policyViolations, 0);
  assert.strictEqual(data.openIncidents, 0);
  assert.strictEqual(data.driftAlerts, 0);
  assert.strictEqual(data.totalPolicies, 0);
  assert.strictEqual(data.activePolicies, 0);
  assert.strictEqual(data.modelsWithoutPolicyCount, 0);

  // Queues should be completely empty
  assert.strictEqual(data.mlLead.myModels.length, 0);
  assert.strictEqual(data.ethics.reviewQueue.length, 0);
  assert.strictEqual(data.compliance.reviewQueue.length, 0);
  assert.strictEqual(data.executive.decisionsQueue.length, 0);
  assert.strictEqual(data.recentAudit.length, 0);
});

test('2. Populated real model without policy is flagged on compliance dashboard', async () => {
  // Create a genuine model without a policy
  const realModel = await Model.create({
    name: 'Sentinel Fraud Detection AI',
    description: 'Autonomous financial transaction fraud scoring',
    purpose: 'Card fraud risk detection',
    owner: mlLeadUser.name,
    team: 'Risk Engineering',
    modelType: 'CLASSIFICATION',
    riskLevel: 'HIGH',
    lifecycleStatus: 'DRAFT',
    policyId: null,
    createdBy: mlLeadUser._id
  });

  const req = { user: govUser };
  let jsonResult = null;
  const res = {
    json: (payload) => {
      jsonResult = payload;
      return payload;
    },
    status: () => res
  };

  await getDashboardStats(req, res);

  assert.strictEqual(jsonResult.success, true);
  const data = jsonResult.data;

  assert.strictEqual(data.totalModels, 1);
  assert.strictEqual(data.modelsWithoutPolicyCount, 1);
  assert.strictEqual(data.modelsWithoutPolicy.length, 1);
  assert.strictEqual(data.modelsWithoutPolicy[0].name, 'Sentinel Fraud Detection AI');

  // Clean up
  await Model.deleteMany({});
});

test('3. Role-specific queues prioritize the relevant stakeholder decisions', async () => {
  const model = await Model.create({
    name: 'Underwriting AI Engine',
    description: 'Loan risk evaluation',
    purpose: 'Consumer loan automation',
    owner: mlLeadUser.name,
    team: 'Credit Team',
    modelType: 'CLASSIFICATION',
    riskLevel: 'HIGH',
    lifecycleStatus: 'PENDING_APPROVAL',
    createdBy: mlLeadUser._id
  });

  const version = await ModelVersion.create({
    modelId: model._id,
    version: 'v1.0',
    lifecycleStatus: 'PENDING_APPROVAL',
    policyStatus: 'PASSED'
  });

  // Verify Governance Officer sees this version in their queue
  let req = { user: govUser };
  let jsonResult = null;
  const res = {
    json: (payload) => {
      jsonResult = payload;
      return payload;
    },
    status: () => res
  };

  await getDashboardStats(req, res);
  assert.strictEqual(jsonResult.data.governance.reviewQueue.length, 1);
  assert.strictEqual(jsonResult.data.governance.reviewQueue[0].modelName, 'Underwriting AI Engine');

  // Submit Governance Officer approval
  await Approval.create({
    modelId: model._id,
    versionId: version._id,
    role: 'GOVERNANCE_OFFICER',
    approverName: govUser.name,
    decision: 'APPROVED',
    decidedAt: new Date()
  });

  // Re-run for Governance Officer: should no longer be in pending governance queue
  await getDashboardStats(req, res);
  assert.strictEqual(jsonResult.data.governance.reviewQueue.length, 0);

  // But Executive Approver still has it in their queue
  req = { user: execUser };
  await getDashboardStats(req, res);
  assert.strictEqual(jsonResult.data.executive.decisionsQueue.length, 1);

  // Clean up
  await Approval.deleteMany({});
  await ModelVersion.deleteMany({});
  await Model.deleteMany({});
});

test('4. Platform Admin receives user administration metrics', async () => {
  const req = { user: adminUser };
  let jsonResult = null;
  const res = {
    json: (payload) => {
      jsonResult = payload;
      return payload;
    },
    status: () => res
  };

  await getDashboardStats(req, res);

  assert.strictEqual(jsonResult.success, true);
  const data = jsonResult.data;
  assert.strictEqual(data.platformAdmin.userStats.total, 4); // 4 created users
  assert.strictEqual(data.platformAdmin.userStats.active, 4);
  assert.strictEqual(data.platformAdmin.userStats.pending, 0);
  assert.strictEqual(data.platformAdmin.userStats.suspended, 0);
});
