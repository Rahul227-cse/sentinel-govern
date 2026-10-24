import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  recipientRole: {
    type: String,
    enum: ['ML_LEAD', 'GOVERNANCE_OFFICER', 'EXECUTIVE_APPROVER', 'PLATFORM_ADMIN', 'ALL'],
    default: 'ML_LEAD',
    index: true
  },
  title: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['DRIFT_INCIDENT', 'POLICY_GATE', 'APPROVAL_REQUEST', 'SYSTEM'],
    default: 'DRIFT_INCIDENT'
  },
  severity: {
    type: String,
    enum: ['INFO', 'WARNING', 'CRITICAL'],
    default: 'CRITICAL'
  },
  modelId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Model',
    default: null
  },
  versionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ModelVersion',
    default: null
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
  read: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

notificationSchema.index({ recipientRole: 1, read: 1, createdAt: -1 });

export const Notification = mongoose.model('Notification', notificationSchema);
