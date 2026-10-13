import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ShieldAlert, ArrowLeft } from 'lucide-react';
import { formatRoleLabel } from '../utils/formatters';

export default function AccessDeniedNotice({ requiredRoles = [] }) {
  const { user } = useAuth();
  const navigate = useNavigate();

  return (
    <div style={{
      padding: '48px 24px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '70vh'
    }}>
      <div style={{
        maxWidth: '480px',
        width: '100%',
        backgroundColor: 'var(--bg-surface)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-color)',
        padding: '36px 32px',
        textAlign: 'center',
        boxShadow: 'var(--shadow-md)'
      }}>
        <div style={{
          width: '52px',
          height: '52px',
          borderRadius: '50%',
          backgroundColor: 'var(--danger-bg)',
          border: '1px solid var(--danger-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 16px',
          color: 'var(--danger)'
        }}>
          <ShieldAlert size={26} />
        </div>

        <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px', color: 'var(--text-primary)' }}>
          Role Authorization Restricted
        </h2>

        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.6', marginBottom: '20px' }}>
          This governance area is strictly partitioned and requires one of the following authorized roles:
        </p>

        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '8px',
          justifyContent: 'center',
          marginBottom: '20px'
        }}>
          {requiredRoles.map((role) => (
            <span
              key={role}
              className="badge badge-danger"
              style={{ fontSize: '11.5px', padding: '4px 10px' }}
            >
              {formatRoleLabel(role)}
            </span>
          ))}
        </div>

        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '24px' }}>
          Your current authenticated role is <strong style={{ color: 'var(--text-primary)' }}>{formatRoleLabel(user?.role)}</strong>.
        </p>

        <button
          onClick={() => navigate('/app')}
          className="btn btn-primary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', margin: '0 auto' }}
        >
          <ArrowLeft size={15} /> Return to Governance Dashboard
        </button>
      </div>
    </div>
  );
}
