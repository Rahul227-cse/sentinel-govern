import mongoose from 'mongoose';

const refreshTokenSchema = new mongoose.Schema({
  tokenHash: { type: String, required: true },
  expiresAt:  { type: Date,   required: true },
  createdAt:  { type: Date,   default: Date.now }
}, { _id: false });

const loginHistorySchema = new mongoose.Schema({
  loginAt:      { type: Date, default: Date.now },
  logoutAt:     { type: Date, default: null },
  authProvider: { type: String, enum: ['GOOGLE', 'EMAIL', 'BOTH'], default: 'EMAIL' },
  userAgent:    { type: String, default: '' },
  ip:           { type: String, default: '' },
  sessionId:    { type: String, default: '' }
}, { _id: true });

const userSchema = new mongoose.Schema({
  googleId: { 
    type: String, 
    unique: true, 
    sparse: true, 
    index: true 
  },
  email: { 
    type: String, 
    required: true, 
    unique: true, 
    lowercase: true, 
    trim: true, 
    index: true 
  },
  name: { 
    type: String, 
    required: true, 
    trim: true 
  },
  avatar: { 
    type: String, 
    default: '' 
  },

  // Native email/password auth
  passwordHash: {
    type: String,
    default: null,
    select: false   // never returned in ordinary queries
  },

  // Secure refresh token store (hashed)
  refreshTokens: {
    type: [refreshTokenSchema],
    default: [],
    select: false
  },

  // Password reset token (hashed) + expiry
  passwordResetTokenHash: {
    type: String,
    default: null,
    select: false
  },
  passwordResetExpiresAt: {
    type: Date,
    default: null
  },

  role: { 
    type: String, 
    enum: [
      'PLATFORM_ADMIN',
      'ML_LEAD',
      'GOVERNANCE_OFFICER',
      'EXECUTIVE_APPROVER'
    ],
    default: 'GOVERNANCE_OFFICER',
    required: true 
  },

  // Account Lifecycle Status (ACTIVE vs SUSPENDED/BLOCKED)
  status: { 
    type: String, 
    enum: ['PENDING', 'ACTIVE', 'SUSPENDED'], 
    default: 'ACTIVE',
    required: true 
  },

  // Account Verification Status (Admin verified vs Pending verification)
  verificationStatus: {
    type: String,
    enum: ['PENDING', 'VERIFIED'],
    default: 'PENDING',
    index: true
  },
  verifiedBy: {
    type: String,
    default: null
  },
  verifiedAt: {
    type: Date,
    default: null
  },

  // Online Presence (Separate from account status)
  presence: {
    type: String,
    enum: ['ACTIVE', 'OFFLINE'],
    default: 'OFFLINE',
    index: true
  },

  organizationId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Organization',
    index: true 
  },
  title: { 
    type: String, 
    default: 'Governance Contributor' 
  },
  department: { 
    type: String, 
    default: 'Engineering' 
  },
  team: {
    type: String,
    default: ''
  },
  teamLead: {
    type: String,
    default: ''
  },
  onboardingCompleted: {
    type: Boolean,
    default: false
  },

  lastLoginAt: { 
    type: Date 
  },
  lastSeenAt: {
    type: Date,
    default: null
  },

  // Permanent activity/login history
  loginHistory: {
    type: [loginHistorySchema],
    default: []
  }
}, {
  timestamps: true
});

userSchema.index({ email: 1, status: 1 });

export const User = mongoose.model('User', userSchema);

