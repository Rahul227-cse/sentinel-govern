import React, { useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { formatRoleLabel } from '../utils/formatters';
import StatusDot from './StatusDot';
import { 
  LayoutDashboard, 
  Database, 
  Scale, 
  ShieldCheck, 
  CheckSquare, 
  Activity, 
  AlertTriangle, 
  FileText, 
  History,
  Shield,
  Users,
  AlertCircle,
  LogOut,
  ChevronLeft,
  ChevronRight,
  User,
  Settings,
  ChevronUp
} from 'lucide-react';

export default function Sidebar({ 
  collapsed = false, 
  onToggle,
  mobileOpen = false,
  onMobileClose
}) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const role = user?.role || 'GOVERNANCE_OFFICER';

  // Close account menu on click outside or Escape
  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    }
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setMenuOpen(false);
      }
    }
    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen]);

  // Section items configuration based on role
  let sections = [];

  if (role === 'PLATFORM_ADMIN') {
    sections = [
      {
        title: 'Administration',
        items: [
          { to: '/admin/users', label: 'Users & Roles', icon: Users }
        ]
      },
      {
        title: 'Permitted Oversight',
        items: [
          { to: '/app', label: 'Executive Dashboard', icon: LayoutDashboard, end: true },
          { to: '/app/registry', label: 'Model Registry', icon: Database },
          { to: '/app/audit', label: 'Audit Trail & Ledger', icon: History },
          { to: '/app/dossier', label: 'Compliance Dossier', icon: FileText }
        ]
      }
    ];
  } else {
    // Governance Stakeholder Roles: ML_LEAD, GOVERNANCE_OFFICER, EXECUTIVE_APPROVER
    sections = [
      {
        title: 'Workspace',
        items: [
          { to: '/app', label: 'Executive Dashboard', icon: LayoutDashboard, end: true },
          { to: '/app/registry', label: 'Model Registry', icon: Database },
          { to: '/app/evaluation', label: 'Fairness & Eval Studio', icon: Scale },
          { to: '/app/policies', label: 'Policy Management', icon: ShieldCheck },
          { to: '/app/approvals', label: 'Approval Center', icon: CheckSquare },
          { to: '/app/monitoring', label: 'Runtime Drift & Health', icon: Activity },
          { to: '/app/incidents', label: 'Incident Management', icon: AlertTriangle },
          { to: '/app/issues', label: 'Issue Reports', icon: AlertCircle }
        ]
      },
      {
        title: 'Governance',
        items: [
          { to: '/app/audit', label: 'Audit Trail & Ledger', icon: History },
          { to: '/app/dossier', label: 'Compliance Dossier', icon: FileText }
        ]
      }
    ];
  }

  // NOTE: User Profile removed from main sidebar sections as per Section 14.
  // Profile access is provided via the bottom-left account menu.

  const handleNavigate = (path) => {
    setMenuOpen(false);
    if (onMobileClose) onMobileClose();
    navigate(path);
  };

  const handleLogout = () => {
    setMenuOpen(false);
    if (onMobileClose) onMobileClose();
    logout();
  };

  return (
    <>
      {/* Mobile Drawer Backdrop */}
      <div 
        className={`sidebar-backdrop ${mobileOpen ? 'mobile-open' : ''}`}
        onClick={onMobileClose}
        aria-hidden="true"
      />

      <aside 
        className={`sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`} 
        aria-label="Main Navigation"
      >
        {/* Brand Header */}
        <div className="brand">
          <NavLink 
            to="/app" 
            className="brand-main" 
            title="Sentinel Govern"
            onClick={() => onMobileClose && onMobileClose()}
          >
            <div className="brand-icon">
              <Shield size={18} strokeWidth={2.2} />
            </div>
            <div className="brand-text">
              <h1>Sentinel Govern</h1>
              <span>AI Governance &amp; Lifecycle Platform</span>
            </div>
          </NavLink>

          {onToggle && (
            <button
              type="button"
              className="sidebar-collapse-btn"
              onClick={onToggle}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
            </button>
          )}
        </div>

        {/* Navigation Sections */}
        <nav className="nav-links">
          {sections.map((section, sIdx) => (
            <div key={sIdx} style={{ marginBottom: '8px' }}>
              <div className="nav-group-title">{section.title}</div>
              {section.items.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                    aria-label={item.label}
                    onClick={() => onMobileClose && onMobileClose()}
                  >
                    <div className="nav-link-icon">
                      <Icon size={16} strokeWidth={2} />
                    </div>
                    <span className="nav-link-text">{item.label}</span>
                    <span className="sidebar-tooltip">{item.label}</span>
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Bottom User Area — ChatGPT-style bottom-left identity & popover menu */}
        <div className="sidebar-footer" ref={menuRef}>
          {/* Floating Account Popover Menu */}
          {menuOpen && (
            <div 
              className="account-popover-menu" 
              role="menu" 
              aria-orientation="vertical"
              aria-labelledby="user-account-btn"
            >
              {/* Popover Header with Identity info */}
              <div className="account-popover-header">
                <div className="account-popover-name">{user?.name || user?.email}</div>
                <div className="account-popover-email">{user?.email}</div>
                <div className="account-popover-meta">
                  <span className="account-popover-badge">
                    {formatRoleLabel(user?.role)}
                  </span>
                  <span className="account-popover-presence">
                    <StatusDot status="healthy" pulse={true} />
                    Active
                  </span>
                </div>
              </div>

              <div className="account-popover-divider" />

              {/* Menu Option 1: Profile */}
              <button
                type="button"
                className="account-popover-item"
                onClick={() => handleNavigate('/app/profile')}
                role="menuitem"
              >
                <User size={15} />
                <span>Profile</span>
              </button>

              <div className="account-popover-divider" />

              {/* Menu Option 3: Log Out */}
              <button
                type="button"
                className="account-popover-item logout"
                onClick={handleLogout}
                role="menuitem"
              >
                <LogOut size={15} />
                <span>Log out</span>
              </button>
            </div>
          )}

          {/* User Identity Trigger Card */}
          {user ? (
            <button
              id="user-account-btn"
              type="button"
              className={`user-profile-card ${menuOpen ? 'menu-active' : ''}`}
              onClick={() => setMenuOpen((prev) => !prev)}
              aria-haspopup="true"
              aria-expanded={menuOpen}
              aria-label={`Account menu for ${user.name || user.email}`}
              title={collapsed ? `${user.name || user.email} (${formatRoleLabel(user.role)})` : undefined}
            >
              <div className="user-avatar" title={user.name || user.email}>
                {user.avatar ? (
                  <img
                    src={user.avatar}
                    alt={user.name || 'User'}
                    referrerPolicy="no-referrer"
                    style={{ width: '100%', height: '100%', borderRadius: '50%' }}
                  />
                ) : (
                  user.name?.charAt(0) || user.email?.charAt(0) || 'U'
                )}
              </div>

              <div className="user-info">
                <div className="user-name">{user.name || user.email}</div>
                <div className="user-meta">
                  <StatusDot
                    status={user.status === 'ACTIVE' ? 'healthy' : 'warning'}
                    pulse={user.status === 'ACTIVE'}
                  />
                  <span>{formatRoleLabel(user.role)}</span>
                </div>
              </div>

              <div className="user-menu-chevron">
                <ChevronUp size={14} style={{ transform: menuOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
              </div>
            </button>
          ) : (
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: collapsed ? 'center' : 'left' }}>
              <div>Responsible AI Platform</div>
              <div>v2.0 • Light Theme</div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
