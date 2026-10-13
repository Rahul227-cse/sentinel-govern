import test from 'node:test';
import assert from 'node:assert';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { User } from '../src/models/User.js';
import { Policy } from '../src/models/Policy.js';
import { Model } from '../src/models/Model.js';
import { ModelVersion } from '../src/models/ModelVersion.js';
import * as policyCtrl from '../src/controllers/policyController.js';
import * as modelCtrl from '../src/controllers/modelController.js';

let mongoServer;
let complianceUser;
let mlLeadUser;
let employeeUser;

let modelA;
let modelB;
let modelC;

let policyA;
let policyB;

test.before(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  complianceUser = await User.create({
    name: 'Chief Governance Officer',
    email: 'gov.officer@enterprise.ai',
    role: 'GOVERNANCE_OFFICER',
    status: 'ACTIVE',
    verificationStatus: 'VERIFIED'
  });

  mlLeadUser = await User.create({
    name: 'Lead ML Engineer',
    email: 'ml.lead@enterprise.ai',
    role: 'ML_LEAD',
    status: 'ACTIVE',
    verificationStatus: 'VERIFIED'
  });

  employeeUser = await User.create({
    name: 'Executive Approver',
    email: 'exec.approver@enterprise.ai',
    role: 'EXECUTIVE_APPROVER',
    status: 'ACTIVE',
    verificationStatus: 'VERIFIED'
  });

  // Create Model A, Model B, Model C
  modelA = await Model.create({
    name: 'Fraud Detection AI',
    description: 'Transaction-level fraud scoring engine',
    purpose: 'Real-time anti-fraud surveillance',
    owner: 'Dr. Jane Smith',
    team: 'Risk Engineering',
    riskLevel: 'HIGH',
    createdBy: mlLeadUser._id
  });

  modelB = await Model.create({
    name: 'Credit Underwriting AI',
    description: 'Consumer credit scoring model',
    purpose: 'Automated lending decisions',
    owner: 'John Doe',
    team: 'Credit Analytics',
    riskLevel: 'HIGH',
    createdBy: mlLeadUser._id
  });

  modelC = await Model.create({
    name: 'Customer Support NLP',
    description: 'Conversational support model',
    purpose: 'Answering client inquiries',
    owner: 'Sarah Connor',
    team: 'Support AI',
    riskLevel: 'LIMITED',
    createdBy: mlLeadUser._id
  });
});

test.after(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

test('1. Compliance Officer creates Policy A associated with Model A', async () => {
  const req = {
    user: complianceUser,
    body: {
      name: 'Fraud Governance Policy',
      description: 'Strict statistical and drift controls for fraud detection',
      targetRiskLevel: 'HIGH',
      applicableModelIds: [modelA._id.toString()],
      rules: {
        minDisparateImpact: 0.82,
        minRocAuc: 0.88
      },
      requiredApprovers: ['ML_LEAD', 'GOVERNANCE_OFFICER'],
      failureAction: 'BLOCK_PROMOTION'
    }
  };
  let responseData;
  const res = {
    status(code) { this.statusCode = code; return this; },
    json(data) { responseData = data; return this; }
  };

  await policyCtrl.createPolicy(req, res);
  assert.strictEqual(res.statusCode, 201);
  assert.strictEqual(responseData.success, true);
  assert.strictEqual(responseData.data.name, 'Fraud Governance Policy');
  assert.strictEqual(responseData.data.applicableModels.length, 1);
  assert.strictEqual(String(responseData.data.applicableModels[0]._id), String(modelA._id));

  policyA = await Policy.findById(responseData.data._id);
  assert.ok(policyA);

  // Model A should have policyId updated
  const updatedModelA = await Model.findById(modelA._id);
  assert.strictEqual(String(updatedModelA.policyId), String(policyA._id));
});

test('2. Governance Officer creates Policy B associated with Model B', async () => {
  const req = {
    user: complianceUser,
    body: {
      name: 'Credit Risk Policy',
      description: 'Fair lending compliance thresholds under ECOA',
      targetRiskLevel: 'HIGH',
      applicableModelIds: [modelB._id.toString()],
      rules: {
        minDisparateImpact: 0.80,
        minAccuracy: 0.85
      },
      requiredApprovers: ['ML_LEAD', 'GOVERNANCE_OFFICER', 'EXECUTIVE_APPROVER'],
      failureAction: 'BLOCK_PROMOTION'
    }
  };
  let responseData;
  const res = {
    status(code) { this.statusCode = code; return this; },
    json(data) { responseData = data; return this; }
  };

  await policyCtrl.createPolicy(req, res);
  assert.strictEqual(res.statusCode, 201);
  assert.strictEqual(responseData.success, true);
  assert.strictEqual(responseData.data.applicableModels.length, 1);
  assert.strictEqual(String(responseData.data.applicableModels[0]._id), String(modelB._id));

  policyB = await Policy.findById(responseData.data._id);
  assert.ok(policyB);

  const updatedModelB = await Model.findById(modelB._id);
  assert.strictEqual(String(updatedModelB.policyId), String(policyB._id));
});

test('3. Model Details bidirectional lookup: Model A -> Policy A, Model B -> Policy B, Model C -> null', async () => {
  // Test Model A
  {
    const req = { params: { id: modelA._id.toString() } };
    let responseData;
    const res = {
      status(code) { this.statusCode = code; return this; },
      json(data) { responseData = data; return this; }
    };
    await modelCtrl.getModelById(req, res);
    assert.strictEqual(res.statusCode || 200, 200);
    assert.strictEqual(responseData.success, true);
    assert.ok(responseData.data.activePolicy);
    assert.strictEqual(String(responseData.data.activePolicy._id), String(policyA._id));
    assert.strictEqual(responseData.data.activePolicy.name, 'Fraud Governance Policy');
  }

  // Test Model B
  {
    const req = { params: { id: modelB._id.toString() } };
    let responseData;
    const res = {
      status(code) { this.statusCode = code; return this; },
      json(data) { responseData = data; return this; }
    };
    await modelCtrl.getModelById(req, res);
    assert.strictEqual(res.statusCode || 200, 200);
    assert.strictEqual(responseData.success, true);
    assert.ok(responseData.data.activePolicy);
    assert.strictEqual(String(responseData.data.activePolicy._id), String(policyB._id));
    assert.strictEqual(responseData.data.activePolicy.name, 'Credit Risk Policy');
  }

  // Test Model C (no policy assigned)
  {
    const req = { params: { id: modelC._id.toString() } };
    let responseData;
    const res = {
      status(code) { this.statusCode = code; return this; },
      json(data) { responseData = data; return this; }
    };
    await modelCtrl.getModelById(req, res);
    assert.strictEqual(res.statusCode || 200, 200);
    assert.strictEqual(responseData.success, true);
    assert.strictEqual(responseData.data.activePolicy, null, 'Model C must have no policy assigned');
  }
});

test('4. Policy Library lookup: Policy A -> Model A, Policy B -> Model B', async () => {
  const req = { query: {} };
  let responseData;
  const res = {
    status(code) { this.statusCode = code; return this; },
    json(data) { responseData = data; return this; }
  };
  await policyCtrl.getPolicies(req, res);
  assert.strictEqual(responseData.success, true);
  assert.strictEqual(responseData.count, 2);

  const pA = responseData.data.find(p => String(p._id) === String(policyA._id));
  const pB = responseData.data.find(p => String(p._id) === String(policyB._id));

  assert.ok(pA);
  assert.strictEqual(pA.applicableModels.length, 1);
  assert.strictEqual(String(pA.applicableModels[0]._id), String(modelA._id));

  assert.ok(pB);
  assert.strictEqual(pB.applicableModels.length, 1);
  assert.strictEqual(String(pB.applicableModels[0]._id), String(modelB._id));
});

test('5. Policy Library "View by Model" filter: filters policies by modelId', async () => {
  // Query by Model A
  {
    const req = { query: { modelId: modelA._id.toString() } };
    let responseData;
    const res = {
      status(code) { this.statusCode = code; return this; },
      json(data) { responseData = data; return this; }
    };
    await policyCtrl.getPolicies(req, res);
    assert.strictEqual(responseData.count, 1);
    assert.strictEqual(String(responseData.data[0]._id), String(policyA._id));
  }

  // Query by Model B
  {
    const req = { query: { modelId: modelB._id.toString() } };
    let responseData;
    const res = {
      status(code) { this.statusCode = code; return this; },
      json(data) { responseData = data; return this; }
    };
    await policyCtrl.getPolicies(req, res);
    assert.strictEqual(responseData.count, 1);
    assert.strictEqual(String(responseData.data[0]._id), String(policyB._id));
  }

  // Query by Model C (no policy)
  {
    const req = { query: { modelId: modelC._id.toString() } };
    let responseData;
    const res = {
      status(code) { this.statusCode = code; return this; },
      json(data) { responseData = data; return this; }
    };
    await policyCtrl.getPolicies(req, res);
    assert.strictEqual(responseData.count, 0, 'No policy should be returned for Model C');
  }
});

test('6. Gate check on Model C fails clearly when no policy is assigned', async () => {
  const versionC = await ModelVersion.create({
    modelId: modelC._id,
    version: 'v1.0.0',
    lifecycleStatus: 'DRAFT'
  });

  const req = {
    params: { versionId: versionC._id.toString() }
  };
  let responseData;
  const res = {
    status(code) { this.statusCode = code; return this; },
    json(data) { responseData = data; return this; }
  };

  await policyCtrl.evaluateGateCheck(req, res);
  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(responseData.success, false);
  assert.strictEqual(responseData.noPolicyAssigned, true);
});

test('7. Compliance Officer can assign Policy A to Model C via updateModelPolicy', async () => {
  const req = {
    user: complianceUser,
    params: { id: modelC._id.toString() },
    body: { policyId: policyA._id.toString() }
  };
  let responseData;
  const res = {
    status(code) { this.statusCode = code; return this; },
    json(data) { responseData = data; return this; }
  };

  await modelCtrl.updateModelPolicy(req, res);
  assert.strictEqual(responseData.success, true);
  assert.strictEqual(String(responseData.data.activePolicy._id), String(policyA._id));

  // Now Policy A has 2 models: Model A and Model C
  const updatedPolicyA = await Policy.findById(policyA._id);
  assert.ok(updatedPolicyA.applicableModelIds.map(String).includes(String(modelC._id)));

  // Query Policy Library for Policy A
  const reqList = { query: {} };
  let resListData;
  const resList = {
    status(code) { this.statusCode = code; return this; },
    json(data) { resListData = data; return this; }
  };
  await policyCtrl.getPolicies(reqList, resList);
  const pA = resListData.data.find(p => String(p._id) === String(policyA._id));
  assert.strictEqual(pA.applicableModels.length, 2, 'Policy A now has 2 models assigned');
});

test('8. RBAC: Non-Governance Officer roles are rejected with 403 Forbidden', async () => {
  const { requireRole } = await import('../src/middleware/authMiddleware.js');
  const complianceOnlyMiddleware = requireRole('GOVERNANCE_OFFICER');

  // ML Lead rejected
  {
    const req = { user: mlLeadUser };
    let calledNext = false;
    const res = {
      statusCode: null,
      status(code) { this.statusCode = code; return this; },
      json() { return this; }
    };
    complianceOnlyMiddleware(req, res, () => { calledNext = true; });
    assert.strictEqual(calledNext, false);
    assert.strictEqual(res.statusCode, 403);
  }

  // Employee rejected
  {
    const req = { user: employeeUser };
    let calledNext = false;
    const res = {
      statusCode: null,
      status(code) { this.statusCode = code; return this; },
      json() { return this; }
    };
    complianceOnlyMiddleware(req, res, () => { calledNext = true; });
    assert.strictEqual(calledNext, false);
    assert.strictEqual(res.statusCode, 403);
  }

  // Compliance Officer passes
  {
    const req = { user: complianceUser };
    let calledNext = false;
    const res = {
      statusCode: null,
      status(code) { this.statusCode = code; return this; },
      json() { return this; }
    };
    complianceOnlyMiddleware(req, res, () => { calledNext = true; });
    assert.strictEqual(calledNext, true, 'Compliance officer role must pass authorization');
  }
});
