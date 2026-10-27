import React, { useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { Loader2, AlertCircle } from 'lucide-react';

/**
 * GoogleSignInButton
 *
 * Official Google Identity Services (GIS) button.
 * Renders a high-contrast, authentic white/light-neutral button with the official
 * multicolored Google 'G' logo and dark readable text in BOTH Dark and Light modes.
 */
export default function GoogleSignInButton({
  onAuthSuccess,
  text = 'signin_with',
  width = 320
}) {
  const { loginWithGoogle, loading, error, clearError } = useAuth();
  const { theme } = useTheme();
  const buttonRef = useRef(null);

  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  const handleCredentialResponse = useCallback(async (response) => {
    if (response?.credential) {
      const res = await loginWithGoogle(response.credential);
      if (res.success && onAuthSuccess) {
        onAuthSuccess(res.user);
      }
    }
  }, [loginWithGoogle, onAuthSuccess]);

  useEffect(() => {
    if (!clientId) {
      console.warn('[GIS] VITE_GOOGLE_CLIENT_ID is not configured in frontend environment.');
      return;
    }

    let checkInterval = null;

    function initGis() {
      if (window.google?.accounts?.id && buttonRef.current) {
        try {
          window.google.accounts.id.initialize({
            client_id: clientId,
            callback: handleCredentialResponse,
            auto_select: false,
            cancel_on_tap_outside: true
          });

          // Clear previous render to ensure clean re-theme
          buttonRef.current.innerHTML = '';

          // Render official Google button:
          // 'outline' theme ensures a crisp white surface with dark readable text
          // and the original multicolored Google 'G' icon across all themes.
          window.google.accounts.id.renderButton(buttonRef.current, {
            theme: 'outline',
            size: 'large',
            shape: 'rectangular',
            text: text, // 'signin_with' or 'signup_with'
            logo_alignment: 'left',
            width: width
          });
        } catch (err) {
          console.warn('[GIS Init Warning]', err);
        }
      }
    }

    if (window.google?.accounts?.id) {
      initGis();
    } else {
      checkInterval = setInterval(() => {
        if (window.google?.accounts?.id) {
          clearInterval(checkInterval);
          initGis();
        }
      }, 250);
    }

    return () => {
      if (checkInterval) clearInterval(checkInterval);
    };
  }, [clientId, handleCredentialResponse, theme, text, width]);

  if (!clientId) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '9px 14px',
        fontSize: '12px',
        color: 'var(--color-danger-text)',
        backgroundColor: 'var(--color-danger-bg)',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--color-danger-border)',
        maxWidth: '320px'
      }}>
        <AlertCircle size={15} style={{ flexShrink: 0 }} />
        <span>VITE_GOOGLE_CLIENT_ID is not configured.</span>
      </div>
    );
  }

  return (
    <div style={{
      display: 'inline-flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '6px',
      width: '100%',
      maxWidth: `${width}px`
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        width: '100%'
      }}>
        {/* Container for official Google Identity Services button */}
        <div
          ref={buttonRef}
          style={{
            minHeight: '40px',
            minWidth: `${Math.min(width, 240)}px`,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center'
          }}
        />

        {loading && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '12px',
            color: 'var(--auth-text-muted)'
          }}>
            <Loader2 size={16} className="spin-animation" />
            <span>Verifying...</span>
          </div>
        )}
      </div>

      {error && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          fontSize: '11.5px',
          color: 'var(--color-danger-text)',
          marginTop: '4px',
          backgroundColor: 'var(--color-danger-bg)',
          border: '1px solid var(--color-danger-border)',
          padding: '6px 10px',
          borderRadius: '6px',
          width: '100%'
        }}>
          <AlertCircle size={13} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1 }}>{error}</span>
          <button
            type="button"
            onClick={clearError}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--color-danger-text)',
              cursor: 'pointer',
              padding: '0 4px',
              fontSize: '14px',
              lineHeight: 1
            }}
            aria-label="Dismiss error"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
