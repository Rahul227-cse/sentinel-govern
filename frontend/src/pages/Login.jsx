import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import GoogleSignInButton from '../components/GoogleSignInButton';
import ThemeToggle from '../components/ThemeToggle';
import {
  Shield, Eye, EyeOff, AlertCircle, CheckCircle2,
  ArrowRight, Lock, Loader2, Check
} from 'lucide-react';

// ─── Governance mini-flow sidebar ────────────────────────────────────────────

const MINI_STEPS = [
  { label: 'Model Registration',   done: true },
  { label: 'Fairness Evaluation',  done: true },
  { label: 'Policy Gate Check',    done: true },
  { label: 'Approval Sign-off',    done: false, active: true },
  { label: 'Production Release',   done: false },
  { label: 'Audit Verification',   done: false },
];

function LeftPanel() {
  return (
    <div
      className="auth-left-panel"
      style={{
        flex: '0 0 420px',
        backgroundColor: 'var(--color-surface)',
        borderRight: '1px solid var(--color-border)',
        padding: '48px 40px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        minHeight: '100vh',
      }}
    >
      {/* Brand Header */}
      <div>
        <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, textDecoration: 'none', marginBottom: 44 }}>
          <div style={{
            width: 30,
            height: 30,
            borderRadius: 'var(--radius-sm)',
            backgroundColor: 'var(--color-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ffffff'
          }}>
            <Shield size={16} strokeWidth={2.4} />
          </div>
          <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--color-text)' }}>
            SENTINEL GOVERN
          </span>
        </Link>

        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--color-primary)', textTransform: 'uppercase', marginBottom: 8 }}>
            AI Governance & Lifecycle Platform
          </div>
          <p style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-text)', lineHeight: 1.3, letterSpacing: '-0.02em', marginBottom: 10 }}>
            Unified governance across the entire AI lifecycle.
          </p>
          <p style={{ fontSize: 13.5, color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
            Deterministic policy gating, multi-stakeholder sign-offs, live inference drift surveillance, and immutable audit logs.
          </p>
        </div>

        {/* Lifecycle mini-visualization */}
        <div style={{
          backgroundColor: 'var(--color-surface-secondary)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--color-border)',
          padding: '18px 16px'
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 14 }}>
            Lifecycle Progression
          </div>
          {MINI_STEPS.map((step, i) => (
            <div key={step.label}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 20,
                  height: 20,
                  borderRadius: '50%',
                  flexShrink: 0,
                  backgroundColor: step.done ? 'var(--color-success-bg)' : step.active ? 'var(--color-primary)' : 'var(--color-surface)',
                  border: `1.5px solid ${step.done ? 'var(--color-success)' : step.active ? 'var(--color-primary)' : 'var(--color-border)'}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  {step.done ? (
                    <Check size={11} color="var(--color-success)" strokeWidth={2.5} />
                  ) : step.active ? (
                    <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#fff' }} />
                  ) : null}
                </div>
                <span style={{ fontSize: 12, fontWeight: step.active ? 600 : 400, color: step.active ? 'var(--color-primary)' : step.done ? 'var(--color-text)' : 'var(--color-text-muted)' }}>
                  {step.label}
                </span>
                {step.active && (
                  <span style={{
                    marginLeft: 'auto',
                    fontSize: 10,
                    fontWeight: 600,
                    color: 'var(--color-warning-text)',
                    backgroundColor: 'var(--color-warning-bg)',
                    border: '1px solid var(--color-warning-border)',
                    padding: '1px 6px',
                    borderRadius: 'var(--radius-xs)'
                  }}>
                    Gate Enforced
                  </span>
                )}
              </div>
              {i < MINI_STEPS.length - 1 && (
                <div style={{ width: 2, height: 8, backgroundColor: step.done ? 'var(--color-success-border)' : 'var(--color-border)', marginLeft: 9 }} />
              )}
            </div>
          ))}
        </div>
      </div>

      <div style={{ fontSize: 11.5, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
        <Lock size={12} style={{ display: 'inline', marginRight: 5, verticalAlign: 'middle' }} />
        Authentication verifies identity. Sentinel Govern determines authorization.
      </div>
    </div>
  );
}

// ─── Utility ─────────────────────────────────────────────────────────────────

function isSafeRedirect(path) {
  return typeof path === 'string' && path.startsWith('/') && !path.startsWith('//') && !path.startsWith('/\\');
}

function getRedirectDestination(user, redirect) {
  if (redirect && isSafeRedirect(redirect)) return redirect;
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
  }, [authError]);

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
    <div style={{ minHeight: '100vh', display: 'flex', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}>
      <style>{`
        .auth-left-panel { display: flex !important; }
        @media (max-width: 840px) { .auth-left-panel { display: none !important; } }
      `}</style>

      <LeftPanel />

      {/* Right: Form panel */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '24px 28px' }}>
        {/* Top bar on form side: theme toggle */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <ThemeToggle />
        </div>

        <div style={{ width: '100%', maxWidth: 400, margin: '0 auto', padding: '20px 0' }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.025em', color: 'var(--color-text)', marginBottom: 6 }}>
            Sign in to Sentinel Govern
          </h1>
          <p style={{ fontSize: 13.5, color: 'var(--color-text-secondary)', marginBottom: 28, lineHeight: 1.5 }}>
            Access your enterprise governance workspace.
          </p>

          {/* Error Banner */}
          {formError && (
            <div style={{
              display: 'flex',
              gap: 10,
              alignItems: 'flex-start',
              backgroundColor: 'var(--color-danger-bg)',
              border: '1px solid var(--color-danger-border)',
              borderRadius: 'var(--radius-sm)',
              padding: '12px 14px',
              marginBottom: 20
            }} role="alert">
              <AlertCircle size={15} color="var(--color-danger)" style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-danger-text)', marginBottom: 1 }}>Sign In Failed</div>
                <div style={{ fontSize: 12, color: 'var(--color-danger-text)' }}>{formError}</div>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            {/* Email */}
            <div className="form-group">
              <label htmlFor="login-email" className="form-label">
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
                className="form-input"
                style={{
                  borderColor: fieldErrors.email ? 'var(--color-danger)' : undefined
                }}
              />
              {fieldErrors.email && <div style={{ fontSize: 11.5, color: 'var(--color-danger)', marginTop: 2 }}>{fieldErrors.email}</div>}
            </div>

            {/* Password */}
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label htmlFor="login-password" className="form-label">
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={e => { setPassword(e.target.value); setFieldErrors(p => ({ ...p, password: '' })); }}
                  placeholder="Enter password"
                  disabled={isProcessing}
                  className="form-input"
                  style={{
                    width: '100%',
                    paddingRight: 40,
                    borderColor: fieldErrors.password ? 'var(--color-danger)' : undefined
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(s => !s)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  style={{
                    position: 'absolute',
                    right: 10,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--color-text-muted)',
                    display: 'flex',
                    padding: 4
                  }}
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {fieldErrors.password && <div style={{ fontSize: 11.5, color: 'var(--color-danger)', marginTop: 2 }}>{fieldErrors.password}</div>}
            </div>

            {/* Remember Me + Forgot */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', userSelect: 'none' }}>
                <input
                  id="login-remember-me"
                  type="checkbox"
                  checked={rememberMe}
                  onChange={e => setRememberMe(e.target.checked)}
                  style={{ width: 14, height: 14, accentColor: 'var(--color-primary)', cursor: 'pointer' }}
                />
                <span style={{ fontSize: 12.5, color: 'var(--color-text-secondary)' }}>Remember session</span>
              </label>
              <Link to="/forgot-password" style={{ fontSize: 12.5, color: 'var(--color-primary)', textDecoration: 'none', fontWeight: 500 }}>
                Forgot password?
              </Link>
            </div>

            {/* Submit Button */}
            <button
              id="login-submit"
              type="submit"
              disabled={isProcessing}
              className="btn btn-primary"
              style={{
                width: '100%',
                padding: '10px 0',
                fontSize: 13.5
              }}
            >
              {isProcessing ? (
                <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Signing in…</>
              ) : (
                <>Sign In <ArrowRight size={14} /></>
              )}
            </button>
          </form>

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '22px 0' }}>
            <div style={{ flex: 1, height: 1, backgroundColor: 'var(--color-border)' }} />
            <span style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 600, letterSpacing: '0.04em' }}>OR</span>
            <div style={{ flex: 1, height: 1, backgroundColor: 'var(--color-border)' }} />
          </div>

          {/* Google OAuth Button */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 22 }}>
            <GoogleSignInButton onAuthSuccess={(u) => navigate(getRedirectDestination(u, redirectTo), { replace: true })} />
          </div>

          {/* Sign up link */}
          <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--color-text-secondary)' }}>
            Don't have an account?{' '}
            <Link to="/signup" style={{ color: 'var(--color-primary)', textDecoration: 'none', fontWeight: 600 }}>
              Create an account
            </Link>
          </p>
        </div>

        {/* Footer info */}
        <div style={{ textAlign: 'center', fontSize: 11.5, color: 'var(--color-text-muted)' }}>
          © 2026 Sentinel Govern. AI Governance & Lifecycle Platform.
        </div>
      </div>
    </div>
  );
}
