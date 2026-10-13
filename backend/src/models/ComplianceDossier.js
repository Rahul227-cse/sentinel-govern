import mongoose from 'mongoose';

const complianceDossierSchema = new mongoose.Schema({
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
  dossierNumber: { 
    type: String, 
    required: true, 
    unique: true 
  },
  title: { 
    type: String, 
    required: true 
  },
  euAiActClassification: { 
    type: String, 
    default: 'HIGH_RISK_ANNEX_III' 
  },
  compiledBy: { 
    type: String, 
    required: true 
  },
  compilerUserId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    default: null 
  },
  sections: {
    riskManagementSystem: { type: mongoose.Schema.Types.Mixed, default: {} },
    dataGovernance: { type: mongoose.Schema.Types.Mixed, default: {} },
    technicalDocumentation: { type: mongoose.Schema.Types.Mixed, default: {} },
    accuracyAndRobustness: { type: mongoose.Schema.Types.Mixed, default: {} },
    humanOversightMeasures: { type: mongoose.Schema.Types.Mixed, default: {} },
    auditTrailDigest: { type: String, default: '' }
  },
  integrityHash: { 
    type: String, 
    default: '' 
  },
  status: { 
    type: String, 
    enum: ['DRAFT', 'FINALIZED', 'CERTIFIED'], 
    default: 'FINALIZED' 
  }
}, {
  timestamps: true
});

complianceDossierSchema.index({ modelId: 1, versionId: 1 });

export const ComplianceDossier = mongoose.model('ComplianceDossier', complianceDossierSchema);
