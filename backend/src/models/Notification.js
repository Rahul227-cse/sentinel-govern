import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true
  },
  recipientRole: {
    type: String,
    enum: ['ML_LEAD', 'GOVERNANCE_OFFICER', 'EXECUTIVE_APPROVER', 'PLATFORM_ADMIN', 'ALL'],
    default: 'ML_LEAD',
    index: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  message: {
    type: String,
    required: true,
    trim: true
  },
  type: {
    type: String,
    required: true,
    trim: true,
    default: 'SYSTEM'
  },
  severity: {
    type: String,
    enum: ['INFO', 'WARNING', 'CRITICAL'],
    default: 'INFO'
  },
  targetUrl: {
    type: String,
    default: null,
    trim: true
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
  approvalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Approval',
    default: null
  },
  issueId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'IssueReport',
    default: null
  },
  idempotencyKey: {
    type: String,
    default: null
  },
  read: {
    type: Boolean,
    default: false,
    index: true
  },
  readAt: {
    type: Date,
    default: null
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

notificationSchema.index({ userId: 1, read: 1, createdAt: -1 });
notificationSchema.index({ recipientRole: 1, read: 1, createdAt: -1 });
notificationSchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });

export const Notification = mongoose.model('Notification', notificationSchema);
