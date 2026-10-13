import React, { useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { Loader2, AlertCircle } from 'lucide-react';

export default function GoogleSignInButton({ onAuthSuccess }) {
  const { loginWithGoogle, loading, error, clearError } = useAuth();
  const buttonRef = useRef(null);

  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  const handleCredentialResponse = async (response) => {
    if (response?.credential) {
      const res = await loginWithGoogle(response.credential);
      if (res.success && onAuthSuccess) {
        onAuthSuccess(res.user);
      }
    }
  };

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

          // Render official Google button into container
          window.google.accounts.id.renderButton(buttonRef.current, {
            theme: 'filled_blue',
            size: 'large',
            shape: 'rectangular',
            text: 'signin_with',
            logo_alignment: 'left',
            width: 320
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
      }, 300);
    }

    return () => {
      if (checkInterval) clearInterval(checkInterval);
    };
  }, [clientId]);

  if (!clientId) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', fontSize: '12px', color: '#DC2626', backgroundColor: '#FEF2F2', borderRadius: '8px', border: '1px solid #FECACA' }}>
        <AlertCircle size={14} />
        <span>VITE_GOOGLE_CLIENT_ID is not configured.</span>
      </div>
    );
  }

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {/* Container for official Google Identity Services button */}
        <div ref={buttonRef} style={{ minHeight: '38px', minWidth: '180px' }} />

        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-muted)' }}>
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
          fontSize: '11px', 
          color: 'var(--danger)', 
          marginTop: '4px',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          padding: '4px 8px',
          borderRadius: '4px'
        }}>
          <AlertCircle size={12} />
          <span>{error}</span>
          <button 
            onClick={clearError} 
            style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: '0 2px' }}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
