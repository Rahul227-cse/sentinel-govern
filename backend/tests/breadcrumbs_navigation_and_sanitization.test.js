import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');

/**
 * Re-create the pure logic functions from PageHeader.jsx for standalone Node.js testing.
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
        url.port === '3000'
      ) {
        target = url.pathname + url.search + url.hash;
      }
    }
  } catch {
    // Ignore URL parse errors
  }

  if (target === '/app/dashboard' || target === '/dashboard') {
    target = '/app';
  }

  return target || null;
}

function mapPathToLabel(pathStr) {
  if (!pathStr) return '';
  const clean = pathStr.toLowerCase().replace(/\/$/, '');
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

function cleanBreadcrumbLabel(rawLabel) {
  if (!rawLabel || typeof rawLabel !== 'string') return '';
  let label = rawLabel.trim();

  const mdMatch = label.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
  if (mdMatch) {
    label = mdMatch[1];
  } else {
    label = label.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  }

  label = label.replace(/[\[\]]/g, '');

  if (label.startsWith('http://') || label.startsWith('https://') || label.includes('localhost:')) {
    try {
      const url = new URL(label.startsWith('http') ? label : `http://${label}`);
      label = mapPathToLabel(url.pathname) || 'Workspace';
    } catch {
      label = 'Workspace';
    }
  }

  if (label.startsWith('/')) {
    label = mapPathToLabel(label) || label.replace(/^\/+/, '');
  }

  return label.trim();
}

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

// ─────────────────────────────────────────────────────────────────────────────
// TEST SUITE
// ─────────────────────────────────────────────────────────────────────────────

test('1. Central Markdown and URL Breadcrumb Sanitization', async (t) => {
  await t.test('1.1 Normalizes composite raw markdown string with localhost URL', () => {
    const raw = '[Governance](http://localhost:3000/app)/Issue Reports';
    const items = normalizeBreadcrumbs(raw, '/app/issues', 'GOVERNANCE_OFFICER');

    assert.equal(items.length, 2);
    assert.deepEqual(items[0], { label: 'Governance', to: '/app' });
    assert.deepEqual(items[1], { label: 'Issue Reports', to: null });
  });

  await t.test('1.2 Sanitizes objects with markdown in label', () => {
    const raw = [
      { label: '[Governance](http://localhost:3000/app)', to: '/app' },
      { label: 'Issue Reports' }
    ];
    const items = normalizeBreadcrumbs(raw, '/app/issues', 'ML_LEAD');

    assert.equal(items.length, 2);
    assert.equal(items[0].label, 'Governance');
    assert.equal(items[0].to, '/app');
    assert.equal(items[1].label, 'Issue Reports');
    assert.equal(items[1].to, null);
  });

  await t.test('1.3 Strips origin from full URLs in target', () => {
    const raw = [
      { label: 'Governance', to: 'http://localhost:3000/app' },
      { label: 'Compliance Dossier' }
    ];
    const items = normalizeBreadcrumbs(raw, '/app/dossier', 'GOVERNANCE_OFFICER');

    assert.equal(items.length, 2);
    assert.equal(items[0].to, '/app');
    assert.equal(items[0].label, 'Governance');
    assert.equal(items[1].label, 'Compliance Dossier');
  });

  await t.test('1.4 Normalizes legacy /app/dashboard targets to /app', () => {
    const raw = [
      { label: 'Workspace', link: '/app/dashboard' },
      { label: 'Profile' }
    ];
    const items = normalizeBreadcrumbs(raw, '/app/profile', 'ML_LEAD');

    assert.equal(items.length, 2);
    assert.equal(items[0].label, 'Workspace');
    assert.equal(items[0].to, '/app');
    assert.equal(items[1].label, 'Profile');
  });

  await t.test('1.5 Never retains brackets, parentheses, or localhost URLs in labels', () => {
    const testCases = [
      '[Workspace](http://127.0.0.1:3000/app)',
      '[Administration](/admin/users)',
      'http://localhost:3000/app',
      '/app/dossier',
      '[Model Registry]'
    ];

    for (const tc of testCases) {
      const clean = cleanBreadcrumbLabel(tc);
      assert.ok(!clean.includes('['), `Should not contain [: ${clean}`);
      assert.ok(!clean.includes(']'), `Should not contain ]: ${clean}`);
      assert.ok(!clean.includes('localhost'), `Should not contain localhost: ${clean}`);
      assert.ok(!clean.startsWith('/'), `Should not start with /: ${clean}`);
      assert.ok(clean.length > 0, `Should produce valid non-empty label for ${tc}`);
    }
  });
});

test('2. Automatic Route & Role Hierarchy Resolution', async (t) => {
  await t.test('2.1 Resolves PLATFORM_ADMIN on /admin/users to Administration / Users & Roles', () => {
    const items = normalizeBreadcrumbs(null, '/admin/users', 'PLATFORM_ADMIN');
    assert.deepEqual(items, [
      { label: 'Administration', to: '/admin/users' },
      { label: 'Users & Roles', to: null }
    ]);
  });

  await t.test('2.2 Resolves PLATFORM_ADMIN on /app to Permitted Oversight / Executive Dashboard', () => {
    const items = normalizeBreadcrumbs(null, '/app', 'PLATFORM_ADMIN');
    assert.deepEqual(items, [
      { label: 'Permitted Oversight', to: '/app' },
      { label: 'Executive Dashboard', to: null }
    ]);
  });

  await t.test('2.3 Resolves ML_LEAD on /app to Workspace / Executive Dashboard', () => {
    const items = normalizeBreadcrumbs(null, '/app', 'ML_LEAD');
    assert.deepEqual(items, [
      { label: 'Workspace', to: '/app' },
      { label: 'Executive Dashboard', to: null }
    ]);
  });

  await t.test('2.4 Resolves ML_LEAD on /app/evaluation to Workspace / Fairness & Eval Studio', () => {
    const items = normalizeBreadcrumbs(null, '/app/evaluation', 'ML_LEAD');
    assert.deepEqual(items, [
      { label: 'Workspace', to: '/app' },
      { label: 'Fairness & Eval Studio', to: null }
    ]);
  });

  await t.test('2.5 Resolves GOVERNANCE_OFFICER on /app/policies to Workspace / Policy Management', () => {
    const items = normalizeBreadcrumbs(null, '/app/policies', 'GOVERNANCE_OFFICER');
    assert.deepEqual(items, [
      { label: 'Workspace', to: '/app' },
      { label: 'Policy Management', to: null }
    ]);
  });

  await t.test('2.6 Resolves EXECUTIVE_APPROVER on /app/approvals to Workspace / Approval Center', () => {
    const items = normalizeBreadcrumbs(null, '/app/approvals', 'EXECUTIVE_APPROVER');
    assert.deepEqual(items, [
      { label: 'Workspace', to: '/app' },
      { label: 'Approval Center', to: null }
    ]);
  });

  await t.test('2.7 Resolves /app/monitoring to Workspace / Runtime Drift & Health', () => {
    const items = normalizeBreadcrumbs(null, '/app/monitoring', 'ML_LEAD');
    assert.deepEqual(items, [
      { label: 'Workspace', to: '/app' },
      { label: 'Runtime Drift & Health', to: null }
    ]);
  });

  await t.test('2.8 Resolves /app/incidents to Workspace / Incident Management', () => {
    const items = normalizeBreadcrumbs(null, '/app/incidents', 'GOVERNANCE_OFFICER');
    assert.deepEqual(items, [
      { label: 'Workspace', to: '/app' },
      { label: 'Incident Management', to: null }
    ]);
  });

  await t.test('2.9 Resolves /app/issues to Governance / Issue Reports', () => {
    const items = normalizeBreadcrumbs(null, '/app/issues', 'GOVERNANCE_OFFICER');
    assert.deepEqual(items, [
      { label: 'Governance', to: '/app' },
      { label: 'Issue Reports', to: null }
    ]);
  });

  await t.test('2.10 Resolves /app/audit to Governance / Audit Trail & Ledger', () => {
    const items = normalizeBreadcrumbs(null, '/app/audit', 'PLATFORM_ADMIN');
    assert.deepEqual(items, [
      { label: 'Governance', to: '/app' },
      { label: 'Audit Trail & Ledger', to: null }
    ]);
  });

  await t.test('2.11 Resolves /app/dossier to Governance / Compliance Dossier', () => {
    const items = normalizeBreadcrumbs(null, '/app/dossier', 'EXECUTIVE_APPROVER');
    assert.deepEqual(items, [
      { label: 'Governance', to: '/app' },
      { label: 'Compliance Dossier', to: null }
    ]);
  });

  await t.test('2.12 Resolves /app/profile to Workspace / Profile', () => {
    const items = normalizeBreadcrumbs(null, '/app/profile', 'ML_LEAD');
    assert.deepEqual(items, [
      { label: 'Workspace', to: '/app' },
      { label: 'Profile', to: null }
    ]);
  });
});

test('3. Static Codebase Audit: Zero Raw Markdown or Localhost Breadcrumbs in Frontend', () => {
  const pagesDir = path.join(rootDir, 'frontend/src/pages');
  const files = fs.readdirSync(pagesDir).filter(f => f.endsWith('.jsx'));

  for (const f of files) {
    const content = fs.readFileSync(path.join(pagesDir, f), 'utf-8');

    // Breadcrumbs must not contain markdown link pattern [text](url)
    const mdBreadcrumbPattern = /breadcrumbs=\{[^}]*\[[^\]]+\]\([^)]+\)/;
    assert.ok(
      !mdBreadcrumbPattern.test(content),
      `File ${f} should not define raw markdown links in breadcrumbs`
    );

    // Breadcrumbs must not contain localhost or port 3000
    const localhostInBreadcrumb = /breadcrumbs=\{[^}]*localhost:3000/;
    assert.ok(
      !localhostInBreadcrumb.test(content),
      `File ${f} should not define localhost:3000 in breadcrumbs`
    );
  }
});
