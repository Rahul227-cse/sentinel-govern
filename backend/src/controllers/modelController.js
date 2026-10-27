import { Model } from '../models/Model.js';
import { ModelVersion } from '../models/ModelVersion.js';
import { Evaluation } from '../models/Evaluation.js';
import { Approval } from '../models/Approval.js';
import { Incident } from '../models/Incident.js';
import { Policy } from '../models/Policy.js';
import { recordAuditEvent } from '../services/auditEngine.js';
import { transitionVersionLifecycle, validateEndpointUrl, validateSafeEndpointUrl } from '../services/lifecycleService.js';
import { evaluatePolicyGates, evaluateEvaluationOutcome } from '../services/policyEngine.js';
import { 
  executeModelInference, 
  checkModelEndpointHealth,
  resolveEffectiveApiConfig,
  safeFetch,
  buildAuthHeaders,
  buildRequestBody,
  buildFullEndpointUrl,
  extractByPath
} from '../services/inferenceService.js';
import {
  parseAndValidateReferenceDataset,
  storeReferenceDatasetDurable
} from '../services/referenceDatasetService.js';

export async function getModels(req, res) {
  try {
    const { riskLevel, status, search } = req.query;
    const filter = {};

    if (riskLevel) filter.riskLevel = riskLevel;
    if (status) filter.lifecycleStatus = status;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { purpose: { $regex: search, $options: 'i' } }
      ];
    }

    const models = await Model.find(filter)
      .populate('currentProductionVersionId')
      .populate('createdBy', 'name email role')
      .sort({ updatedAt: -1 });

    res.json({ success: true, count: models.length, data: models });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

export async function getModelById(req, res) {
  try {
    const model = await Model.findById(req.params.id)
      .populate('currentProductionVersionId')
      .populate('createdBy', 'name email role');

    if (!model) {
      return res.status(404).json({ success: false, error: 'Model not found' });
    }

    const versions = await ModelVersion.find({ modelId: model._id })
      .populate('latestEvaluationId')
      .populate('createdBy', 'name email role')
      .sort({ createdAt: -1 });

    const incidents = await Incident.find({ modelId: model._id })
      .sort({ createdAt: -1 });

    let activePolicy = null;
    if (model.policyId) {
      activePolicy = await Policy.findById(model.policyId);
    }
    if (!activePolicy) {
      activePolicy = await Policy.findOne({
        $or: [
          { applicableModelIds: model._id },
          { applicableModelId: model._id }
        ],
        isActive: true
      });
    }

    // Find all policies associated with this model
    const applicablePolicies = await Policy.find({
      $or: [
        ...(model.policyId ? [{ _id: model.policyId }] : []),
        { applicableModelIds: model._id },
        { applicableModelId: model._id }
      ],
      isActive: true
    });

    res.json({
      success: true,
      data: {
        model,
        versions,
        incidents,
        activePolicy,
        applicablePolicies
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

export async function createModel(req, res) {
  try {
    const {
      name,
      description,
      purpose,
      owner,
      team,
      modelType,
      riskLevel = 'HIGH',
      intendedUsers = [],
      protectedAttributes = ['gender', 'age'],
      policyId = null,
      initialVersion = 'v1.0',
      initialChangelog = 'Initial model architecture and baseline training',
      riskAssessment = {}
    } = req.body;

    if (!name || !description || !purpose || !team) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: name, description, purpose, team'
      });
    }

    const existing = await Model.findOne({ name });
    if (existing) {
      return res.status(409).json({
        success: false,
        error: `Model with name "${name}" already exists`
      });
    }

    // Owner: preserve provided owner (e.g. from seed/demo or form) or default to authenticated user
    const resolvedOwner = owner || (req.user ? (req.user.name || req.user.email) : 'ML Lead');
    // createdBy: strictly populated from authenticated user context, never from client body
    const createdBy = req.user ? req.user._id : null;
    const actor = req.user ? (req.user.name || req.user.email) : resolvedOwner;
    const role = req.user ? req.user.role : 'ML_LEAD';

    const model = await Model.create({
      name,
      description,
      purpose,
      owner: resolvedOwner,
      team,
      modelType,
      riskLevel,
      intendedUsers,
      protectedAttributes,
      policyId: policyId || null,
      createdBy,
      riskAssessment: {
        prohibitedPracticesChecked: riskAssessment.prohibitedPracticesChecked ?? true,
        euAiActClassification: riskAssessment.euAiActClassification ?? riskLevel,
        safetyImpactRating: riskAssessment.safetyImpactRating ?? 'High Significance',
        autonomyLevel: riskAssessment.autonomyLevel ?? 'Human-in-the-loop',
        frameworkAlignment: riskAssessment.frameworkAlignment ?? ['EU_AI_ACT_ANNEX_III', 'NIST_AI_RMF_GOVERN'],
        assessmentNotes: riskAssessment.assessmentNotes ?? 'AI governance risk assessment aligned with selected regulatory concepts.',
        assessedAt: new Date(),
        assessedBy: resolvedOwner
      }
    });

    // Automatically create initial version in DRAFT state
    const version = await ModelVersion.create({
      modelId: model._id,
      version: initialVersion,
      changelog: initialChangelog,
      lifecycleStatus: 'DRAFT',
      createdBy,
      trainingDatasetInfo: {
        name: `${name} Baseline Dataset`,
        sampleCount: 50000,
        featureCount: 28,
        dateRange: '2025-01 to 2025-12',
        dataHash: `sha256-${Date.now().toString(16)}`
      }
    });

    // Record audit event
    await recordAuditEvent({
      actor,
      role,
      action: 'MODEL_CREATED',
      entityType: 'Model',
      entityId: model._id,
      payload: {
        modelId: String(model._id),
        modelName: model.name,
        name: model.name,
        riskLevel: model.riskLevel,
        initialVersionId: String(version._id),
        initialVersion: version.version,
        purpose: model.purpose,
        createdBy: req.user?.email || null
      }
    });

    // Notify ML Leads / reviewers about new model registration
    try {
      const { dispatchNotification } = await import('../services/notificationService.js');
      await dispatchNotification({
        recipientRole: 'ML_LEAD',
        excludeUserId: req.user?._id,
        title: `Model registered: ${model.name}`,
        message: `New model "${model.name}" (${version.version}) has been registered by ${actor} and is ready for technical evaluation.`,
        type: 'MODEL_REGISTERED',
        severity: 'INFO',
        targetUrl: `/app/models/${model._id}`,
        modelId: model._id,
        versionId: version._id,
        idempotencyKey: `model_created_${model._id}`,
        actor
      });
    } catch (notifErr) {
      console.warn('[Notification] Model created notification warning:', notifErr.message);
    }


    res.status(201).json({
      success: true,
      data: { model, version }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

export async function createModelVersion(req, res) {
  try {
    const { modelId } = req.params;
    const { version, changelog, trainingDatasetInfo, artifactReference } = req.body;

    const model = await Model.findById(modelId);
    if (!model) {
      return res.status(404).json({ success: false, error: 'Model not found' });
    }

    const existingVersion = await ModelVersion.findOne({ modelId, version });
    if (existingVersion) {
      return res.status(409).json({
        success: false,
        error: `Version ${version} already exists for this model`
      });
    }

    // Created by authenticated user, not trusting arbitrary client-supplied creator
    const createdBy = req.user ? req.user._id : null;
    const actor = req.user ? (req.user.name || req.user.email) : model.owner;
    const role = req.user ? req.user.role : 'ML_LEAD';

    const newVersion = await ModelVersion.create({
      modelId,
      version,
      changelog: changelog || `Version ${version} iteration`,
      artifactReference: artifactReference || `artifacts/${model.name.toLowerCase().replace(/\s+/g, '_')}_${version}.bin`,
      trainingDatasetInfo: trainingDatasetInfo || {
        name: `${model.name} Enhanced Dataset`,
        sampleCount: 65000,
        featureCount: 30,
        dateRange: '2025-06 to 2026-02',
        dataHash: `sha256-${Date.now().toString(16)}`
      },
      lifecycleStatus: 'DRAFT',
      createdBy
    });

    await recordAuditEvent({
      actor,
      role,
      action: 'VERSION_CREATED',
      entityType: 'ModelVersion',
      entityId: newVersion._id,
      payload: {
        modelId: String(model._id),
        modelName: model.name,
        versionId: String(newVersion._id),
        version: newVersion.version,
        changelog: newVersion.changelog,
        createdBy: req.user?.email || null
      }
    });

    // Notify ML Leads / reviewers about new version creation
    try {
      const { dispatchNotification } = await import('../services/notificationService.js');
      await dispatchNotification({
        recipientRole: 'ML_LEAD',
        excludeUserId: req.user?._id,
        title: `New version registered: ${model.name} ${newVersion.version}`,
        message: `Version ${newVersion.version} for model "${model.name}" has been created and is ready for validation.`,
        type: 'MODEL_REGISTERED',
        severity: 'INFO',
        targetUrl: `/app/models/${model._id}`,
        modelId: model._id,
        versionId: newVersion._id,
        idempotencyKey: `version_created_${newVersion._id}`,
        actor
      });
    } catch (notifErr) {
      console.warn('[Notification] Version created notification warning:', notifErr.message);
    }


    res.status(201).json({ success: true, data: newVersion });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

export async function updateModelRisk(req, res) {
  try {
    const { id } = req.params;
    const { riskLevel, riskAssessment } = req.body;
    const actor = req.user ? (req.user.name || req.user.email) : (req.body.actor || 'Governance Officer');
    const role = req.user ? req.user.role : (req.body.role || 'GOVERNANCE_OFFICER');

    const model = await Model.findById(id);
    if (!model) {
      return res.status(404).json({ success: false, error: 'Model not found' });
    }

    const oldRisk = model.riskLevel;
    if (riskLevel) model.riskLevel = riskLevel;

    if (riskAssessment) {
      model.riskAssessment = {
        ...model.riskAssessment?.toObject(),
        ...riskAssessment,
        assessedAt: new Date(),
        assessedBy: actor
      };
    }

    await model.save();

    await recordAuditEvent({
      actor,
      role,
      action: 'RISK_ASSESSED',
      entityType: 'Model',
      entityId: model._id,
      payload: {
        modelId: String(model._id),
        modelName: model.name,
        previousRiskLevel: oldRisk,
        newRiskLevel: model.riskLevel,
        assessmentNotes: model.riskAssessment.assessmentNotes
      }
    });


    res.json({ success: true, data: model });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

export async function transitionLifecycle(req, res) {
  try {
    const { versionId } = req.params;
    const { targetStatus, rationale } = req.body;

    if (!targetStatus) {
      return res.status(400).json({ success: false, error: 'targetStatus is required' });
    }

    const actor = req.user ? (req.user.name || req.user.email) : (req.body.actor || 'Governance User');
    const role = req.user ? req.user.role : (req.body.role || 'ML_LEAD');

    const updatedVersion = await transitionVersionLifecycle({
      versionId,
      targetStatus,
      actor,
      role,
      rationale: rationale || ''
    });

    res.json({ success: true, data: updatedVersion });
  } catch (error) {
    // 400 Bad Request indicates a policy/governance gate rejection
    res.status(400).json({
      success: false,
      error: error.message,
      gateBlocked: true
    });
  }
}

export async function updateModelPolicy(req, res) {
  try {
    const { id } = req.params;
    const { policyId } = req.body;
    const actor = req.user ? (req.user.name || req.user.email) : 'Governance Officer';
    const role = req.user ? req.user.role : 'GOVERNANCE_OFFICER';

    const model = await Model.findById(id);
    if (!model) {
      return res.status(404).json({ success: false, error: 'Model not found' });
    }

    let targetPolicy = null;
    if (policyId) {
      targetPolicy = await Policy.findById(policyId);
      if (!targetPolicy) {
        return res.status(404).json({ success: false, error: 'Target policy not found' });
      }
    }

    const previousPolicyId = model.policyId;
    model.policyId = policyId || null;
    await model.save();

    // Synchronize Policy applicableModelIds
    if (targetPolicy) {
      await Policy.findByIdAndUpdate(targetPolicy._id, {
        $addToSet: { applicableModelIds: model._id }
      });
    }

    if (previousPolicyId && String(previousPolicyId) !== String(policyId)) {
      await Policy.findByIdAndUpdate(previousPolicyId, {
        $pull: { applicableModelIds: model._id }
      });
    }

    // Reassess any versions that have existing evaluations against the newly assigned policy
    const versions = await ModelVersion.find({ modelId: model._id });
    const reassessedVersions = [];

    for (const version of versions) {
      const evaluation = version.latestEvaluationId
        ? await Evaluation.findById(version.latestEvaluationId)
        : await Evaluation.findOne({ versionId: version._id }).sort({ evaluatedAt: -1 });

      if (evaluation) {
        let policyDecision = null;
        let evaluationPassed = false;

        if (targetPolicy) {
          policyDecision = evaluatePolicyGates({
            policy: targetPolicy,
            evaluation,
            modelVersion: version,
            model
          });
          evaluationPassed = (
            policyDecision?.gateBreakdown?.fairnessGate?.status === 'PASSED' &&
            policyDecision?.gateBreakdown?.performanceGate?.status === 'PASSED'
          );
        } else {
          policyDecision = {
            passed: false,
            overallDecision: 'BLOCKED',
            noPolicyAssigned: true,
            reasons: [`No governance policy assigned to model "${model.name}". A Governance Officer must assign an active governance policy.`],
            evaluations: []
          };
          const evalOutcome = evaluateEvaluationOutcome({ evaluation });
          evaluationPassed = evalOutcome.passed;
        }

        version.latestEvaluationId = evaluation._id;
        version.evaluationStatus = evaluationPassed ? 'EVALUATED_PASS' : 'EVALUATED_FAIL';
        version.policyStatus = policyDecision?.passed ? 'PASSED' : 'FAILED';
        version.latestPolicyEvaluation = policyDecision;
        await version.save();

        reassessedVersions.push({
          versionId: String(version._id),
          version: version.version,
          policyStatus: version.policyStatus,
          evaluationStatus: version.evaluationStatus,
          overallDecision: policyDecision?.overallDecision
        });
      }
    }

    await recordAuditEvent({
      actor,
      role,
      action: policyId ? 'MODEL_POLICY_ASSIGNED' : 'MODEL_POLICY_UNASSIGNED',
      entityType: 'Model',
      entityId: model._id,
      payload: {
        modelId: String(model._id),
        modelName: model.name,
        previousPolicyId: previousPolicyId ? String(previousPolicyId) : null,
        newPolicyId: policyId ? String(policyId) : null,
        policyName: targetPolicy ? targetPolicy.name : null,
        reassessedVersions: reassessedVersions.length,
        versionDetails: reassessedVersions
      }
    });

    res.json({
      success: true,
      data: {
        model,
        activePolicy: targetPolicy,
        reassessedVersions
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * Compares all versions of a governed model for evidence-based decision making and rollback analysis.
 */
export async function compareModelVersions(req, res) {
  try {
    const { modelId } = req.params;
    const model = await Model.findById(modelId);
    if (!model) {
      return res.status(404).json({ success: false, error: 'Model not found' });
    }

    const versions = await ModelVersion.find({ modelId: model._id })
      .populate('latestEvaluationId')
      .sort({ createdAt: -1 });

    const currentProdId = model.currentProductionVersionId ? String(model.currentProductionVersionId) : null;

    const versionComparisons = versions.map((v) => {
      const isCurrentProduction = currentProdId === String(v._id);
      const isRollbackEligible = v.policyStatus === 'PASSED' &&
        ['APPROVED', 'IN_PRODUCTION', 'RETIRED'].includes(v.deploymentStatus) ||
        ['APPROVED', 'RETIRED', 'DEPRECATED'].includes(v.lifecycleStatus);

      const evalData = v.latestEvaluationId;
      const metrics = evalData?.performanceMetrics ? {
        accuracy: evalData.performanceMetrics.accuracy,
        rocAuc: evalData.performanceMetrics.rocAuc,
        precision: evalData.performanceMetrics.precision,
        recall: evalData.performanceMetrics.recall,
        f1: evalData.performanceMetrics.f1
      } : null;

      const fairness = evalData?.fairnessMetrics ? {
        disparateImpactRatio: evalData.fairnessMetrics.disparateImpactRatio,
        demographicParityDiff: evalData.fairnessMetrics.demographicParityDiff,
        protectedAttribute: evalData.fairnessMetrics.protectedAttribute
      } : null;

      return {
        _id: v._id,
        version: v.version,
        changelog: v.changelog,
        lifecycleStatus: v.lifecycleStatus,
        deploymentStatus: v.deploymentStatus,
        policyStatus: v.policyStatus,
        approvalStatus: v.approvalStatus,
        isCurrentProduction,
        isRollbackEligible,
        evaluationStatus: v.evaluationStatus,
        metrics,
        fairness,
        trainingDataset: v.trainingDatasetInfo,
        deployedAt: v.deployedAt,
        createdAt: v.createdAt
      };
    });

    res.json({
      success: true,
      data: {
        model: {
          _id: model._id,
          name: model.name,
          riskLevel: model.riskLevel,
          lifecycleStatus: model.lifecycleStatus
        },
        currentProductionVersionId: currentProdId,
        versions: versionComparisons,
        rollbackRecommendations: versionComparisons.filter(v => !v.isCurrentProduction && v.isRollbackEligible)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * Connects or updates model or version API endpoint configuration.
 * Supports model-level configuration and version-level overrides.
 * Validates endpoint URL for SSRF, configures adapter, and performs dynamic health probe.
 * Masks authentication secrets from response.
 */
export async function updateModelApiConfig(req, res) {
  try {
    const modelId = req.params.modelId || req.params.id;
    const versionId = req.params.versionId || req.body.versionId;
    const {
      endpointUrl,
      healthEndpoint = '',
      predictEndpoint = '',
      method = 'POST',
      authType = 'NONE',
      authHeaderName,
      authHeaderValue,
      requestMapping,
      responseMapping,
      timeoutMs = 30000,
      maxRetries = 2,
      clearOverride = false
    } = req.body;

    const model = await Model.findById(modelId).select('+apiConfig.authHeaderValue');
    if (!model) {
      return res.status(404).json({ success: false, error: 'Model not found' });
    }

    // ── Version-Level Override Branch ──────────────────────────────────────────
    if (versionId) {
      const version = await ModelVersion.findById(versionId).select('+apiConfig.authHeaderValue');
      if (!version) {
        return res.status(404).json({ success: false, error: 'Model version not found' });
      }
      if (String(version.modelId) !== String(model._id)) {
        return res.status(400).json({ success: false, error: 'Target version does not belong to specified model' });
      }

      // Revert version override if clearOverride is requested
      if (clearOverride) {
        version.apiConfig = null;
        version.markModified('apiConfig');
        await version.save();

        await recordAuditEvent({
          actor: req.user ? (req.user.name || req.user.email) : 'ML Lead',
          role: req.user ? req.user.role : 'ML_LEAD',
          action: 'VERSION_CONFIG_CLEARED',
          entityType: 'ModelVersion',
          entityId: version._id,
          payload: {
            modelId: String(model._id),
            versionId: String(version._id),
            version: version.version,
            message: 'Version endpoint override removed. Inheriting from parent model.'
          }
        });

        const effective = resolveEffectiveApiConfig(model.apiConfig, null);
        const modelConfigOut = model.apiConfig ? model.apiConfig.toObject() : {};
        delete modelConfigOut.authHeaderValue;

        return res.json({
          success: true,
          data: {
            modelId: model._id,
            versionId: version._id,
            scope: 'VERSION',
            isOverridden: false,
            modelApiConfig: {
              ...modelConfigOut,
              hasAuthSecret: Boolean(model.apiConfig?.authHeaderValue)
            },
            versionApiConfig: null,
            effectiveApiConfig: effective
          }
        });
      }

      if (!endpointUrl || typeof endpointUrl !== 'string' || !endpointUrl.trim()) {
        return res.status(400).json({ success: false, error: 'endpointUrl is required and must be a non-empty string' });
      }

      const cleanBaseUrl = endpointUrl.trim().replace(/\/+$/, '');
      await validateSafeEndpointUrl(cleanBaseUrl, { allowLocal: process.env.NODE_ENV !== 'production' });

      // Preserve existing version secret if caller submitted empty string, null, or masked indicator ('***')
      let resolvedAuthHeaderValue = version.apiConfig?.authHeaderValue || '';
      if (authHeaderValue !== undefined && authHeaderValue !== null) {
        const trimmedVal = String(authHeaderValue).trim();
        if (trimmedVal && trimmedVal !== '***' && !trimmedVal.startsWith('••••')) {
          resolvedAuthHeaderValue = trimmedVal;
        }
      }

      const resolvedAuthType = ['NONE', 'BEARER', 'API_KEY', 'CUSTOM_HEADER'].includes(authType) ? authType : 'NONE';
      if (resolvedAuthType === 'NONE') {
        resolvedAuthHeaderValue = '';
      }

      const cleanPredict = (predictEndpoint || '').trim().replace(/^\/+/, '');
      const cleanHealth = (healthEndpoint || '').trim().replace(/^\/+/, '');

      version.apiConfig = {
        endpointUrl: cleanBaseUrl,
        healthEndpoint: cleanHealth ? `/${cleanHealth}` : '',
        predictEndpoint: cleanPredict ? `/${cleanPredict}` : '',
        method: ['GET', 'POST'].includes(method?.toUpperCase()) ? method.toUpperCase() : 'POST',
        authType: resolvedAuthType,
        authHeaderName: (authHeaderName || '').trim(),
        authHeaderValue: resolvedAuthHeaderValue,
        requestMapping: requestMapping || {},
        responseMapping: {
          predictionField: responseMapping?.predictionField || '',
          latencyField: responseMapping?.latencyField || ''
        },
        timeoutMs: Math.min(Math.max(Number(timeoutMs) || 30000, 1000), 60000),
        maxRetries: Number(maxRetries) !== undefined ? Number(maxRetries) : 2
      };

      version.markModified('apiConfig');
      await version.save();

      await recordAuditEvent({
        actor: req.user ? (req.user.name || req.user.email) : 'ML Lead',
        role: req.user ? req.user.role : 'ML_LEAD',
        action: 'VERSION_CONFIG_UPDATED',
        entityType: 'ModelVersion',
        entityId: version._id,
        payload: {
          modelId: String(model._id),
          versionId: String(version._id),
          version: version.version,
          endpointUrl: cleanBaseUrl,
          predictEndpoint: version.apiConfig.predictEndpoint,
          authType: resolvedAuthType
        }
      });

      const effective = resolveEffectiveApiConfig(model.apiConfig, version.apiConfig);
      const versionConfigOut = version.apiConfig.toObject();
      delete versionConfigOut.authHeaderValue;

      const isOverridden = {
        endpointUrl: Boolean(version?.apiConfig?.endpointUrl),
        healthEndpoint: Boolean(version?.apiConfig?.healthEndpoint),
        predictEndpoint: Boolean(version?.apiConfig?.predictEndpoint),
        method: Boolean(version?.apiConfig?.method),
        authType: Boolean(version?.apiConfig?.authType),
        authHeaderName: Boolean(version?.apiConfig?.authHeaderName),
        authHeaderValue: Boolean(resolvedAuthHeaderValue),
        requestMapping: Boolean(version?.apiConfig?.requestMapping),
        responseMapping: Boolean(version?.apiConfig?.responseMapping?.predictionField),
        timeoutMs: Boolean(version?.apiConfig?.timeoutMs)
      };

      return res.json({
        success: true,
        data: {
          modelId: model._id,
          versionId: version._id,
          scope: 'VERSION',
          isOverridden,
          versionApiConfig: {
            ...versionConfigOut,
            hasAuthSecret: Boolean(resolvedAuthHeaderValue)
          },
          effectiveApiConfig: effective
        }
      });
    }

    // ── Model-Level Configuration Branch ───────────────────────────────────────
    if (!endpointUrl || typeof endpointUrl !== 'string' || !endpointUrl.trim()) {
      return res.status(400).json({ success: false, error: 'endpointUrl is required and must be a non-empty string' });
    }

    const cleanBaseUrl = endpointUrl.trim().replace(/\/+$/, '');
    await validateSafeEndpointUrl(cleanBaseUrl, { allowLocal: process.env.NODE_ENV !== 'production' });

    // Preserve existing secret if caller submitted empty string, null, or masked indicator ('***')
    let resolvedAuthHeaderValue = model.apiConfig?.authHeaderValue || '';
    if (authHeaderValue !== undefined && authHeaderValue !== null) {
      const trimmedVal = String(authHeaderValue).trim();
      if (trimmedVal && trimmedVal !== '***' && !trimmedVal.startsWith('••••')) {
        resolvedAuthHeaderValue = trimmedVal;
      }
    }

    // If authType is NONE, clear the secret
    const resolvedAuthType = ['NONE', 'BEARER', 'API_KEY', 'CUSTOM_HEADER'].includes(authType) ? authType : 'NONE';
    if (resolvedAuthType === 'NONE') {
      resolvedAuthHeaderValue = '';
    }

    const cleanPredict = (predictEndpoint || '').trim().replace(/^\/+/, '');
    const cleanHealth = (healthEndpoint || '').trim().replace(/^\/+/, '');

    model.apiConfig = {
      endpointUrl: cleanBaseUrl,
      healthEndpoint: cleanHealth ? `/${cleanHealth}` : '',
      predictEndpoint: cleanPredict ? `/${cleanPredict}` : '',
      method: ['GET', 'POST'].includes(method?.toUpperCase()) ? method.toUpperCase() : 'POST',
      authType: resolvedAuthType,
      authHeaderName: (authHeaderName || '').trim(),
      authHeaderValue: resolvedAuthHeaderValue,
      requestMapping: requestMapping || {},
      responseMapping: {
        predictionField: responseMapping?.predictionField || '',
        latencyField: responseMapping?.latencyField || ''
      },
      timeoutMs: Math.min(Math.max(Number(timeoutMs) || 30000, 1000), 60000),
      maxRetries: Math.min(Math.max(Number(maxRetries) || 2, 0), 3),
      status: 'CONFIGURATION_REQUIRED',
      lastCheckedAt: null,
      lastResponseTimeMs: null,
      lastError: null
    };

    await model.save();

    // Perform dynamic health probe
    let healthResult = null;
    try {
      healthResult = await checkModelEndpointHealth(model._id);
    } catch (healthErr) {
      healthResult = { status: 'UNAVAILABLE', error: healthErr.message };
    }

    // Refresh model to read updated state without exposing auth secret
    const updatedModel = await Model.findById(modelId);

    await recordAuditEvent({
      actor: req.user ? (req.user.name || req.user.email) : 'ML Lead',
      role: req.user ? req.user.role : 'ML_LEAD',
      action: 'MODEL_CONFIG_UPDATED',
      entityType: 'Model',
      entityId: model._id,
      payload: {
        modelId: String(model._id),
        modelName: model.name,
        endpointUrl: cleanBaseUrl,
        predictEndpoint: model.apiConfig.predictEndpoint,
        authType: resolvedAuthType,
        status: updatedModel.apiConfig.status,
        lastResponseTimeMs: updatedModel.apiConfig.lastResponseTimeMs
      }
    });

    const apiConfigOutput = updatedModel.apiConfig.toObject();
    delete apiConfigOutput.authHeaderValue;

    res.json({
      success: true,
      data: {
        modelId: updatedModel._id,
        scope: 'MODEL',
        apiConfig: {
          ...apiConfigOutput,
          hasAuthSecret: Boolean(resolvedAuthHeaderValue)
        },
        healthResult
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * Retrieves endpoint configuration and inheritance metadata for a model and optional version.
 * GET /models/:id/endpoint?versionId=...
 */
export async function getModelEndpointConfig(req, res) {
  try {
    const modelId = req.params.modelId || req.params.id;
    const { versionId } = req.query;

    const model = await Model.findById(modelId).select('+apiConfig.authHeaderValue');
    if (!model) {
      return res.status(404).json({ success: false, error: 'Model not found' });
    }

    let version = null;
    if (versionId) {
      version = await ModelVersion.findById(versionId).select('+apiConfig.authHeaderValue');
      if (version && String(version.modelId) !== String(model._id)) {
        return res.status(400).json({ success: false, error: 'Target version does not belong to specified model' });
      }
    }

    const effectiveConfig = resolveEffectiveApiConfig(model.apiConfig, version?.apiConfig);

    const modelConfigOut = model.apiConfig ? model.apiConfig.toObject() : {};
    const hasModelAuthSecret = Boolean(modelConfigOut.authHeaderValue);
    delete modelConfigOut.authHeaderValue;

    let versionConfigOut = null;
    let hasVersionAuthSecret = false;
    if (version?.apiConfig) {
      versionConfigOut = version.apiConfig.toObject();
      hasVersionAuthSecret = Boolean(versionConfigOut.authHeaderValue);
      delete versionConfigOut.authHeaderValue;
    }

    const isOverridden = {
      endpointUrl: Boolean(version?.apiConfig?.endpointUrl),
      healthEndpoint: Boolean(version?.apiConfig?.healthEndpoint),
      predictEndpoint: Boolean(version?.apiConfig?.predictEndpoint),
      method: Boolean(version?.apiConfig?.method),
      authType: Boolean(version?.apiConfig?.authType),
      authHeaderName: Boolean(version?.apiConfig?.authHeaderName),
      authHeaderValue: hasVersionAuthSecret,
      requestMapping: Boolean(version?.apiConfig?.requestMapping),
      responseMapping: Boolean(version?.apiConfig?.responseMapping?.predictionField),
      timeoutMs: Boolean(version?.apiConfig?.timeoutMs)
    };

    res.json({
      success: true,
      data: {
        modelId: model._id,
        modelName: model.name,
        versionId: version?._id || null,
        versionNumber: version?.version || null,
        modelApiConfig: {
          ...modelConfigOut,
          hasAuthSecret: hasModelAuthSecret
        },
        versionApiConfig: versionConfigOut ? {
          ...versionConfigOut,
          hasAuthSecret: hasVersionAuthSecret
        } : null,
        effectiveApiConfig: {
          ...effectiveConfig,
          hasAuthSecret: hasVersionAuthSecret || hasModelAuthSecret
        },
        isOverridden
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * Tests live connection for in-flight endpoint configuration without persisting changes.
 * Supports Health Check and Prediction Smoke Tests.
 * POST /models/:id/test-connection
 */
export async function testEndpointConnection(req, res) {
  try {
    const modelId = req.params.modelId || req.params.id;
    const {
      versionId,
      endpointUrl,
      healthEndpoint = '',
      predictEndpoint = '',
      method = 'POST',
      authType = 'NONE',
      authHeaderName,
      authHeaderValue,
      requestMapping,
      responseMapping,
      timeoutMs = 8000,
      testType = 'HEALTH', // 'HEALTH' | 'PREDICTION'
      testPayload
    } = req.body;

    const model = await Model.findById(modelId).select('+apiConfig.authHeaderValue');
    if (!model) {
      return res.status(404).json({ success: false, error: 'Model not found' });
    }

    let version = null;
    if (versionId) {
      version = await ModelVersion.findById(versionId).select('+apiConfig.authHeaderValue');
      if (!version || String(version.modelId) !== String(model._id)) {
        return res.status(400).json({ success: false, error: 'Target version does not exist or does not belong to the model' });
      }
    }

    if (!endpointUrl || typeof endpointUrl !== 'string' || !endpointUrl.trim()) {
      return res.status(400).json({ success: false, error: 'endpointUrl is required for testing connection' });
    }

    const cleanBaseUrl = endpointUrl.trim().replace(/\/+$/, '');
    await validateSafeEndpointUrl(cleanBaseUrl, { allowLocal: process.env.NODE_ENV !== 'production' });

    // Secret resolution: if blank or masked, use saved secret from version (if available) or model
    let resolvedSecret = (authHeaderValue || '').trim();
    if (!resolvedSecret || resolvedSecret === '***' || resolvedSecret.startsWith('••••')) {
      resolvedSecret = (version?.apiConfig?.authHeaderValue || model.apiConfig?.authHeaderValue || '').trim();
    }
    if (authType === 'NONE') {
      resolvedSecret = '';
    }

    const configForTest = {
      authType,
      authHeaderName,
      authHeaderValue: resolvedSecret
    };
    const authHeaders = buildAuthHeaders(configForTest);
    const allowLocal = process.env.NODE_ENV !== 'production';
    const safeTimeoutMs = Math.min(Math.max(Number(timeoutMs) || 8000, 1000), 30000);

    // ── Prediction Smoke Test ──────────────────────────────────────────────────
    if (testType === 'PREDICTION') {
      const targetPredictPath = (predictEndpoint || '').trim().replace(/^\/+/, '');
      const targetUrl = buildFullEndpointUrl(cleanBaseUrl, targetPredictPath);

      const customHeaders = requestMapping?.customHeaders || {};
      const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...customHeaders,
        ...authHeaders
      };

      const formattedPayload = buildRequestBody(testPayload || {}, requestMapping, configForTest);
      const httpMethod = ['GET', 'POST'].includes(method?.toUpperCase()) ? method.toUpperCase() : 'POST';
      const body = httpMethod === 'GET' ? undefined : JSON.stringify(formattedPayload);

      const t0 = Date.now();
      const response = await safeFetch(
        targetUrl,
        {
          method: httpMethod,
          headers,
          body,
          signal: AbortSignal.timeout(safeTimeoutMs)
        },
        { allowLocal }
      );
      const latencyMs = Date.now() - t0;

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        return res.json({
          success: false,
          testType: 'PREDICTION',
          statusCode: response.status,
          latencyMs,
          message: `Prediction endpoint returned HTTP ${response.status}`,
          error: errText.slice(0, 300)
        });
      }

      const rawResponse = await response.json().catch(() => ({}));

      let prediction = null;
      let predictionExtracted = false;
      let extractionError = null;

      const configuredField = responseMapping?.predictionField;
      if (typeof rawResponse !== 'object' && rawResponse !== null && rawResponse !== undefined) {
        // Direct prediction value (primitive string, number, boolean)
        prediction = rawResponse;
        predictionExtracted = true;
      } else if (configuredField && configuredField.trim()) {
        const extracted = extractByPath(rawResponse, configuredField.trim());
        if (extracted !== undefined) {
          prediction = extracted;
          predictionExtracted = true;
        } else if (rawResponse && typeof rawResponse === 'object' && rawResponse.probability_of_default !== undefined) {
          prediction = rawResponse.probability_of_default;
          predictionExtracted = true;
        } else if (rawResponse && typeof rawResponse === 'object' && rawResponse.decision !== undefined) {
          // Graceful fallback to decision if configured field not found in object
          prediction = rawResponse.decision;
          predictionExtracted = true;
        } else if (rawResponse && typeof rawResponse === 'object' && rawResponse.prediction !== undefined) {
          prediction = rawResponse.prediction;
          predictionExtracted = true;
        } else if (rawResponse && typeof rawResponse === 'object' && rawResponse.result !== undefined) {
          prediction = rawResponse.result;
          predictionExtracted = true;
        } else {
          extractionError = `Configured prediction field "${configuredField.trim()}" not found in response`;
        }
      } else {
        if (typeof rawResponse !== 'object' || rawResponse === null) {
          prediction = rawResponse;
          predictionExtracted = true;
        } else if (rawResponse.probability_of_default !== undefined) {
          prediction = rawResponse.probability_of_default;
          predictionExtracted = true;
        } else if (rawResponse.prediction !== undefined) {
          prediction = rawResponse.prediction;
          predictionExtracted = true;
        } else if (rawResponse.decision !== undefined) {
          prediction = rawResponse.decision;
          predictionExtracted = true;
        } else if (rawResponse.result !== undefined) {
          prediction = rawResponse.result;
          predictionExtracted = true;
        } else {
          extractionError = 'No predictionField configured and response has no standard "prediction" or "decision" field';
        }
      }

      return res.json({
        success: predictionExtracted,
        testType: 'PREDICTION',
        targetUrl,
        statusCode: response.status,
        latencyMs,
        prediction,
        extractedPrediction: prediction,
        predictionExtracted,
        rawResponse,
        message: predictionExtracted 
          ? `Prediction smoke test passed (${latencyMs}ms). Output: ${JSON.stringify(prediction)}`
          : `Prediction endpoint reached (HTTP ${response.status}), but extraction failed: ${extractionError}`,
        extractionError
      });
    }

    // ── Health Check Probe ─────────────────────────────────────────────────────
    const targetHealthPath = (healthEndpoint || '').trim().replace(/^\/+/, '') || 'health';
    const targetUrl = buildFullEndpointUrl(cleanBaseUrl, targetHealthPath);

    const t0 = Date.now();
    const response = await safeFetch(
      targetUrl,
      {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          ...authHeaders
        },
        signal: AbortSignal.timeout(safeTimeoutMs)
      },
      { allowLocal }
    );
    const latencyMs = Date.now() - t0;

    let details = {};
    try {
      details = await response.json();
    } catch {
      details = {};
    }

    return res.json({
      success: response.ok,
      testType: 'HEALTH',
      targetUrl,
      statusCode: response.status,
      latencyMs,
      details,
      message: response.ok 
        ? `Health check passed (${latencyMs}ms). HTTP ${response.status}`
        : `Health check failed with HTTP ${response.status}`
    });
  } catch (error) {
    const isTimeout = error.name === 'TimeoutError' || error.message.includes('timeout') || error.message.includes('aborted');
    return res.status(error.message.includes('SSRF BLOCKED') ? 400 : 502).json({
      success: false,
      error: isTimeout ? 'Connection timed out' : error.message,
      statusCode: isTimeout ? 504 : 502
    });
  }
}

/**
 * Retrieves all versions for a model.
 * GET /models/:modelId/versions
 */
export async function getModelVersions(req, res) {
  try {
    const modelId = req.params.modelId || req.params.id;
    const versions = await ModelVersion.find({ modelId }).sort({ createdAt: -1 });
    res.json({
      success: true,
      count: versions.length,
      data: versions
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * Invokes live inference against a registered model version via the dynamic inference engine.
 * POST /models/:id/predict
 */
export async function predictModel(req, res) {
  try {
    const { id } = req.params;
    const { versionId, inputPayload, allowDraft = false } = req.body;

    if (inputPayload === undefined || inputPayload === null) {
      return res.status(400).json({
        success: false,
        error: 'inputPayload is required for model inference'
      });
    }

    const result = await executeModelInference({
      modelId: id,
      versionId,
      inputPayload,
      options: { allowDraft: Boolean(allowDraft) }
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      success: false,
      error: error.message,
      code: error.code || undefined,
      rawResponse: error.rawResponse || undefined
    });
  }
}

/**
 * Performs an on-demand dynamic health probe against a model's configured endpoint.
 * POST /models/:id/probe
 */
export async function probeModelHealth(req, res) {
  try {
    const { id } = req.params;
    const healthResult = await checkModelEndpointHealth(id);
    res.json({
      success: true,
      data: healthResult
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Uploads, validates, and durably persists a reference CSV dataset for a ModelVersion.
 * POST /models/:modelId/versions/:versionId/reference-dataset
 */
export async function uploadReferenceDataset(req, res) {
  try {
    const { modelId, versionId } = req.params;
    const model = await Model.findById(modelId);
    if (!model) {
      return res.status(404).json({ success: false, error: 'Model not found' });
    }

    const version = await ModelVersion.findById(versionId);
    if (!version || String(version.modelId) !== String(model._id)) {
      return res.status(404).json({ success: false, error: 'ModelVersion not found or does not belong to specified model' });
    }

    if (!req.file || !req.file.buffer || req.file.buffer.length === 0) {
      return res.status(400).json({ success: false, error: 'Uploaded file is empty or missing.' });
    }

    const parsed = parseAndValidateReferenceDataset({
      buffer: req.file.buffer,
      filename: req.file.originalname
    });

    const storage = await storeReferenceDatasetDurable({
      modelId: model._id,
      versionId: version._id,
      filename: req.file.originalname,
      buffer: req.file.buffer
    });

    version.referenceDataset = {
      filename: req.file.originalname,
      rowCount: parsed.rowCount,
      featureColumns: parsed.featureColumns,
      targetColumn: parsed.targetColumn,
      protectedAttributes: parsed.protectedAttributes,
      dataHash: parsed.dataHash,
      uploadedAt: new Date(),
      schemaStats: parsed.schemaStats,
      gridFsId: storage.gridFsId,
      storagePath: storage.storagePath
    };

    await version.save();

    await recordAuditEvent({
      actor: req.user ? (req.user.name || req.user.email) : 'ML Lead',
      role: req.user ? req.user.role : 'ML_LEAD',
      action: 'REFERENCE_DATASET_UPLOADED',
      entityType: 'ModelVersion',
      entityId: version._id,
      payload: {
        modelId: String(model._id),
        modelName: model.name,
        versionId: String(version._id),
        version: version.version,
        filename: req.file.originalname,
        rowCount: parsed.rowCount,
        featureColumnsCount: parsed.featureColumns.length,
        targetColumn: parsed.targetColumn,
        dataHash: parsed.dataHash
      }
    });

    res.json({
      success: true,
      data: {
        modelId: model._id,
        versionId: version._id,
        referenceDataset: version.referenceDataset
      }
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
}

/**
 * Retrieves metadata for a ModelVersion's reference dataset.
 * GET /models/:modelId/versions/:versionId/reference-dataset
 */
export async function getReferenceDataset(req, res) {
  try {
    const { modelId, versionId } = req.params;
    const model = await Model.findById(modelId);
    if (!model) {
      return res.status(404).json({ success: false, error: 'Model not found' });
    }

    const version = await ModelVersion.findById(versionId);
    if (!version || String(version.modelId) !== String(model._id)) {
      return res.status(404).json({ success: false, error: 'ModelVersion not found or does not belong to specified model' });
    }

    if (!version.referenceDataset || !version.referenceDataset.filename) {
      return res.status(404).json({
        success: false,
        error: 'No reference dataset associated with this model version.'
      });
    }

    res.json({
      success: true,
      data: version.referenceDataset
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}


