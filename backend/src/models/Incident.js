import mongoose from 'mongoose';

const incidentSchema = new mongoose.Schema({
  incidentNumber: { 
    type: String, 
    required: true, 
    unique: true 
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
  type: { 
    type: String, 
    enum: ['DATA_DRIFT', 'FAIRNESS_VIOLATION', 'PERFORMANCE_DEGRADATION', 'SECURITY_ANOMALY'],
    required: true 
  },
  title: { type: String, required: true },
  description: { type: String, required: true },
  severity: { 
    type: String, 
    enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
    default: 'HIGH' 
  },
  status: { 
    type: String, 
    enum: ['OPEN', 'INVESTIGATING', 'MITIGATED', 'CLOSED'],
    default: 'OPEN' 
  },
  metricsSnapshot: { type: mongoose.Schema.Types.Mixed, default: {} },
  recommendedAction: { 
    type: String, 
    enum: ['ROLLBACK', 'RETRAIN_MODEL', 'ADJUST_THRESHOLD', 'INVESTIGATE'],
    default: 'ROLLBACK' 
  },
  recommendedRollbackVersionId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'ModelVersion',
    default: null 
  },
  organizationId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Organization',
    index: true,
    default: null 
  },
  assignedTo: { type: String, default: 'ML_LEAD' },
  assignedUserId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    default: null 
  },
  investigationNotes: [{
    note: { type: String, required: true },
    author: { type: String, required: true },
    authorUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now }
  }],
  issueReportRef: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'IssueReport',
    default: null
  },
  telemetryRef: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Telemetry',
    default: null
  },
  workloadId: {
    type: String,
    default: 'fraud-detection',
    index: true
  },
  reportRef: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Report',
    default: null
  },
  mitigationNotes: { type: String, default: '' },
  resolvedAt: { type: Date },
  resolvedBy: { type: String },
  resolvedUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
  timestamps: true
});

export const Incident = mongoose.model('Incident', incidentSchema);
