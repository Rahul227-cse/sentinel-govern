import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Clock, LogOut, RefreshCw } from 'lucide-react';

export default function PendingApprovalNotice() {
  const { user, logout, refreshUser } = useAuth();
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState(null);

  const handleRefresh = async () => {
    setChecking(true);
    setMessage(null);
    try {
      const updatedUser = await refreshUser();
      if (updatedUser?.status === 'ACTIVE') {
        setMessage({ type: 'success', text: 'Account activated! Entering platform...' });
      } else {
        setMessage({ type: 'info', text: 'Status is still PENDING. Please contact your platform administrator.' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to verify account status. Please try again.' });
    } finally {
      setChecking(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'var(--bg-base, #F8FAFC)',
      padding: '24px',
      color: 'var(--text-primary, #0F172A)'
    }}>
      <div style={{
        maxWidth: '500px',
        width: '100%',
        backgroundColor: 'var(--color-surface)',
        borderRadius: 'var(--radius-modal)',
        border: '1px solid var(--color-border)',
        padding: '40px 32px',
        boxShadow: 'var(--shadow-dropdown)',
        textAlign: 'center'
      }}>
        <div style={{
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          backgroundColor: 'var(--warning-bg, #FEF3C7)',
          border: '1px solid var(--warning-border, #FDE68A)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 20px',
          color: 'var(--warning, #D97706)'
        }}>
          <Clock size={28} />
        </div>

        <span style={{
          display: 'inline-block',
          fontSize: '11px',
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          padding: '4px 12px',
          borderRadius: '999px',
          backgroundColor: 'var(--warning-bg, #FEF3C7)',
          color: 'var(--warning, #D97706)',
          border: '1px solid var(--warning-border, #FDE68A)',
          marginBottom: '14px'
        }}>
          Awaiting Administrator Approval
        </span>

        <h1 style={{ fontSize: '20px', fontWeight: 800, marginBottom: '10px', color: 'var(--text-primary)' }}>
          Access Pending Review
        </h1>

        <p style={{
          fontSize: '13.5px',
          color: 'var(--text-secondary, #475569)',
          lineHeight: '1.6',
          marginBottom: '24px'
        }}>
          Welcome, <strong style={{ color: 'var(--text-primary)' }}>{user?.name || user?.email}</strong>. 
          Your corporate Google identity has been verified. In accordance with enterprise AI governance policy, 
          new accounts require a Platform Administrator to review and activate your governance permissions.
        </p>

        {/* User Info Card */}
        <div style={{
          backgroundColor: 'var(--bg-secondary, #F1F5F9)',
          border: '1px solid var(--border-color, #E2E8F0)',
          borderRadius: 'var(--radius-md, 8px)',
          padding: '16px',
          textAlign: 'left',
          fontSize: '12.5px',
          marginBottom: '24px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ color: 'var(--text-muted)' }}>Verified Email:</span>
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{user?.email}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ color: 'var(--text-muted)' }}>Current Status:</span>
            <span style={{ fontWeight: 700, color: 'var(--warning)' }}>{user?.status || 'PENDING'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-muted)' }}>Assigned Role:</span>
            <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>{user?.role || 'GOVERNANCE_OFFICER'} (Inactive)</span>
          </div>
        </div>

        {message && (
          <div style={{
            padding: '10px 14px',
            borderRadius: 'var(--radius-md)',
            fontSize: '13px',
            marginBottom: '20px',
            backgroundColor: message.type === 'success' ? 'var(--success-bg)' : 'var(--accent-light)',
            border: `1px solid ${message.type === 'success' ? 'var(--success-border)' : 'var(--border-color)'}`,
            color: message.type === 'success' ? 'var(--success)' : 'var(--accent-primary)'
          }}>
            {message.text}
          </div>
        )}

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
          <button
            onClick={handleRefresh}
            disabled={checking}
            className="btn btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
          >
            <RefreshCw size={14} className={checking ? 'animate-spin' : ''} />
            {checking ? 'Checking Status...' : 'Check Status'}
          </button>

          <button
            onClick={logout}
            className="btn btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
          >
            <LogOut size={14} />
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}
