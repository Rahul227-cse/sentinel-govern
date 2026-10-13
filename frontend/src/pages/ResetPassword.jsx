import React, { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { resetPassword } from '../services/api';
import ThemeToggle from '../components/ThemeToggle';
import { Shield, Eye, EyeOff, AlertCircle, CheckCircle2, ArrowLeft, Loader2 } from 'lucide-react';

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
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
        {[0, 1, 2, 3].map(i => (
          <div
            key={i}
            style={{
              flex: 1,
              height: 3,
              borderRadius: 2,
              backgroundColor: i < passed ? colors[passed] : 'var(--color-border)',
              transition: 'background 200ms'
            }}
          />
        ))}
      </div>
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
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        backgroundColor: 'var(--color-bg)',
        color: 'var(--color-text)',
        padding: '24px 28px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
            <div style={{ width: 28, height: 28, borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
              <Shield size={15} strokeWidth={2.4} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text)' }}>SENTINEL GOVERN</span>
          </Link>
          <ThemeToggle />
        </div>

        <div style={{ maxWidth: 400, margin: '0 auto', textAlign: 'center', backgroundColor: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', padding: '36px 28px' }}>
          <div style={{ width: 44, height: 44, borderRadius: '50%', backgroundColor: 'var(--color-danger-bg)', border: '1px solid var(--color-danger-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <AlertCircle size={22} color="var(--color-danger)" />
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text)', marginBottom: 8 }}>Invalid reset link</h2>
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.6, marginBottom: 22 }}>
            This password reset link is missing or invalid. Please request a new one.
          </p>
          <Link to="/forgot-password" className="btn btn-primary" style={{ padding: '8px 18px', fontSize: 13 }}>
            Request new link
          </Link>
        </div>

        <div style={{ textAlign: 'center', fontSize: 11.5, color: 'var(--color-text-muted)' }}>
          © 2026 Sentinel Govern. AI Governance & Lifecycle Platform.
        </div>
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
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      backgroundColor: 'var(--color-bg)',
      color: 'var(--color-text)',
      padding: '24px 28px'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
          <div style={{ width: 28, height: 28, borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
            <Shield size={15} strokeWidth={2.4} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text)' }}>SENTINEL GOVERN</span>
        </Link>
        <ThemeToggle />
      </div>

      <div style={{ width: '100%', maxWidth: 400, margin: '0 auto', padding: '24px 0' }}>
        <div style={{
          backgroundColor: 'var(--color-surface)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--color-border)',
          padding: '32px 28px',
          boxShadow: 'var(--shadow-sm)'
        }}>
          {!success ? (
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-text)', letterSpacing: '-0.02em', marginBottom: 6 }}>
                Set new password
              </h1>
              <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.5, marginBottom: 22 }}>
                Enter your new password below. All existing sessions will be invalidated for security.
              </p>

              {error && (
                <div style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'flex-start',
                  backgroundColor: 'var(--color-danger-bg)',
                  border: '1px solid var(--color-danger-border)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '10px 12px',
                  marginBottom: 16
                }}>
                  <AlertCircle size={14} color="var(--color-danger)" style={{ flexShrink: 0, marginTop: 1 }} />
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--color-danger-text)' }}>{error}</div>
                    {/expired|invalid/i.test(error) && (
                      <Link to="/forgot-password" style={{ fontSize: 12, color: 'var(--color-primary)', fontWeight: 600, textDecoration: 'none' }}>
                        Request a new link →
                      </Link>
                    )}
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit} noValidate>
                <div className="form-group" style={{ marginBottom: 12 }}>
                  <label htmlFor="reset-password" className="form-label">New password</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      id="reset-password"
                      ref={passwordRef}
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={password}
                      onChange={e => { setPassword(e.target.value); setFieldErrors(p => ({ ...p, password: '' })); }}
                      placeholder="Enter new password"
                      disabled={submitting}
                      className="form-input"
                      style={{ width: '100%', paddingRight: 40, borderColor: fieldErrors.password ? 'var(--color-danger)' : undefined }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(s => !s)}
                      aria-label={showPassword ? 'Hide' : 'Show'}
                      style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', display: 'flex', padding: 4 }}
                    >
                      {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  {fieldErrors.password && <div style={{ fontSize: 11.5, color: 'var(--color-danger)', marginTop: 2 }}>{fieldErrors.password}</div>}
                  <PasswordStrength password={password} />
                </div>

                <div className="form-group" style={{ marginBottom: 20 }}>
                  <label htmlFor="reset-confirm" className="form-label">Confirm password</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      id="reset-confirm"
                      type={showConfirm ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={e => { setConfirmPassword(e.target.value); setFieldErrors(p => ({ ...p, confirmPassword: '' })); }}
                      placeholder="Confirm password"
                      disabled={submitting}
                      className="form-input"
                      style={{ width: '100%', paddingRight: 40, borderColor: fieldErrors.confirmPassword ? 'var(--color-danger)' : undefined }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm(s => !s)}
                      aria-label={showConfirm ? 'Hide' : 'Show'}
                      style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', display: 'flex', padding: 4 }}
                    >
                      {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  {fieldErrors.confirmPassword && <div style={{ fontSize: 11.5, color: 'var(--color-danger)', marginTop: 2 }}>{fieldErrors.confirmPassword}</div>}
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
                  className="btn btn-primary"
                  style={{ width: '100%', padding: '10px 0', fontSize: 13 }}
                >
                  {submitting ? (
                    <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Updating password…</>
                  ) : (
                    'Reset Password'
                  )}
                </button>
              </form>
            </div>
          ) : (
            <div style={{ textAlign: 'center' }}>
              <div style={{
                width: 44,
                height: 44,
                borderRadius: '50%',
                backgroundColor: 'var(--color-success-bg)',
                border: '1px solid var(--color-success-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
                color: 'var(--color-success)'
              }}>
                <CheckCircle2 size={22} />
              </div>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text)', marginBottom: 8 }}>Password updated</h2>
              <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.6, marginBottom: 22 }}>
                Your password has been changed successfully. You can now sign in with your new credentials.
              </p>
              <Link to="/login" className="btn btn-primary" style={{ padding: '8px 20px', fontSize: 13 }}>
                Sign In
              </Link>
            </div>
          )}
        </div>

        {!success && (
          <div style={{ textAlign: 'center', marginTop: 18 }}>
            <Link to="/login" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--color-text-secondary)', textDecoration: 'none' }}>
              <ArrowLeft size={13} /> Back to Sign In
            </Link>
          </div>
        )}
      </div>

      <div style={{ textAlign: 'center', fontSize: 11.5, color: 'var(--color-text-muted)' }}>
        © 2026 Sentinel Govern. AI Governance & Lifecycle Platform.
      </div>
    </div>
  );
}
