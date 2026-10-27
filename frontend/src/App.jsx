import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { RoleProvider } from './context/RoleContext';
import { ThemeProvider } from './context/ThemeContext';

import ProtectedRoute from './components/ProtectedRoute';
import AppLayout from './components/AppLayout';
import SuspendedNotice from './components/SuspendedNotice';
import ErrorBoundary from './components/ErrorBoundary';

// Public pages
import Landing from './pages/Landing';
import LoginPage from './pages/Login';
import SignupPage from './pages/Signup';
import ForgotPasswordPage from './pages/ForgotPassword';
import ResetPasswordPage from './pages/ResetPassword';
import OnboardingPage from './pages/Onboarding';

// Authenticated governance pages
import Dashboard from './pages/Dashboard';
import ModelRegistry from './pages/ModelRegistry';
import ModelDetails from './pages/ModelDetails';
import FairnessStudio from './pages/FairnessStudio';
import PolicyManagement from './pages/PolicyManagement';
import ApprovalCenter from './pages/ApprovalCenter';
import Monitoring from './pages/Monitoring';
import IncidentManagement from './pages/IncidentManagement';
import IssueReporting from './pages/IssueReporting';
import AuditTrail from './pages/AuditTrail';
import ComplianceDossier from './pages/ComplianceDossier';
import AdminUsers from './pages/AdminUsers';
import UserProfile from './pages/UserProfile';

/**
 * Root Route Dispatcher:
 * Dispatches root URL '/' based on authentication and lifecycle status.
 * Unauthenticated users see the marketing landing page.
 * Authenticated users are dispatched based on role and onboarding status.
 */
function RootDispatcher() {
  const { user, isAuthenticated, loading } = useAuth();

  if (loading) {
    return <ProtectedRoute />;
  }

  if (!isAuthenticated || !user) {
    return <Landing />;
  }

  if (user.status === 'SUSPENDED') {
    return <SuspendedNotice />;
  }

  if (!user.onboardingCompleted) {
    return <Navigate to="/onboarding" replace />;
  }

  if (user.role === 'PLATFORM_ADMIN') {
    return <Navigate to="/admin/users" replace />;
  }

  return <Navigate to="/app" replace />;
}

/**
 * Public Route Guard:
 * Prevents authenticated ACTIVE users from reaching public auth pages.
 * SUSPENDED users are allowed to see auth pages (or suspended notice).
 */
function PublicOnlyRoute({ children }) {
  const { user, isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) return null;

  if (isAuthenticated && user && user.status === 'ACTIVE') {
    if (!user.onboardingCompleted) {
      // Allow viewing signup page if onboarding is incomplete (e.g. user navigated Back from onboarding)
      if (location.pathname === '/signup') {
        return children;
      }
      return <Navigate to="/onboarding" replace />;
    }
    const dest = user.role === 'PLATFORM_ADMIN' ? '/admin/users' : '/app';
    return <Navigate to={dest} replace />;
  }

  return children;
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <RoleProvider>
          <ErrorBoundary isRoot>
            <BrowserRouter>
              <Routes>
                {/* ── 1. Root Entrypoint — Landing or App Dispatch ── */}
                <Route path="/" element={<RootDispatcher />} />

                {/* ── 2. Public Authentication Routes ── */}
                <Route path="/login"           element={<PublicOnlyRoute><LoginPage /></PublicOnlyRoute>} />
                <Route path="/signup"          element={<PublicOnlyRoute><SignupPage /></PublicOnlyRoute>} />
                <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                <Route path="/reset-password"  element={<ResetPasswordPage />} />

                {/* ── 3. Post-Signup Onboarding Flow ── */}
                <Route 
                  path="/onboarding" 
                  element={
                    <ProtectedRoute>
                      <OnboardingPage />
                    </ProtectedRoute>
                  } 
                />

                {/* ── 4. Unified Authenticated Workspace Layout ── */}
                {/* Exactly ONE AppLayout / Sidebar instance for all authenticated routes */}
                <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
                  {/* Platform Administration routes */}
                  <Route path="/admin"          element={<Navigate to="/admin/users" replace />} />
                  <Route 
                    path="/admin/users" 
                    element={
                      <ProtectedRoute allowedRoles={['PLATFORM_ADMIN']}>
                        <AdminUsers />
                      </ProtectedRoute>
                    } 
                  />
                  <Route path="/admin/roles"    element={<Navigate to="/admin/users" replace />} />
                  <Route path="/admin/settings" element={<Navigate to="/admin/users" replace />} />

                  {/* Core Governance Application Workspace */}
                  <Route path="/app"            element={<Dashboard />} />
                  <Route path="/app/dashboard"  element={<Navigate to="/app" replace />} />
                  <Route path="/app/registry"   element={<ModelRegistry />} />
                  <Route path="/app/models"     element={<Navigate to="/app/registry" replace />} />
                  <Route path="/app/models/:id" element={<ModelDetails />} />
                  <Route path="/app/evaluation" element={<FairnessStudio />} />
                  <Route path="/app/policies"   element={<PolicyManagement />} />
                  <Route path="/app/approvals"  element={<ApprovalCenter />} />
                  <Route path="/app/monitoring" element={<Monitoring />} />
                  <Route path="/app/incidents"  element={<IncidentManagement />} />
                  <Route path="/app/issues"     element={<IssueReporting />} />
                  <Route path="/app/audit"      element={<AuditTrail />} />
                  <Route path="/app/reports"    element={<Navigate to="/app/dossier" replace />} />
                  <Route path="/app/dossier"    element={<ComplianceDossier />} />
                  <Route path="/app/profile"    element={<UserProfile />} />

                  {/* Backward Compatibility Redirects (rendered in same unified AppLayout) */}
                  <Route path="/dashboard"  element={<Navigate to="/app" replace />} />
                  <Route path="/registry"   element={<Navigate to="/app/registry" replace />} />
                  <Route path="/models"     element={<Navigate to="/app/registry" replace />} />
                  <Route path="/models/:id" element={<ModelDetails />} />
                  <Route path="/evaluation" element={<Navigate to="/app/evaluation" replace />} />
                  <Route path="/policies"   element={<Navigate to="/app/policies" replace />} />
                  <Route path="/approvals"  element={<Navigate to="/app/approvals" replace />} />
                  <Route path="/monitoring" element={<Navigate to="/app/monitoring" replace />} />
                  <Route path="/incidents"  element={<Navigate to="/app/incidents" replace />} />
                  <Route path="/issues"     element={<Navigate to="/app/issues" replace />} />
                  <Route path="/audit"      element={<Navigate to="/app/audit" replace />} />
                  <Route path="/reports"    element={<Navigate to="/app/dossier" replace />} />
                  <Route path="/dossier"    element={<Navigate to="/app/dossier" replace />} />
                  <Route path="/profile"    element={<Navigate to="/app/profile" replace />} />
                </Route>

                {/* ── 5. Catch-all fallback ── */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </BrowserRouter>
          </ErrorBoundary>
        </RoleProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
