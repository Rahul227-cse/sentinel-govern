import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Normalizes and strips origin/localhost from a target link, ensuring
 * it is a valid internal SPA route path.
 */
function cleanBreadcrumbTarget(rawTarget) {
  if (!rawTarget || typeof rawTarget !== 'string') return null;
  let target = rawTarget.trim();
  try {
    if (target.startsWith('http://') || target.startsWith('https://')) {
      const url = new URL(target);
      if (
        url.hostname === 'localhost' ||
        url.hostname === '127.0.0.1' ||
        (typeof window !== 'undefined' && url.origin === window.location.origin)
      ) {
        target = url.pathname + url.search + url.hash;
      }
    }
  } catch {
    // Ignore URL parse errors
  }

  // Normalize duplicate or legacy paths
  if (target === '/app/dashboard' || target === '/dashboard') {
    target = '/app';
  }

  return target || null;
}

/**
 * Maps known route paths to clean, human-readable labels.
 */
function mapPathToLabel(path) {
  if (!path) return '';
  const clean = path.toLowerCase().replace(/\/$/, '');
  switch (clean) {
    case '':
    case '/app':
    case '/app/dashboard':
    case '/dashboard':
      return 'Executive Dashboard';
    case '/app/registry':
    case '/registry':
    case '/app/models':
    case '/models':
      return 'Model Registry';
    case '/app/evaluation':
    case '/evaluation':
      return 'Fairness & Eval Studio';
    case '/app/policies':
    case '/policies':
      return 'Policy Management';
    case '/app/approvals':
    case '/approvals':
      return 'Approval Center';
    case '/app/monitoring':
    case '/monitoring':
      return 'Runtime Drift & Health';
    case '/app/incidents':
    case '/incidents':
      return 'Incident Management';
    case '/app/issues':
    case '/issues':
      return 'Issue Reports';
    case '/app/audit':
    case '/audit':
      return 'Audit Trail & Ledger';
    case '/app/dossier':
    case '/app/reports':
    case '/dossier':
    case '/reports':
      return 'Compliance Dossier';
    case '/app/profile':
    case '/profile':
      return 'Profile';
    case '/admin':
    case '/admin/users':
      return 'Users & Roles';
    default:
      return '';
  }
}

/**
 * Cleans any raw Markdown syntax, localhost addresses, URLs, or unprocessed
 * route paths from a breadcrumb label.
 */
function cleanBreadcrumbLabel(rawLabel, extractedTarget = null) {
  if (!rawLabel || typeof rawLabel !== 'string') return '';
  let label = rawLabel.trim();

  // Strip Markdown link syntax: [Text](url)
  const mdMatch = label.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
  if (mdMatch) {
    label = mdMatch[1];
  } else {
    // Strip inline markdown link remnants [Text](...) -> Text
    label = label.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  }

  // Remove stray brackets
  label = label.replace(/[\[\]]/g, '');

  // Strip raw URLs or localhost references
  if (label.startsWith('http://') || label.startsWith('https://') || label.includes('localhost:')) {
    try {
      const url = new URL(label.startsWith('http') ? label : `http://${label}`);
      label = mapPathToLabel(url.pathname) || 'Workspace';
    } catch {
      label = 'Workspace';
    }
  }

  // Strip unprocessed route paths like "/app" or "/admin/users"
  if (label.startsWith('/')) {
    label = mapPathToLabel(label) || label.replace(/^\/+/, '');
  }

  return label.trim();
}

/**
 * Splits a composite breadcrumb string (e.g. "[Governance](http://localhost:3000/app)/Issue Reports")
 * without breaking URLs nested inside parentheses.
 */
function parseBreadcrumbsString(str) {
  if (!str || typeof str !== 'string') return [];
  const tokens = [];
  let current = '';
  let inParen = false;

  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === '(') inParen = true;
    else if (ch === ')') inParen = false;

    if (!inParen && (ch === '/' || (ch === '>' && str[i - 1] === ' ') || ch === '\\')) {
      if (current.trim()) tokens.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) tokens.push(current.trim());
  return tokens;
}

/**
 * Returns canonical hierarchical breadcrumbs when none are provided.
 */
function getDefaultBreadcrumbs(pathname, role) {
  const path = (pathname || '').toLowerCase().replace(/\/$/, '') || '/app';

  if (path.startsWith('/admin')) {
    return [
      { label: 'Administration', to: '/admin/users' },
      { label: 'Users & Roles' }
    ];
  }

  if (path === '/app' || path === '/app/dashboard' || path === '/dashboard') {
    const parent = role === 'PLATFORM_ADMIN' ? 'Permitted Oversight' : 'Workspace';
    return [
      { label: parent, to: '/app' },
      { label: 'Executive Dashboard' }
    ];
  }

  if (path.startsWith('/app/registry') || path.startsWith('/app/models')) {
    if (path.startsWith('/app/models/') && path !== '/app/models') {
      return [
        { label: 'Model Registry', to: '/app/registry' },
        { label: 'Model Details' }
      ];
    }
    const parent = role === 'PLATFORM_ADMIN' ? 'Permitted Oversight' : 'Workspace';
    return [
      { label: parent, to: '/app' },
      { label: 'Model Registry' }
    ];
  }

  if (path.startsWith('/app/evaluation') || path.startsWith('/evaluation')) {
    return [
      { label: 'Workspace', to: '/app' },
      { label: 'Fairness & Eval Studio' }
    ];
  }

  if (path.startsWith('/app/policies') || path.startsWith('/policies')) {
    return [
      { label: 'Workspace', to: '/app' },
      { label: 'Policy Management' }
    ];
  }

  if (path.startsWith('/app/approvals') || path.startsWith('/approvals')) {
    return [
      { label: 'Workspace', to: '/app' },
      { label: 'Approval Center' }
    ];
  }

  if (path.startsWith('/app/monitoring') || path.startsWith('/monitoring')) {
    return [
      { label: 'Workspace', to: '/app' },
      { label: 'Runtime Drift & Health' }
    ];
  }

  if (path.startsWith('/app/incidents') || path.startsWith('/incidents')) {
    return [
      { label: 'Workspace', to: '/app' },
      { label: 'Incident Management' }
    ];
  }

  if (path.startsWith('/app/issues') || path.startsWith('/issues')) {
    return [
      { label: 'Governance', to: '/app' },
      { label: 'Issue Reports' }
    ];
  }

  if (path.startsWith('/app/audit') || path.startsWith('/audit')) {
    return [
      { label: 'Governance', to: '/app' },
      { label: 'Audit Trail & Ledger' }
    ];
  }

  if (
    path.startsWith('/app/dossier') ||
    path.startsWith('/app/reports') ||
    path.startsWith('/dossier') ||
    path.startsWith('/reports')
  ) {
    return [
      { label: 'Governance', to: '/app' },
      { label: 'Compliance Dossier' }
    ];
  }

  if (path.startsWith('/app/profile') || path.startsWith('/profile')) {
    return [
      { label: 'Workspace', to: '/app' },
      { label: 'Profile' }
    ];
  }

  return [];
}

/**
 * Normalizes input breadcrumbs from arrays, strings, or missing props
 * into a sanitized list of { label, to } items.
 */
function normalizeBreadcrumbs(rawBreadcrumbs, locationPathname, userRole) {
  let list = [];

  if (typeof rawBreadcrumbs === 'string') {
    list = parseBreadcrumbsString(rawBreadcrumbs);
  } else if (Array.isArray(rawBreadcrumbs)) {
    list = rawBreadcrumbs;
  }

  if (!list || list.length === 0) {
    list = getDefaultBreadcrumbs(locationPathname, userRole);
  }

  return list
    .map((item) => {
      if (!item) return null;

      let rawLabel = '';
      let rawTarget = null;

      if (typeof item === 'string') {
        const md = item.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        if (md) {
          rawLabel = md[1];
          rawTarget = md[2];
        } else {
          rawLabel = item;
        }
      } else if (typeof item === 'object') {
        const labelCandidate = item.label || item.title || item.name || item.text || '';
        const targetCandidate = item.to || item.link || item.href || item.path || null;

        if (typeof labelCandidate === 'string') {
          const md = labelCandidate.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
          if (md) {
            rawLabel = md[1];
            rawTarget = targetCandidate || md[2];
          } else {
            rawLabel = labelCandidate;
            rawTarget = targetCandidate;
          }
        } else {
          rawLabel = String(labelCandidate);
          rawTarget = targetCandidate;
        }
      }

      const label = cleanBreadcrumbLabel(rawLabel);
      const to = cleanBreadcrumbTarget(rawTarget);

      if (!label) return null;
      return { label, to };
    })
    .filter(Boolean);
}

/**
 * PageHeader: Enterprise breadcrumb, title, subtitle, and action controls.
 * Centralizes breadcrumb parsing, sanitization, and hierarchy resolution across all roles.
 */
export default function PageHeader({
  breadcrumbs,
  title,
  subtitle,
  children,
  action,
  badge
}) {
  const loc = useLocation();
  const locationPathname = loc?.pathname || '';

  const auth = useAuth();
  const userRole = auth?.user?.role || null;

  const items = normalizeBreadcrumbs(breadcrumbs, locationPathname, userRole);

  const actions = (children && action) ? (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
      {children}
      {action}
    </div>
  ) : (children || action);

  return (
    <div className="page-header">
      <div>
        {/* Global Breadcrumb UI Suppression: Breadcrumb trail removed per enterprise design */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <h1 className="page-title">{title}</h1>
          {badge}
        </div>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>

      {actions && <div className="header-actions">{actions}</div>}
    </div>
  );
}
