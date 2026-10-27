import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { updateUserProfile } from '../services/api';
import GoogleSignInButton from '../components/GoogleSignInButton';
import ThemeToggle from '../components/ThemeToggle';
import AnimatedCircularFrame from '../components/AnimatedCircularFrame';
import { Shield, Eye, EyeOff, AlertCircle, CheckCircle2, ArrowRight, Loader2 } from 'lucide-react';
import '../styles/AuthAnimated.css';

// ─── Password Strength Indicator ─────────────────────────────────────────────

function PasswordStrength({ password }) {
  if (!password) return null;

  const checks = [
    { label: 'At least 8 characters', ok: password.length >= 8 },
    { label: 'Uppercase letter',       ok: /[A-Z]/.test(password) },
    { label: 'Lowercase letter',       ok: /[a-z]/.test(password) },
    { label: 'Number',                 ok: /[0-9]/.test(password) },
  ];
  const passed = checks.filter(c => c.ok).length;
  const colors = ['var(--color-danger)', 'var(--color-warning)', 'var(--color-warning)', 'var(--color-success)', 'var(--color-success)'];
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong'];

  return (
    <div style={{ marginTop: 6, marginBottom: 8 }}>
      <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
        {[0, 1, 2, 3].map(i => (
          <div
            key={i}
            style={{
              flex: 1,
              height: 3,
              borderRadius: 2,
              backgroundColor: i < passed ? colors[passed] : 'var(--auth-border)',
              transition: 'background 200ms'
            }}
          />
        ))}
      </div>
      {passed > 0 && (
        <div style={{ fontSize: 11, color: colors[passed], fontWeight: 600, marginBottom: 4 }}>
          {labels[passed]} password
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 10px' }}>
        {checks.map(c => (
          <div key={c.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{
              width: 5,
              height: 5,
              borderRadius: '50%',
              backgroundColor: c.ok ? 'var(--color-success)' : 'var(--auth-border-strong)',
              flexShrink: 0
            }} />
            <span style={{ fontSize: 10.5, color: c.ok ? 'var(--color-success-text)' : 'var(--auth-text-muted)' }}>
              {c.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SignupPage() {
  const { user, isAuthenticated, loading: authLoading, signup, logout, refreshUser, error: authError, clearError } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // An account is already established if the user is authenticated with pending onboarding
  const hasExistingAccount = Boolean(isAuthenticated && user && !user.onboardingCompleted);

  const [name, setName]                       = useState(location.state?.name || user?.name || '');
  const [email, setEmail]                     = useState(location.state?.email || user?.email || '');
  const [password, setPassword]               = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword]       = useState(false);
  const [showConfirm, setShowConfirm]         = useState(false);
  const [submitting, setSubmitting]           = useState(false);
  const [formError, setFormError]             = useState('');
  const [fieldErrors, setFieldErrors]         = useState({});

  const nameRef = useRef(null);

  useEffect(() => { nameRef.current?.focus(); }, []);

  // Sync state if user loads after mount
  useEffect(() => {
    if (user) {
      setName(prev => (!prev ? (user.name || '') : prev));
      setEmail(prev => (!prev ? (user.email || '') : prev));
    }
  }, [user]);

  // If user has already completed onboarding, redirect to destination
  useEffect(() => {
    if (!authLoading && isAuthenticated && user) {
      if (user.onboardingCompleted) {
        navigate(user.role === 'PLATFORM_ADMIN' ? '/admin/users' : '/app', { replace: true });
      }
    }
  }, [authLoading, isAuthenticated, user, navigate]);

  useEffect(() => {
    if (authError) {
      setFormError(authError);
      clearError();
    }
  }, [authError, clearError]);

  function validate() {
    const errors = {};
    if (!name.trim() || name.trim().length < 2) errors.name = 'Full name must be at least 2 characters.';
    if (!email.trim() || !email.includes('@')) errors.email = 'Enter a valid email address.';
    if (!password) errors.password = 'Password is required.';
    else if (password.length < 8) errors.password = 'Password must be at least 8 characters.';
    else if (!/[A-Z]/.test(password)) errors.password = 'Password must include an uppercase letter.';
    else if (!/[0-9]/.test(password)) errors.password = 'Password must include a number.';
    if (password && confirmPassword !== password) errors.confirmPassword = 'Passwords do not match.';
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
      const res = await signup({ name: name.trim(), email: email.trim().toLowerCase(), password });
      if (res.success) {
        // Continue directly into Sentinel Govern onboarding workflow, preserving any existing onboarding selections
        navigate('/onboarding', {
          replace: true,
          state: {
            fromSignup: true,
            name: name.trim(),
            email: email.trim().toLowerCase(),
            onboardingData: location.state?.onboardingData || null
          }
        });
      } else {
        setFormError(res.error || 'Signup failed. Please try again.');
      }
    } catch (err) {
      setFormError(err.message || 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleContinueToOnboarding(e) {
    if (e) e.preventDefault();
    setFormError('');
    const trimmedName = name.trim();
    if (!trimmedName || trimmedName.length < 2) {
      setFieldErrors({ name: 'Full name must be at least 2 characters.' });
      return;
    }
    setFieldErrors({});

    // If name was edited, securely update via authenticated endpoint
    if (trimmedName !== user?.name) {
      setSubmitting(true);
      try {
        const res = await updateUserProfile({ name: trimmedName });
        if (res && res.success) {
          if (refreshUser) await refreshUser();
        } else {
          setFormError(res?.error || 'Failed to update name');
          setSubmitting(false);
          return;
        }
      } catch (err) {
        setFormError(err.message || 'Failed to update name');
        setSubmitting(false);
        return;
      }
      setSubmitting(false);
    }

    // Navigate forward to onboarding, preserving prior selections
    navigate('/onboarding', {
      state: {
        fromSignup: true,
        onboardingData: location.state?.onboardingData || null
      }
    });
  }

  async function handleStartOver() {
    setSubmitting(true);
    try {
      if (logout) await logout();
    } catch {
      // ignore
    } finally {
      setName('');
      setEmail('');
      setPassword('');
      setConfirmPassword('');
      setFieldErrors({});
      setFormError('');
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

      {/* Main Centered Stage with 50-Segment Animated Circular Frame (mode="signup") */}
      <main className="auth-main-stage">
        <AnimatedCircularFrame mode="signup">
          <h1 className="auth-title">
            {hasExistingAccount ? 'Account established' : 'Create your account'}
          </h1>
          <p className="auth-subtitle">
            {hasExistingAccount
              ? 'Your workspace account is ready. Adjust your name if needed, or continue.'
              : "Join your organization's workspace and configure your role."}
          </p>

          {hasExistingAccount && (
            <div style={{
              display: 'flex',
              gap: 8,
              alignItems: 'flex-start',
              borderLeft: '2px solid var(--auth-accent-primary)',
              padding: '4px 0 4px 10px',
              marginBottom: 14
            }} role="status">
              <CheckCircle2 size={15} color="var(--color-primary)" style={{ flexShrink: 0, marginTop: 1 }} />
              <div style={{ fontSize: 12, color: 'var(--color-text)' }}>
                <strong style={{ display: 'block', marginBottom: 2 }}>Account registered for {user?.email || email}</strong>
                <span style={{ color: 'var(--color-text-secondary)' }}>
                  You are in the workspace setup flow. You can adjust your full name below or continue with onboarding.
                </span>
              </div>
            </div>
          )}

          {formError && (
            <div className="auth-error-banner" role="alert">
              <AlertCircle size={15} color="var(--color-danger)" style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                <div style={{ fontWeight: 600, marginBottom: 1 }}>
                  {hasExistingAccount ? 'Update Failed' : 'Account Creation Failed'}
                </div>
                <div>{formError}</div>
              </div>
            </div>
          )}

          <form onSubmit={hasExistingAccount ? handleContinueToOnboarding : handleSubmit} noValidate>
            {/* Full name */}
            <div className="auth-form-group">
              <label htmlFor="signup-name" className="auth-label">Full name</label>
              <input
                id="signup-name"
                ref={nameRef}
                type="text"
                autoComplete="name"
                value={name}
                onChange={e => { setName(e.target.value); setFieldErrors(p => ({ ...p, name: '' })); }}
                placeholder="Jane Smith"
                disabled={isProcessing}
                className={`auth-input ${fieldErrors.name ? 'has-error' : ''}`}
              />
              {fieldErrors.name && (
                <div className="auth-field-error">
                  <AlertCircle size={11} /> {fieldErrors.name}
                </div>
              )}
            </div>

            {/* Email */}
            <div className="auth-form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label htmlFor="signup-email" className="auth-label">Work email</label>
                {hasExistingAccount && (
                  <span style={{ fontSize: 11, color: 'var(--auth-text-muted)' }}>Registered</span>
                )}
              </div>
              <input
                id="signup-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={hasExistingAccount ? undefined : e => { setEmail(e.target.value); setFieldErrors(p => ({ ...p, email: '' })); }}
                placeholder="name@enterprise.com"
                disabled={isProcessing || hasExistingAccount}
                readOnly={hasExistingAccount}
                className={`auth-input ${fieldErrors.email ? 'has-error' : ''}`}
                style={hasExistingAccount ? { backgroundColor: 'var(--auth-surface-secondary)', opacity: 0.9, cursor: 'not-allowed' } : undefined}
              />
              {fieldErrors.email && (
                <div className="auth-field-error">
                  <AlertCircle size={11} /> {fieldErrors.email}
                </div>
              )}
            </div>

            {/* Password section */}
            {hasExistingAccount ? (
              <div style={{
                padding: '6px 0',
                marginBottom: 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Shield size={14} color="var(--color-success)" />
                  <span style={{ fontSize: 12, color: 'var(--auth-text-secondary)', fontWeight: 500 }}>
                    Password established and encrypted
                  </span>
                </div>
                <span style={{ fontSize: 11, color: 'var(--color-success)', fontWeight: 600 }}>Secured</span>
              </div>
            ) : (
              <>
                {/* Password */}
                <div className="auth-form-group">
                  <label htmlFor="signup-password" className="auth-label">Password</label>
                  <div className="auth-input-wrapper">
                    <input
                      id="signup-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={password}
                      onChange={e => { setPassword(e.target.value); setFieldErrors(p => ({ ...p, password: '' })); }}
                      placeholder="Create password (8+ chars)"
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
                  <PasswordStrength password={password} />
                </div>

                {/* Confirm password */}
                <div className="auth-form-group" style={{ marginBottom: 16 }}>
                  <label htmlFor="signup-confirm" className="auth-label">Confirm password</label>
                  <div className="auth-input-wrapper">
                    <input
                      id="signup-confirm"
                      type={showConfirm ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={e => { setConfirmPassword(e.target.value); setFieldErrors(p => ({ ...p, confirmPassword: '' })); }}
                      placeholder="Confirm password"
                      disabled={isProcessing}
                      className={`auth-input ${fieldErrors.confirmPassword ? 'has-error' : ''}`}
                      style={{ paddingRight: 40 }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm(s => !s)}
                      aria-label={showConfirm ? 'Hide password' : 'Show password'}
                      className="auth-eye-btn"
                    >
                      {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  {fieldErrors.confirmPassword && (
                    <div className="auth-field-error">
                      <AlertCircle size={11} /> {fieldErrors.confirmPassword}
                    </div>
                  )}
                  {confirmPassword && confirmPassword === password && !fieldErrors.confirmPassword && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 4 }}>
                      <CheckCircle2 size={12} color="var(--color-success)" />
                      <span style={{ fontSize: 11, color: 'var(--color-success-text)' }}>Passwords match</span>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Action Button */}
            {hasExistingAccount ? (
              <button
                id="signup-continue-onboarding"
                type="submit"
                disabled={isProcessing}
                className="auth-btn-primary"
              >
                {isProcessing ? (
                  <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Updating profile…</>
                ) : (
                  <>Continue to Onboarding <ArrowRight size={14} /></>
                )}
              </button>
            ) : (
              <button
                id="signup-submit"
                type="submit"
                disabled={isProcessing}
                className="auth-btn-primary"
              >
                {isProcessing ? (
                  <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Creating account…</>
                ) : (
                  <>Create account <ArrowRight size={14} /></>
                )}
              </button>
            )}
          </form>

          {/* Additional Options */}
          {hasExistingAccount ? (
            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <button
                id="signup-start-over-btn"
                type="button"
                onClick={handleStartOver}
                disabled={isProcessing}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--auth-text-muted)',
                  fontSize: 12.5,
                  cursor: 'pointer',
                  textDecoration: 'underline'
                }}
              >
                Register a different account / Sign out
              </button>
            </div>
          ) : (
            <>
              {/* Divider */}
              <div className="auth-divider">
                <div className="auth-divider-line" />
                <span className="auth-divider-text">OR</span>
                <div className="auth-divider-line" />
              </div>

              {/* Google Sign-Up Button */}
              <div className="auth-google-wrapper">
                <GoogleSignInButton
                  text="signup_with"
                  onAuthSuccess={(u) => navigate(u?.onboardingCompleted ? (u?.role === 'PLATFORM_ADMIN' ? '/admin/users' : '/app') : '/onboarding', { replace: true })}
                />
              </div>

              {/* Link to Login */}
              <p className="auth-switch-text">
                Already registered?{' '}
                <Link to="/login" className="auth-link">
                  Sign in
                </Link>
              </p>
            </>
          )}
        </AnimatedCircularFrame>
      </main>

      {/* Footer */}
      <footer className="auth-footer">
        © 2026 Sentinel Govern. Institutional AI Governance & Lifecycle Platform.
      </footer>
    </div>
  );
}
