import React, { memo } from 'react';

/**
 * AnimatedCircularFrame
 *
 * Renders authentication form content directly inside a 50-segment
 * circular wheel that rotates continuously as one unified unit.
 *
 * Free of rectangular form cards, borders, panels, or box shadows.
 */
const SEGMENT_COUNT = 50;

function AnimatedCircularFrameComponent({ children, className = '', mode = 'login' }) {
  return (
    <div className={`auth-circular-frame mode-${mode} ${className}`}>
      {/* Ambient soft glow behind rotating ring */}
      <div className="auth-circular-glow" aria-hidden="true" />

      {/* 50-Segment Circular Orbit — Rotates as ONE unified circle in a single direction */}
      <div className="auth-circular-ring" aria-hidden="true">
        {Array.from({ length: SEGMENT_COUNT }, (_, i) => {
          // Calculate vertical position factor t:
          // 0 at top (i = 0), 1 at bottom (i = 25), 0.5 at sides (i = 12, 37)
          const t = ((1 - Math.cos((i / SEGMENT_COUNT) * 2 * Math.PI)) / 2).toFixed(3);
          return (
            <span
              key={i}
              style={{
                '--i': i,
                '--t': t
              }}
            />
          );
        })}
      </div>

      {/* Form Content directly inside the circle */}
      <div className="auth-card">
        {children}
      </div>
    </div>
  );
}

export default memo(AnimatedCircularFrameComponent);
