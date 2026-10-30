// ============================================
// VELTRONIK - REGISTER PAGE
// ============================================

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import Icon from '../components/Icon';
// La marca en vector y en el azul de la app: el PNG azul marino no se veía sobre lo oscuro.
import logoSrc from '../assets/marca-veltronik.svg';
import CONFIG from '../lib/config';
import { errorService } from '../services';
import { diagnoseConnectivity } from '../lib/connectivity';

export default function RegisterPage() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // A qué email se mandó el link de confirmación (null = todavía no se creó la cuenta).
  const [correoEnviadoA, setCorreoEnviadoA] = useState(null);
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
      const { confirmarCorreo } = await register(email, password, fullName);
      if (confirmarCorreo) {
        setCorreoEnviadoA(email.trim());
      } else {
        showToast('¡Cuenta creada! Redirigiendo...', 'success');
      }
    } catch (error) {
      console.error('Register error:', error);
      showToast(await getRegisterErrorMessage(error), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const logo = (
    <div className="auth-logo">
      <img src={logoSrc} alt="Veltronik" className="auth-logo-img marca-centrada" />
      <h1 className="auth-logo-text">Veltronik</h1>
      <p className="auth-logo-subtitle">El sistema de tu gimnasio</p>
    </div>
  );

  // La cuenta está creada pero cerrada hasta tocar el link del correo (Supabase tiene la
  // confirmación prendida). Antes acá decía "Redirigiendo..." y lo mandaba al login sin más.
  if (correoEnviadoA) {
    return (
      <div className="auth-card">
        {logo}
        <h2 className="auth-title">Revisá tu correo</h2>
        <p className="auth-subtitle">Falta un paso para entrar</p>
        <div className="auth-aviso" role="status">
          <Icon name="mail" />
          <span>
            Te mandamos un correo a <strong>{correoEnviadoA}</strong>. Tocá el enlace que trae
            y tu cuenta queda lista. Si no aparece, mirá en spam o en promociones.
          </span>
        </div>
        <p className="auth-links">
          ¿Ya lo confirmaste? <Link to={CONFIG.ROUTES.LOGIN}>Iniciá sesión</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="auth-card">
      {logo}

      {/* Title */}
      <h2 className="auth-title">Crear cuenta</h2>
      <p className="auth-subtitle">Comenzá con 14 días gratis • Sin tarjeta de crédito</p>

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
            placeholder="Repetí tu contraseña"
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
            'Crear cuenta'
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

async function getRegisterErrorMessage(error) {
  const message = error.message || error.toString();
  if (message.includes('User already registered')) return 'Este email ya está registrado';
  if (message.includes('Password should be')) return 'La contraseña debe tener al menos 6 caracteres';
  if (message.includes('Unable to validate email')) return 'Email inválido';

  // Fallo de RED: diagnosticamos la causa real (antivirus/firewall vs sin internet)
  // en vez del genérico "intentá de nuevo".
  if (errorService.isNetworkError(error)) {
    const diagnosis = await diagnoseConnectivity();
    return errorService.messageForDiagnosis(diagnosis);
  }

  return 'No pudimos crear la cuenta. Probá de nuevo.';
}
