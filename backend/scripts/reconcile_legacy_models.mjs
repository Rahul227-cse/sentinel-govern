/**
 * Sentinel Govern - One-Time Legacy Model Lifecycle Reconciliation Script
 * 
 * Safely reconciles exactly three legacy seeded models and their linked versions
 * from invalid IN_PRODUCTION / PASSED / APPROVED status to legitimate non-production DRAFT status.
 * 
 * Usage:
 *   node backend/scripts/reconcile_legacy_models.mjs          # Default: Read-only simulation with diff
 *   node backend/scripts/reconcile_legacy_models.mjs --apply  # Explicit transaction execution
 */

import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

import { Model } from '../src/models/Model.js';
import { ModelVersion } from '../src/models/ModelVersion.js';
import { Evaluation } from '../src/models/Evaluation.js';
import { Approval } from '../src/models/Approval.js';
import { Deployment } from '../src/models/Deployment.js';
import { recordAuditEvent, verifyAuditChainIntegrity } from '../src/services/auditEngine.js';

// Target Allowlist: Exactly the three audited legacy seeded models
export const TARGET_RECONCILIATION_MODELS = [
  {
    id: '6acdeff52fe166c1c4b8e0c5',
    expectedName: 'Credit Risk Scoring & Default Assessment',
    expectedVersionId: '6acdeff72fe166c1c4b8e0d9',
    expectedVersionLabel: 'v1.0'
  },
  {
    id: '6acdeff82fe166c1c4b8e0e1',
    expectedName: 'Medical & Insurance Charges Predictor',
    expectedVersionId: '6acdeffa2fe166c1c4b8e0e6',
    expectedVersionLabel: 'v1.0'
  },
  {
    id: '6acdeffc2fe166c1c4b8e0ea',
    expectedName: 'Customer Churn Retention Intelligence',
    expectedVersionId: '6acdeffd2fe166c1c4b8e0ee',
    expectedVersionLabel: 'v1.0'
  }
];

// Explicit Forbidden Allowlist: Protected production models that MUST NEVER be altered
export const FORBIDDEN_MODEL_IDS = [
  '6ac879e2396f54be9a4426e1' // Real-Time Fraud Detection & Anomaly Intelligence
];

/**
 * Validates all strict governance preconditions for a candidate model.
 * Throws an Error if any assumption deviates.
 */
export function validatePreconditions({ model, version, evalCount, approvalCount, deploymentCount, targetConfig }) {
  if (!model) {
    throw new Error(`[RECONCILIATION ABORT] Model ${targetConfig.id} not found in database.`);
  }

  // Guard against forbidden IDs and names
  if (FORBIDDEN_MODEL_IDS.includes(String(model._id)) || /fraud/i.test(model.name)) {
    throw new Error(`[CRITICAL GUARD BLOCKED] Attempted modification of protected Fraud Detection model (${model._id}). Aborting.`);
  }

  if (String(model._id) !== targetConfig.id) {
    throw new Error(`[RECONCILIATION ABORT] Model ID mismatch: expected ${targetConfig.id}, got ${model._id}`);
  }

  if (model.name !== targetConfig.expectedName) {
    throw new Error(`[RECONCILIATION ABORT] Model name mismatch for ${model._id}: expected "${targetConfig.expectedName}", got "${model.name}"`);
  }

  if (model.lifecycleStatus !== 'IN_PRODUCTION') {
    throw new Error(`[RECONCILIATION ABORT] Model ${model.name} lifecycleStatus is "${model.lifecycleStatus}", expected "IN_PRODUCTION"`);
  }

  if (String(model.currentProductionVersionId) !== targetConfig.expectedVersionId) {
    throw new Error(`[RECONCILIATION ABORT] Model ${model.name} production version pointer mismatch: expected ${targetConfig.expectedVersionId}, got ${model.currentProductionVersionId}`);
  }

  if (model.policyId !== null && model.policyId !== undefined) {
    throw new Error(`[RECONCILIATION ABORT] Model ${model.name} unexpectedly has assigned policyId: ${model.policyId}`);
  }

  if (model.applicablePolicyIds && model.applicablePolicyIds.length > 0) {
    throw new Error(`[RECONCILIATION ABORT] Model ${model.name} unexpectedly has applicablePolicyIds: ${JSON.stringify(model.applicablePolicyIds)}`);
  }

  if (!version) {
    throw new Error(`[RECONCILIATION ABORT] Linked version ${targetConfig.expectedVersionId} for model ${model.name} not found.`);
  }

  if (String(version._id) !== targetConfig.expectedVersionId) {
    throw new Error(`[RECONCILIATION ABORT] Version ID mismatch: expected ${targetConfig.expectedVersionId}, got ${version._id}`);
  }

  if (String(version.modelId) !== String(model._id)) {
    throw new Error(`[RECONCILIATION ABORT] Version ${version._id} does not belong to model ${model._id} (belongs to: ${version.modelId})`);
  }

  if (version.version !== targetConfig.expectedVersionLabel) {
    throw new Error(`[RECONCILIATION ABORT] Version label mismatch: expected "${targetConfig.expectedVersionLabel}", got "${version.version}"`);
  }

  if (version.lifecycleStatus !== 'IN_PRODUCTION') {
    throw new Error(`[RECONCILIATION ABORT] Version ${version.version} lifecycleStatus is "${version.lifecycleStatus}", expected "IN_PRODUCTION"`);
  }

  if (version.deploymentStatus !== 'IN_PRODUCTION') {
    throw new Error(`[RECONCILIATION ABORT] Version ${version.version} deploymentStatus is "${version.deploymentStatus}", expected "IN_PRODUCTION"`);
  }

  if (version.policyStatus !== 'PASSED') {
    throw new Error(`[RECONCILIATION ABORT] Version ${version.version} policyStatus is "${version.policyStatus}", expected "PASSED"`);
  }

  if (version.approvalStatus !== 'APPROVED') {
    throw new Error(`[RECONCILIATION ABORT] Version ${version.version} approvalStatus is "${version.approvalStatus}", expected "APPROVED"`);
  }

  if (version.evaluationStatus !== 'NOT_EVALUATED') {
    throw new Error(`[RECONCILIATION ABORT] Version ${version.version} evaluationStatus is "${version.evaluationStatus}", expected "NOT_EVALUATED"`);
  }

  if (version.latestEvaluationId !== null && version.latestEvaluationId !== undefined) {
    throw new Error(`[RECONCILIATION ABORT] Version ${version.version} unexpectedly has latestEvaluationId: ${version.latestEvaluationId}`);
  }

  if (version.deploymentRef !== null && version.deploymentRef !== undefined) {
    throw new Error(`[RECONCILIATION ABORT] Version ${version.version} unexpectedly has deploymentRef: ${version.deploymentRef}`);
  }

  if (evalCount > 0) {
    throw new Error(`[RECONCILIATION ABORT] Model ${model.name} unexpectedly has ${evalCount} Evaluation document(s).`);
  }

  if (approvalCount > 0) {
    throw new Error(`[RECONCILIATION ABORT] Model ${model.name} unexpectedly has ${approvalCount} Approval document(s).`);
  }

  if (deploymentCount > 0) {
    throw new Error(`[RECONCILIATION ABORT] Model ${model.name} unexpectedly has ${deploymentCount} Deployment document(s).`);
  }

  return true;
}

/**
 * Builds a structured diff between current document states and intended reconciled states.
 */
export function buildReconciliationDiff({ model, version }) {
  const modelChanges = {
    lifecycleStatus: { from: model.lifecycleStatus, to: 'DRAFT' },
    currentProductionVersionId: { from: String(model.currentProductionVersionId), to: null },
    apiConfigStatus: { from: model.apiConfig?.status || 'undefined', to: 'DISCONNECTED' }
  };

  const versionChanges = {
    lifecycleStatus: { from: version.lifecycleStatus, to: 'DRAFT' },
    deploymentStatus: { from: version.deploymentStatus, to: 'NOT_DEPLOYED' },
    policyStatus: { from: version.policyStatus, to: 'PENDING' },
    approvalStatus: { from: version.approvalStatus, to: 'NOT_REQUESTED' },
    evaluationStatus: { from: version.evaluationStatus, to: 'NOT_EVALUATED' },
    deployedAt: { from: version.deployedAt ? version.deployedAt.toISOString() : 'null', to: null },
    deploymentRef: { from: version.deploymentRef ? String(version.deploymentRef) : 'null', to: null }
  };

  return { modelChanges, versionChanges };
}

/**
 * Executes or simulates reconciliation across target models.
 */
export async function executeReconciliation({
  isApply = false,
  mongooseInstance = mongoose,
  auditWriter = recordAuditEvent,
  auditVerifier = verifyAuditChainIntegrity
} = {}) {
  console.log('========================================================================');
  console.log(`SENTINEL GOVERN - LEGACY MODEL LIFECYCLE RECONCILIATION`);
  console.log(`Execution Mode: ${isApply ? '⚠️  APPLY (ACTIVE WRITES WITH TRANSACTION)' : '🔍 DRY RUN (READ-ONLY SIMULATION)'}`);
  console.log('========================================================================\n');

  // Verify DB connection
  const conn = mongooseInstance.connection;
  if (!conn || conn.readyState !== 1) {
    throw new Error('[DB ERROR] MongoDB connection is not active.');
  }

  // Pre-fetch and validate all models and versions
  console.log(`1. Inspecting target models against strict audit baseline...`);
  const verificationPackages = [];

  for (const target of TARGET_RECONCILIATION_MODELS) {
    const model = await Model.findById(target.id);
    const version = await ModelVersion.findById(target.expectedVersionId);
    const evalCount = await Evaluation.countDocuments({ modelId: target.id });
    const approvalCount = await Approval.countDocuments({ modelId: target.id });
    const deploymentCount = await Deployment.countDocuments({ modelId: target.id });

    validatePreconditions({
      model,
      version,
      evalCount,
      approvalCount,
      deploymentCount,
      targetConfig: target
    });

    const diff = buildReconciliationDiff({ model, version });
    verificationPackages.push({ target, model, version, diff });

    console.log(`   ✓ Model verified: "${target.expectedName}" (${target.id})`);
    console.log(`     - Version: ${target.expectedVersionLabel} (${target.expectedVersionId})`);
    console.log(`     - Linked evaluations: ${evalCount}, approvals: ${approvalCount}, deployments: ${deploymentCount}`);
  }

  console.log(`\n2. Reconciliation diff summary:`);
  for (const pkg of verificationPackages) {
    console.log(`\n--- Target: ${pkg.target.expectedName} [${pkg.target.id}] ---`);
    console.log(`    Model Mutations:`);
    for (const [k, v] of Object.entries(pkg.diff.modelChanges)) {
      console.log(`      • ${k}: "${v.from}" -> "${v.to}"`);
    }
    console.log(`    Version Mutations (${pkg.target.expectedVersionLabel} [${pkg.target.expectedVersionId}]):`);
    for (const [k, v] of Object.entries(pkg.diff.versionChanges)) {
      console.log(`      • ${k}: "${v.from}" -> "${v.to}"`);
    }
  }

  if (!isApply) {
    console.log('\n========================================================================');
    console.log('✅ DRY RUN COMPLETED SUCCESSFULLY');
    console.log('No database records were modified or deleted.');
    console.log('All historical telemetry, incidents, reports, and audit logs are preserved.');
    console.log('To execute this reconciliation, rerun with the explicit "--apply" flag.');
    console.log('========================================================================\n');
    return {
      success: true,
      mode: 'DRY_RUN',
      reconciledCount: 0,
      verifiedPackages: verificationPackages
    };
  }

  // APPLY MODE: Enforce atomic MongoDB transaction
  console.log('\n3. Initializing MongoDB transaction for atomic apply...');

  // Topology check: MongoDB transactions strictly require a replica set or mongos
  const topologyType = conn.client?.topology?.description?.type;
  if (topologyType === 'Single') {
    throw new Error(
      '[TRANSACTION FATAL] Current MongoDB connection is standalone ("Single"). ' +
      'Multi-document transactions require a ReplicaSet. Aborting rather than executing non-atomic writes.'
    );
  }

  const session = await conn.startSession();
  session.startTransaction();

  try {
    console.log('   - Transaction started successfully.');
    const reconciledResults = [];

    for (const pkg of verificationPackages) {
      const { target } = pkg;

      // Re-read documents within session to guarantee isolation
      const modelInTx = await Model.findById(target.id).session(session);
      const versionInTx = await ModelVersion.findById(target.expectedVersionId).session(session);
      const evalCountInTx = await Evaluation.countDocuments({ modelId: target.id }).session(session);
      const approvalCountInTx = await Approval.countDocuments({ modelId: target.id }).session(session);
      const deployCountInTx = await Deployment.countDocuments({ modelId: target.id }).session(session);

      validatePreconditions({
        model: modelInTx,
        version: versionInTx,
        evalCount: evalCountInTx,
        approvalCount: approvalCountInTx,
        deploymentCount: deployCountInTx,
        targetConfig: target
      });

      // Apply consistent non-production draft mutations
      modelInTx.lifecycleStatus = 'DRAFT';
      modelInTx.currentProductionVersionId = null;
      if (!modelInTx.apiConfig) {
        modelInTx.apiConfig = { status: 'DISCONNECTED' };
      } else {
        modelInTx.apiConfig.status = 'DISCONNECTED';
      }
      await modelInTx.save({ session });

      versionInTx.lifecycleStatus = 'DRAFT';
      versionInTx.deploymentStatus = 'NOT_DEPLOYED';
      versionInTx.policyStatus = 'PENDING';
      versionInTx.approvalStatus = 'NOT_REQUESTED';
      versionInTx.evaluationStatus = 'NOT_EVALUATED';
      versionInTx.deployedAt = null;
      versionInTx.deploymentRef = null;
      await versionInTx.save({ session });

      // Record truthful, dedicated reconciliation audit event for ModelVersion
      await auditWriter({
        actor: 'Sentinel Governance Maintenance Script',
        role: 'PLATFORM_ADMIN',
        action: 'GOVERNANCE_RECONCILIATION',
        entityType: 'ModelVersion',
        entityId: String(versionInTx._id),
        payload: {
          modelId: String(modelInTx._id),
          modelName: modelInTx.name,
          versionId: String(versionInTx._id),
          version: versionInTx.version,
          previousStatus: 'IN_PRODUCTION',
          newStatus: 'DRAFT',
          previousDeploymentStatus: 'IN_PRODUCTION',
          newDeploymentStatus: 'NOT_DEPLOYED',
          previousPolicyStatus: 'PASSED',
          newPolicyStatus: 'PENDING',
          previousApprovalStatus: 'APPROVED',
          newApprovalStatus: 'NOT_REQUESTED',
          reconciliationType: 'LEGACY_SEED_RECONCILIATION',
          rationale: 'Administrative reconciliation: resetting unverified legacy seed status to DRAFT to enforce legitimate policy evaluation, required approvals, and stage-gate progression.'
        },
        session
      });

      // Record truthful, dedicated reconciliation audit event for Model
      await auditWriter({
        actor: 'Sentinel Governance Maintenance Script',
        role: 'PLATFORM_ADMIN',
        action: 'GOVERNANCE_RECONCILIATION',
        entityType: 'Model',
        entityId: String(modelInTx._id),
        payload: {
          modelId: String(modelInTx._id),
          modelName: modelInTx.name,
          previousStatus: 'IN_PRODUCTION',
          newStatus: 'DRAFT',
          previousProductionVersionId: String(target.expectedVersionId),
          newProductionVersionId: null,
          reconciliationType: 'LEGACY_SEED_RECONCILIATION',
          rationale: 'Administrative reconciliation: removed unverified production pointer and aligned model lifecycle status with version DRAFT baseline.'
        },
        session
      });

      reconciledResults.push({
        modelId: modelInTx._id,
        modelName: modelInTx.name,
        versionId: versionInTx._id
      });

      console.log(`   ✓ Reconciled within transaction: ${modelInTx.name}`);
    }

    // Verify audit chain integrity within the transaction prior to commit
    console.log('\n4. Verifying cryptographic audit chain integrity within transaction...');
    const chainCheck = await auditVerifier({ session });
    if (!chainCheck.valid) {
      throw new Error(`[AUDIT INTEGRITY FAILED] Chain validation failed: ${chainCheck.message}. Aborting transaction.`);
    }
    console.log(`   ✓ Cryptographic audit chain verified (${chainCheck.totalBlocks} total blocks).`);

    // Commit atomic transaction
    await session.commitTransaction();
    console.log('\n5. Transaction committed successfully. All changes are durable.');

    console.log('\n========================================================================');
    console.log('🎉 RECONCILIATION COMPLETED SUCCESSFULLY');
    console.log(`Reconciled models: ${reconciledResults.length}`);
    console.log('All documents preserved. Zero history lost.');
    console.log('========================================================================\n');

    return {
      success: true,
      mode: 'APPLY',
      reconciledCount: reconciledResults.length,
      reconciledResults
    };
  } catch (txError) {
    console.error('\n❌ [RECONCILIATION ERROR] Transaction aborted due to error:', txError.message);
    await session.abortTransaction();
    throw txError;
  } finally {
    await session.endSession();
  }
}

// Standalone execution entrypoint
const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMainModule) {
  const envPath = path.resolve(process.cwd(), 'backend/.env');
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
  } else {
    dotenv.config();
  }

  const isApply = process.argv.includes('--apply');

  async function main() {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      console.error('[FATAL] MONGODB_URI environment variable is required.');
      process.exit(1);
    }

    const maskedUri = uri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@');
    console.log(`Connecting to MongoDB at: ${maskedUri}`);

    await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
    try {
      await executeReconciliation({ isApply, mongooseInstance: mongoose });
    } finally {
      await mongoose.disconnect();
      console.log('Disconnected from MongoDB.');
    }
  }

  main().catch(err => {
    console.error('[FATAL ERROR]', err.message);
    process.exit(1);
  });
}
