import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import GoogleSignInButton from '../components/GoogleSignInButton';
import ThemeToggle from '../components/ThemeToggle';
import AnimatedCircularFrame from '../components/AnimatedCircularFrame';
import {
  Shield, Eye, EyeOff, AlertCircle, ArrowRight, Loader2
} from 'lucide-react';
import '../styles/AuthAnimated.css';

// ─── Utility ─────────────────────────────────────────────────────────────────

function isSafeRedirect(path) {
  return typeof path === 'string' && path.startsWith('/') && !path.startsWith('//') && !path.startsWith('/\\');
}

function getRedirectDestination(user, redirect) {
  if (redirect && isSafeRedirect(redirect)) return redirect;
  if (user && !user.onboardingCompleted) return '/onboarding';
  return user?.role === 'PLATFORM_ADMIN' ? '/admin/users' : '/app';
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function LoginPage() {
  const { user, isAuthenticated, loading: authLoading, login, error: authError, clearError } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const params = new URLSearchParams(location.search);
  const redirectTo = params.get('redirect') || location.state?.from?.pathname;

  const [email, setEmail]               = useState('');
  const [password, setPassword]         = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe]     = useState(false);
  const [submitting, setSubmitting]     = useState(false);
  const [formError, setFormError]       = useState('');
  const [fieldErrors, setFieldErrors]   = useState({});

  const emailRef = useRef(null);

  useEffect(() => { emailRef.current?.focus(); }, []);

  // Redirect if already authenticated
  useEffect(() => {
    if (!authLoading && isAuthenticated && user) {
      navigate(getRedirectDestination(user, redirectTo), { replace: true });
    }
  }, [authLoading, isAuthenticated, user, navigate, redirectTo]);

  // Sync server error to local display
  useEffect(() => {
    if (authError) {
      setFormError(humanizeError(authError));
      clearError();
    }
  }, [authError, clearError]);

  function humanizeError(msg = '') {
    if (/suspended/i.test(msg)) return 'Your account has been suspended. Contact your administrator.';
    if (/pending/i.test(msg)) return 'Your account is awaiting administrator approval.';
    if (/invalid email or password/i.test(msg)) return 'Email or password is incorrect. Check your details and try again.';
    if (/too many/i.test(msg) || /rate/i.test(msg)) return 'Too many attempts. Please wait a few minutes and try again.';
    if (/network|fetch|reach/i.test(msg)) return "We couldn't reach Sentinel Govern. Check your connection and try again.";
    return msg || 'Something went wrong. Please try again.';
  }

  function validate() {
    const errors = {};
    if (!email.trim()) errors.email = 'Email is required.';
    else if (!email.includes('@')) errors.email = 'Enter a valid email address.';
    if (!password) errors.password = 'Password is required.';
    return errors;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError('');
    const errors = validate();
    if (Object.keys(errors).length) { setFieldErrors(errors); return; }
    setFieldErrors({});
    setSubmitting(true);
    try {
      const res = await login({ email: email.trim().toLowerCase(), password, rememberMe });
      if (res.success) {
        navigate(getRedirectDestination(res.user, redirectTo), { replace: true });
      } else {
        setFormError(humanizeError(res.error));
      }
    } catch (err) {
      setFormError(humanizeError(err.message));
    } finally {
      setSubmitting(false);
    }
  }

  const isProcessing = submitting || authLoading;

  return (
    <div className="auth-page-wrapper">
      {/* Top Navigation Bar */}
      <header className="auth-top-bar">
        <Link to="/" className="auth-brand-logo" aria-label="Sentinel Govern Home">
          <div className="auth-brand-icon">
            <Shield size={17} strokeWidth={2.4} />
          </div>
          <span className="auth-brand-text">SENTINEL GOVERN</span>
        </Link>
        <div className="auth-top-actions">
          <ThemeToggle />
        </div>
      </header>

      {/* Main Centered Stage with 50-Segment Animated Circular Frame */}
      <main className="auth-main-stage">
        <AnimatedCircularFrame mode="login">
          <h1 className="auth-title">
            Sign in to Sentinel Govern
          </h1>
          <p className="auth-subtitle">
            Access your enterprise governance workspace.
          </p>

          {/* Error Banner */}
          {formError && (
            <div className="auth-error-banner" role="alert">
              <AlertCircle size={15} color="var(--color-danger)" style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                <div style={{ fontWeight: 600, marginBottom: 1 }}>Sign In Failed</div>
                <div>{formError}</div>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            {/* Email */}
            <div className="auth-form-group">
              <label htmlFor="login-email" className="auth-label">
                Email address
              </label>
              <input
                id="login-email"
                ref={emailRef}
                type="email"
                autoComplete="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setFieldErrors(p => ({ ...p, email: '' })); }}
                placeholder="name@enterprise.com"
                disabled={isProcessing}
                className={`auth-input ${fieldErrors.email ? 'has-error' : ''}`}
              />
              {fieldErrors.email && (
                <div className="auth-field-error">
                  <AlertCircle size={11} /> {fieldErrors.email}
                </div>
              )}
            </div>

            {/* Password */}
            <div className="auth-form-group" style={{ marginBottom: 12 }}>
              <label htmlFor="login-password" className="auth-label">
                Password
              </label>
              <div className="auth-input-wrapper">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={e => { setPassword(e.target.value); setFieldErrors(p => ({ ...p, password: '' })); }}
                  placeholder="Enter password"
                  disabled={isProcessing}
                  className={`auth-input ${fieldErrors.password ? 'has-error' : ''}`}
                  style={{ paddingRight: 40 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(s => !s)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="auth-eye-btn"
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {fieldErrors.password && (
                <div className="auth-field-error">
                  <AlertCircle size={11} /> {fieldErrors.password}
                </div>
              )}
            </div>

            {/* Remember Me + Forgot Password */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', userSelect: 'none' }}>
                <input
                  id="login-remember-me"
                  type="checkbox"
                  checked={rememberMe}
                  onChange={e => setRememberMe(e.target.checked)}
                  style={{
                    width: 14,
                    height: 14,
                    accentColor: 'var(--auth-accent-primary)',
                    cursor: 'pointer'
                  }}
                />
                <span style={{ fontSize: 12.5, color: 'var(--auth-text-secondary)' }}>Remember session</span>
              </label>
              <Link to="/forgot-password" className="auth-link" style={{ fontSize: 12.5 }}>
                Forgot password?
              </Link>
            </div>

            {/* Submit Button */}
            <button
              id="login-submit"
              type="submit"
              disabled={isProcessing}
              className="auth-btn-primary"
            >
              {isProcessing ? (
                <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Signing in…</>
              ) : (
                <>Sign In <ArrowRight size={14} /></>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="auth-divider">
            <div className="auth-divider-line" />
            <span className="auth-divider-text">OR</span>
            <div className="auth-divider-line" />
          </div>

          {/* Google OAuth Button */}
          <div className="auth-google-wrapper">
            <GoogleSignInButton
              text="signin_with"
              onAuthSuccess={(u) => navigate(getRedirectDestination(u, redirectTo), { replace: true })}
            />
          </div>

          {/* Create Account link */}
          <p className="auth-switch-text">
            Don't have an account?{' '}
            <Link to="/signup" className="auth-link">
              Create an account
            </Link>
          </p>
        </AnimatedCircularFrame>
      </main>

      {/* Footer */}
      <footer className="auth-footer">
        © 2026 Sentinel Govern. Institutional AI Governance & Lifecycle Platform.
      </footer>
    </div>
  );
}
