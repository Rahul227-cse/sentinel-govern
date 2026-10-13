import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Navbar from './Navbar';
import ErrorBoundary from './ErrorBoundary';
import { useAuth } from '../context/AuthContext';
import { Clock } from 'lucide-react';

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const { user } = useAuth();

  const toggleSidebar = () => {
    setCollapsed((prev) => !prev);
  };

  const isPendingVerification = user?.verificationStatus === 'PENDING';

  return (
    <div className="app-container">
      <Sidebar collapsed={collapsed} onToggle={toggleSidebar} />
      <div className={`main-content ${collapsed ? 'sidebar-collapsed' : ''}`}>
        <Navbar onToggleSidebar={toggleSidebar} isSidebarCollapsed={collapsed} />
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
