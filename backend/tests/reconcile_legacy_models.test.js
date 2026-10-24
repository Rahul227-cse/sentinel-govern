import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

import {
  TARGET_RECONCILIATION_MODELS,
  FORBIDDEN_MODEL_IDS,
  validatePreconditions,
  buildReconciliationDiff,
  executeReconciliation
} from '../scripts/reconcile_legacy_models.mjs';
import { Model } from '../src/models/Model.js';
import { ModelVersion } from '../src/models/ModelVersion.js';
import { Evaluation } from '../src/models/Evaluation.js';
import { Approval } from '../src/models/Approval.js';
import { Deployment } from '../src/models/Deployment.js';
import * as auditEngine from '../src/services/auditEngine.js';

// Helper to construct a valid baseline model & version matching target config
function createValidTargetState(target) {
  const model = {
    _id: new mongoose.Types.ObjectId(target.id),
    name: target.expectedName,
    lifecycleStatus: 'IN_PRODUCTION',
    currentProductionVersionId: new mongoose.Types.ObjectId(target.expectedVersionId),
    policyId: null,
    applicablePolicyIds: [],
    apiConfig: { status: 'DISCONNECTED' },
    save: async () => model
  };

  const version = {
    _id: new mongoose.Types.ObjectId(target.expectedVersionId),
    modelId: new mongoose.Types.ObjectId(target.id),
    version: target.expectedVersionLabel,
    lifecycleStatus: 'IN_PRODUCTION',
    deploymentStatus: 'IN_PRODUCTION',
    policyStatus: 'PASSED',
    approvalStatus: 'APPROVED',
    evaluationStatus: 'NOT_EVALUATED',
    latestEvaluationId: null,
    deploymentRef: null,
    deployedAt: new Date(),
    save: async () => version
  };

  return { model, version };
}

test('Reconciliation: Target allowlist contains exactly the three audited models', () => {
  assert.equal(TARGET_RECONCILIATION_MODELS.length, 3);
  const ids = TARGET_RECONCILIATION_MODELS.map(m => m.id);
  assert.ok(ids.includes('6acdeff52fe166c1c4b8e0c5'), 'Must contain Credit Risk model ID');
  assert.ok(ids.includes('6acdeff82fe166c1c4b8e0e1'), 'Must contain Insurance Charges model ID');
  assert.ok(ids.includes('6acdeffc2fe166c1c4b8e0ea'), 'Must contain Customer Churn model ID');
});

test('Reconciliation: FORBIDDEN guard blocks Fraud Detection ID and name', () => {
  const target = TARGET_RECONCILIATION_MODELS[0];
  const fraudModel = {
    _id: new mongoose.Types.ObjectId('6ac879e2396f54be9a4426e1'),
    name: 'Real-Time Fraud Detection & Anomaly Intelligence',
    lifecycleStatus: 'IN_PRODUCTION',
    currentProductionVersionId: new mongoose.Types.ObjectId(target.expectedVersionId),
    policyId: null
  };
  const { version } = createValidTargetState(target);

  assert.throws(
    () => validatePreconditions({
      model: fraudModel,
      version,
      evalCount: 0,
      approvalCount: 0,
      deploymentCount: 0,
      targetConfig: target
    }),
    /CRITICAL GUARD BLOCKED/
  );
});

test('Reconciliation: FORBIDDEN guard blocks regex match on fraud in name', () => {
  const target = TARGET_RECONCILIATION_MODELS[0];
  const fakeModel = {
    _id: new mongoose.Types.ObjectId(target.id),
    name: 'Fraud Detection Platform Experimental',
    lifecycleStatus: 'IN_PRODUCTION',
    currentProductionVersionId: new mongoose.Types.ObjectId(target.expectedVersionId),
    policyId: null
  };
  const { version } = createValidTargetState(target);

  assert.throws(
    () => validatePreconditions({
      model: fakeModel,
      version,
      evalCount: 0,
      approvalCount: 0,
      deploymentCount: 0,
      targetConfig: target
    }),
    /CRITICAL GUARD BLOCKED/
  );
});

test('Reconciliation: Preconditions pass when model and version match audited baseline', () => {
  const target = TARGET_RECONCILIATION_MODELS[0];
  const { model, version } = createValidTargetState(target);

  const isValid = validatePreconditions({
    model,
    version,
    evalCount: 0,
    approvalCount: 0,
    deploymentCount: 0,
    targetConfig: target
  });

  assert.equal(isValid, true);
});

test('Reconciliation: Aborts if model lifecycleStatus is already DRAFT or not IN_PRODUCTION', () => {
  const target = TARGET_RECONCILIATION_MODELS[0];
  const { model, version } = createValidTargetState(target);
  model.lifecycleStatus = 'DRAFT';

  assert.throws(
    () => validatePreconditions({
      model,
      version,
      evalCount: 0,
      approvalCount: 0,
      deploymentCount: 0,
      targetConfig: target
    }),
    /lifecycleStatus is "DRAFT", expected "IN_PRODUCTION"/
  );
});

test('Reconciliation: Aborts if model unexpectedly has assigned policy', () => {
  const target = TARGET_RECONCILIATION_MODELS[0];
  const { model, version } = createValidTargetState(target);
  model.policyId = new mongoose.Types.ObjectId();

  assert.throws(
    () => validatePreconditions({
      model,
      version,
      evalCount: 0,
      approvalCount: 0,
      deploymentCount: 0,
      targetConfig: target
    }),
    /unexpectedly has assigned policyId/
  );
});

test('Reconciliation: Aborts if model unexpectedly has evaluations', () => {
  const target = TARGET_RECONCILIATION_MODELS[0];
  const { model, version } = createValidTargetState(target);

  assert.throws(
    () => validatePreconditions({
      model,
      version,
      evalCount: 2,
      approvalCount: 0,
      deploymentCount: 0,
      targetConfig: target
    }),
    /unexpectedly has 2 Evaluation document\(s\)/
  );
});

test('Reconciliation: Aborts if model unexpectedly has approvals', () => {
  const target = TARGET_RECONCILIATION_MODELS[0];
  const { model, version } = createValidTargetState(target);

  assert.throws(
    () => validatePreconditions({
      model,
      version,
      evalCount: 0,
      approvalCount: 1,
      deploymentCount: 0,
      targetConfig: target
    }),
    /unexpectedly has 1 Approval document\(s\)/
  );
});

test('Reconciliation: Aborts if model unexpectedly has deployment documents', () => {
  const target = TARGET_RECONCILIATION_MODELS[0];
  const { model, version } = createValidTargetState(target);

  assert.throws(
    () => validatePreconditions({
      model,
      version,
      evalCount: 0,
      approvalCount: 0,
      deploymentCount: 1,
      targetConfig: target
    }),
    /unexpectedly has 1 Deployment document\(s\)/
  );
});

test('Reconciliation: Aborts if version does not belong to target model', () => {
  const target = TARGET_RECONCILIATION_MODELS[0];
  const { model, version } = createValidTargetState(target);
  version.modelId = new mongoose.Types.ObjectId(); // Different model ID

  assert.throws(
    () => validatePreconditions({
      model,
      version,
      evalCount: 0,
      approvalCount: 0,
      deploymentCount: 0,
      targetConfig: target
    }),
    /does not belong to model/
  );
});

test('Reconciliation: Aborts if version ID does not match expected version pointer', () => {
  const target = TARGET_RECONCILIATION_MODELS[0];
  const { model, version } = createValidTargetState(target);
  model.currentProductionVersionId = new mongoose.Types.ObjectId(); // Wrong pointer

  assert.throws(
    () => validatePreconditions({
      model,
      version,
      evalCount: 0,
      approvalCount: 0,
      deploymentCount: 0,
      targetConfig: target
    }),
    /production version pointer mismatch/
  );
});

test('Reconciliation: buildReconciliationDiff correctly maps intended non-production mutations', () => {
  const target = TARGET_RECONCILIATION_MODELS[0];
  const { model, version } = createValidTargetState(target);

  const diff = buildReconciliationDiff({ model, version });

  assert.equal(diff.modelChanges.lifecycleStatus.from, 'IN_PRODUCTION');
  assert.equal(diff.modelChanges.lifecycleStatus.to, 'DRAFT');
  assert.equal(diff.modelChanges.currentProductionVersionId.to, null);
  assert.equal(diff.modelChanges.apiConfigStatus.to, 'DISCONNECTED');

  assert.equal(diff.versionChanges.lifecycleStatus.from, 'IN_PRODUCTION');
  assert.equal(diff.versionChanges.lifecycleStatus.to, 'DRAFT');
  assert.equal(diff.versionChanges.deploymentStatus.to, 'NOT_DEPLOYED');
  assert.equal(diff.versionChanges.policyStatus.to, 'PENDING');
  assert.equal(diff.versionChanges.approvalStatus.to, 'NOT_REQUESTED');
  assert.equal(diff.versionChanges.deployedAt.to, null);
  assert.equal(diff.versionChanges.deploymentRef.to, null);
});

test('Reconciliation: executeReconciliation in dry-run mode performs zero writes and returns diff', async () => {
  const targetMap = {};
  for (const t of TARGET_RECONCILIATION_MODELS) {
    targetMap[t.id] = createValidTargetState(t);
  }

  // Stub Mongoose Model/ModelVersion/etc queries
  const origFindById = Model.findById;
  const origVersionFindById = ModelVersion.findById;
  const origEvalCount = Evaluation.countDocuments;
  const origApprovalCount = Approval.countDocuments;
  const origDeployCount = Deployment.countDocuments;

  let writeAttempted = false;

  Model.findById = async (id) => {
    const pkg = targetMap[String(id)];
    if (!pkg) return null;
    return {
      ...pkg.model,
      save: async () => { writeAttempted = true; }
    };
  };

  ModelVersion.findById = async (id) => {
    for (const pkg of Object.values(targetMap)) {
      if (String(pkg.version._id) === String(id)) {
        return {
          ...pkg.version,
          save: async () => { writeAttempted = true; }
        };
      }
    }
    return null;
  };

  Evaluation.countDocuments = async () => 0;
  Approval.countDocuments = async () => 0;
  Deployment.countDocuments = async () => 0;

  const mockMongoose = {
    connection: {
      readyState: 1,
      client: { topology: { description: { type: 'ReplicaSetWithPrimary' } } }
    }
  };

  try {
    const result = await executeReconciliation({ isApply: false, mongooseInstance: mockMongoose });
    assert.equal(result.success, true);
    assert.equal(result.mode, 'DRY_RUN');
    assert.equal(result.reconciledCount, 0);
    assert.equal(result.verifiedPackages.length, 3);
    assert.equal(writeAttempted, false, 'Dry run must not perform writes or call save');
  } finally {
    Model.findById = origFindById;
    ModelVersion.findById = origVersionFindById;
    Evaluation.countDocuments = origEvalCount;
    Approval.countDocuments = origApprovalCount;
    Deployment.countDocuments = origDeployCount;
  }
});

test('Reconciliation: Aborts atomic transaction on standalone connection if apply is attempted', async () => {
  const targetMap = {};
  for (const t of TARGET_RECONCILIATION_MODELS) {
    targetMap[t.id] = createValidTargetState(t);
  }

  const origFindById = Model.findById;
  const origVersionFindById = ModelVersion.findById;
  const origEvalCount = Evaluation.countDocuments;
  const origApprovalCount = Approval.countDocuments;
  const origDeployCount = Deployment.countDocuments;

  Model.findById = async (id) => targetMap[String(id)]?.model || null;
  ModelVersion.findById = async (id) => {
    for (const pkg of Object.values(targetMap)) {
      if (String(pkg.version._id) === String(id)) return pkg.version;
    }
    return null;
  };
  Evaluation.countDocuments = async () => 0;
  Approval.countDocuments = async () => 0;
  Deployment.countDocuments = async () => 0;

  // Single standalone topology (no replica set)
  const mockMongoose = {
    connection: {
      readyState: 1,
      client: { topology: { description: { type: 'Single' } } }
    }
  };

  try {
    await assert.rejects(
      () => executeReconciliation({ isApply: true, mongooseInstance: mockMongoose }),
      /Current MongoDB connection is standalone \("Single"\)/
    );
  } finally {
    Model.findById = origFindById;
    ModelVersion.findById = origVersionFindById;
    Evaluation.countDocuments = origEvalCount;
    Approval.countDocuments = origApprovalCount;
    Deployment.countDocuments = origDeployCount;
  }
});

test('Reconciliation: Atomic transaction rolls back cleanly when audit write fails', async () => {
  const targetMap = {};
  for (const t of TARGET_RECONCILIATION_MODELS) {
    targetMap[t.id] = createValidTargetState(t);
  }

  const origFindById = Model.findById;
  const origVersionFindById = ModelVersion.findById;
  const origEvalCount = Evaluation.countDocuments;
  const origApprovalCount = Approval.countDocuments;
  const origDeployCount = Deployment.countDocuments;
  const origRecordAudit = auditEngine.recordAuditEvent;

  // Track session lifecycle
  let sessionStarted = false;
  let transactionStarted = false;
  let transactionAborted = false;
  let transactionCommitted = false;
  let sessionEnded = false;

  const mockSession = {
    startTransaction: () => { transactionStarted = true; },
    abortTransaction: async () => { transactionAborted = true; },
    commitTransaction: async () => { transactionCommitted = true; },
    endSession: async () => { sessionEnded = true; }
  };

  const createQueryChain = (data) => ({
    session: () => Promise.resolve(data)
  });

  Model.findById = (id) => ({
    session: () => Promise.resolve({
      ...targetMap[String(id)].model,
      save: async () => {}
    }),
    then: (resolve) => resolve(targetMap[String(id)]?.model || null)
  });

  ModelVersion.findById = (id) => ({
    session: () => {
      for (const pkg of Object.values(targetMap)) {
        if (String(pkg.version._id) === String(id)) {
          return Promise.resolve({
            ...pkg.version,
            save: async () => {}
          });
        }
      }
      return Promise.resolve(null);
    },
    then: (resolve) => {
      for (const pkg of Object.values(targetMap)) {
        if (String(pkg.version._id) === String(id)) return resolve(pkg.version);
      }
      return resolve(null);
    }
  });

  Evaluation.countDocuments = () => ({
    session: () => Promise.resolve(0),
    then: (resolve) => resolve(0)
  });
  Approval.countDocuments = () => ({
    session: () => Promise.resolve(0),
    then: (resolve) => resolve(0)
  });
  Deployment.countDocuments = () => ({
    session: () => Promise.resolve(0),
    then: (resolve) => resolve(0)
  });

  // Custom audit writer that simulates failure
  const failingAuditWriter = async () => {
    throw new Error('Simulated network disruption during audit write');
  };

  const mockMongoose = {
    connection: {
      readyState: 1,
      client: { topology: { description: { type: 'ReplicaSetWithPrimary' } } },
      startSession: async () => {
        sessionStarted = true;
        return mockSession;
      }
    }
  };

  try {
    await assert.rejects(
      () => executeReconciliation({
        isApply: true,
        mongooseInstance: mockMongoose,
        auditWriter: failingAuditWriter
      }),
      /Simulated network disruption during audit write/
    );

    assert.equal(sessionStarted, true, 'Session must have been created');
    assert.equal(transactionStarted, true, 'Transaction must have been initiated');
    assert.equal(transactionAborted, true, 'Transaction must abort on error');
    assert.equal(transactionCommitted, false, 'Transaction must not commit on error');
    assert.equal(sessionEnded, true, 'Session must end on cleanup');
  } finally {
    Model.findById = origFindById;
    ModelVersion.findById = origVersionFindById;
    Evaluation.countDocuments = origEvalCount;
    Approval.countDocuments = origApprovalCount;
    Deployment.countDocuments = origDeployCount;
  }
});

test('Reconciliation: Successful apply commits transaction, applies DRAFT, and records truthful audit events', async () => {
  const targetMap = {};
  for (const t of TARGET_RECONCILIATION_MODELS) {
    targetMap[t.id] = createValidTargetState(t);
  }

  const origFindById = Model.findById;
  const origVersionFindById = ModelVersion.findById;
  const origEvalCount = Evaluation.countDocuments;
  const origApprovalCount = Approval.countDocuments;
  const origDeployCount = Deployment.countDocuments;

  let transactionCommitted = false;
  let transactionAborted = false;
  const savedModels = [];
  const savedVersions = [];
  const recordedAudits = [];

  const mockSession = {
    startTransaction: () => {},
    abortTransaction: async () => { transactionAborted = true; },
    commitTransaction: async () => { transactionCommitted = true; },
    endSession: async () => {}
  };

  Model.findById = (id) => ({
    session: () => {
      const doc = {
        ...targetMap[String(id)].model,
        save: async ({ session }) => {
          assert.ok(session, 'Must save within session');
          savedModels.push({ ...doc });
        }
      };
      return Promise.resolve(doc);
    },
    then: (resolve) => resolve(targetMap[String(id)]?.model || null)
  });

  ModelVersion.findById = (id) => ({
    session: () => {
      for (const pkg of Object.values(targetMap)) {
        if (String(pkg.version._id) === String(id)) {
          const doc = {
            ...pkg.version,
            save: async ({ session }) => {
              assert.ok(session, 'Must save within session');
              savedVersions.push({ ...doc });
            }
          };
          return Promise.resolve(doc);
        }
      }
      return Promise.resolve(null);
    },
    then: (resolve) => {
      for (const pkg of Object.values(targetMap)) {
        if (String(pkg.version._id) === String(id)) return resolve(pkg.version);
      }
      return resolve(null);
    }
  });

  Evaluation.countDocuments = () => ({
    session: () => Promise.resolve(0),
    then: (resolve) => resolve(0)
  });
  Approval.countDocuments = () => ({
    session: () => Promise.resolve(0),
    then: (resolve) => resolve(0)
  });
  Deployment.countDocuments = () => ({
    session: () => Promise.resolve(0),
    then: (resolve) => resolve(0)
  });

  const customAuditWriter = async (event) => {
    assert.ok(event.session, 'Audit event must receive session');
    assert.equal(event.actor, 'Sentinel Governance Maintenance Script');
    assert.equal(event.role, 'PLATFORM_ADMIN');
    assert.equal(event.action, 'GOVERNANCE_RECONCILIATION');
    recordedAudits.push(event);
    return { ...event, sequenceNumber: recordedAudits.length };
  };

  const customAuditVerifier = async ({ session } = {}) => {
    assert.ok(session, 'Audit integrity verification must be called with session before commit');
    return { valid: true, totalBlocks: 419, brokenAtSequence: null };
  };

  const mockMongoose = {
    connection: {
      readyState: 1,
      client: { topology: { description: { type: 'ReplicaSetWithPrimary' } } },
      startSession: async () => mockSession
    }
  };

  try {
    const result = await executeReconciliation({
      isApply: true,
      mongooseInstance: mockMongoose,
      auditWriter: customAuditWriter,
      auditVerifier: customAuditVerifier
    });
    assert.equal(result.success, true);
    assert.equal(result.mode, 'APPLY');
    assert.equal(result.reconciledCount, 3);
    assert.equal(transactionCommitted, true, 'Transaction must be committed');
    assert.equal(transactionAborted, false, 'Transaction must not be aborted');

    // Verify 3 models saved with DRAFT and null production pointer
    assert.equal(savedModels.length, 3);
    for (const m of savedModels) {
      assert.equal(m.lifecycleStatus, 'DRAFT');
      assert.equal(m.currentProductionVersionId, null);
      assert.equal(m.apiConfig.status, 'DISCONNECTED');
    }

    // Verify 3 versions saved with DRAFT and NOT_DEPLOYED
    assert.equal(savedVersions.length, 3);
    for (const v of savedVersions) {
      assert.equal(v.lifecycleStatus, 'DRAFT');
      assert.equal(v.deploymentStatus, 'NOT_DEPLOYED');
      assert.equal(v.policyStatus, 'PENDING');
      assert.equal(v.approvalStatus, 'NOT_REQUESTED');
      assert.equal(v.evaluationStatus, 'NOT_EVALUATED');
      assert.equal(v.deployedAt, null);
      assert.equal(v.deploymentRef, null);
    }

    // Verify 6 audit events recorded (1 model + 1 version for each of 3 targets)
    assert.equal(recordedAudits.length, 6);
  } finally {
    Model.findById = origFindById;
    ModelVersion.findById = origVersionFindById;
    Evaluation.countDocuments = origEvalCount;
    Approval.countDocuments = origApprovalCount;
    Deployment.countDocuments = origDeployCount;
  }
});
