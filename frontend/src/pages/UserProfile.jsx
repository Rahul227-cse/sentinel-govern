import React from 'react';
import { useAuth } from '../context/AuthContext';
import PageHeader from '../components/PageHeader';
import { formatRoleLabel, formatStatusLabel } from '../utils/formatters';
import { 
  AlertCircle,
  LogIn,
  LogOut,
  Circle
} from 'lucide-react';

export default function UserProfile() {
  const { user } = useAuth();

  if (!user) return null;

  const isVerified = user.verificationStatus === 'VERIFIED';
  const isOnline = user.presence === 'ACTIVE';

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

  return (
    <div className="page-container" style={{ maxWidth: '1000px', margin: '0 auto' }}>
      <PageHeader
        breadcrumbs={[
          { label: 'Workspace', link: '/app/dashboard' },
          { label: 'Profile' }
        ]}
        title="User Profile & Identity"
        subtitle="View your enterprise governance role binding, organizational metadata, and session history."
      />

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
                {user.authProvider || 'native'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>Member Since:</span>
              <span style={{ fontWeight: 500, color: 'var(--color-text)' }}>
                {formatDateTime(user.createdAt)}
              </span>
            </div>
          </div>
        </div>

        {/* Right Column: Organizational Information & Session Activity */}
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
                  {user.department || 'Not specified'}
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
                  {user.team || 'Not specified'}
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
                  {user.teamLead || 'None / Not specified'}
                </span>
              </div>
            </div>
          </div>

          {/* Session & Activity History */}
          <div style={{
            backgroundColor: 'var(--color-surface)',
            borderRadius: '12px',
            border: '1px solid var(--color-border)',
            padding: '24px',
            boxShadow: 'var(--shadow-xs)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-text)', margin: 0 }}>
                Login & Activity History
              </h3>
              <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                {user.loginHistory?.length || 0} recorded sessions
              </span>
            </div>

            {(!user.loginHistory || user.loginHistory.length === 0) ? (
              <div style={{ textAlign: 'center', padding: '24px', color: 'var(--color-text-muted)', fontSize: '13px' }}>
                No past sessions recorded.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {user.loginHistory.slice(0, 10).map((session, idx) => (
                  <div
                    key={session._id || idx}
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
                        {session.authProvider || 'native'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
