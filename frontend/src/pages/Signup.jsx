import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import GoogleSignInButton from '../components/GoogleSignInButton';
import ThemeToggle from '../components/ThemeToggle';
import { formatRoleLabel } from '../utils/formatters';
import { Shield, Eye, EyeOff, AlertCircle, CheckCircle2, ArrowRight, Loader2 } from 'lucide-react';

// ─── Password Strength Indicator ─────────────────────────────────────────────

function PasswordStrength({ password }) {
  if (!password) return null;

  const checks = [
    { label: 'At least 8 characters',    ok: password.length >= 8 },
    { label: 'Uppercase letter',          ok: /[A-Z]/.test(password) },
    { label: 'Lowercase letter',          ok: /[a-z]/.test(password) },
    { label: 'Number',                    ok: /[0-9]/.test(password) },
  ];
  const passed = checks.filter(c => c.ok).length;
  const colors = ['var(--color-danger)', 'var(--color-warning)', 'var(--color-warning)', 'var(--color-success)', 'var(--color-success)'];
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong'];

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
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
      {passed > 0 && (
        <div style={{ fontSize: 11, color: colors[passed], fontWeight: 600, marginBottom: 6 }}>{labels[passed]}</div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 12px' }}>
        {checks.map(c => (
          <div key={c.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{
              width: 5,
              height: 5,
              borderRadius: '50%',
              backgroundColor: c.ok ? 'var(--color-success)' : 'var(--color-border-strong)',
              flexShrink: 0
            }} />
            <span style={{ fontSize: 11, color: c.ok ? 'var(--color-success-text)' : 'var(--color-text-muted)' }}>{c.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Left Panel ───────────────────────────────────────────────────────────────

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
        minHeight: '100vh'
      }}
    >
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
            Workspace Registration
          </div>
          <p style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-text)', lineHeight: 1.3, letterSpacing: '-0.02em', marginBottom: 10 }}>
            Establish governance accountability for enterprise AI.
          </p>
          <p style={{ fontSize: 13.5, color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
            Configure your organizational unit, select your governance persona, and participate in multi-stakeholder model sign-offs.
          </p>
        </div>

        {/* Governance roles */}
        <div style={{
          backgroundColor: 'var(--color-surface-secondary)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          padding: '18px 16px'
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 12 }}>
            Separation of Duty Roles
          </div>
          {[
            { role: 'ML_LEAD',             desc: 'Model registry, evals & promotion' },
            { role: 'GOVERNANCE_OFFICER',  desc: 'Fairness, policy review & compliance' },
            { role: 'EXECUTIVE_APPROVER',  desc: 'Business-risk acceptance & executive sign-off' },
            { role: 'PLATFORM_ADMIN',      desc: 'System administration & user access' },
          ].map(({ role, desc }) => (
            <div key={role} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--color-border-subtle)' }}>
              <span style={{
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--color-primary)',
                backgroundColor: 'var(--color-accent-subtle)',
                padding: '2px 7px',
                borderRadius: 'var(--radius-xs)',
                border: '1px solid var(--color-accent-border)'
              }}>
                {formatRoleLabel(role)}
              </span>
              <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{desc}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>
        Institutional AI governance adhering to NIST AI RMF and EU AI Act Annex III standards.
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SignupPage() {
  const { user, isAuthenticated, loading: authLoading, signup, error: authError, clearError } = useAuth();
  const navigate = useNavigate();

  const [name, setName]                       = useState('');
  const [email, setEmail]                     = useState('');
  const [password, setPassword]               = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword]       = useState(false);
  const [showConfirm, setShowConfirm]         = useState(false);
  const [submitting, setSubmitting]           = useState(false);
  const [formError, setFormError]             = useState('');
  const [fieldErrors, setFieldErrors]         = useState({});

  const nameRef = useRef(null);

  useEffect(() => { nameRef.current?.focus(); }, []);

  useEffect(() => {
    if (!authLoading && isAuthenticated && user) {
      if (!user.onboardingCompleted) {
        navigate('/onboarding', { replace: true });
      } else {
        navigate(user.role === 'PLATFORM_ADMIN' ? '/admin/users' : '/app', { replace: true });
      }
    }
  }, [authLoading, isAuthenticated, user, navigate]);

  useEffect(() => {
    if (authError) { setFormError(authError); clearError(); }
  }, [authError]);

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
        navigate('/onboarding', { replace: true });
      } else {
        setFormError(res.error || 'Signup failed. Please try again.');
      }
    } catch (err) {
      setFormError(err.message || 'Something went wrong.');
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

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '24px 28px' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <ThemeToggle />
        </div>

        <div style={{ width: '100%', maxWidth: 420, margin: '0 auto', padding: '16px 0' }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.025em', color: 'var(--color-text)', marginBottom: 6 }}>
            Create your account
          </h1>
          <p style={{ fontSize: 13.5, color: 'var(--color-text-secondary)', marginBottom: 24 }}>
            Join your organization's workspace and configure your role.
          </p>

          {formError && (
            <div style={{
              display: 'flex',
              gap: 10,
              alignItems: 'flex-start',
              backgroundColor: 'var(--color-danger-bg)',
              border: '1px solid var(--color-danger-border)',
              borderRadius: 'var(--radius-sm)',
              padding: '12px 14px',
              marginBottom: 18
            }} role="alert">
              <AlertCircle size={15} color="var(--color-danger)" style={{ flexShrink: 0, marginTop: 1 }} />
              <div style={{ fontSize: 12.5, color: 'var(--color-danger-text)' }}>{formError}</div>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            {/* Full name */}
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label htmlFor="signup-name" className="form-label">Full name</label>
              <input
                id="signup-name" ref={nameRef} type="text" autoComplete="name"
                value={name} onChange={e => { setName(e.target.value); setFieldErrors(p => ({ ...p, name: '' })); }}
                placeholder="Jane Smith" disabled={isProcessing}
                className="form-input"
                style={{ borderColor: fieldErrors.name ? 'var(--color-danger)' : undefined }}
              />
              {fieldErrors.name && <div style={{ fontSize: 11.5, color: 'var(--color-danger)', marginTop: 2 }}>{fieldErrors.name}</div>}
            </div>

            {/* Email */}
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label htmlFor="signup-email" className="form-label">Work email</label>
              <input
                id="signup-email" type="email" autoComplete="email"
                value={email} onChange={e => { setEmail(e.target.value); setFieldErrors(p => ({ ...p, email: '' })); }}
                placeholder="name@enterprise.com" disabled={isProcessing}
                className="form-input"
                style={{ borderColor: fieldErrors.email ? 'var(--color-danger)' : undefined }}
              />
              {fieldErrors.email && <div style={{ fontSize: 11.5, color: 'var(--color-danger)', marginTop: 2 }}>{fieldErrors.email}</div>}
            </div>

            {/* Password */}
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label htmlFor="signup-password" className="form-label">Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  id="signup-password" type={showPassword ? 'text' : 'password'} autoComplete="new-password"
                  value={password} onChange={e => { setPassword(e.target.value); setFieldErrors(p => ({ ...p, password: '' })); }}
                  placeholder="Create password (8+ chars)" disabled={isProcessing}
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

            {/* Confirm password */}
            <div className="form-group" style={{ marginBottom: 18 }}>
              <label htmlFor="signup-confirm" className="form-label">Confirm password</label>
              <div style={{ position: 'relative' }}>
                <input
                  id="signup-confirm" type={showConfirm ? 'text' : 'password'} autoComplete="new-password"
                  value={confirmPassword} onChange={e => { setConfirmPassword(e.target.value); setFieldErrors(p => ({ ...p, confirmPassword: '' })); }}
                  placeholder="Confirm password" disabled={isProcessing}
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
              id="signup-submit"
              type="submit"
              disabled={isProcessing}
              className="btn btn-primary"
              style={{ width: '100%', padding: '10px 0', fontSize: 13.5 }}
            >
              {isProcessing ? (
                <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Creating account…</>
              ) : (
                <>Create account <ArrowRight size={14} /></>
              )}
            </button>
          </form>

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0' }}>
            <div style={{ flex: 1, height: 1, backgroundColor: 'var(--color-border)' }} />
            <span style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 600, letterSpacing: '0.04em' }}>OR</span>
            <div style={{ flex: 1, height: 1, backgroundColor: 'var(--color-border)' }} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
            <GoogleSignInButton onAuthSuccess={(u) => navigate(u?.onboardingCompleted ? (u?.role === 'PLATFORM_ADMIN' ? '/admin/users' : '/app') : '/onboarding', { replace: true })} />
          </div>

          <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--color-text-secondary)' }}>
            Already registered?{' '}
            <Link to="/login" style={{ color: 'var(--color-primary)', textDecoration: 'none', fontWeight: 600 }}>
              Sign in
            </Link>
          </p>
        </div>

        <div style={{ textAlign: 'center', fontSize: 11.5, color: 'var(--color-text-muted)' }}>
          © 2026 Sentinel Govern. AI Governance & Lifecycle Platform.
        </div>
      </div>
    </div>
  );
}
