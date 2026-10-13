import mongoose from 'mongoose';

const monitoringSchema = new mongoose.Schema({
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
  monitoringTeam: { 
    type: String, 
    default: 'MLOps & Governance' 
  },
  primaryOwner: { 
    type: String, 
    required: true 
  },
  ownerUserId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    default: null 
  },
  monitoringStatus: { 
    type: String, 
    enum: ['ACTIVE', 'PAUSED', 'DISABLED'], 
    default: 'ACTIVE' 
  },
  healthStatus: { 
    type: String, 
    enum: ['HEALTHY', 'WARNING', 'ISSUE', 'CRITICAL'], 
    default: 'HEALTHY' 
  },
  monitoringFrequency: { 
    type: String, 
    enum: ['HOURLY', 'DAILY', 'WEEKLY', 'REALTIME'], 
    default: 'DAILY' 
  },
  lastEvaluatedAt: { 
    type: Date, 
    default: Date.now 
  },
  latestPsi: { 
    type: Number, 
    default: null 
  },
  driftMethod: {
    type: String,
    enum: ['PSI', 'EVIDENTLY'],
    default: 'PSI'
  },
  driftDetected: { 
    type: Boolean, 
    default: false 
  },
  telemetryRef: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Telemetry',
    default: null 
  }
}, {
  timestamps: true
});

monitoringSchema.index({ modelId: 1, healthStatus: 1 });

export const Monitoring = mongoose.model('Monitoring', monitoringSchema);
