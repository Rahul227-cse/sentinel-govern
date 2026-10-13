import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { forgotPassword } from '../services/api';
import ThemeToggle from '../components/ThemeToggle';
import { Shield, AlertCircle, CheckCircle2, ArrowLeft, Mail, Loader2 } from 'lucide-react';

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
          <div style={{
            width: 28,
            height: 28,
            borderRadius: 'var(--radius-sm)',
            backgroundColor: 'var(--color-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ffffff'
          }}>
            <Shield size={15} strokeWidth={2.4} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--color-text)' }}>SENTINEL GOVERN</span>
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
          {!submitted ? (
            <div>
              <div style={{
                width: 40,
                height: 40,
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--color-accent-subtle)',
                border: '1px solid var(--color-accent-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 18,
                color: 'var(--color-primary)'
              }}>
                <Mail size={18} />
              </div>

              <h1 style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--color-text)', marginBottom: 6 }}>
                Reset password
              </h1>
              <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.5, marginBottom: 22 }}>
                Enter your registered work email and we'll send you instructions to reset your password.
              </p>

              {error && (
                <div style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'center',
                  backgroundColor: 'var(--color-danger-bg)',
                  border: '1px solid var(--color-danger-border)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '10px 12px',
                  marginBottom: 16
                }}>
                  <AlertCircle size={14} color="var(--color-danger)" style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: 'var(--color-danger-text)' }}>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} noValidate>
                <div className="form-group" style={{ marginBottom: 18 }}>
                  <label htmlFor="forgot-email" className="form-label">Work email</label>
                  <input
                    id="forgot-email"
                    ref={emailRef}
                    type="email"
                    value={email}
                    onChange={e => { setEmail(e.target.value); setError(''); }}
                    placeholder="name@enterprise.com"
                    disabled={submitting}
                    className="form-input"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="btn btn-primary"
                  style={{ width: '100%', padding: '10px 0', fontSize: 13 }}
                >
                  {submitting ? (
                    <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Sending link…</>
                  ) : (
                    'Send reset instructions'
                  )}
                </button>
              </form>
            </div>
          ) : (
            <div>
              <div style={{
                width: 40,
                height: 40,
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--color-success-bg)',
                border: '1px solid var(--color-success-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 18,
                color: 'var(--color-success)'
              }}>
                <CheckCircle2 size={20} />
              </div>

              <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text)', marginBottom: 8 }}>
                Check your inbox
              </h2>
              <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.6, marginBottom: 20 }}>
                If an account exists for <strong style={{ color: 'var(--color-text)' }}>{email}</strong>, we've sent password reset instructions.
              </p>
            </div>
          )}

          <div style={{ borderTop: '1px solid var(--color-border-subtle)', marginTop: 22, paddingTop: 16, textAlign: 'center' }}>
            <Link to="/login" style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12.5,
              fontWeight: 500,
              color: 'var(--color-text-secondary)',
              textDecoration: 'none'
            }}>
              <ArrowLeft size={13} /> Back to Sign In
            </Link>
          </div>
        </div>
      </div>

      <div style={{ textAlign: 'center', fontSize: 11.5, color: 'var(--color-text-muted)' }}>
        © 2026 Sentinel Govern. AI Governance & Lifecycle Platform.
      </div>
    </div>
  );
}
