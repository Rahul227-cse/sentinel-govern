import React from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';

/**
 * ErrorState: Standardized enterprise error display with retry action
 */
export default function ErrorState({
  icon: Icon = AlertCircle,
  title = 'Unable to Load Data',
  message,
  retryText = 'Try Again',
  onRetry,
  secondaryActionText,
  onSecondaryAction,
  style = {}
}) {
  return (
    <div
      style={{
        textAlign: 'center',
        padding: '48px 24px',
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-color)',
        borderRadius: 'var(--radius-lg)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        ...style
      }}
    >
      <div
        style={{
          width: '48px',
          height: '48px',
          borderRadius: '50%',
          backgroundColor: 'var(--color-danger-bg)',
          color: 'var(--color-danger-text)',
          border: '1px solid var(--color-danger-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '16px'
        }}
      >
        <Icon size={24} />
      </div>

      <h3
        style={{
          fontSize: '16px',
          fontWeight: 600,
          color: 'var(--text-primary)',
          marginBottom: '8px'
        }}
      >
        {title}
      </h3>

      {message && (
        <p
          style={{
            fontSize: '13px',
            color: 'var(--text-secondary)',
            maxWidth: '480px',
            lineHeight: 1.5,
            marginBottom: (onRetry || onSecondaryAction) ? '20px' : '0'
          }}
        >
          {message}
        </p>
      )}

      {(onRetry || secondaryActionText) && (
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {onRetry && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={onRetry}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <RotateCcw size={14} />
              {retryText}
            </button>
          )}
          {secondaryActionText && onSecondaryAction && (
            <button className="btn btn-subtle btn-sm" onClick={onSecondaryAction}>
              {secondaryActionText}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
