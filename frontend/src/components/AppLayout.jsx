import React, { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Navbar from './Navbar';
import ErrorBoundary from './ErrorBoundary';
import { useAuth } from '../context/AuthContext';
import { Clock, AlertTriangle, WifiOff, RefreshCw } from 'lucide-react';
import { checkBackendHealth } from '../services/api';

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('sentinel_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user } = useAuth();
  const [connectionIssue, setConnectionIssue] = useState(null);
  const [retrying, setRetrying] = useState(false);

  // Close mobile drawer on route change or screen resize
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 768) {
        setMobileOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    let active = true;
    checkBackendHealth().then((health) => {
      if (!active) return;
      if (health.status !== 'HEALTHY') {
        setConnectionIssue({
          status: health.status,
          message: health.message
        });
      } else {
        setConnectionIssue(null);
      }
    });

    const handleConnectionEvent = (e) => {
      if (!active) return;
      if (e.detail?.status === 'HEALTHY') {
        setConnectionIssue(null);
      } else if (e.detail?.status) {
        setConnectionIssue({
          status: e.detail.status,
          message: e.detail.message
        });
      }
    };

    window.addEventListener('sentinel:connection_status', handleConnectionEvent);

    const intervalId = setInterval(() => {
      checkBackendHealth().then((health) => {
        if (!active) return;
        if (health.status === 'HEALTHY') {
          setConnectionIssue(null);
        } else if (health.status) {
          setConnectionIssue({
            status: health.status,
            message: health.message
          });
        }
      });
    }, 30000);

    return () => {
      active = false;
      window.removeEventListener('sentinel:connection_status', handleConnectionEvent);
      clearInterval(intervalId);
    };
  }, []);

  const handleManualRetry = async () => {
    setRetrying(true);
    try {
      const health = await checkBackendHealth();
      if (health.status === 'HEALTHY') {
        setConnectionIssue(null);
      } else {
        setConnectionIssue({
          status: health.status,
          message: health.message
        });
      }
    } finally {
      setRetrying(false);
    }
  };

  const toggleSidebar = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('sentinel_sidebar_collapsed', String(next));
      } catch {
        // ignore localStorage errors in restricted contexts
      }
      return next;
    });
  };

  const toggleMobileOpen = () => {
    setMobileOpen((prev) => !prev);
  };

  const closeMobile = () => {
    setMobileOpen(false);
  };

  const isPendingVerification = user?.verificationStatus === 'PENDING';

  return (
    <div className="app-container">
      <Sidebar 
        collapsed={collapsed} 
        onToggle={toggleSidebar} 
        mobileOpen={mobileOpen}
        onMobileClose={closeMobile}
      />
      <div className={`main-content ${collapsed ? 'sidebar-collapsed' : ''}`}>
        <Navbar onMobileMenuToggle={toggleMobileOpen} />
        {connectionIssue && (
          <div
            id="sentinel-connection-warning-banner"
            role="alert"
            style={{
              backgroundColor: connectionIssue.status === 'DATABASE_UNAVAILABLE'
                ? 'var(--color-warning-bg)'
                : 'var(--color-danger-bg)',
              borderBottom: connectionIssue.status === 'DATABASE_UNAVAILABLE'
                ? '1px solid var(--color-warning-border)'
                : '1px solid var(--color-danger-border)',
              padding: '10px 24px',
              fontSize: '13px',
              color: connectionIssue.status === 'DATABASE_UNAVAILABLE'
                ? 'var(--color-warning-text)'
                : 'var(--color-danger-text)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              fontWeight: 500,
              zIndex: 100
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {connectionIssue.status === 'DATABASE_UNAVAILABLE' ? (
                <AlertTriangle size={18} color="var(--color-warning)" style={{ flexShrink: 0 }} />
              ) : (
                <WifiOff size={18} color="var(--color-danger)" style={{ flexShrink: 0 }} />
              )}
              <span>{connectionIssue.message}</span>
            </div>
            <button
              id="sentinel-connection-retry-btn"
              onClick={handleManualRetry}
              disabled={retrying}
              style={{
                backgroundColor: 'transparent',
                border: `1px solid ${connectionIssue.status === 'DATABASE_UNAVAILABLE' ? 'var(--color-warning-border)' : 'var(--color-danger-border)'}`,
                color: connectionIssue.status === 'DATABASE_UNAVAILABLE' ? 'var(--color-warning-text)' : 'var(--color-danger-text)',
                borderRadius: 'var(--radius-sm)',
                padding: '4px 10px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: retrying ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px'
              }}
            >
              <RefreshCw size={12} className={retrying ? 'spin' : ''} />
              {retrying ? 'Checking...' : 'Retry Connection'}
            </button>
          </div>
        )}
        {isPendingVerification && (
          <div style={{
            backgroundColor: 'var(--color-warning-bg)',
            borderBottom: '1px solid var(--color-warning-border)',
            padding: '10px 24px',
            fontSize: '12.5px',
            color: 'var(--color-warning-text)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontWeight: 500
          }}>
            <Clock size={16} color="var(--color-warning)" style={{ flexShrink: 0 }} />
            <span>
              <strong>Account Verification Pending:</strong> You have full read access to explore models, policies, and dossiers. Governance actions (creating models, running evaluations, approving policies) will activate once a Platform Administrator verifies your account.
            </span>
          </div>
        )}
        <main>
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
