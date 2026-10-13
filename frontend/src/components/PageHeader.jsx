import React from 'react';
import { Link } from 'react-router-dom';

/**
 * PageHeader: Enterprise breadcrumb, title, subtitle, and action controls
 */
export default function PageHeader({
  breadcrumbs = [],
  title,
  subtitle,
  children,
  badge
}) {
  return (
    <div className="page-header">
      <div>
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav className="breadcrumb-trail" aria-label="Breadcrumb">
            {breadcrumbs.map((b, idx) => (
              <React.Fragment key={idx}>
                {b.to ? (
                  <Link to={b.to} className="breadcrumb-item">
                    {b.label}
                  </Link>
                ) : (
                  <span className="breadcrumb-item" style={{ color: 'var(--text-muted)' }}>
                    {b.label}
                  </span>
                )}
                {idx < breadcrumbs.length - 1 && (
                  <span className="breadcrumb-separator">/</span>
                )}
              </React.Fragment>
            ))}
          </nav>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <h1 className="page-title">{title}</h1>
          {badge}
        </div>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>

      {children && <div className="header-actions">{children}</div>}
    </div>
  );
}
