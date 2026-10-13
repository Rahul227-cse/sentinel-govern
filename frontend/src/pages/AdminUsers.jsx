import React, { useEffect, useState } from 'react';
import { 
  getAdminUsers, 
  verifyAdminUser, 
  blockAdminUser, 
  unblockAdminUser 
} from '../services/api';
import PageHeader from '../components/PageHeader';
import LoadingSkeleton from '../components/LoadingSkeleton';
import { 
  formatRoleLabel, 
  formatStatusLabel
} from '../utils/formatters';
import { 
  RefreshCw, 
  CheckCircle2, 
  X, 
  Shield, 
  ShieldCheck,
  AlertTriangle,
  UserCheck, 
  UserX, 
  LogOut, 
  LogIn, 
  Circle
} from 'lucide-react';

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState(null);
  const [actionSuccess, setActionSuccess] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [updatingId, setUpdatingId] = useState(null);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [activeTab, setActiveTab] = useState('ALL'); // 'ALL' | 'PENDING' | 'VERIFIED' | 'SUSPENDED'

  const loadUsers = async () => {
    try {
      setLoading(true);
      setActionError(null);
      const data = await getAdminUsers();
      const userList = Array.isArray(data) ? data : (data?.data || []);
      setUsers(userList);
      // Keep selected user updated if open
      if (selectedUser) {
        const refreshed = userList.find(u => u._id === selectedUser._id);
        if (refreshed) setSelectedUser(refreshed);
      }
    } catch (err) {
      setActionError(err.data?.error || err.message || 'Failed to load user roster');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleVerify = async (userId) => {
    try {
      setUpdatingId(userId);
      setActionError(null);
      setActionSuccess(null);
      const res = await verifyAdminUser(userId);
      const updated = res.user || res;
      setActionSuccess(`Verified account for ${updated.name || updated.email}`);
      await loadUsers();
      if (selectedUser && selectedUser._id === userId) {
        setSelectedUser(prev => ({ ...prev, ...updated }));
      }
    } catch (err) {
      setActionError(err.data?.error || err.message || 'Failed to verify user');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleBlock = async (userId) => {
    try {
      setUpdatingId(userId);
      setActionError(null);
      setActionSuccess(null);
      const res = await blockAdminUser(userId);
      const updated = res.user || res;
      setActionSuccess(`Suspended account for ${updated.name || updated.email}`);
      await loadUsers();
      if (selectedUser && selectedUser._id === userId) {
        setSelectedUser(prev => ({ ...prev, ...updated }));
      }
    } catch (err) {
      setActionError(err.data?.error || err.message || 'Failed to suspend user');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleUnblock = async (userId) => {
    try {
      setUpdatingId(userId);
      setActionError(null);
      setActionSuccess(null);
      const res = await unblockAdminUser(userId);
      const updated = res.user || res;
      setActionSuccess(`Re-activated account for ${updated.name || updated.email}`);
      await loadUsers();
      if (selectedUser && selectedUser._id === userId) {
        setSelectedUser(prev => ({ ...prev, ...updated }));
      }
    } catch (err) {
      setActionError(err.data?.error || err.message || 'Failed to re-activate user');
    } finally {
      setUpdatingId(null);
    }
  };

  // Classify users into Kanban columns
  const pendingUsers = users.filter(u => u.status !== 'SUSPENDED' && u.verificationStatus !== 'VERIFIED');
  const verifiedUsers = users.filter(u => u.status !== 'SUSPENDED' && u.verificationStatus === 'VERIFIED');
  const blockedUsers = users.filter(u => u.status === 'SUSPENDED');

  const formatDateTime = (dateStr) => {
    if (!dateStr) return 'Never';
    const d = new Date(dateStr);
    return d.toLocaleString('en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const renderPresencePill = (presence) => {
    const isOnline = presence === 'ACTIVE';
    return (
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        fontSize: '11px',
        fontWeight: 600,
        color: isOnline ? 'var(--success-text)' : 'var(--text-muted)',
        backgroundColor: isOnline ? 'var(--success-bg)' : 'var(--neutral-badge-bg)',
        padding: '2px 8px',
        borderRadius: '999px',
        border: `1px solid ${isOnline ? 'var(--success-border)' : 'var(--neutral-badge-border)'}`
      }}>
        <span style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          backgroundColor: isOnline ? 'var(--success)' : 'var(--text-tertiary)'
        }} />
        {isOnline ? 'Active' : 'Offline'}
      </span>
    );
  };

  const renderVerificationPill = (vStatus) => {
    const isVerified = vStatus === 'VERIFIED';
    return (
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        fontSize: '11px',
        fontWeight: 600,
        color: isVerified ? 'var(--success-text)' : 'var(--warning-text)',
        backgroundColor: isVerified ? 'var(--success-bg)' : 'var(--warning-bg)',
        padding: '2px 8px',
        borderRadius: '999px',
        border: `1px solid ${isVerified ? 'var(--success-border)' : 'var(--warning-border)'}`
      }}>
        <span style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          backgroundColor: isVerified ? 'var(--success)' : 'var(--warning)'
        }} />
        {isVerified ? 'Verified' : 'Pending'}
      </span>
    );
  };

  const renderUserCard = (u, isPending = false) => {
    const isSelected = selectedUser?._id === u._id;
    return (
      <div
        key={u._id}
        onClick={() => setSelectedUser(u)}
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderRadius: '8px',
          border: isSelected ? '1px solid var(--primary-brand)' : '1px solid var(--border-color)',
          padding: '14px 16px',
          marginBottom: '10px',
          cursor: 'pointer',
          transition: 'border-color var(--transition-fast), box-shadow var(--transition-fast)',
          boxShadow: isSelected 
            ? '0 0 0 1px var(--primary-brand), var(--shadow-sm)' 
            : 'var(--shadow-xs)',
          position: 'relative'
        }}
        onMouseEnter={(e) => {
          if (!isSelected) {
            e.currentTarget.style.borderColor = 'var(--border-strong)';
            e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
          }
        }}
        onMouseLeave={(e) => {
          if (!isSelected) {
            e.currentTarget.style.borderColor = 'var(--border-color)';
            e.currentTarget.style.boxShadow = 'var(--shadow-xs)';
          }
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {u.avatar ? (
              <img 
                src={u.avatar} 
                alt={u.name} 
                referrerPolicy="no-referrer"
                style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover' }}
              />
            ) : (
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                backgroundColor: 'var(--surface-selected-blue, var(--bg-selected))',
                color: 'var(--primary-brand)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 600,
                fontSize: '12px',
                border: '1px solid var(--border-color)'
              }}>
                {u.name?.charAt(0)?.toUpperCase() || 'U'}
              </div>
            )}
            <div>
              <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>
                {u.name || 'Anonymous User'}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                {u.email}
              </div>
            </div>
          </div>
        </div>

        {/* Role & Org */}
        <div style={{ 
          fontSize: '12px', 
          backgroundColor: 'var(--bg-subtle)', 
          padding: '6px 10px', 
          borderRadius: '6px',
          marginBottom: '10px',
          border: '1px solid var(--border-subtle)'
        }}>
          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
            {formatRoleLabel(u.role)}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
            {u.department || 'No Dept'} • {u.team || 'No Team'}
          </div>
        </div>

        {/* Badges & Action */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '6px' }}>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            {u.status === 'SUSPENDED' ? (
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '11px',
                fontWeight: 600,
                color: 'var(--danger-text)',
                backgroundColor: 'var(--danger-bg)',
                padding: '2px 8px',
                borderRadius: '999px',
                border: '1px solid var(--danger-border)'
              }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--danger)' }} />
                Blocked
              </span>
            ) : (
              renderVerificationPill(u.verificationStatus)
            )}
            {renderPresencePill(u.presence)}
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              setSelectedUser(u);
            }}
            style={{
              padding: '4px 10px',
              fontSize: '11.5px',
              fontWeight: 600,
              color: isPending ? 'var(--primary-brand)' : 'var(--text-secondary)',
              backgroundColor: isPending ? 'var(--surface-selected-blue, var(--bg-selected))' : 'var(--bg-subtle)',
              border: `1px solid ${isPending ? 'var(--border-focus)' : 'var(--border-color)'}`,
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            {isPending ? 'Review →' : 'View'}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="page-container" style={{ position: 'relative' }}>
      <PageHeader
        breadcrumbs={[
          { label: 'Admin', link: '/app' },
          { label: 'Users' }
        ]}
        title="Platform User Administration"
        subtitle="Manage authenticated identity records, lifecycle access states, and enterprise governance role bindings."
        action={
          <button 
            onClick={loadUsers} 
            disabled={loading} 
            className="btn btn-secondary btn-sm"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh Directory
          </button>
        }
      />

      {/* Separation of Duties Notice */}
      <div style={{
        backgroundColor: 'var(--color-info-subtle)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        padding: '12px 16px',
        marginBottom: '20px',
        fontSize: '12.5px',
        color: 'var(--color-text)',
        display: 'flex',
        alignItems: 'center',
        gap: '12px'
      }}>
        <ShieldCheck size={20} color="var(--color-primary)" style={{ flexShrink: 0 }} />
        <div>
          <strong style={{ color: 'var(--color-primary)' }}>Separation of Duties Active: </strong>
          Platform Administrators verify accounts and manage account lifecycle states. Platform Admins do NOT possess automatic bypass permissions for domain model creation, evaluation execution, or stakeholder sign-offs.
        </div>
      </div>

      {actionError && (
        <div style={{
          backgroundColor: '#fee2e2',
          border: '1px solid #fecaca',
          color: '#991b1b',
          padding: '12px 18px',
          borderRadius: '8px',
          marginBottom: '20px',
          fontSize: '13px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <AlertTriangle size={16} />
          {actionError}
        </div>
      )}

      {actionSuccess && (
        <div style={{
          backgroundColor: '#dcfce7',
          border: '1px solid #bbf7d0',
          color: '#166534',
          padding: '12px 18px',
          borderRadius: '8px',
          marginBottom: '20px',
          fontSize: '13px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <CheckCircle2 size={16} />
          {actionSuccess}
        </div>
      )}

      {/* User Lifecycle Selectable Tabs / Filters */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', borderBottom: '1px solid var(--color-border)', paddingBottom: '14px', flexWrap: 'wrap' }}>
        {[
          { id: 'ALL', label: 'All Accounts', count: users.length, color: 'var(--color-primary)' },
          { id: 'PENDING', label: 'Pending Verification', count: pendingUsers.length, color: '#eab308' },
          { id: 'VERIFIED', label: 'Approved / Active', count: verifiedUsers.length, color: '#16a34a' },
          { id: 'SUSPENDED', label: 'Suspended / Blocked', count: blockedUsers.length, color: '#dc2626' }
        ].map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '7px 14px',
                borderRadius: 'var(--radius-md)',
                border: isActive ? '1.5px solid var(--color-primary)' : '1px solid var(--color-border)',
                backgroundColor: isActive ? 'var(--color-accent-subtle)' : 'var(--color-surface)',
                color: isActive ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                fontWeight: isActive ? 600 : 500,
                fontSize: '13px',
                cursor: 'pointer',
                transition: 'all var(--transition-fast)'
              }}
            >
              <span>{tab.label}</span>
              <span style={{
                fontSize: '11px',
                fontWeight: 700,
                padding: '2px 7px',
                borderRadius: '999px',
                backgroundColor: isActive ? 'var(--color-surface)' : 'var(--color-surface-secondary)',
                border: '1px solid var(--color-border)',
                color: tab.color
              }}>
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Kanban Board Layout */}
      {loading && users.length === 0 ? (
        <div style={{ padding: '24px' }}>
          <LoadingSkeleton height="320px" />
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: activeTab === 'ALL' ? 'repeat(3, 1fr)' : '1fr',
          maxWidth: activeTab === 'ALL' ? 'none' : '720px',
          gap: '20px',
          alignItems: 'start'
        }}>
          {/* Column 1: Pending Verification */}
          {(activeTab === 'ALL' || activeTab === 'PENDING') && (
            <div style={{
              backgroundColor: 'var(--color-surface-subtle)',
              borderRadius: '12px',
              border: '1px solid var(--color-border)',
              padding: '16px'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '14px',
                paddingBottom: '10px',
                borderBottom: '1px solid var(--color-border)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#eab308' }} />
                  <h3 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
                    Pending Verification
                  </h3>
                </div>
                <span style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  backgroundColor: 'rgba(234, 179, 8, 0.15)',
                  color: '#eab308',
                  padding: '2px 8px',
                  borderRadius: '999px'
                }}>
                  {pendingUsers.length}
                </span>
              </div>

              <div>
                {pendingUsers.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--color-text-muted)', fontSize: '12.5px' }}>
                    No pending accounts awaiting verification
                  </div>
                ) : (
                  pendingUsers.map(u => renderUserCard(u, true))
                )}
              </div>
            </div>
          )}

          {/* Column 2: Approved / Verified */}
          {(activeTab === 'ALL' || activeTab === 'VERIFIED') && (
            <div style={{
              backgroundColor: 'var(--color-surface-subtle)',
              borderRadius: '12px',
              border: '1px solid var(--color-border)',
              padding: '16px'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '14px',
                paddingBottom: '10px',
                borderBottom: '1px solid var(--color-border)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#22c55e' }} />
                  <h3 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
                    Approved / Verified
                  </h3>
                </div>
                <span style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  backgroundColor: 'rgba(34, 197, 94, 0.15)',
                  color: '#16a34a',
                  padding: '2px 8px',
                  borderRadius: '999px'
                }}>
                  {verifiedUsers.length}
                </span>
              </div>

              <div>
                {verifiedUsers.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--color-text-muted)', fontSize: '12.5px' }}>
                    No verified accounts
                  </div>
                ) : (
                  verifiedUsers.map(u => renderUserCard(u, false))
                )}
              </div>
            </div>
          )}

          {/* Column 3: Blocked / Suspended */}
          {(activeTab === 'ALL' || activeTab === 'SUSPENDED') && (
            <div style={{
              backgroundColor: 'var(--color-surface-subtle)',
              borderRadius: '12px',
              border: '1px solid var(--color-border)',
              padding: '16px'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '14px',
                paddingBottom: '10px',
                borderBottom: '1px solid var(--color-border)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#ef4444' }} />
                  <h3 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
                    Blocked / Suspended
                  </h3>
                </div>
                <span style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  backgroundColor: 'rgba(239, 68, 68, 0.15)',
                  color: '#dc2626',
                  padding: '2px 8px',
                  borderRadius: '999px'
                }}>
                  {blockedUsers.length}
                </span>
              </div>

              <div>
                {blockedUsers.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--color-text-muted)', fontSize: '12.5px' }}>
                    No suspended accounts
                  </div>
                ) : (
                  blockedUsers.map(u => renderUserCard(u, false))
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* User Detail Drawer (100% OPAQUE independent layer with backdrop) */}
      {selectedUser && (
        <>
          <div 
            className="drawer-backdrop" 
            onClick={() => setSelectedUser(null)} 
            aria-hidden="true"
          />
          <div 
            className="user-detail-drawer"
            role="dialog"
            aria-label={`User Details: ${selectedUser.name || 'User'}`}
            style={{
              position: 'fixed',
              top: 0,
              right: 0,
              bottom: 0,
              width: '440px',
              maxWidth: '92vw',
              backgroundColor: 'var(--bg-surface)',
              borderLeft: '1px solid var(--border-color)',
              boxShadow: 'var(--shadow-dropdown)',
              zIndex: 1050,
              display: 'flex',
              flexDirection: 'column',
              animation: 'drawerSlideIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
            }}
          >
            {/* Sticky Drawer Header */}
            <div style={{
              padding: '18px 20px',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              backgroundColor: 'var(--bg-surface)',
              position: 'sticky',
              top: 0,
              zIndex: 10
            }}>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                {selectedUser.avatar ? (
                  <img 
                    src={selectedUser.avatar} 
                    alt={selectedUser.name} 
                    referrerPolicy="no-referrer"
                    style={{ width: '42px', height: '42px', borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--border-color)' }}
                  />
                ) : (
                  <div style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '50%',
                    backgroundColor: 'var(--surface-selected-blue, var(--bg-selected))',
                    color: 'var(--primary-brand)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: '15px',
                    border: '1px solid var(--border-color)'
                  }}>
                    {selectedUser.name?.charAt(0)?.toUpperCase() || 'U'}
                  </div>
                )}
                <div>
                  <h2 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.01em' }}>
                    {selectedUser.name || 'Anonymous User'}
                  </h2>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    {selectedUser.email}
                  </div>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '6px' }}>
                    {renderPresencePill(selectedUser.presence)}
                    <span style={{ fontSize: '11px', color: 'var(--border-strong)' }}>•</span>
                    <span style={{
                      fontSize: '11px',
                      fontWeight: 600,
                      color: selectedUser.status === 'ACTIVE' ? 'var(--success-text)' : 'var(--danger-text)'
                    }}>
                      {formatStatusLabel(selectedUser.status)}
                    </span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setSelectedUser(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: '4px',
                  borderRadius: 'var(--radius-xs)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = 'var(--text-primary)';
                  e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = 'var(--text-muted)';
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
                aria-label="Close drawer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Drawer Body - Scrollable */}
            <div style={{
              flex: 1,
              overflowY: 'auto',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '20px',
              backgroundColor: 'var(--bg-surface)'
            }}>
              {/* Section 1: Identity */}
              <div className="drawer-section">
                <div className="drawer-section-title">Identity</div>
                <div className="drawer-kv-grid">
                  <div className="drawer-kv-row">
                    <span className="drawer-kv-label">User ID</span>
                    <span className="drawer-kv-value font-mono" style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                      {selectedUser._id}
                    </span>
                  </div>
                  <div className="drawer-kv-row">
                    <span className="drawer-kv-label">Full Name</span>
                    <span className="drawer-kv-value">{selectedUser.name || 'Not provided'}</span>
                  </div>
                  <div className="drawer-kv-row">
                    <span className="drawer-kv-label">Email Address</span>
                    <span className="drawer-kv-value">{selectedUser.email}</span>
                  </div>
                  <div className="drawer-kv-row">
                    <span className="drawer-kv-label">Presence Status</span>
                    <div>{renderPresencePill(selectedUser.presence)}</div>
                  </div>
                </div>
              </div>

              {/* Section 2: Organization */}
              <div className="drawer-section">
                <div className="drawer-section-title">Organization</div>
                <div className="drawer-kv-grid">
                  <div className="drawer-kv-row">
                    <span className="drawer-kv-label">Assigned Role</span>
                    <div style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: 'var(--primary-brand)',
                      backgroundColor: 'var(--surface-selected-blue, var(--bg-selected))',
                      padding: '3px 8px',
                      borderRadius: 'var(--radius-xs)',
                      border: '1px solid var(--border-color)'
                    }}>
                      <Shield size={12} />
                      <span>{formatRoleLabel(selectedUser.role)}</span>
                    </div>
                  </div>
                  <div className="drawer-kv-row">
                    <span className="drawer-kv-label">Department</span>
                    <span className="drawer-kv-value">{selectedUser.department || 'Not provided'}</span>
                  </div>
                  <div className="drawer-kv-row">
                    <span className="drawer-kv-label">Team</span>
                    <span className="drawer-kv-value">{selectedUser.team || 'Not provided'}</span>
                  </div>
                  <div className="drawer-kv-row">
                    <span className="drawer-kv-label">Team Lead / Manager</span>
                    <span className="drawer-kv-value">{selectedUser.teamLead || 'None / Not specified'}</span>
                  </div>
                </div>
              </div>

              {/* Section 3: Verification */}
              <div className="drawer-section">
                <div className="drawer-section-title">Verification</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div className="drawer-kv-row">
                    <span className="drawer-kv-label">Verification Status</span>
                    <div>{renderVerificationPill(selectedUser.verificationStatus)}</div>
                  </div>
                  {selectedUser.verificationStatus === 'VERIFIED' ? (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '12px',
                      color: 'var(--success-text)',
                      backgroundColor: 'var(--success-bg)',
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--success-border)'
                    }}>
                      <CheckCircle2 size={14} color="var(--success)" />
                      <span>Verified account • {selectedUser.verifiedAt ? formatDateTime(selectedUser.verifiedAt) : 'Manually approved'}</span>
                    </div>
                  ) : (
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      backgroundColor: 'var(--warning-bg)',
                      padding: '12px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--warning-border)'
                    }}>
                      <p style={{ margin: 0, fontSize: '12px', color: 'var(--warning-text)' }}>
                        Awaiting platform administrator verification approval before elevated privileges can be granted.
                      </p>
                      <button
                        onClick={() => handleVerify(selectedUser._id)}
                        disabled={updatingId === selectedUser._id}
                        className="btn btn-primary btn-sm"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          width: '100%',
                          backgroundColor: 'var(--success)',
                          borderColor: 'var(--success)'
                        }}
                      >
                        <UserCheck size={14} /> Approve & Verify Account
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Section 4: Account Lifecycle */}
              <div className="drawer-section">
                <div className="drawer-section-title">Account Lifecycle</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div className="drawer-kv-row">
                    <span className="drawer-kv-label">Lifecycle Status</span>
                    <span style={{
                      fontSize: '12px',
                      fontWeight: 600,
                      color: selectedUser.status === 'ACTIVE' ? 'var(--success-text)' : 'var(--danger-text)'
                    }}>
                      {formatStatusLabel(selectedUser.status)}
                    </span>
                  </div>

                  {selectedUser.status === 'ACTIVE' ? (
                    <button
                      onClick={() => handleBlock(selectedUser._id)}
                      disabled={updatingId === selectedUser._id}
                      className="btn btn-secondary btn-sm"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        color: 'var(--danger-text)',
                        borderColor: 'var(--danger-border)',
                        backgroundColor: 'var(--danger-bg)'
                      }}
                    >
                      <UserX size={14} /> Suspend / Block Account
                    </button>
                  ) : (
                    <button
                      onClick={() => handleUnblock(selectedUser._id)}
                      disabled={updatingId === selectedUser._id}
                      className="btn btn-secondary btn-sm"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        color: 'var(--success-text)',
                        borderColor: 'var(--success-border)',
                        backgroundColor: 'var(--success-bg)'
                      }}
                    >
                      <UserCheck size={14} /> Unblock / Re-activate Account
                    </button>
                  )}
                </div>
              </div>

              {/* Section 5: Activity */}
              <div className="drawer-section">
                <div className="drawer-section-title">Activity Timestamps</div>
                <div className="drawer-kv-grid">
                  <div className="drawer-kv-row">
                    <span className="drawer-kv-label">Last Login</span>
                    <span className="drawer-kv-value">{formatDateTime(selectedUser.lastLoginAt)}</span>
                  </div>
                  <div className="drawer-kv-row">
                    <span className="drawer-kv-label">Last Seen</span>
                    <span className="drawer-kv-value">{formatDateTime(selectedUser.lastSeenAt)}</span>
                  </div>
                  <div className="drawer-kv-row">
                    <span className="drawer-kv-label">Account Created</span>
                    <span className="drawer-kv-value">{formatDateTime(selectedUser.createdAt)}</span>
                  </div>
                </div>
              </div>

              {/* Section 6: Login History */}
              <div className="drawer-section">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div className="drawer-section-title" style={{ marginBottom: 0 }}>Login History</div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {selectedUser.loginHistory?.length || 0} events
                  </span>
                </div>

                {(!selectedUser.loginHistory || selectedUser.loginHistory.length === 0) ? (
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', padding: '12px 0' }}>
                    No historical sessions recorded.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {selectedUser.loginHistory
                      .slice(0, showAllHistory ? 50 : 5)
                      .map((item, idx) => (
                        <div
                          key={item._id || idx}
                          style={{
                            backgroundColor: 'var(--bg-subtle)',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: 'var(--radius-sm)',
                            padding: '8px 10px',
                            fontSize: '11.5px'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--text-primary)', fontWeight: 500 }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                              <LogIn size={12} color="var(--primary-brand)" /> {formatDateTime(item.loginAt)}
                            </span>
                            <span style={{ fontSize: '10px', color: 'var(--text-muted)', backgroundColor: 'var(--neutral-badge-bg)', border: '1px solid var(--border-color)', padding: '1px 6px', borderRadius: 'var(--radius-xs)' }}>
                              {item.authProvider || 'native'}
                            </span>
                          </div>
                          {item.logoutAt ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--text-muted)', marginTop: '4px', fontSize: '11px' }}>
                              <LogOut size={11} color="var(--text-tertiary)" /> Logout: {formatDateTime(item.logoutAt)}
                            </div>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--success-text)', marginTop: '4px', fontSize: '11px', fontWeight: 500 }}>
                              <Circle size={7} fill="var(--success)" color="var(--success)" /> Active Session
                            </div>
                          )}
                        </div>
                      ))}

                    {selectedUser.loginHistory.length > 5 && (
                      <button
                        onClick={() => setShowAllHistory(!showAllHistory)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--primary-brand)',
                          fontSize: '11.5px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          padding: '4px 0',
                          textAlign: 'left'
                        }}
                      >
                        {showAllHistory ? 'Show fewer sessions' : `View full history (${selectedUser.loginHistory.length} sessions) →`}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
