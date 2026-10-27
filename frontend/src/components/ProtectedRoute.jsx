import React from 'react';
import { Navigate, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import SuspendedNotice from './SuspendedNotice';
import AccessDeniedNotice from './AccessDeniedNotice';
import { Compass } from 'lucide-react';

export default function ProtectedRoute({ allowedRoles, children }) {
  const { user, isAuthenticated, loading } = useAuth();
  const location = useLocation();

  // 1. Prevent rendering protected content before auth verification completes
  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'var(--color-bg)',
        color: 'var(--color-text)',
        gap: '16px'
      }}>
        <div style={{
          width: '48px',
          height: '48px',
          borderRadius: 'var(--radius-card)',
          backgroundColor: 'var(--color-accent-subtle)',
          border: '1px solid var(--color-accent-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--color-primary)'
        }}>
          <Compass size={26} />
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--color-text)' }}>Sentinel Govern</div>
          <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
            Verifying session…
          </div>
        </div>
      </div>
    );
  }

  // 2. Unauthenticated -> redirect to /login with redirect param
  if (!isAuthenticated || !user) {
    const redirectParam = location.pathname !== '/' ? `?redirect=${encodeURIComponent(location.pathname)}` : '';
    return <Navigate to={`/login${redirectParam}`} state={{ from: location }} replace />;
  }


  // 3. SUSPENDED users see access-denied state
  if (user.status === 'SUSPENDED') {
    return <SuspendedNotice />;
  }

  // 4. Incomplete onboarding -> redirect to /onboarding
  if (!user.onboardingCompleted && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }

  // 5. Role restrictions for specific sections (e.g. /admin/* requires PLATFORM_ADMIN)
  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    return <AccessDeniedNotice requiredRoles={allowedRoles} />;
  }

  // 6. Active and permitted -> render children or nested routes
  return children ? children : <Outlet />;
}
