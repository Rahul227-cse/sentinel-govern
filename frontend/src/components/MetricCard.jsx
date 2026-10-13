import React from 'react';

/**
 * MetricCard: High-density enterprise KPI metric card
 */
export default function MetricCard({
  title,
  value,
  subtext,
  icon: Icon,
  trend,
  trendPositive,
  onClick,
  style = {}
}) {
  return (
    <div
      className="metric-card"
      onClick={onClick}
      style={{
        cursor: onClick ? 'pointer' : 'default',
        ...style
      }}
    >
      <div className="metric-header">
        <span>{title}</span>
        {Icon && (
          <div className="metric-icon-wrap">
            <Icon size={16} />
          </div>
        )}
      </div>

      <div className="metric-value tnum">{value}</div>

      {(subtext || trend) && (
        <div className="metric-sub">
          {trend && (
            <span
              style={{
                color: trendPositive ? 'var(--success-text)' : 'var(--danger-text)',
                fontWeight: 600
              }}
            >
              {trend}
            </span>
          )}
          <span>{subtext}</span>
        </div>
      )}
    </div>
  );
}
