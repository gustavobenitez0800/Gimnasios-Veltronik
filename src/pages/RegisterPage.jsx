// ============================================
// VELTRONIK - REGISTER PAGE
// ============================================

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import Icon from '../components/Icon';
import logoSrc from '../assets/LogoPrincipalVeltronik.png';
import CONFIG from '../lib/config';

export default function RegisterPage() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { register } = useAuth();
  const { showToast } = useToast();

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!fullName) {
      showToast('Por favor ingresa tu nombre completo', 'error');
      return;
    }
    if (!email) {
      showToast('Por favor ingresa tu email', 'error');
      return;
    }
    if (!email.includes('@') || !email.includes('.')) {
      showToast('Por favor ingresa un email válido', 'error');
      return;
    }
    if (password !== confirmPassword) {
      showToast('Las contraseñas no coinciden', 'error');
      return;
    }
    if (password.length < 6) {
      showToast('La contraseña debe tener al menos 6 caracteres', 'error');
      return;
    }

    setSubmitting(true);
    try {
      await register(email, password, fullName);
      showToast('¡Cuenta creada! Redirigiendo...', 'success');
    } catch (error) {
      console.error('Register error:', error);
      showToast(getRegisterErrorMessage(error), 'error');
    } finally {
      setSubmitting(false);
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
      <h2 className="auth-title">Crear cuenta</h2>
      <p className="auth-subtitle">Comenzá con 30 días gratis • Sin tarjeta de crédito</p>

      {/* Register Form */}
      <form className="auth-form" onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label" htmlFor="fullName">Nombre completo</label>
          <input
            type="text"
            id="fullName"
            className="form-input"
            placeholder="Tu nombre"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            autoComplete="name"
          />
        </div>

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
              placeholder="Mínimo 6 caracteres"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
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

        <div className="form-group">
          <label className="form-label" htmlFor="confirmPassword">Repetir contraseña</label>
          <input
            type={showPassword ? 'text' : 'password'}
            id="confirmPassword"
            className="form-input"
            placeholder="Repite tu contraseña"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            autoComplete="new-password"
          />
        </div>

        <button type="submit" className="auth-submit" disabled={submitting}>
          {submitting ? (
            <><span className="spinner" /> Registrando...</>
          ) : (
            'Crear Cuenta'
          )}
        </button>
      </form>

      {/* Login Link */}
      <p className="auth-links">
        ¿Ya tenés cuenta? <Link to={CONFIG.ROUTES.LOGIN}>Inicia sesión</Link>
      </p>
    </div>
  );
}

function getRegisterErrorMessage(error) {
  const message = error.message || error.toString();
  if (message.includes('User already registered')) return 'Este email ya está registrado';
  if (message.includes('Password should be')) return 'La contraseña debe tener al menos 6 caracteres';
  if (message.includes('Unable to validate email')) return 'Email inválido';
  return 'Error al crear la cuenta. Intenta de nuevo.';
}
