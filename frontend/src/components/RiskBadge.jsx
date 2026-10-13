import React from 'react';
import { AlertCircle, AlertTriangle, ShieldCheck, ShieldAlert } from 'lucide-react';
import StatusBadgeCore from './StatusBadge';

export function RiskBadge({ level }) {
  const normalized = (level || 'HIGH').toUpperCase();

  switch (normalized) {
    case 'UNACCEPTABLE':
      return (
        <span className="status-badge status-danger" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <ShieldAlert size={12} />
          Unacceptable Risk
        </span>
      );
    case 'HIGH':
      return (
        <span className="status-badge status-warning" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <AlertTriangle size={12} />
          High Risk
        </span>
      );
    case 'LIMITED':
      return (
        <span className="status-badge status-info" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <AlertCircle size={12} />
          Limited Risk
        </span>
      );
    case 'MINIMAL':
    case 'LOW':
    default:
      return (
        <span className="status-badge status-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <ShieldCheck size={12} />
          Minimal Risk
        </span>
      );
  }
}

export function StatusBadge({ status }) {
  return <StatusBadgeCore status={status} />;
}
