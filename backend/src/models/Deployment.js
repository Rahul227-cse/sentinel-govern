import mongoose from 'mongoose';

const deploymentSchema = new mongoose.Schema({
  organizationId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Organization',
    index: true,
    default: null 
  },
  modelId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Model', 
    required: true, 
    index: true 
  },
  versionId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'ModelVersion', 
    required: true, 
    index: true 
  },
  environment: { 
    type: String, 
    enum: ['STAGING', 'PRODUCTION', 'CANARY'], 
    default: 'PRODUCTION' 
  },
  deployedBy: { 
    type: String, 
    required: true 
  },
  deployerUserId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    default: null 
  },
  status: { 
    type: String, 
    enum: ['ACTIVE', 'ROLLED_BACK', 'RETIRED'], 
    default: 'ACTIVE' 
  },
  endpointUrl: { 
    type: String, 
    default: '' 
  },
  trafficPercentage: { 
    type: Number, 
    default: 100 
  },
  deployedAt: { 
    type: Date, 
    default: Date.now 
  },
  rollbackRef: {
    rolledBackAt: { type: Date },
    rolledBackBy: { type: String },
    rolledBackUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    previousVersionId: { type: mongoose.Schema.Types.ObjectId, ref: 'ModelVersion' },
    reason: { type: String }
  }
}, {
  timestamps: true
});

deploymentSchema.index({ modelId: 1, status: 1 });

export const Deployment = mongoose.model('Deployment', deploymentSchema);
