import React from 'react';
import { useAuth } from '../context/AuthContext';
import { ShieldX, LogOut } from 'lucide-react';

export default function SuspendedNotice() {
  const { user, logout } = useAuth();

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
        backgroundColor: '#FFFFFF',
        borderRadius: 'var(--radius-lg, 12px)',
        border: '1px solid var(--danger-border, #FECDD3)',
        padding: '40px 32px',
        boxShadow: 'var(--shadow-md)',
        textAlign: 'center'
      }}>
        <div style={{
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          backgroundColor: 'var(--danger-bg, #FFF1F2)',
          border: '1px solid var(--danger-border, #FECDD3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 20px',
          color: 'var(--danger, #E11D48)'
        }}>
          <ShieldX size={28} />
        </div>

        <span style={{
          display: 'inline-block',
          fontSize: '11px',
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          padding: '4px 12px',
          borderRadius: '999px',
          backgroundColor: 'var(--danger-bg, #FFF1F2)',
          color: 'var(--danger, #E11D48)',
          border: '1px solid var(--danger-border, #FECDD3)',
          marginBottom: '14px'
        }}>
          Access Revoked
        </span>

        <h1 style={{ fontSize: '20px', fontWeight: 800, marginBottom: '10px', color: 'var(--text-primary)' }}>
          Account Suspended
        </h1>

        <p style={{
          fontSize: '13.5px',
          color: 'var(--text-secondary, #475569)',
          lineHeight: '1.6',
          marginBottom: '24px'
        }}>
          Access for account <strong style={{ color: 'var(--text-primary)' }}>{user?.email}</strong> has been revoked 
          by a Platform Administrator. All access to model registries, evaluations, policy configurations, 
          and audit ledgers has been blocked.
        </p>

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
            <span style={{ color: 'var(--text-muted)' }}>Account Email:</span>
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{user?.email}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-muted)' }}>Account Status:</span>
            <span style={{ fontWeight: 700, color: 'var(--danger)' }}>SUSPENDED</span>
          </div>
        </div>

        <button
          onClick={logout}
          className="btn btn-secondary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', margin: '0 auto' }}
        >
          <LogOut size={14} />
          Sign Out of Sentinel Govern
        </button>
      </div>
    </div>
  );
}
