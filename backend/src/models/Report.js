import mongoose from 'mongoose';

const reportSchema = new mongoose.Schema({
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
  reportNumber: { 
    type: String, 
    required: true, 
    unique: true 
  },
  reportType: { 
    type: String, 
    enum: ['PERFORMANCE_IMPACT', 'FAIRNESS_ANNUAL', 'EXECUTIVE_SUMMARY', 'EU_AI_ACT_CONFORMITY', 'DATA_DRIFT_ANALYSIS'], 
    default: 'PERFORMANCE_IMPACT' 
  },
  workloadId: {
    type: String,
    default: 'fraud-detection',
    index: true
  },
  incidentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Incident',
    default: null
  },
  telemetryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Telemetry',
    default: null
  },
  driftAnalysis: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  recommendations: [{ type: String }],
  reportContent: {
    type: String,
    default: ''
  },
  title: { 
    type: String, 
    required: true 
  },
  reportingPeriod: { 
    startDate: { type: Date },
    endDate: { type: Date },
    label: { type: String, default: 'Q1 2026' }
  },
  generatedBy: { 
    type: String, 
    required: true 
  },
  generatorUserId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    default: null 
  },
  executiveSummary: { 
    type: String, 
    default: '' 
  },
  operationalStatus: { 
    type: String, 
    enum: ['HEALTHY', 'WARNING', 'ISSUE', 'CRITICAL'],
    default: 'HEALTHY' 
  },
  metricsSummary: {
    accuracy: { type: Number, default: 0 },
    disparateImpactRatio: { type: Number, default: 0 },
    demographicParityDiff: { type: Number, default: 0 },
    rocAuc: { type: Number, default: 0 },
    aggregatePsi: { type: Number, default: 0 },
    openIncidentsCount: { type: Number, default: 0 },
    predictionVolume: { type: Number, default: 0 }
  },
  businessImpact: {
    decisionsProcessed: { type: Number, default: 0 },
    estimatedCostSavings: { type: String, default: 'N/A' },
    riskMitigationScore: { type: Number, default: 100 }
  },
  dataProvenance: { 
    type: String, 
    enum: ['MEASURED_REAL', 'EVALUATION_UPLOAD', 'SIMULATED_DEMO'], 
    default: 'MEASURED_REAL' 
  }
}, {
  timestamps: true
});

reportSchema.index({ modelId: 1, reportType: 1 });

export const Report = mongoose.model('Report', reportSchema);
