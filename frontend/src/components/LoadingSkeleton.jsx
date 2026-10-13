import React from 'react';

/**
 * LoadingSkeleton: Minimal pulse skeleton matching layout
 */
export default function LoadingSkeleton({ rows = 3, height = '40px', style = {} }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%', ...style }}>
      {Array.from({ length: rows }).map((_, idx) => (
        <div
          key={idx}
          style={{
            height,
            backgroundColor: 'var(--bg-subtle)',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-subtle)',
            animation: 'skeleton-pulse 1.5s ease-in-out infinite'
          }}
        />
      ))}
      <style>{`
        @keyframes skeleton-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
