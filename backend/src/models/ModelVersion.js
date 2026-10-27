import mongoose from 'mongoose';

const modelVersionSchema = new mongoose.Schema({
  modelId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Model', 
    required: true, 
    index: true 
  },
  version: { 
    type: String, 
    required: true, 
    trim: true 
  },
  changelog: { type: String, default: '' },
  artifactReference: { type: String, default: '' },
  trainingDatasetInfo: {
    name: { type: String, default: 'Training Set Alpha' },
    sampleCount: { type: Number, default: 50000 },
    featureCount: { type: Number, default: 24 },
    dateRange: { type: String, default: '2025-01 to 2025-12' },
    dataHash: { type: String, default: 'sha256-d7a8f3b2...' }
  },
  referenceDataset: {
    filename: { type: String, default: null },
    rowCount: { type: Number, default: null },
    featureColumns: [{ type: String }],
    targetColumn: { type: String, default: null },
    protectedAttributes: [{ type: String }],
    dataHash: { type: String, default: null },
    uploadedAt: { type: Date, default: null },
    schemaStats: { type: mongoose.Schema.Types.Mixed, default: null },
    gridFsId: { type: mongoose.Schema.Types.ObjectId, default: null },
    storagePath: { type: String, default: null }
  },
  lifecycleStatus: { 
    type: String, 
    enum: ['DRAFT', 'UNDER_REVIEW', 'EVALUATION', 'PENDING_APPROVAL', 'APPROVED', 'IN_PRODUCTION', 'RETIRED', 'DEPRECATED'],
    default: 'DRAFT',
    required: true 
  },
  apiConfig: {
    endpointUrl: { type: String, default: null },
    healthEndpoint: { type: String, default: null },
    predictEndpoint: { type: String, default: null },
    method: { type: String, enum: ['POST', 'GET', null], default: null },
    authType: { type: String, enum: ['NONE', 'BEARER', 'API_KEY', 'CUSTOM_HEADER', null], default: null },
    authHeaderName: { type: String, default: null },
    authHeaderValue: { type: String, default: null, select: false },
    requestMapping: { type: mongoose.Schema.Types.Mixed, default: null },
    responseMapping: {
      predictionField: { type: String, default: null },
      latencyField: { type: String, default: null }
    },
    timeoutMs: { type: Number, default: null },
    maxRetries: { type: Number, default: null }
  },
  evaluationStatus: { 
    type: String, 
    enum: ['NOT_EVALUATED', 'EVALUATED_PASS', 'EVALUATED_FAIL'],
    default: 'NOT_EVALUATED' 
  },
  policyStatus: { 
    type: String, 
    enum: ['PENDING', 'PASSED', 'FAILED'],
    default: 'PENDING' 
  },
  approvalStatus: { 
    type: String, 
    enum: ['NOT_REQUESTED', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED'],
    default: 'NOT_REQUESTED' 
  },
  deploymentStatus: { 
    type: String, 
    enum: ['NOT_DEPLOYED', 'STAGING', 'IN_PRODUCTION', 'ROLLED_BACK', 'RETIRED'],
    default: 'NOT_DEPLOYED' 
  },
  latestEvaluationId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Evaluation',
    default: null 
  },
  latestPolicyEvaluation: {
    passed: { type: Boolean, default: false },
    overallDecision: { type: String, default: 'NOT_EVALUATED' },
    reasons: [{ type: String }],
    noPolicyAssigned: { type: Boolean, default: false },
    gateBreakdown: { type: mongoose.Schema.Types.Mixed, default: {} },
    evaluatedAt: { type: Date }
  },
  organizationId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Organization',
    index: true,
    default: null 
  },
  deploymentRef: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Deployment',
    default: null
  },
  activeMonitoringRef: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Monitoring',
    default: null
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  deployedAt: { type: Date },
  rolledBackAt: { type: Date }
}, {
  timestamps: true
});

modelVersionSchema.index({ modelId: 1, version: 1 }, { unique: true });

export const ModelVersion = mongoose.model('ModelVersion', modelVersionSchema);
