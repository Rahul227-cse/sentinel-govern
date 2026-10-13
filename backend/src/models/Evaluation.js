import mongoose from 'mongoose';

const evaluationSchema = new mongoose.Schema({
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
  datasetName: { type: String, required: true },
  sampleCount: { type: Number, required: true },
  performanceMetrics: {
    accuracy: { type: Number, required: true, min: 0, max: 1 },
    precision: { type: Number, required: true, min: 0, max: 1 },
    recall: { type: Number, required: true, min: 0, max: 1 },
    f1: { type: Number, required: true, min: 0, max: 1 },
    rocAuc: { 
      type: Number, 
      default: null,
      validate: {
        validator: function(v) {
          return v === null || v === undefined || (typeof v === 'number' && !isNaN(v) && v >= 0 && v <= 1);
        },
        message: props => `ROC-AUC value (${props.value}) must be between 0 and 1, or null if unavailable`
      }
    }
  },
  fairnessMetrics: {
    protectedAttribute: { type: String, default: 'NONE' },
    privilegedGroup: { type: String, default: 'N/A' },
    unprivilegedGroup: { type: String, default: 'N/A' },
    disparateImpactRatio: { type: Number, default: 0 },
    demographicParityDiff: { type: Number, default: 0 },
    fairnessEvaluated: { type: Boolean },
    equalizedOdds: {
      privilegedTPR: { type: Number, default: 0 },
      unprivilegedTPR: { type: Number, default: 0 },
      tprDiff: { type: Number, default: 0 },
      privilegedFPR: { type: Number, default: 0 },
      unprivilegedFPR: { type: Number, default: 0 },
      fprDiff: { type: Number, default: 0 }
    },
    groupStats: {
      privileged: {
        total: { type: Number, default: 0 },
        positivePredictions: { type: Number, default: 0 },
        selectionRate: { type: Number, default: 0 }
      },
      unprivileged: {
        total: { type: Number, default: 0 },
        positivePredictions: { type: Number, default: 0 },
        selectionRate: { type: Number, default: 0 }
      }
    }
  },
  organizationId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Organization',
    index: true,
    default: null 
  },
  evaluatorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  dataSource: {
    type: String,
    enum: ['SYNTHETIC_BENCHMARK', 'FILE_UPLOAD', 'PRODUCTION_TRAFFIC'],
    default: 'FILE_UPLOAD'
  },
  uploadedFileMeta: {
    filename: { type: String },
    rowCount: { type: Number },
    fileType: { type: String },
    uploadedAt: { type: Date }
  },
  evaluatedBy: { type: String, default: 'Automated Evaluation Engine' },
  evaluatedAt: { type: Date, default: Date.now }
}, {
  timestamps: true
});

export const Evaluation = mongoose.model('Evaluation', evaluationSchema);
