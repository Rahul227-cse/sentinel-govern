import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { updateUserProfile, changeUserPassword } from '../services/api';
import PageHeader from '../components/PageHeader';
import { formatRoleLabel, formatStatusLabel } from '../utils/formatters';
import { 
  AlertCircle,
  LogIn,
  LogOut,
  Circle,
  Edit2,
  Key,
  Shield,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Save,
  X
} from 'lucide-react';

export default function UserProfile() {
  const { user, refreshUser } = useAuth();

  // Profile Edit State
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileName, setProfileName] = useState(user?.name || '');
  const [profileEmail, setProfileEmail] = useState(user?.email || '');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState('');

  // Password Change State
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');

  // Session History State (collapsed to 3 by default)
  const [expandedHistory, setExpandedHistory] = useState(false);

  if (!user) return null;

  const isVerified = user.verificationStatus === 'VERIFIED';
  const isOnline = user.presence === 'ACTIVE';
  const isExternalGoogleOnly = user.authProvider === 'GOOGLE' || (user.googleId && !user.passwordHash);

  const formatDateTime = (dateStr) => {
    if (!dateStr) return 'N/A';
    const d = new Date(dateStr);
    return d.toLocaleString('en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // ─── Handle Profile Update ─────────────────────────────────────────────────
  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setProfileError('');
    setProfileSuccess('');

    const trimmedName = profileName.trim();
    const trimmedEmail = profileEmail.trim().toLowerCase();

    if (!trimmedName || trimmedName.length < 2) {
      setProfileError('Display name must be at least 2 characters.');
      return;
    }
    if (trimmedName.length > 80) {
      setProfileError('Display name cannot exceed 80 characters.');
      return;
    }
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setProfileError('Please provide a valid email address.');
      return;
    }

    try {
      setProfileSaving(true);
      await updateUserProfile({
        name: trimmedName,
        email: trimmedEmail
      });
      await refreshUser();
      setProfileSuccess('Profile updated successfully.');
      setIsEditingProfile(false);
    } catch (err) {
      console.error('Failed to update profile:', err);
      setProfileError(err.message || 'Failed to update profile.');
    } finally {
      setProfileSaving(false);
    }
  };

  // ─── Handle Change Password ───────────────────────────────────────────────
  const handleSavePassword = async (e) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (!currentPassword) {
      setPasswordError('Current password is required.');
      return;
    }
    if (!newPassword) {
      setPasswordError('New password is required.');
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters long.');
      return;
    }
    if (!/[A-Z]/.test(newPassword)) {
      setPasswordError('New password must contain at least one uppercase letter.');
      return;
    }
    if (!/[a-z]/.test(newPassword)) {
      setPasswordError('New password must contain at least one lowercase letter.');
      return;
    }
    if (!/[0-9]/.test(newPassword)) {
      setPasswordError('New password must contain at least one digit.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New password and confirmation do not match.');
      return;
    }
    if (newPassword === currentPassword) {
      setPasswordError('New password must be different from current password.');
      return;
    }

    try {
      setPasswordSaving(true);
      const res = await changeUserPassword({
        currentPassword,
        newPassword,
        confirmPassword
      });
      setPasswordSuccess(res.message || 'Password updated successfully. Other sessions invalidated.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setIsChangingPassword(false);
    } catch (err) {
      console.error('Failed to change password:', err);
      setPasswordError(err.message || 'Failed to update password.');
    } finally {
      setPasswordSaving(false);
    }
  };

  // Sort sessions in reverse chronological order
  const sortedSessions = [...(user.loginHistory || [])].sort((a, b) => {
    return new Date(b.loginAt || 0) - new Date(a.loginAt || 0);
  });
  const displayedSessions = expandedHistory ? sortedSessions : sortedSessions.slice(0, 3);

  return (
    <div className="page-container" style={{ maxWidth: '1000px', margin: '0 auto' }}>
      <PageHeader
        breadcrumbs={[
          { label: 'Workspace', to: '/app' },
          { label: 'Profile' }
        ]}
        title="User Profile & Identity"
        subtitle="Manage your enterprise identity, credentials, role binding, and verifiable session history."
      />

      {/* Global Success / Alert Feedback */}
      {profileSuccess && (
        <div style={{
          backgroundColor: '#f0fdf4',
          border: '1px solid #bbf7d0',
          color: '#15803d',
          borderRadius: '8px',
          padding: '12px 16px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '13px'
        }}>
          <CheckCircle2 size={16} />
          <span>{profileSuccess}</span>
        </div>
      )}

      {/* Verification Notice Banner */}
      {!isVerified && (
        <div style={{
          backgroundColor: '#fffbeb',
          border: '1px solid #fde68a',
          borderRadius: '10px',
          padding: '16px 20px',
          marginBottom: '24px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '14px'
        }}>
          <AlertCircle size={22} color="#d97706" style={{ flexShrink: 0, marginTop: '2px' }} />
          <div>
            <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#92400e' }}>
              Account Verification Pending
            </h4>
            <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#b45309', lineHeight: 1.5 }}>
              Your account is currently awaiting verification by a Platform Administrator. 
              You can navigate and view Sentinel Govern models, dashboards, and policies with read-only access. 
              Protected governance actions (registering models, running evaluations, approving policies) will activate automatically once verified.
            </p>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '24px', alignItems: 'start' }}>
        
        {/* Left Column: Identity Card */}
        <div style={{
          backgroundColor: 'var(--color-surface)',
          borderRadius: '12px',
          border: '1px solid var(--color-border)',
          padding: '24px',
          boxShadow: 'var(--shadow-xs)',
          textAlign: 'center'
        }}>
          {user.avatar ? (
            <img 
              src={user.avatar} 
              alt={user.name} 
              referrerPolicy="no-referrer"
              style={{ width: '80px', height: '80px', borderRadius: '50%', objectFit: 'cover', margin: '0 auto 16px' }}
            />
          ) : (
            <div style={{
              width: '80px',
              height: '80px',
              borderRadius: '50%',
              backgroundColor: 'rgba(30, 58, 138, 0.12)',
              color: 'var(--color-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: '28px',
              margin: '0 auto 16px',
              border: '2px solid var(--color-border)'
            }}>
              {user.name?.charAt(0)?.toUpperCase() || 'U'}
            </div>
          )}

          {!isEditingProfile ? (
            <>
              <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--color-text)', margin: '0 0 4px' }}>
                {user.name || 'Anonymous User'}
              </h2>
              <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginBottom: '16px' }}>
                {user.email}
              </div>

              <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '20px' }}>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  fontSize: '11.5px',
                  fontWeight: 600,
                  color: isOnline ? '#166534' : 'var(--color-text-muted)',
                  backgroundColor: isOnline ? 'rgba(34, 197, 94, 0.12)' : 'var(--color-surface-subtle)',
                  padding: '3px 10px',
                  borderRadius: '999px',
                  border: `1px solid ${isOnline ? '#bbf7d0' : 'var(--color-border)'}`
                }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: isOnline ? '#22c55e' : '#94a3b8' }} />
                  {isOnline ? 'Online' : 'Offline'}
                </span>

                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  fontSize: '11.5px',
                  fontWeight: 600,
                  color: isVerified ? '#1e40af' : '#854d0e',
                  backgroundColor: isVerified ? 'rgba(59, 130, 246, 0.12)' : 'rgba(234, 179, 8, 0.12)',
                  padding: '3px 10px',
                  borderRadius: '999px',
                  border: `1px solid ${isVerified ? '#bfdbfe' : '#fde047'}`
                }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: isVerified ? '#3b82f6' : '#eab308' }} />
                  {isVerified ? 'Verified' : 'Pending Verification'}
                </span>
              </div>

              <div style={{
                borderTop: '1px solid var(--color-border)',
                paddingTop: '16px',
                textAlign: 'left',
                fontSize: '12.5px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--color-text-muted)' }}>Account Status:</span>
                  <span style={{ fontWeight: 600, color: user.status === 'ACTIVE' ? '#16a34a' : '#dc2626' }}>
                    {formatStatusLabel(user.status || 'ACTIVE')}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--color-text-muted)' }}>Auth Provider:</span>
                  <span style={{ fontWeight: 600, color: 'var(--color-text)' }}>
                    {user.authProvider || 'EMAIL'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--color-text-muted)' }}>Member Since:</span>
                  <span style={{ fontWeight: 500, color: 'var(--color-text)' }}>
                    {formatDateTime(user.createdAt)}
                  </span>
                </div>
              </div>

              <button
                onClick={() => {
                  setProfileName(user.name || '');
                  setProfileEmail(user.email || '');
                  setProfileError('');
                  setProfileSuccess('');
                  setIsEditingProfile(true);
                }}
                className="btn btn-secondary btn-sm"
                style={{
                  marginTop: '18px',
                  width: '100%',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                <Edit2 size={13} /> Edit Profile
              </button>
            </>
          ) : (
            /* Inline Edit Profile Form */
            <form onSubmit={handleSaveProfile} style={{ textAlign: 'left', marginTop: '4px' }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-text)', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Edit2 size={15} color="var(--color-primary)" />
                <span>Edit Profile Details</span>
              </div>

              {profileError && (
                <div style={{
                  backgroundColor: '#fef2f2',
                  border: '1px solid #fecaca',
                  color: '#b91c1c',
                  borderRadius: '6px',
                  padding: '8px 12px',
                  fontSize: '12px',
                  marginBottom: '12px'
                }}>
                  {profileError}
                </div>
              )}

              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '4px' }}>
                  Display Name *
                </label>
                <input
                  type="text"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  className="input-field"
                  style={{ width: '100%', fontSize: '13px' }}
                  required
                  minLength={2}
                  maxLength={80}
                  disabled={profileSaving}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '4px' }}>
                  Email Address *
                </label>
                <input
                  type="email"
                  value={profileEmail}
                  onChange={(e) => setProfileEmail(e.target.value)}
                  className="input-field"
                  style={{ width: '100%', fontSize: '13px' }}
                  required
                  disabled={profileSaving}
                />
                <span style={{ display: 'block', fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '3px' }}>
                  Used for account notifications and audit ledger identity.
                </span>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setIsEditingProfile(false)}
                  disabled={profileSaving}
                  className="btn btn-secondary btn-sm"
                  style={{ flex: 1 }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={profileSaving}
                  className="btn btn-primary btn-sm"
                  style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}
                >
                  <Save size={13} /> {profileSaving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          )}

        </div>

        {/* Right Column: Organizational Info, Security/Password & Activity History */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Organizational Metadata */}
          <div style={{
            backgroundColor: 'var(--color-surface)',
            borderRadius: '12px',
            border: '1px solid var(--color-border)',
            padding: '24px',
            boxShadow: 'var(--shadow-xs)'
          }}>
            <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-text)', margin: '0 0 16px' }}>
              Organizational Details
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
              <div style={{
                backgroundColor: 'var(--color-surface-subtle)',
                border: '1px solid var(--color-border-subtle)',
                borderRadius: '8px',
                padding: '14px'
              }}>
                <span style={{ fontSize: '11.5px', color: 'var(--color-text-muted)', display: 'block', textTransform: 'uppercase', fontWeight: 600 }}>
                  Assigned Governance Role
                </span>
                <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-primary)', marginTop: '4px', display: 'block' }}>
                  {formatRoleLabel(user.role)}
                </span>
              </div>

              <div style={{
                backgroundColor: 'var(--color-surface-subtle)',
                border: '1px solid var(--color-border-subtle)',
                borderRadius: '8px',
                padding: '14px'
              }}>
                <span style={{ fontSize: '11.5px', color: 'var(--color-text-muted)', display: 'block', textTransform: 'uppercase', fontWeight: 600 }}>
                  Department
                </span>
                <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--color-text)', marginTop: '4px', display: 'block' }}>
                  {user.department || 'Engineering'}
                </span>
              </div>

              <div style={{
                backgroundColor: 'var(--color-surface-subtle)',
                border: '1px solid var(--color-border-subtle)',
                borderRadius: '8px',
                padding: '14px'
              }}>
                <span style={{ fontSize: '11.5px', color: 'var(--color-text-muted)', display: 'block', textTransform: 'uppercase', fontWeight: 600 }}>
                  Team
                </span>
                <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--color-text)', marginTop: '4px', display: 'block' }}>
                  {user.team || 'AI Governance'}
                </span>
              </div>

              <div style={{
                backgroundColor: 'var(--color-surface-subtle)',
                border: '1px solid var(--color-border-subtle)',
                borderRadius: '8px',
                padding: '14px'
              }}>
                <span style={{ fontSize: '11.5px', color: 'var(--color-text-muted)', display: 'block', textTransform: 'uppercase', fontWeight: 600 }}>
                  Team Lead / Manager
                </span>
                <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--color-text)', marginTop: '4px', display: 'block' }}>
                  {user.teamLead || 'Not specified'}
                </span>
              </div>
            </div>
          </div>

          {/* Security & Password Management Section */}
          <div style={{
            backgroundColor: 'var(--color-surface)',
            borderRadius: '12px',
            border: '1px solid var(--color-border)',
            padding: '24px',
            boxShadow: 'var(--shadow-xs)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Key size={17} color="var(--color-primary)" />
                <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-text)', margin: 0 }}>
                  Security & Password Management
                </h3>
              </div>
              {!isExternalGoogleOnly && !isChangingPassword && (
                <button
                  onClick={() => {
                    setIsChangingPassword(true);
                    setPasswordError('');
                    setPasswordSuccess('');
                  }}
                  className="btn btn-secondary btn-sm"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px' }}
                >
                  <Key size={12} /> Change Password
                </button>
              )}
            </div>

            {passwordSuccess && (
              <div style={{
                backgroundColor: '#f0fdf4',
                border: '1px solid #bbf7d0',
                color: '#15803d',
                borderRadius: '6px',
                padding: '10px 14px',
                fontSize: '12.5px',
                marginBottom: '14px'
              }}>
                {passwordSuccess}
              </div>
            )}

            {isExternalGoogleOnly ? (
              /* Google External SSO Information Box */
              <div style={{
                backgroundColor: 'var(--color-surface-subtle)',
                border: '1px solid var(--color-border-subtle)',
                borderRadius: '8px',
                padding: '16px 18px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px'
              }}>
                <Shield size={20} color="var(--color-primary)" style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <div style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--color-text)', marginBottom: '4px' }}>
                    External Google Identity Provider (SSO)
                  </div>
                  <div style={{ fontSize: '12.5px', color: 'var(--color-text-secondary)', lineHeight: '1.5' }}>
                    This account is managed through Google Single Sign-On. Your password, two-factor authentication, and security credentials are administered through your Google Workspace account.
                  </div>
                </div>
              </div>
            ) : !isChangingPassword ? (
              /* Normal Native Account Info */
              <div style={{
                backgroundColor: 'var(--color-surface-subtle)',
                border: '1px solid var(--color-border-subtle)',
                borderRadius: '8px',
                padding: '14px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <div>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text)', display: 'block' }}>
                    Native Password Authentication
                  </span>
                  <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', display: 'block', marginTop: '2px' }}>
                    Standard enterprise credentials protected with salted bcrypt hashing.
                  </span>
                </div>
                <span style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: '#15803d',
                  backgroundColor: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  padding: '3px 8px',
                  borderRadius: '4px'
                }}>
                  ACTIVE
                </span>
              </div>
            ) : (
              /* Change Password Form */
              <form onSubmit={handleSavePassword} style={{
                backgroundColor: 'var(--color-surface-subtle)',
                border: '1px solid var(--color-border)',
                borderRadius: '8px',
                padding: '18px 20px'
              }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text)', marginBottom: '14px' }}>
                  Update Account Password
                </div>

                {passwordError && (
                  <div style={{
                    backgroundColor: '#fef2f2',
                    border: '1px solid #fecaca',
                    color: '#b91c1c',
                    borderRadius: '6px',
                    padding: '8px 12px',
                    fontSize: '12px',
                    marginBottom: '14px'
                  }}>
                    {passwordError}
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px', marginBottom: '14px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '4px' }}>
                      Current Password *
                    </label>
                    <input
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      className="input-field"
                      style={{ width: '100%', fontSize: '13px' }}
                      required
                      disabled={passwordSaving}
                      placeholder="••••••••"
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '4px' }}>
                      New Password *
                    </label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="input-field"
                      style={{ width: '100%', fontSize: '13px' }}
                      required
                      disabled={passwordSaving}
                      placeholder="Min 8 chars"
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '4px' }}>
                      Confirm Password *
                    </label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="input-field"
                      style={{ width: '100%', fontSize: '13px' }}
                      required
                      disabled={passwordSaving}
                      placeholder="Re-type new password"
                    />
                  </div>
                </div>

                <div style={{
                  fontSize: '11px',
                  color: 'var(--color-text-muted)',
                  marginBottom: '16px',
                  backgroundColor: 'var(--color-surface)',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--color-border-subtle)'
                }}>
                  Requirements: minimum 8 characters, at least 1 uppercase letter, 1 lowercase letter, and 1 numeric digit. Changing your password will invalidate other active sessions.
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setIsChangingPassword(false);
                      setPasswordError('');
                      setCurrentPassword('');
                      setNewPassword('');
                      setConfirmPassword('');
                    }}
                    disabled={passwordSaving}
                    className="btn btn-secondary btn-sm"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={passwordSaving}
                    className="btn btn-primary btn-sm"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                  >
                    <Save size={13} /> {passwordSaving ? 'Updating...' : 'Update Password'}
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Login & Activity History */}
          <div style={{
            backgroundColor: 'var(--color-surface)',
            borderRadius: '12px',
            border: '1px solid var(--color-border)',
            padding: '24px',
            boxShadow: 'var(--shadow-xs)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-text)', margin: 0 }}>
                  Login & Activity History
                </h3>
                <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '2px', display: 'block' }}>
                  {sortedSessions.length} recorded session{sortedSessions.length === 1 ? '' : 's'} (showing {displayedSessions.length} latest)
                </span>
              </div>
            </div>

            {sortedSessions.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px', color: 'var(--color-text-muted)', fontSize: '13px' }}>
                No past sessions recorded.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {displayedSessions.map((session, idx) => (
                  <div
                    key={session._id || session.sessionId || idx}
                    style={{
                      backgroundColor: 'var(--color-surface-subtle)',
                      border: '1px solid var(--color-border-subtle)',
                      borderRadius: '8px',
                      padding: '12px 16px',
                      fontSize: '12.5px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, color: 'var(--color-text)' }}>
                        <LogIn size={14} color="var(--color-primary)" />
                        <span>Login: {formatDateTime(session.loginAt)}</span>
                      </div>
                      {session.logoutAt ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-text-muted)', fontSize: '12px', marginTop: '4px' }}>
                          <LogOut size={13} color="var(--color-text-muted)" />
                          <span>Logout: {formatDateTime(session.logoutAt)}</span>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#16a34a', fontSize: '12px', marginTop: '4px', fontWeight: 500 }}>
                          <Circle size={8} fill="#22c55e" color="#22c55e" />
                          <span>Current Active Session</span>
                        </div>
                      )}
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <span style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        backgroundColor: 'var(--color-surface)',
                        color: 'var(--color-text-muted)',
                        border: '1px solid var(--color-border-subtle)',
                        padding: '2px 8px',
                        borderRadius: '4px'
                      }}>
                        {session.authProvider || 'EMAIL'}
                      </span>
                    </div>
                  </div>
                ))}

                {/* View all activity / Show less controls */}
                {sortedSessions.length > 3 && (
                  <div style={{ textAlign: 'center', marginTop: '6px' }}>
                    <button
                      onClick={() => setExpandedHistory(!expandedHistory)}
                      className="btn btn-secondary btn-sm"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        fontSize: '12px',
                        padding: '6px 14px'
                      }}
                    >
                      {expandedHistory ? (
                        <>
                          <ChevronUp size={14} /> Show less
                        </>
                      ) : (
                        <>
                          <ChevronDown size={14} /> View all activity ({sortedSessions.length})
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
