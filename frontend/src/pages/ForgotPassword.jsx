import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { forgotPassword } from '../services/api';
import ThemeToggle from '../components/ThemeToggle';
import AnimatedCircularFrame from '../components/AnimatedCircularFrame';
import { Shield, AlertCircle, CheckCircle2, ArrowLeft, Mail, Loader2 } from 'lucide-react';
import '../styles/AuthAnimated.css';

export default function ForgotPasswordPage() {
  const [email, setEmail]           = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState('');
  const [submitted, setSubmitted]   = useState(false);

  const emailRef = useRef(null);
  useEffect(() => { emailRef.current?.focus(); }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!email.trim() || !email.includes('@')) {
      setError('Enter a valid email address.');
      return;
    }
    setSubmitting(true);
    try {
      await forgotPassword(email.trim().toLowerCase());
      setSubmitted(true);
    } catch {
      // Always show neutral message even on server error (prevents enumeration)
      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page-wrapper">
      {/* Top Header */}
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

      {/* Main Centered Stage with Animated Circular Frame */}
      <main className="auth-main-stage">
        <AnimatedCircularFrame mode="login">
          {!submitted ? (
            <div>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 14px',
                color: 'var(--auth-accent-primary)'
              }}>
                <Mail size={24} />
              </div>

              <h1 className="auth-title">
                Reset password
              </h1>
              <p className="auth-subtitle">
                Enter your registered work email and we'll send you instructions to reset your password.
              </p>

              {error && (
                <div className="auth-error-banner" role="alert">
                  <AlertCircle size={15} color="var(--color-danger)" style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} noValidate>
                <div className="auth-form-group" style={{ marginBottom: 20 }}>
                  <label htmlFor="forgot-email" className="auth-label">Work email</label>
                  <input
                    id="forgot-email"
                    ref={emailRef}
                    type="email"
                    value={email}
                    onChange={e => { setEmail(e.target.value); setError(''); }}
                    placeholder="name@enterprise.com"
                    disabled={submitting}
                    className="auth-input"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="auth-btn-primary"
                >
                  {submitting ? (
                    <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Sending link…</>
                  ) : (
                    'Send reset instructions'
                  )}
                </button>
              </form>
            </div>
          ) : (
            <div>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 14px',
                color: 'var(--color-success)'
              }}>
                <CheckCircle2 size={26} />
              </div>

              <h2 className="auth-title" style={{ fontSize: 20 }}>
                Check your inbox
              </h2>
              <p className="auth-subtitle" style={{ lineHeight: 1.6, marginBottom: 24 }}>
                If an account exists for <strong style={{ color: 'var(--auth-text-primary)' }}>{email}</strong>, we've sent password reset instructions.
              </p>
            </div>
          )}

          <div style={{
            borderTop: '1px solid var(--auth-border-subtle)',
            marginTop: 22,
            paddingTop: 16,
            textAlign: 'center'
          }}>
            <Link to="/login" style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 13,
              fontWeight: 500,
              textDecoration: 'none'
            }} className="auth-link">
              <ArrowLeft size={14} /> Back to Sign In
            </Link>
          </div>
        </AnimatedCircularFrame>
      </main>

      {/* Footer info */}
      <footer className="auth-footer">
        © 2026 Sentinel Govern. Institutional AI Governance & Lifecycle Platform.
      </footer>
    </div>
  );
}
