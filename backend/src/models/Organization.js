import mongoose from 'mongoose';

const organizationSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true, 
    unique: true, 
    trim: true 
  },
  slug: { 
    type: String, 
    required: true, 
    unique: true, 
    lowercase: true, 
    trim: true 
  },
  domain: { 
    type: String, 
    trim: true 
  },
  settings: {
    enforceMfa: { type: Boolean, default: false },
    defaultRiskLevel: { 
      type: String, 
      enum: ['UNACCEPTABLE', 'HIGH', 'LIMITED', 'MINIMAL'], 
      default: 'HIGH' 
    },
    regulatoryFrameworks: [{ 
      type: String, 
      default: ['EU_AI_ACT_ANNEX_III', 'NIST_AI_RMF_1.0'] 
    }]
  },
  ownerId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  }
}, {
  timestamps: true
});

organizationSchema.index({ slug: 1 });

export const Organization = mongoose.model('Organization', organizationSchema);
