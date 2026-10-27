import mongoose from 'mongoose';

const riskAssessmentSchema = new mongoose.Schema({
  prohibitedPracticesChecked: { type: Boolean, default: false },
  euAiActClassification: { 
    type: String, 
    enum: ['UNACCEPTABLE', 'HIGH', 'LIMITED', 'MINIMAL'], 
    default: 'HIGH' 
  },
  safetyImpactRating: { type: String, default: 'Significant' },
  autonomyLevel: { type: String, default: 'Human-in-the-loop' },
  frameworkAlignment: [{ type: String }], // e.g. ['EU_AI_ACT_ANNEX_III', 'NIST_AI_RMF_GOVERN']
  assessmentNotes: { type: String, default: '' },
  assessedAt: { type: Date },
  assessedBy: { type: String }
}, { _id: false });

const modelSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true },
  description: { type: String, required: true },
  purpose: { type: String, required: true },
  owner: { type: String, required: true },
  team: { type: String, required: true },
  modelType: { 
    type: String, 
    enum: ['CLASSIFICATION', 'REGRESSION', 'LLM_GENERATIVE', 'RECOMMENDER', 'OTHER'],
    default: 'CLASSIFICATION' 
  },
  riskLevel: { 
    type: String, 
    enum: ['UNACCEPTABLE', 'HIGH', 'LIMITED', 'MINIMAL'], 
    default: 'HIGH' 
  },
  lifecycleStatus: { 
    type: String, 
    enum: ['DRAFT', 'UNDER_REVIEW', 'EVALUATION', 'PENDING_APPROVAL', 'APPROVED', 'IN_PRODUCTION', 'RETIRED', 'DEPRECATED'],
    default: 'DRAFT' 
  },
  currentProductionVersionId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'ModelVersion',
    default: null 
  },
  policyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Policy',
    default: null
  },
  applicablePolicyIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Policy'
  }],
  intendedUsers: [{ type: String }],
  protectedAttributes: [{ type: String }], // e.g. ['gender', 'age', 'race']
  organizationId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Organization',
    index: true,
    default: null 
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  apiConfig: {
    endpointUrl: { type: String, default: '' },
    healthEndpoint: { type: String, default: '' },
    predictEndpoint: { type: String, default: '' },
    method: { type: String, enum: ['POST', 'GET'], default: 'POST' },
    authType: { type: String, enum: ['NONE', 'BEARER', 'API_KEY', 'CUSTOM_HEADER'], default: 'NONE' },
    authHeaderName: { type: String, default: '' },
    authHeaderValue: { type: String, default: '', select: false },
    requestMapping: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    responseMapping: {
      predictionField: { type: String, default: '' },
      latencyField: { type: String, default: '' }
    },
    timeoutMs: { type: Number, default: 30000 },
    maxRetries: { type: Number, default: 2 },
    status: { 
      type: String, 
      enum: ['CONFIGURATION_REQUIRED', 'DISCONNECTED', 'CONNECTED', 'UNAVAILABLE'], 
      default: 'CONFIGURATION_REQUIRED' 
    },
    lastCheckedAt: { type: Date, default: null },
    lastResponseTimeMs: { type: Number, default: null },
    lastError: { type: String, default: null }
  },
  riskAssessment: { type: riskAssessmentSchema, default: () => ({}) }
}, {
  timestamps: true
});

export const Model = mongoose.model('Model', modelSchema);
