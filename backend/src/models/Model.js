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
    enum: ['DRAFT', 'UNDER_REVIEW', 'EVALUATION', 'PENDING_APPROVAL', 'APPROVED', 'IN_PRODUCTION', 'DEPRECATED'],
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
    endpointUrl: { type: String, default: 'http://127.0.0.1:8000' },
    healthEndpoint: { type: String, default: '/health' },
    predictEndpoint: { type: String, default: '/score' },
    authHeader: { type: String, default: '' },
    status: { type: String, enum: ['DISCONNECTED', 'CONNECTED', 'UNAVAILABLE', 'CONFIGURATION_REQUIRED'], default: 'DISCONNECTED' },
    lastCheckedAt: { type: Date, default: null },
    lastResponseTimeMs: { type: Number, default: null }
  },
  riskAssessment: { type: riskAssessmentSchema, default: () => ({}) }
}, {
  timestamps: true
});

export const Model = mongoose.model('Model', modelSchema);
