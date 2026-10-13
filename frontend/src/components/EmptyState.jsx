import React from 'react';

/**
 * EmptyState: Professional enterprise empty state with context and recovery actions
 * Communicates that empty = valid, system is ready.
 */
export default function EmptyState({
  icon: Icon,
  title,
  description,
  actionText,
  onAction,
  action,
  secondaryActionText,
  onSecondaryAction,
  style = {}
}) {
  return (
    <div
      style={{
        textAlign: 'center',
        padding: '52px 24px',
        backgroundColor: 'var(--color-surface)',
        border: '1px dashed var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        ...style
      }}
    >
      {Icon && (
        <div
          style={{
            width: '40px',
            height: '40px',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--color-surface-secondary)',
            color: 'var(--color-text-muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '16px',
            border: '1px solid var(--color-border)'
          }}
        >
          <Icon size={20} strokeWidth={1.8} />
        </div>
      )}

      <h3
        style={{
          fontSize: '15px',
          fontWeight: 600,
          color: 'var(--color-text)',
          marginBottom: '6px',
          letterSpacing: '-0.01em'
        }}
      >
        {title}
      </h3>

      {description && (
        <p
          style={{
            fontSize: '13px',
            color: 'var(--color-text-secondary)',
            maxWidth: '440px',
            lineHeight: 1.55,
            marginBottom: (actionText || action) ? '20px' : '0'
          }}
        >
          {description}
        </p>
      )}

      {action && (
        <div style={{ marginTop: description ? '16px' : '8px' }}>
          {action}
        </div>
      )}

      {!action && (actionText || secondaryActionText) && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
          {actionText && (
            <button className="btn btn-primary btn-sm" onClick={onAction}>
              {actionText}
            </button>
          )}
          {secondaryActionText && (
            <button className="btn btn-secondary btn-sm" onClick={onSecondaryAction}>
              {secondaryActionText}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
