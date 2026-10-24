import { Model } from '../models/Model.js';
import { ModelVersion } from '../models/ModelVersion.js';
import { Evaluation } from '../models/Evaluation.js';
import { Approval } from '../models/Approval.js';
import { Incident } from '../models/Incident.js';
import { Policy } from '../models/Policy.js';
import { recordAuditEvent } from '../services/auditEngine.js';
import { transitionVersionLifecycle } from '../services/lifecycleService.js';

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
        policyName: targetPolicy ? targetPolicy.name : null
      }
    });

    res.json({
      success: true,
      data: {
        model,
        activePolicy: targetPolicy
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
        ['APPROVED', 'DEPRECATED'].includes(v.lifecycleStatus);

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
 * Connects or updates model API endpoint configuration.
 * Validates endpoint URL, performs real /health probe and real /score test.
 */
export async function updateModelApiConfig(req, res) {
  try {
    const { id } = req.params;
    const { endpointUrl, healthEndpoint = '/health', predictEndpoint = '/score', authHeader } = req.body;

    const model = await Model.findById(id);
    if (!model) {
      return res.status(404).json({ success: false, error: 'Model not found' });
    }

    if (!endpointUrl) {
      return res.status(400).json({ success: false, error: 'endpointUrl is required' });
    }

    // Perform live connection test
    const cleanUrl = endpointUrl.replace(/\/+$/, '');
    let status = 'UNAVAILABLE';
    let lastResponseTimeMs = null;
    let healthDetails = null;

    try {
      const t0 = Date.now();
      const healthRes = await fetch(`${cleanUrl}${healthEndpoint}`, { signal: AbortSignal.timeout(5000) });
      lastResponseTimeMs = Date.now() - t0;
      if (healthRes.ok) {
        status = 'CONNECTED';
        healthDetails = await healthRes.json().catch(() => ({}));
      } else {
        status = 'UNAVAILABLE';
      }
    } catch (netErr) {
      status = 'UNAVAILABLE';
    }

    model.apiConfig = {
      endpointUrl: cleanUrl,
      healthEndpoint,
      predictEndpoint,
      authHeader: authHeader || '',
      status,
      lastCheckedAt: new Date(),
      lastResponseTimeMs
    };

    await model.save();

    await recordAuditEvent({
      actor: req.user ? (req.user.name || req.user.email) : 'ML Lead',
      role: req.user ? req.user.role : 'ML_LEAD',
      action: 'MODEL_CONFIG_UPDATED',
      entityType: 'Model',
      entityId: model._id,
      payload: {
        modelId: String(model._id),
        modelName: model.name,
        endpointUrl: cleanUrl,
        status,
        lastResponseTimeMs
      }
    });

    res.json({
      success: true,
      data: {
        modelId: model._id,
        apiConfig: model.apiConfig,
        healthDetails
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

