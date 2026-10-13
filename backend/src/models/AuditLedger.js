import mongoose from 'mongoose';

const auditLedgerSchema = new mongoose.Schema({
  sequenceNumber: { 
    type: Number, 
    required: true, 
    unique: true, 
    index: true 
  },
  previousHash: { 
    type: String, 
    required: true 
  },
  currentHash: { 
    type: String, 
    required: true 
  },
  timestamp: { 
    type: Date, 
    default: Date.now,
    required: true 
  },
  actor: { 
    type: String, 
    required: true 
  },
  role: { 
    type: String, 
    default: 'SYSTEM' 
  },
  action: { 
    type: String, 
    enum: [
      'MODEL_CREATED',
      'VERSION_CREATED',
      'LIFECYCLE_TRANSITION',
      'RISK_ASSESSED',

      'EVALUATION_COMPLETED',
      'POLICY_PASSED',
      'POLICY_FAILED',
      'POLICY_CREATED',
      'POLICY_UPDATED',
      'MODEL_POLICY_ASSIGNED',
      'MODEL_POLICY_UNASSIGNED',
      'APPROVAL_GRANTED',
      'APPROVAL_REJECTED',
      'DEPLOYMENT_STARTED',
      'DEPLOYMENT_COMPLETED',
      'DRIFT_DETECTED',
      'TELEMETRY_INGESTED',
      'INCIDENT_CREATED',
      'INCIDENT_UPDATED',
      'INCIDENT_STATUS_UPDATED',
      'ROLLBACK_STARTED',
      'ROLLBACK_COMPLETED',
      'USER_CREATED',
      'ROLE_ASSIGNED',
      'USER_STATUS_CHANGED',
      'ISSUE_REPORTED',
      'ISSUE_REPORT_CREATED',
      'ISSUE_INVESTIGATED',
      'ISSUE_REPORT_UPDATED',
      'ISSUE_RESOLVED',
      'ISSUE_ESCALATED',
      'ISSUE_ESCALATED_TO_INCIDENT',
      'REPORT_GENERATED',
      'REPORT_UPDATED',
      'DOSSIER_COMPILED',
      'USER_PASSWORD_RESET',
      'USER_LOGIN',
      'USER_LOGOUT',
      'USER_ONBOARDING_COMPLETED',
      'USER_VERIFIED',
      'USER_BLOCKED',
      'USER_UNBLOCKED'
    ],
    required: true 
  },
  entityType: { type: String, required: true },
  entityId: { type: String, required: true },
  organizationId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Organization',
    index: true,
    default: null 
  },
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    default: null 
  },
  payload: { type: mongoose.Schema.Types.Mixed, default: {} }
}, {
  timestamps: true
});

export const AuditLedger = mongoose.model('AuditLedger', auditLedgerSchema);
export const AuditLog = AuditLedger;
