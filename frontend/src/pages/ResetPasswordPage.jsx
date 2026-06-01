// ============================================
// VELTRONIK V2 - RESET PASSWORD PAGE
// ============================================

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../contexts/ToastContext';
import { authService, errorService } from '../services';
import CONFIG from '../lib/config';
import logoSrc from '../assets/LogoPrincipalVeltronik.png';
import Icon from '../components/Icon';

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  // Al llegar desde el link del email, Supabase crea una sesión de recuperación.
  // Esperamos a que exista esa sesión (evento PASSWORD_RECOVERY o sesión activa).
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const session = await authService.getSession().catch(() => null);
        if (mounted && session) setSessionReady(true);
      } catch { /* noop */ }
    })();

    const sub = authService.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        if (mounted) setSessionReady(true);
      }
    });

    // Fallback: si en 4s no hubo sesión, dejamos intentar igual (Supabase a veces ya la aplicó).
    const t = setTimeout(() => { if (mounted) setSessionReady(true); }, 4000);

    return () => { mounted = false; clearTimeout(t); sub?.unsubscribe?.(); };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (password !== confirmPassword) { showToast('Las contraseñas no coinciden', 'error'); return; }
    if (password.length < 6) { showToast('La contraseña debe tener al menos 6 caracteres', 'error'); return; }

    setSubmitting(true);
    try {
      await authService.updatePassword(password);
      showToast('Tu contraseña se actualizó correctamente. Ya podés iniciar sesión.', 'success', 6000);
      await authService.signOut().catch(() => {});
      navigate(CONFIG.ROUTES.LOGIN);
    } catch (error) {
      console.error('Reset error:', error);
      showToast(errorService.getMessage(error), 'error');
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
            <img src={logoSrc} alt="Veltronik" className="auth-logo-img" />
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
                  <Icon name={showPassword ? 'eyeOff' : 'eye'} size="1.1em" />
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
