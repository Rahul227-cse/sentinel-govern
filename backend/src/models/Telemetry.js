import mongoose from 'mongoose';

const featureDriftSchema = new mongoose.Schema({
  name: { type: String, required: true },
  psi: { type: Number, default: null },
  statisticalMethod: { type: String, default: null },
  pValue: { type: Number, default: null },
  threshold: { type: Number, default: null },
  driftDetected: { type: Boolean, default: false },
  expectedDistribution: [{
    bin: String,
    percentage: Number
  }],
  actualDistribution: [{
    bin: String,
    percentage: Number
  }]
}, { _id: false });

const telemetrySchema = new mongoose.Schema({
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
  batchId: { type: String, required: true },
  sampleSize: { type: Number, default: 2500 },
  features: [featureDriftSchema],
  aggregatePsi: { type: Number, default: null },
  monitoringSource: { 
    type: String, 
    enum: ['SIMULATION', 'EVIDENTLY'], 
    default: 'SIMULATION' 
  },
  driftedColumns: [{ type: String }],
  reportArtifactPath: { type: String, default: null },
  driftStatus: { 
    type: String, 
    enum: ['HEALTHY', 'WARNING', 'DRIFT_DETECTED'],
    default: 'HEALTHY' 
  },
  incidentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Incident',
    default: null
  },
  reportId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Report',
    default: null
  },
  workloadId: {
    type: String,
    default: 'fraud-detection',
    index: true
  },
  isSyntheticWalkthroughTraffic: {
    type: Boolean,
    default: false
  },
  referenceDatasetVersion: {
    type: String,
    default: 'baseline-v1.0'
  },
  observationWindow: {
    startTime: { type: Date, default: null },
    endTime: { type: Date, default: null }
  },
  performanceTelemetry: {
    predictionVolume: { type: Number, default: 1250 },
    avgLatencyMs: { type: Number, default: 34 },
    errorRate: { type: Number, default: 0.004 },
    estimatedAccuracy: { type: Number, default: 0.89 }
  },
  recordedAt: { type: Date, default: Date.now }
}, {
  timestamps: true
});

export const Telemetry = mongoose.model('Telemetry', telemetrySchema);
