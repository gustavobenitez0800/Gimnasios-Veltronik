// ============================================
// VELTRONIK V2 - RESET PASSWORD PAGE
// ============================================

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../contexts/ToastContext';
import supabase from '../lib/supabase';
import { getSession, getSupabaseErrorMessage } from '../lib/supabase';
import CONFIG from '../lib/config';

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  // Check for recovery token in hash
  useEffect(() => {
    const checkRecovery = async () => {
      const hash = window.location.hash;

      // Supabase recovery link includes access_token in the hash
      if (hash && hash.includes('access_token')) {
        try {
          const params = new URLSearchParams(hash.split('#')[1] || '');
          const accessToken = params.get('access_token');
          const refreshToken = params.get('refresh_token');
          const type = params.get('type');

          if (type === 'recovery' && accessToken) {
            await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            // Clear the hash
            window.history.replaceState(null, '', window.location.pathname + '#/reset-password');
            setSessionReady(true);
            return;
          }
        } catch (error) {
          console.error('Recovery token error:', error);
        }
      }

      // Check for existing session
      const session = await getSession();
      if (!session) {
        showToast('El enlace ha expirado. Solicitá uno nuevo.', 'error');
        setTimeout(() => navigate(CONFIG.ROUTES.LOGIN), 2000);
      } else {
        setSessionReady(true);
      }
    };

    checkRecovery();
  }, [navigate, showToast]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (password !== confirmPassword) { showToast('Las contraseñas no coinciden', 'error'); return; }
    if (password.length < 6) { showToast('La contraseña debe tener al menos 6 caracteres', 'error'); return; }

    setSubmitting(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      showToast('¡Contraseña actualizada! Redirigiendo...', 'success');
      setTimeout(() => navigate(CONFIG.ROUTES.LOGIN), 2000);
    } catch (error) {
      showToast('Error al cambiar contraseña: ' + getSupabaseErrorMessage(error), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (!sessionReady) {
    return (
      <div className="auth-wrapper">
        <div className="auth-container">
          <div className="auth-card" style={{ textAlign: 'center' }}>
            <span className="spinner" style={{ width: 32, height: 32 }} />
            <p style={{ marginTop: '1rem', color: 'var(--text-muted)' }}>Verificando enlace...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-wrapper">
      <div className="auth-container">
        <div className="auth-card">
          <div className="auth-logo">
            <img src="/assets/LogoPrincipalVeltronik.png" alt="Veltronik" className="auth-logo-img" />
            <h1 className="auth-logo-text">Veltronik</h1>
          </div>

          <h2 className="auth-title">Restablecer Contraseña</h2>
          <p className="auth-subtitle">Ingresá tu nueva contraseña</p>

          <form className="auth-form" onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Nueva Contraseña</label>
              <div className="password-wrapper">
                <input type={showPassword ? 'text' : 'password'} className="form-input"
                  placeholder="Mínimo 6 caracteres" value={password}
                  onChange={e => setPassword(e.target.value)} required minLength={6} autoComplete="new-password" />
                <button type="button" className="password-toggle"
                  onClick={() => setShowPassword(!showPassword)}>
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Confirmar Contraseña</label>
              <div className="password-wrapper">
                <input type={showPassword ? 'text' : 'password'} className="form-input"
                  placeholder="Repetí tu contraseña" value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)} required minLength={6} autoComplete="new-password" />
              </div>
            </div>

            <button type="submit" className="auth-submit" disabled={submitting}>
              {submitting ? <><span className="spinner" /> Cambiando...</> : 'Cambiar Contraseña'}
            </button>
          </form>

          <p className="auth-links">
            <a href="#/login">Volver al inicio de sesión</a>
          </p>
        </div>
      </div>
    </div>
  );
}
