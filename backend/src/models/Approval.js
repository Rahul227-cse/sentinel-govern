import mongoose from 'mongoose';

const approvalSchema = new mongoose.Schema({
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
  role: { 
    type: String, 
    enum: ['PLATFORM_ADMIN', 'ML_LEAD', 'GOVERNANCE_OFFICER', 'EXECUTIVE_APPROVER'],
    required: true 
  },
  approverName: { type: String, required: true },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  organizationId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Organization',
    index: true,
    default: null 
  },
  decision: { 
    type: String, 
    enum: ['PENDING', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED'],
    default: 'PENDING' 
  },
  comment: { type: String, default: '' },
  decidedAt: { type: Date }
}, {
  timestamps: true
});

approvalSchema.index({ versionId: 1, role: 1 }, { unique: true });

export const Approval = mongoose.model('Approval', approvalSchema);
