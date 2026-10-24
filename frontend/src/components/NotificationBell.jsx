import React, { useState, useEffect, useRef } from 'react';
import { Bell, AlertTriangle, ShieldAlert, Check, RefreshCw } from 'lucide-react';
import { getNotifications, markNotificationRead } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useRole } from '../context/RoleContext';
import { Link } from 'react-router-dom';

export default function NotificationBell() {
  const { user } = useAuth();
  const { currentRole } = useRole();
  const activeRole = user?.role || currentRole?.id || 'ML_LEAD';

  const [notifications, setNotifications] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef(null);

  const fetchNotifs = async () => {
    try {
      const res = await getNotifications({ role: activeRole });
      if (res && res.data) {
        setNotifications(res.data);
      }
    } catch (err) {
      // Silently catch in navbar polling
    }
  };

  useEffect(() => {
    fetchNotifs();
    const interval = setInterval(fetchNotifs, 10000); // 10s polling
    return () => clearInterval(interval);
  }, [activeRole]);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMarkAsRead = async (id, e) => {
    e.stopPropagation();
    try {
      await markNotificationRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n._id === id ? { ...n, read: true } : n))
      );
    } catch (err) {
      console.error('Failed to mark read', err);
    }
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="notification-bell-container" ref={dropdownRef} style={{ position: 'relative' }}>
      <button
        type="button"
        id="notification-bell-btn"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          background: 'transparent',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-sm)',
          padding: '6px 8px',
          color: 'var(--text-secondary)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative'
        }}
        title="Notifications"
        aria-label="View notifications"
      >
        <Bell size={16} />
        {unreadCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: '-4px',
              right: '-4px',
              background: 'var(--danger)',
              color: '#FFF',
              borderRadius: '10px',
              padding: '1px 5px',
              fontSize: '10px',
              fontWeight: 700,
              minWidth: '16px',
              textAlign: 'center',
              lineHeight: '14px'
            }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            width: '340px',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-dropdown)',
            zIndex: 1000,
            overflow: 'hidden'
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '10px 14px',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'var(--bg-subtle)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Bell size={14} color="var(--accent-primary)" />
              <span style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-primary)' }}>
                Notifications
              </span>
              {unreadCount > 0 && (
                <span className="badge badge-danger" style={{ fontSize: '10px', padding: '1px 6px' }}>
                  {unreadCount} unread
                </span>
              )}
            </div>
            <button
              onClick={fetchNotifs}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center'
              }}
              title="Refresh"
            >
              <RefreshCw size={12} />
            </button>
          </div>

          {/* List */}
          <div style={{ maxHeight: '360px', overflowY: 'auto' }}>
            {notifications.length === 0 ? (
              <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12.5px' }}>
                No notifications for {activeRole}
              </div>
            ) : (
              notifications.map((n) => {
                const isDrift = n.type === 'DRIFT_INCIDENT';
                return (
                  <div
                    key={n._id}
                    style={{
                      padding: '10px 14px',
                      borderBottom: '1px solid var(--border-color)',
                      background: n.read ? 'transparent' : 'var(--accent-subtle)',
                      transition: 'background 0.15s ease',
                      position: 'relative'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                      {isDrift ? (
                        <ShieldAlert size={15} color="var(--danger)" style={{ flexShrink: 0, marginTop: '2px' }} />
                      ) : (
                        <AlertTriangle size={15} color="var(--warning)" style={{ flexShrink: 0, marginTop: '2px' }} />
                      )}

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
                          <span style={{ fontSize: '12px', fontWeight: n.read ? 600 : 700, color: 'var(--text-primary)' }}>
                            {n.title}
                          </span>
                          {!n.read && (
                            <button
                              onClick={(e) => handleMarkAsRead(n._id, e)}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--text-muted)',
                                cursor: 'pointer',
                                padding: '2px',
                                flexShrink: 0
                              }}
                              title="Mark as read"
                            >
                              <Check size={12} />
                            </button>
                          )}
                        </div>

                        <p style={{ margin: '4px 0 6px', fontSize: '11.5px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                          {n.message}
                        </p>

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '10.5px', color: 'var(--text-muted)' }}>
                          <span>{new Date(n.createdAt).toLocaleTimeString()}</span>
                          {n.incidentId && (
                            <Link
                              to="/app/incidents"
                              onClick={() => setIsOpen(false)}
                              style={{ color: 'var(--accent-primary)', textDecoration: 'none', fontWeight: 600 }}
                            >
                              Inspect Incident →
                            </Link>
                          )}
                        </div>
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
              padding: '8px 14px',
              borderTop: '1px solid var(--border-color)',
              background: 'var(--bg-subtle)',
              textAlign: 'center'
            }}
          >
            <Link
              to="/app/incidents"
              onClick={() => setIsOpen(false)}
              style={{ fontSize: '11.5px', color: 'var(--text-secondary)', textDecoration: 'none', fontWeight: 600 }}
            >
              View All Governance Incidents
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
