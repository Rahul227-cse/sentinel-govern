import React, { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { resetPassword } from '../services/api';
import ThemeToggle from '../components/ThemeToggle';
import AnimatedCircularFrame from '../components/AnimatedCircularFrame';
import { Shield, Eye, EyeOff, AlertCircle, CheckCircle2, ArrowLeft, Loader2 } from 'lucide-react';
import '../styles/AuthAnimated.css';

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
    </div>
  );
}

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword]               = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword]       = useState(false);
  const [showConfirm, setShowConfirm]         = useState(false);
  const [submitting, setSubmitting]           = useState(false);
  const [error, setError]                     = useState('');
  const [fieldErrors, setFieldErrors]         = useState({});
  const [success, setSuccess]                 = useState(false);

  const passwordRef = useRef(null);
  useEffect(() => { passwordRef.current?.focus(); }, []);

  // No token = invalid link
  if (!token) {
    return (
      <div className="auth-page-wrapper">
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

        <main className="auth-main-stage">
          <AnimatedCircularFrame mode="login">
            <div style={{ textAlign: 'center', padding: '12px 0' }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 14px',
                color: 'var(--color-danger)'
              }}>
                <AlertCircle size={28} />
              </div>
              <h1 className="auth-title" style={{ fontSize: 20 }}>
                Invalid reset link
              </h1>
              <p className="auth-subtitle" style={{ marginBottom: 24 }}>
                This password reset link is missing or invalid. Please request a new one.
              </p>
              <Link to="/forgot-password" className="auth-btn-primary" style={{ textDecoration: 'none', display: 'inline-flex' }}>
                Request new link
              </Link>
            </div>
          </AnimatedCircularFrame>
        </main>

        <footer className="auth-footer">
          © 2026 Sentinel Govern. AI Governance & Lifecycle Platform.
        </footer>
      </div>
    );
  }

  function validate() {
    const errors = {};
    if (!password) errors.password = 'New password is required.';
    else if (password.length < 8) errors.password = 'Password must be at least 8 characters.';
    else if (!/[A-Z]/.test(password)) errors.password = 'Password must include an uppercase letter.';
    else if (!/[0-9]/.test(password)) errors.password = 'Password must include a number.';
    if (password && confirmPassword !== password) errors.confirmPassword = 'Passwords do not match.';
    return errors;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    const errors = validate();
    if (Object.keys(errors).length) { setFieldErrors(errors); return; }
    setFieldErrors({});
    setSubmitting(true);
    try {
      await resetPassword(token, password);
      setSuccess(true);
    } catch (err) {
      const msg = err.data?.error || err.message || '';
      if (/invalid|expired/i.test(msg)) {
        setError('This reset link is invalid or has expired. Please request a new one.');
      } else if (/password/i.test(msg)) {
        setFieldErrors({ password: msg });
      } else {
        setError(msg || 'Password reset failed. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page-wrapper">
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

      <main className="auth-main-stage">
        <AnimatedCircularFrame mode="login">
          {!success ? (
            <div>
              <h1 className="auth-title">
                Set new password
              </h1>
              <p className="auth-subtitle">
                Enter your new password below. All existing sessions will be invalidated for security.
              </p>

              {error && (
                <div className="auth-error-banner" role="alert">
                  <AlertCircle size={15} color="var(--color-danger)" style={{ flexShrink: 0, marginTop: 1 }} />
                  <div>
                    <div>{error}</div>
                    {/expired|invalid/i.test(error) && (
                      <Link to="/forgot-password" className="auth-link" style={{ marginTop: 4, display: 'inline-block', fontSize: 12 }}>
                        Request a new link →
                      </Link>
                    )}
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit} noValidate>
                <div className="auth-form-group">
                  <label htmlFor="reset-password" className="auth-label">New password</label>
                  <div className="auth-input-wrapper">
                    <input
                      id="reset-password"
                      ref={passwordRef}
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={password}
                      onChange={e => { setPassword(e.target.value); setFieldErrors(p => ({ ...p, password: '' })); }}
                      placeholder="Enter new password"
                      disabled={submitting}
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

                <div className="auth-form-group" style={{ marginBottom: 20 }}>
                  <label htmlFor="reset-confirm" className="auth-label">Confirm password</label>
                  <div className="auth-input-wrapper">
                    <input
                      id="reset-confirm"
                      type={showConfirm ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={e => { setConfirmPassword(e.target.value); setFieldErrors(p => ({ ...p, confirmPassword: '' })); }}
                      placeholder="Confirm password"
                      disabled={submitting}
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
                      <span style={{ fontSize: 11.5, color: 'var(--color-success-text)' }}>Passwords match</span>
                    </div>
                  )}
                </div>

                <button
                  id="reset-submit"
                  type="submit"
                  disabled={submitting}
                  className="auth-btn-primary"
                >
                  {submitting ? (
                    <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Updating password…</>
                  ) : (
                    'Reset Password'
                  )}
                </button>
              </form>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '10px 0' }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 14px',
                color: 'var(--color-success)'
              }}>
                <CheckCircle2 size={28} />
              </div>
              <h2 className="auth-title" style={{ fontSize: 20 }}>
                Password updated
              </h2>
              <p className="auth-subtitle" style={{ lineHeight: 1.6, marginBottom: 24 }}>
                Your password has been changed successfully. You can now sign in with your new credentials.
              </p>
              <Link to="/login" className="auth-btn-primary" style={{ textDecoration: 'none', display: 'inline-flex' }}>
                Sign In
              </Link>
            </div>
          )}

          {!success && (
            <div style={{
              borderTop: '1px solid var(--auth-border-subtle)',
              marginTop: 22,
              paddingTop: 16,
              textAlign: 'center'
            }}>
              <Link to="/login" className="auth-link" style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 13,
                textDecoration: 'none'
              }}>
                <ArrowLeft size={14} /> Back to Sign In
              </Link>
            </div>
          )}
        </AnimatedCircularFrame>
      </main>

      <footer className="auth-footer">
        © 2026 Sentinel Govern. AI Governance & Lifecycle Platform.
      </footer>
    </div>
  );
}
