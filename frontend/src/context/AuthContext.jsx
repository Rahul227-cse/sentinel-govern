import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import {
  googleAuthLogin,
  nativeSignup as apiNativeSignup,
  nativeLogin as apiNativeLogin,
  completeOnboarding as apiCompleteOnboarding,
  refreshAuthToken,
  getAuthMe,
  logoutAuth
} from '../services/api';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser]             = useState(null);
  const [token, setToken]           = useState(localStorage.getItem('sentinel_token') || localStorage.getItem('aegis_token'));
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const refreshingRef               = useRef(false);

  // ─── Session Initialization ───────────────────────────────────────────────

  useEffect(() => {
    async function initAuth() {
      const storedToken = localStorage.getItem('sentinel_token') || localStorage.getItem('aegis_token');
      if (storedToken) {
        try {
          const res = await getAuthMe();
          if (res && res.user) {
            const legacyRoles = ['ETHICS_OFFICER', 'COMPLIANCE_OFFICER', 'EXECUTIVE_SPONSOR', 'EMPLOYEE'];
            if (legacyRoles.includes(res.user.role)) {
              console.warn('[Auth] Stale legacy role detected in session. Invalidating session.');
              _clearLocalSession();
            } else {
              setUser(res.user);
            }
          } else {
            await silentRefresh();
          }
        } catch (err) {
          if (err.status === 401) {
            await silentRefresh();
          } else {
            console.warn('[Auth] Session initialization failed:', err.message);
            _clearLocalSession();
          }
        }
      }
      setLoading(false);
    }

    initAuth();
  }, []);

  // ─── Silent Token Refresh ─────────────────────────────────────────────────

  async function silentRefresh() {
    if (refreshingRef.current) return false;
    refreshingRef.current = true;
    try {
      const res = await refreshAuthToken();
      if (res && res.token) {
        const legacyRoles = ['ETHICS_OFFICER', 'COMPLIANCE_OFFICER', 'EXECUTIVE_SPONSOR', 'EMPLOYEE'];
        if (res.user && legacyRoles.includes(res.user.role)) {
          console.warn('[Auth] Stale legacy role returned on refresh. Invalidating session.');
          _clearLocalSession();
          return false;
        }
        localStorage.setItem('sentinel_token', res.token);
        localStorage.setItem('aegis_token', res.token);
        setToken(res.token);
        setUser(res.user || null);
        return true;
      }
    } catch {
      // Refresh cookie absent or expired — clean up silently
    } finally {
      refreshingRef.current = false;
    }
    _clearLocalSession();
    return false;
  }

  // ─── Unauthorized Event Listener ─────────────────────────────────────────

  useEffect(() => {
    const handleUnauthorized = async (event) => {
      const refreshed = await silentRefresh();
      if (!refreshed) {
        setError(event.detail?.error || 'Session expired. Please sign in again.');
      }
    };

    window.addEventListener('sentinel:unauthorized', handleUnauthorized);
    window.addEventListener('aegis:unauthorized', handleUnauthorized);
    return () => {
      window.removeEventListener('sentinel:unauthorized', handleUnauthorized);
      window.removeEventListener('aegis:unauthorized', handleUnauthorized);
    };
  }, []);

  // ─── Helpers ──────────────────────────────────────────────────────────────

  function _setSession(res) {
    if (res && res.token) {
      const legacyRoles = ['ETHICS_OFFICER', 'COMPLIANCE_OFFICER', 'EXECUTIVE_SPONSOR', 'EMPLOYEE'];
      if (res.user && legacyRoles.includes(res.user.role)) {
        console.warn('[Auth] Attempted to set session with legacy role. Rejected.');
        _clearLocalSession();
        return;
      }
      localStorage.setItem('sentinel_token', res.token);
      localStorage.setItem('aegis_token', res.token);
      setToken(res.token);
      setUser(res.user);
    }
  }

  function _clearLocalSession() {
    localStorage.removeItem('sentinel_token');
    localStorage.removeItem('aegis_token');
    setToken(null);
    setUser(null);
  }

  // ─── Google Sign-In ────────────────────────────────────────────────────────

  const loginWithGoogle = async (credential) => {
    setLoading(true);
    setError(null);
    try {
      const res = await googleAuthLogin(credential);
      if (res && res.token) {
        _setSession(res);
        return { success: true, user: res.user };
      } else {
        throw new Error('Invalid authentication response from server');
      }
    } catch (err) {
      const errorMsg = err.data?.error || err.message || 'Google Sign-In failed';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      setLoading(false);
    }
  };

  // ─── Native Signup ─────────────────────────────────────────────────────────

  const signup = async ({ name, email, password }) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiNativeSignup({ name, email, password });
      if (res && res.token) {
        _setSession(res);
        return { success: true, user: res.user };
      } else {
        throw new Error('Invalid signup response from server');
      }
    } catch (err) {
      const errorMsg = err.data?.error || err.message || 'Signup failed';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      setLoading(false);
    }
  };

  // ─── Native Login ──────────────────────────────────────────────────────────

  const login = async ({ email, password, rememberMe = false }) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiNativeLogin({ email, password, rememberMe });
      if (res && res.token) {
        _setSession(res);
        return { success: true, user: res.user };
      } else {
        throw new Error('Invalid login response from server');
      }
    } catch (err) {
      const errorMsg = err.data?.error || err.message || 'Login failed';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      setLoading(false);
    }
  };

  // ─── Complete Onboarding ───────────────────────────────────────────────────

  const submitOnboarding = async (data) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiCompleteOnboarding(data);
      if (res && res.token) {
        _setSession(res);
        return { success: true, user: res.user };
      } else {
        throw new Error('Invalid onboarding response from server');
      }
    } catch (err) {
      const errorMsg = err.data?.error || err.message || 'Onboarding failed';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      setLoading(false);
    }
  };

  // ─── Logout ────────────────────────────────────────────────────────────────

  const logout = async () => {
    try {
      await logoutAuth().catch(() => {});
    } finally {
      _clearLocalSession();
      setError(null);
    }
  };

  // ─── Refresh User Profile ──────────────────────────────────────────────────

  const refreshUser = async () => {
    try {
      const res = await getAuthMe();
      if (res && res.user) {
        setUser(res.user);
        return res.user;
      } else {
        await logout();
        return null;
      }
    } catch {
      await logout();
      return null;
    }
  };

  const clearError = () => setError(null);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!user,
        role: user?.role || null,
        currentRole: user?.role || null,
        loading,
        error,
        // Auth methods
        loginWithGoogle,
        login,
        signup,
        submitOnboarding,
        logout,
        refreshUser,
        clearError
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
