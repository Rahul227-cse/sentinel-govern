import mongoose from 'mongoose';

const issueReportSchema = new mongoose.Schema({
  organizationId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Organization',
    index: true,
    default: null 
  },
  reportNumber: { 
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
    required: false,
    default: null, 
    index: true 
  },
  submittedBy: { 
    type: String, 
    required: true 
  },
  submitterUserId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    default: null,
    index: true 
  },
  issueType: { 
    type: String, 
    enum: ['PERFORMANCE', 'BIAS', 'DATA', 'SAFETY', 'DRIFT', 'OTHER'],
    required: true 
  },
  severity: { 
    type: String, 
    enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
    default: 'MEDIUM' 
  },
  title: { 
    type: String, 
    required: true,
    trim: true 
  },
  description: { 
    type: String, 
    required: true 
  },
  evidence: [{
    name: { type: String },
    url: { type: String },
    type: { type: String }
  }],
  status: { 
    type: String, 
    enum: ['SUBMITTED', 'UNDER_INVESTIGATION', 'RESOLVED', 'REJECTED', 'ESCALATED_TO_INCIDENT'],
    default: 'SUBMITTED' 
  },
  escalatedIncidentId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Incident',
    default: null 
  },
  resolutionNotes: { 
    type: String, 
    default: '' 
  },
  resolvedBy: { 
    type: String 
  },
  resolvedUserId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  },
  resolvedAt: { 
    type: Date 
  }
}, {
  timestamps: true
});

issueReportSchema.index({ modelId: 1, status: 1 });

export const IssueReport = mongoose.model('IssueReport', issueReportSchema);
