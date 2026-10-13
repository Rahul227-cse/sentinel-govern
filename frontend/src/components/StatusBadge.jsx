import React from 'react';
import StatusDot from './StatusDot';
import { formatStatusLabel, formatLifecycleLabel } from '../utils/formatters';

/**
 * StatusBadge: Unified enterprise status badge
 * Always includes readable text and subtle dot; never relies on color alone.
 */
export default function StatusBadge({ 
  status, 
  label, 
  variant, 
  pulse = false,
  showDot = true,
  className = '',
  style = {} 
}) {
  const normStatus = (status || '').toLowerCase().replace(/[\s-]/g, '_');
  const badgeClass = variant ? `badge-${variant}` : `badge-${normStatus}`;
  
  // Format the label gracefully using centralized formatters, eliminating underscores
  let displayLabel = label;
  if (!displayLabel && status) {
    displayLabel = formatLifecycleLabel(status);
    if (displayLabel === status && status.includes('_')) {
      displayLabel = formatStatusLabel(status);
    }
  }
  displayLabel = displayLabel || 'Unknown';

  return (
    <span className={`badge ${badgeClass} ${className}`} style={style}>
      {showDot && <StatusDot status={normStatus} pulse={pulse} />}
      <span>{displayLabel}</span>
    </span>
  );
}
