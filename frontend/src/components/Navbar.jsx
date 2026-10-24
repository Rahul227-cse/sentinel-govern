import React from 'react';
import { useRole } from '../context/RoleContext';
import { useAuth } from '../context/AuthContext';
import { formatRoleLabel } from '../utils/formatters';
import GoogleSignInButton from './GoogleSignInButton';
import ThemeToggle from './ThemeToggle';
import NotificationBell from './NotificationBell';
import { Shield, CheckCircle2, Clock } from 'lucide-react';

export default function Navbar() {
  const { currentRole, switchRole, roles } = useRole();
  const { user, isAuthenticated } = useAuth();

  return (
    <header className="navbar" role="banner">
      {/* Left side: Context & Workspace Breadcrumb */}
      <div className="navbar-left">
        <div className="navbar-workspace-context">
          <span className="navbar-workspace-name">Sentinel Govern</span>
          <span className="navbar-domain-divider">/</span>
          <span>AI Governance Control Plane</span>
        </div>
      </div>

      {/* Right side: Security Controls, Theme Toggle & Session Identity */}
      <div className="navbar-right">
        {/* Subtle Policy Gating indicator */}
        <div
          className="navbar-gate-indicator"
          title="Deterministic policy gates and tamper-evident audit logging are active"
        >
          <span className="status-dot healthy pulse" />
          <span>Policy Gates Active</span>
        </div>

        {/* In-App Drift & Incident Notifications */}
        <NotificationBell />

        {/* Theme Toggle (Light / Dark) */}
        <ThemeToggle />

        {/* Authenticated Role Display */}
        {isAuthenticated && user ? (
          <div className="navbar-role-pill">
            <Shield size={13} className="navbar-role-icon" />
            <span className="navbar-role-text">
              <strong>{formatRoleLabel(user.role)}</strong>
            </span>
            {user.verificationStatus === 'VERIFIED' ? (
              <span className="navbar-verified-tag" title="Account verified by Platform Administrator">
                <CheckCircle2 size={11} /> Verified
              </span>
            ) : (
              <span className="navbar-pending-tag" title="Account verification pending review">
                <Clock size={11} /> Pending
              </span>
            )}
          </div>
        ) : (
          /* Unauthenticated Simulation Mode Persona Switcher */
          <div
            className="navbar-role-pill"
            title="Simulation Persona (Active when unauthenticated)"
          >
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 12 }}>Persona:</span>
            <select
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--color-text)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                outline: 'none'
              }}
              value={currentRole?.id || 'ML_LEAD'}
              onChange={(e) => switchRole && switchRole(e.target.value)}
            >
              {roles && roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Sign In Button if not authenticated */}
        {!isAuthenticated && <GoogleSignInButton />}
      </div>
    </header>
  );
}
