import mongoose from 'mongoose';

const policySchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  description: { type: String, required: true },
  targetRiskLevel: { 
    type: String, 
    enum: ['ALL', 'UNACCEPTABLE', 'HIGH', 'LIMITED', 'MINIMAL'],
    default: 'HIGH' 
  },
  applicableModelId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Model',
    default: null
  },
  applicableModelIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Model'
  }],
  rules: {
    minDisparateImpact: { type: Number, default: 0.80 },
    maxDisparateImpact: { type: Number, default: 1.25 },
    maxDemographicParityDiff: { type: Number, default: 0.10 },
    minRocAuc: { type: Number, default: 0.85 },
    minAccuracy: { type: Number, default: 0.80 },
    minPrecision: { type: Number, default: 0.75 },
    minRecall: { type: Number, default: 0.75 },
    maxPsiThreshold: { type: Number, default: 0.25 }
  },
  requiredApprovers: [{ 
    type: String, 
    enum: ['ML_LEAD', 'GOVERNANCE_OFFICER', 'EXECUTIVE_APPROVER'] 
  }],
  failureAction: { 
    type: String, 
    enum: ['BLOCK_PROMOTION', 'WARN_ONLY'], 
    default: 'BLOCK_PROMOTION' 
  },
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
  isActive: { type: Boolean, default: true }
}, {
  timestamps: true
});

export const Policy = mongoose.model('Policy', policySchema);
