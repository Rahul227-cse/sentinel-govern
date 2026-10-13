import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { Model } from '../src/models/Model.js';
import { ModelVersion } from '../src/models/ModelVersion.js';
import { Policy } from '../src/models/Policy.js';
import { Approval } from '../src/models/Approval.js';
import { transitionVersionLifecycle } from '../src/services/lifecycleService.js';
import { executeRollback } from '../src/services/incidentService.js';

let mongoServer;

test.before(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

test.after(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

test('Lifecycle Enforcement: Rejects direct skip from DRAFT to APPROVED', async () => {
  const model = await Model.create({
    name: 'Test Model 1',
    description: 'Test',
    purpose: 'Underwriting',
    owner: 'Tester',
    team: 'Risk',
    riskLevel: 'HIGH'
  });

  const version = await ModelVersion.create({
    modelId: model._id,
    version: 'v1.0',
    lifecycleStatus: 'DRAFT'
  });

  await assert.rejects(
    async () => {
      await transitionVersionLifecycle({
        versionId: version._id,
        targetStatus: 'APPROVED'
      });
    },
    (err) => {
      assert.match(err.message, /Cannot approve model directly from DRAFT/);
      return true;
    }
  );
});

test('Lifecycle Enforcement: Rejects promotion to IN_PRODUCTION if version is not APPROVED', async () => {
  const model = await Model.create({
    name: 'Test Model 2',
    description: 'Test',
    purpose: 'Underwriting',
    owner: 'Tester',
    team: 'Risk',
    riskLevel: 'HIGH'
  });

  const version = await ModelVersion.create({
    modelId: model._id,
    version: 'v1.0',
    lifecycleStatus: 'DRAFT'
  });

  await assert.rejects(
    async () => {
      await transitionVersionLifecycle({
        versionId: version._id,
        targetStatus: 'IN_PRODUCTION'
      });
    },
    (err) => {
      assert.match(err.message, /DEPLOYMENT GATE BLOCKED: Version v1.0 must be APPROVED prior to production/);
      return true;
    }
  );
});

test('Lifecycle Enforcement: Rejects transition to PENDING_APPROVAL if policyStatus is FAILED', async () => {
  const model = await Model.create({
    name: 'Test Model 3',
    description: 'Test',
    purpose: 'Underwriting',
    owner: 'Tester',
    team: 'Risk',
    riskLevel: 'HIGH'
  });

  const version = await ModelVersion.create({
    modelId: model._id,
    version: 'v1.0',
    lifecycleStatus: 'EVALUATION',
    policyStatus: 'FAILED'
  });

  await assert.rejects(
    async () => {
      await transitionVersionLifecycle({
        versionId: version._id,
        targetStatus: 'PENDING_APPROVAL'
      });
    },
    (err) => {
      assert.match(err.message, /GOVERNANCE GATE BLOCKED/);
      return true;
    }
  );
});

test('Lifecycle Enforcement: Rejects transition to APPROVED if mandatory role approvals are missing', async () => {
  await Policy.create({
    name: 'Test Policy High Risk',
    description: 'Test policy',
    targetRiskLevel: 'HIGH',
    requiredApprovers: ['ML_LEAD', 'GOVERNANCE_OFFICER', 'EXECUTIVE_APPROVER'],
    isActive: true
  });

  const model = await Model.create({
    name: 'Test Model 4',
    description: 'Test',
    purpose: 'Underwriting',
    owner: 'Tester',
    team: 'Risk',
    riskLevel: 'HIGH'
  });

  const version = await ModelVersion.create({
    modelId: model._id,
    version: 'v1.0',
    lifecycleStatus: 'PENDING_APPROVAL',
    policyStatus: 'PASSED'
  });

  // Only ML_LEAD has approved, GOVERNANCE_OFFICER and EXECUTIVE_APPROVER are missing
  await Approval.create({
    modelId: model._id,
    versionId: version._id,
    role: 'ML_LEAD',
    approverName: 'Dr. Lead',
    decision: 'APPROVED'
  });

  await assert.rejects(
    async () => {
      await transitionVersionLifecycle({
        versionId: version._id,
        targetStatus: 'APPROVED'
      });
    },
    (err) => {
      assert.match(err.message, /APPROVAL GATE BLOCKED: Missing mandatory sign-offs/);
      return true;
    }
  );
});

test('Rollback Enforcement: Rejects rollback to a version that failed governance or was never approved', async () => {
  const model = await Model.create({
    name: 'Test Model 5',
    description: 'Test',
    purpose: 'Underwriting',
    owner: 'Tester',
    team: 'Risk',
    riskLevel: 'HIGH'
  });

  const failedVersion = await ModelVersion.create({
    modelId: model._id,
    version: 'v1.1',
    lifecycleStatus: 'EVALUATION',
    policyStatus: 'FAILED',
    approvalStatus: 'NOT_REQUESTED'
  });

  await assert.rejects(
    async () => {
      await executeRollback({
        modelId: model._id,
        targetVersionId: failedVersion._id
      });
    },
    (err) => {
      assert.match(err.message, /ROLLBACK GATE BLOCKED: Target version v1.1 cannot be deployed via rollback because it failed governance policies/);
      return true;
    }
  );
});

test('Rollback Enforcement: Permits rollback to a genuinely approved baseline version', async () => {
  const model = await Model.create({
    name: 'Test Model 6',
    description: 'Test',
    purpose: 'Underwriting',
    owner: 'Tester',
    team: 'Risk',
    riskLevel: 'HIGH'
  });

  const approvedBaseline = await ModelVersion.create({
    modelId: model._id,
    version: 'v1.0',
    lifecycleStatus: 'APPROVED',
    policyStatus: 'PASSED',
    approvalStatus: 'APPROVED'
  });

  const prodVersion = await ModelVersion.create({
    modelId: model._id,
    version: 'v1.2',
    lifecycleStatus: 'IN_PRODUCTION',
    policyStatus: 'PASSED',
    approvalStatus: 'APPROVED',
    deploymentStatus: 'IN_PRODUCTION'
  });

  model.currentProductionVersionId = prodVersion._id;
  model.lifecycleStatus = 'IN_PRODUCTION';
  await model.save();

  const rollbackResult = await executeRollback({
    modelId: model._id,
    targetVersionId: approvedBaseline._id,
    actor: 'Executive VP'
  });

  assert.equal(rollbackResult.success, true);
  assert.equal(rollbackResult.activeVersion, 'v1.0');

  const updatedModel = await Model.findById(model._id);
  assert.equal(String(updatedModel.currentProductionVersionId), String(approvedBaseline._id));

  const updatedProd = await ModelVersion.findById(prodVersion._id);
  assert.equal(updatedProd.lifecycleStatus, 'DEPRECATED');
  assert.equal(updatedProd.deploymentStatus, 'ROLLED_BACK');
});
