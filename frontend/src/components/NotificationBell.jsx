import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Bell, 
  AlertTriangle, 
  ShieldAlert, 
  Info, 
  Check, 
  CheckCheck, 
  RefreshCw, 
  Inbox,
  ArrowRight
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { getNotifications, markNotificationRead, markAllNotificationsRead } from '../services/api';
import { useAuth } from '../context/AuthContext';

/**
 * Formats a timestamp into human-readable relative duration.
 */
function formatRelativeTime(dateStr) {
  if (!dateStr) return '';
  const now = new Date();
  const past = new Date(dateStr);
  const diffSec = Math.floor((now - past) / 1000);

  if (diffSec < 45) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;

  return past.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Validates and safely resolves internal application destinations for a notification.
 */
function resolveDestinationUrl(n) {
  if (n.targetUrl && typeof n.targetUrl === 'string') {
    const trimmed = n.targetUrl.trim();
    if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
      return trimmed;
    }
  }

  if (n.incidentId) return '/app/incidents';
  if (n.approvalId || (n.type && n.type.includes('APPROVAL'))) return '/app/approvals';
  if (n.modelId) return `/app/models/${n.modelId}`;
  if (n.type && n.type.includes('USER')) return '/admin/users';

  return '/app';
}

export default function NotificationBell() {
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [activeFilter, setActiveFilter] = useState('all'); // 'all' | 'unread'
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const dropdownRef = useRef(null);
  const isFetchingRef = useRef(false);

  const fetchNotifs = useCallback(async (isManual = false) => {
    if (!isAuthenticated || isFetchingRef.current) return;
    isFetchingRef.current = true;
    if (isManual) setLoading(true);

    try {
      const res = await getNotifications({ limit: 50 });
      if (res && res.success) {
        setNotifications(res.data || []);
        setUnreadCount(typeof res.unreadCount === 'number' ? res.unreadCount : (res.data || []).filter(n => !n.read).length);
        setError(null);
      }
    } catch (err) {
      if (isManual) {
        setError(err.message || 'Failed to load notifications');
      }
    } finally {
      isFetchingRef.current = false;
      if (isManual) setLoading(false);
    }
  }, [isAuthenticated]);

  // Polling with Page Visibility API & Immediate local event refresh
  useEffect(() => {
    if (!isAuthenticated) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    fetchNotifs();

    // 25-second HTTP polling
    let intervalId = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) {
        return; // Pause polling when tab is hidden
      }
      fetchNotifs();
    }, 25000);

    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && !document.hidden) {
        fetchNotifs();
      }
    };

    const handleImmediateRefresh = () => {
      fetchNotifs(false);
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }
    window.addEventListener('sentinel:notifications_refresh', handleImmediateRefresh);

    return () => {
      clearInterval(intervalId);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
      window.removeEventListener('sentinel:notifications_refresh', handleImmediateRefresh);
    };
  }, [isAuthenticated, fetchNotifs]);

  // Close dropdown on outside click or Escape key
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleMarkAsRead = async (id, e) => {
    if (e) e.stopPropagation();
    try {
      await markNotificationRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n._id === id ? { ...n, read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Failed to mark notification read:', err);
    }
  };

  const handleMarkAllAsRead = async (e) => {
    if (e) e.stopPropagation();
    try {
      await markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark all as read:', err);
    }
  };

  const handleNotificationClick = async (n) => {
    if (!n.read) {
      await handleMarkAsRead(n._id);
    }
    setIsOpen(false);
    const dest = resolveDestinationUrl(n);
    navigate(dest);
  };

  const displayedNotifications = activeFilter === 'unread'
    ? notifications.filter((n) => !n.read)
    : notifications;

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="notification-bell-container" ref={dropdownRef} style={{ position: 'relative' }}>
      <button
        type="button"
        id="notification-bell-btn"
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen) fetchNotifs(true);
        }}
        style={{
          background: 'transparent',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-sm)',
          padding: '6px 8px',
          color: isOpen ? 'var(--color-primary)' : 'var(--text-secondary)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          transition: 'border-color var(--transition-fast), color var(--transition-fast)'
        }}
        title="Notifications"
        aria-label={`View notifications (${unreadCount} unread)`}
        aria-expanded={isOpen}
      >
        <Bell size={16} />
        {unreadCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: '-4px',
              right: '-4px',
              backgroundColor: 'var(--color-danger, #ef4444)',
              color: '#ffffff',
              borderRadius: '10px',
              padding: '1px 5px',
              fontSize: '10px',
              fontWeight: 700,
              minWidth: '16px',
              textAlign: 'center',
              lineHeight: '14px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
            }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          id="notification-dropdown-menu"
          role="region"
          aria-label="Notifications"
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            width: '380px',
            maxWidth: '92vw',
            backgroundColor: 'var(--color-surface, #ffffff)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg, 12px)',
            boxShadow: 'var(--shadow-dropdown)',
            zIndex: 1050,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '12px 16px',
              borderBottom: '1px solid var(--color-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: 'var(--color-surface-secondary, #f8fafc)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Bell size={15} color="var(--color-primary)" />
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text)' }}>
                Notifications
              </span>
              {unreadCount > 0 && (
                <span
                  style={{
                    backgroundColor: 'var(--color-danger-bg, #fdeeee)',
                    color: 'var(--color-danger-text, #991b1b)',
                    border: '1px solid var(--color-danger-border, #f9c9c5)',
                    fontSize: '10px',
                    fontWeight: 700,
                    padding: '1px 6px',
                    borderRadius: '999px'
                  }}
                >
                  {unreadCount} new
                </span>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {unreadCount > 0 && (
                <button
                  type="button"
                  id="mark-all-read-btn"
                  onClick={handleMarkAllAsRead}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--color-primary)',
                    fontSize: '11.5px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '2px 4px'
                  }}
                  title="Mark all notifications as read"
                >
                  <CheckCheck size={13} /> Mark all read
                </button>
              )}
              <button
                type="button"
                onClick={() => fetchNotifs(true)}
                disabled={loading}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--color-text-muted)',
                  cursor: 'pointer',
                  padding: '2px'
                }}
                title="Refresh notifications"
              >
                <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          {/* Filter Bar (All / Unread) */}
          <div
            style={{
              padding: '6px 16px',
              borderBottom: '1px solid var(--color-border-subtle, #edf0f4)',
              display: 'flex',
              gap: '6px',
              backgroundColor: 'var(--color-surface)'
            }}
          >
            <button
              type="button"
              onClick={() => setActiveFilter('all')}
              style={{
                background: activeFilter === 'all' ? 'var(--color-accent-subtle)' : 'transparent',
                color: activeFilter === 'all' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                border: activeFilter === 'all' ? '1px solid var(--color-accent-border)' : '1px solid transparent',
                borderRadius: '6px',
                padding: '3px 10px',
                fontSize: '11.5px',
                fontWeight: activeFilter === 'all' ? 700 : 500,
                cursor: 'pointer'
              }}
            >
              All ({notifications.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveFilter('unread')}
              style={{
                background: activeFilter === 'unread' ? 'var(--color-accent-subtle)' : 'transparent',
                color: activeFilter === 'unread' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                border: activeFilter === 'unread' ? '1px solid var(--color-accent-border)' : '1px solid transparent',
                borderRadius: '6px',
                padding: '3px 10px',
                fontSize: '11.5px',
                fontWeight: activeFilter === 'unread' ? 700 : 500,
                cursor: 'pointer'
              }}
            >
              Unread ({unreadCount})
            </button>
          </div>

          {/* List Area */}
          <div style={{ maxHeight: '380px', overflowY: 'auto' }}>
            {error && (
              <div style={{ padding: '16px', textAlign: 'center', color: 'var(--color-danger)', fontSize: '12px' }}>
                {error}
                <div style={{ marginTop: '6px' }}>
                  <button onClick={() => fetchNotifs(true)} className="btn btn-secondary btn-sm" style={{ fontSize: '11px' }}>
                    Retry
                  </button>
                </div>
              </div>
            )}

            {!error && displayedNotifications.length === 0 ? (
              <div style={{ padding: '36px 20px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                <Inbox size={28} style={{ margin: '0 auto 8px', opacity: 0.5 }} />
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text)' }}>
                  {activeFilter === 'unread' ? "You're all caught up" : "No notifications"}
                </div>
                <div style={{ fontSize: '11.5px', marginTop: '2px' }}>
                  {activeFilter === 'unread' 
                    ? "Zero unread alerts in your governance queue." 
                    : "No governance alerts have been logged for your account."}
                </div>
              </div>
            ) : (
              displayedNotifications.map((n) => {
                const isCritical = n.severity === 'CRITICAL';
                const isWarning = n.severity === 'WARNING';

                return (
                  <div
                    key={n._id}
                    onClick={() => handleNotificationClick(n)}
                    style={{
                      padding: '12px 16px',
                      borderBottom: '1px solid var(--color-border-subtle, #edf0f4)',
                      backgroundColor: n.read ? 'transparent' : 'var(--color-accent-subtle, #eef2ff)',
                      cursor: 'pointer',
                      transition: 'background-color var(--transition-fast)',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '10px'
                    }}
                    onMouseEnter={(e) => {
                      if (n.read) e.currentTarget.style.backgroundColor = 'var(--color-surface-secondary, #f8fafc)';
                    }}
                    onMouseLeave={(e) => {
                      if (n.read) e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    {/* Severity Icon */}
                    <div style={{ flexShrink: 0, marginTop: '2px' }}>
                      {isCritical ? (
                        <ShieldAlert size={16} color="var(--color-danger, #ef4444)" />
                      ) : isWarning ? (
                        <AlertTriangle size={16} color="var(--color-warning, #f59e0b)" />
                      ) : (
                        <Info size={16} color="var(--color-primary, #3b82f6)" />
                      )}
                    </div>

                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                        <span style={{ 
                          fontSize: '12px', 
                          fontWeight: n.read ? 600 : 700, 
                          color: 'var(--color-text)',
                          lineHeight: 1.3
                        }}>
                          {n.title}
                        </span>
                        {!n.read && (
                          <button
                            type="button"
                            onClick={(e) => handleMarkAsRead(n._id, e)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: 'var(--color-text-muted)',
                              cursor: 'pointer',
                              padding: '2px',
                              borderRadius: '4px',
                              display: 'flex',
                              alignItems: 'center'
                            }}
                            title="Mark as read"
                          >
                            <Check size={13} />
                          </button>
                        )}
                      </div>

                      <p style={{ 
                        margin: '4px 0 6px', 
                        fontSize: '11.5px', 
                        color: 'var(--color-text-secondary)', 
                        lineHeight: 1.45 
                      }}>
                        {n.message}
                      </p>

                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'space-between', 
                        fontSize: '10.5px', 
                        color: 'var(--color-text-muted)' 
                      }}>
                        <span>{formatRelativeTime(n.createdAt)}</span>
                        <span style={{ 
                          color: 'var(--color-primary)', 
                          fontWeight: 600, 
                          display: 'inline-flex', 
                          alignItems: 'center', 
                          gap: '3px' 
                        }}>
                          View <ArrowRight size={10} />
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div
            style={{
              padding: '10px 16px',
              borderTop: '1px solid var(--color-border)',
              backgroundColor: 'var(--color-surface-secondary, #f8fafc)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '11.5px'
            }}
          >
            <Link
              to="/app/incidents"
              onClick={() => setIsOpen(false)}
              style={{ color: 'var(--color-text-secondary)', textDecoration: 'none', fontWeight: 600 }}
            >
              Incidents
            </Link>
            <Link
              to="/app/approvals"
              onClick={() => setIsOpen(false)}
              style={{ color: 'var(--color-text-secondary)', textDecoration: 'none', fontWeight: 600 }}
            >
              Approval Queue
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
