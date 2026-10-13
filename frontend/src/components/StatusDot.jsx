import React from 'react';

/**
 * StatusDot: Subtle colored indicator with optional pulse for live states.
 * Colors adhere to enterprise status language without neon glows.
 */
export default function StatusDot({ status, pulse = false, style = {} }) {
  const normalized = (status || '').toLowerCase().replace(/[\s-]/g, '_');
  
  return (
    <span
      className={`status-dot ${normalized} ${pulse ? 'pulse' : ''}`}
      style={style}
      aria-hidden="true"
    />
  );
}
