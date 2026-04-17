// ============================================
// VELTRONIK - LOGIN PAGE
// ============================================

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import Icon from '../components/Icon';
import logoSrc from '../assets/LogoPrincipalVeltronik.png';
import CONFIG from '../lib/config';
import { supabase } from '../services';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { login, loginWithGoogle } = useAuth();
  const { showToast } = useToast();

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!email || !password) {
      showToast('Por favor completa todos los campos', 'error');
      return;
    }

    setSubmitting(true);
    try {
      await login(email, password);
    } catch (error) {
      console.error('Login error:', error);
      showToast(getAuthErrorMessage(error), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      showToast('Por favor ingresa tu email primero', 'warning');
      return;
    }
    if (!email.includes('@') || !email.includes('.')) {
      showToast('Por favor ingresa un email válido', 'error');
      return;
    }

    try {
      const redirectUrl = `${window.location.origin}/#/reset-password`;
      await supabase.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl });
      showToast('Si el email existe, recibirás instrucciones para recuperar tu contraseña', 'success', 5000);
    } catch {
      showToast('Si el email existe, recibirás instrucciones para recuperar tu contraseña', 'success', 5000);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      await loginWithGoogle();
    } catch {
      showToast('Error al iniciar sesión con Google', 'error');
    }
  };

  return (
    <div className="auth-card">
      {/* Logo */}
      <div className="auth-logo">
        <img src={logoSrc} alt="Veltronik" className="auth-logo-img" />
        <h1 className="auth-logo-text">Veltronik</h1>
        <p className="auth-logo-subtitle">Plataforma de Gestión de Negocios</p>
      </div>

      {/* Title */}
      <h2 className="auth-title">Bienvenido de nuevo</h2>
      <p className="auth-subtitle">Ingresa tus credenciales para acceder</p>

      {/* Login Form */}
      <form className="auth-form" onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label" htmlFor="email">Email</label>
          <input
            type="email"
            id="email"
            className="form-input"
            placeholder="tu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="password">Contraseña</label>
          <div className="password-wrapper">
            <input
              type={showPassword ? 'text' : 'password'}
              id="password"
              className="form-input"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              minLength="6"
            />
            <button
              type="button"
              className="password-toggle"
              onClick={() => setShowPassword(!showPassword)}
            >
              <Icon name={showPassword ? 'eyeOff' : 'eye'} />
            </button>
          </div>
        </div>

        <div className="auth-forgot">
          <button type="button" onClick={handleForgotPassword} className="link-button">
            ¿Olvidaste tu contraseña?
          </button>
        </div>

        <button type="submit" className="auth-submit" disabled={submitting}>
          {submitting ? (
            <><span className="spinner" /> Ingresando...</>
          ) : (
            'Iniciar Sesión'
          )}
        </button>
      </form>

      {/* Divider */}
      <div className="auth-divider">o continúa con</div>

      {/* Google Login */}
      <div className="auth-social">
        <button type="button" className="btn-google" onClick={handleGoogleLogin}>
          <svg viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
          Continuar con Google
        </button>
      </div>

      {/* Register Link */}
      <p className="auth-links">
        ¿No tenés cuenta? <Link to={CONFIG.ROUTES.REGISTER}>Registrate gratis</Link>
      </p>
    </div>
  );
}

function getAuthErrorMessage(error) {
  const message = error.message || error.toString();
  if (message.includes('Invalid login credentials')) return 'Email o contraseña incorrectos';
  if (message.includes('User already registered')) return 'Este email ya está registrado';
  if (message.includes('Email not confirmed')) return 'Por favor confirma tu email antes de iniciar sesión';
  if (message.includes('Password should be')) return 'La contraseña debe tener al menos 6 caracteres';
  if (message.includes('Unable to validate email')) return 'Email inválido';
  return 'Error de autenticación. Intenta de nuevo.';
}
