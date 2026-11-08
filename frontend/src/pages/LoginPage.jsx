// ============================================
// VELTRONIK - LOGIN PAGE
// ============================================

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import Icon from '../components/Icon';
// La marca en vector y en el azul de la app: el PNG azul marino no se veía sobre lo oscuro.
import logoSrc from '../assets/marca-veltronik.svg';
import CONFIG from '../lib/config';
import { openPortal } from '../lib/portal';
import { canUseBrowserSignIn } from '../lib/desktopAuth';
import { authService, errorService } from '../services';
import { diagnoseConnectivity } from '../lib/connectivity';
import { INITIAL_URL } from '../lib/supabase';
import { leerVueltaDelCorreo, avisoDeLaVuelta } from '../lib/vueltaDelCorreo';
import ReenviarConfirmacion from '../components/auth/ReenviarConfirmacion';
import BotonGoogle from '../components/auth/BotonGoogle';

// Google ya funciona en los dos envases (Fase 2).
//
// Antes el botón estaba ESCONDIDO en Electron: la app se sirve por file:// y ahí Google
// no tiene a dónde redirigir de vuelta. Ahora el escritorio saca el login al navegador
// del sistema y lo recibe por veltronik:// (ver lib/desktopAuth.js), así que la única
// razón para ocultarlo es que este build de escritorio no tenga el puente de Electron
// disponible — o sea, abierto en un navegador común durante el desarrollo.
const SHOW_GOOGLE = !CONFIG.IS_DESKTOP || canUseBrowserSignIn();

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // El email de una cuenta que existe pero no confirmó el correo: con él se ofrece mandarlo de
  // nuevo. Es justo quien no encontró el primero (cayó en Spam o en «Correo no deseado»).
  const [sinConfirmar, setSinConfirmar] = useState(null);
  const { user, login, loginWithGoogle } = useAuth();
  const { showToast } = useToast();
  // ¿Llegó acá desde el link "Confirmá tu correo"? Si el canje hubiera andado ya estaría en el
  // Lobby; si está acá, falló, y antes lo hacía EN SILENCIO (ver lib/vueltaDelCorreo.js). Se
  // lee de INITIAL_URL porque AuthContext ya limpió la barra de direcciones.
  const [vueltaDelCorreo] = useState(() => avisoDeLaVuelta(leerVueltaDelCorreo(INITIAL_URL)));
  // Con sesión, este render es el instante antes de que el guard lo mande al Lobby.
  const aviso = user ? null : vueltaDelCorreo;

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!email || !password) {
      showToast('Completá el email y la contraseña.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      // ⚠️ La contraseña va TAL CUAL. Antes se le hacía .trim() acá y en el registro no: el que
      // se registraba con una contraseña que empezaba o terminaba en espacio no podía entrar
      // nunca (Supabase guarda exactamente lo que se le da al crear la cuenta).
      await login(email.trim(), password);
    } catch (error) {
      console.error('Login error:', error);
      setSinConfirmar(esCorreoSinConfirmar(error) ? email.trim() : null);
      showToast(await getAuthErrorMessage(error), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      showToast('Ingresá tu email primero y volvé a tocar "¿Olvidaste tu contraseña?"', 'warning');
      return;
    }
    if (!email.includes('@') || !email.includes('.')) {
      showToast('Ingresá un email válido', 'error');
      return;
    }

    try {
      await authService.resetPassword(email.trim());
      // Tono confiado, pero el mensaje es idéntico exista o no la cuenta: por seguridad NO
      // revelamos si el email está registrado (evita que alguien enumere usuarios probando emails).
      showToast(`Te enviamos un correo a ${email.trim()} para restablecer tu contraseña. Revisá tu bandeja de entrada y el spam.`, 'success', 8000);
    } catch (error) {
      console.error('Reset password error:', error);
      showToast(await getAuthErrorMessage(error), 'error');
    }
  };

  const handleGoogleLogin = async () => {
    try {
      await loginWithGoogle();
      // En el escritorio esto solo ABRIÓ el navegador: la sesión llega después, por el
      // deep link. Sin este aviso la pantalla se queda igual y parece que no pasó nada.
      if (CONFIG.IS_DESKTOP) {
        showToast('Terminá de iniciar sesión en el navegador y volvé a esta ventana.', 'info', 8000);
      }
    } catch (error) {
      showToast(error?.message || 'Error al iniciar sesión con Google', 'error');
    }
  };

  return (
    <div className="auth-card">
      {/* Logo */}
      <div className="auth-logo">
        <img src={logoSrc} alt="Veltronik" className="auth-logo-img marca-centrada" />
        <h1 className="auth-logo-text">Veltronik</h1>
        <p className="auth-logo-subtitle">El sistema de tu gimnasio</p>
      </div>

      {/* Title */}
      <h2 className="auth-title">Hola de nuevo</h2>
      <p className="auth-subtitle">Entrá con tu cuenta</p>

      {aviso && (
        <div className={`auth-aviso${aviso.tipo === 'error' ? ' is-error' : ''}`} role="status">
          <Icon name={aviso.tipo === 'error' ? 'alertTriangle' : 'checkCircle'} />
          <span>{aviso.texto}</span>
        </div>
      )}

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
              aria-label={showPassword ? 'Ocultar la contraseña' : 'Mostrar la contraseña'}
              aria-pressed={showPassword}
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
            'Iniciar sesión'
          )}
        </button>
      </form>

      {/* La cuenta existe pero el correo no se confirmó: se puede pedir otro acá mismo. */}
      {sinConfirmar && <ReenviarConfirmacion email={sinConfirmar} esperaInicial={0} />}

      {/* Google: web con redirect, escritorio por navegador + veltronik:// */}
      {SHOW_GOOGLE && (<>
      {/* Divider */}
      <div className="auth-divider">o entrá con</div>

      <BotonGoogle onClick={handleGoogleLogin} />
      </>)}

      {/* Register Link. Crear la cuenta es cosa del portal: en el escritorio la pantalla
          de registro no existe (Fase 4), así que el link abriría la nada. Abre el navegador. */}
      <p className="auth-links">
        ¿No tenés cuenta?{' '}
        {CONFIG.IS_DESKTOP ? (
          <button type="button" className="link-button" onClick={() => openPortal('/#/register')}>
            Registrate gratis
          </button>
        ) : (
          <Link to={CONFIG.ROUTES.REGISTER}>Registrate gratis</Link>
        )}
      </p>
    </div>
  );
}

/** La cuenta existe y la contraseña está bien, pero nunca se tocó el link del correo. */
function esCorreoSinConfirmar(error) {
  return String(error?.message || error || '').includes('Email not confirmed');
}

async function getAuthErrorMessage(error) {
  const message = error.message || error.toString();

  // Rate limiting specific check
  if (message.includes('Too many requests') || message.includes('rate limit')) {
    return 'Demasiados intentos. Esperá unos minutos y probá de nuevo.';
  }

  if (message.includes('Invalid login credentials')) return 'Email o contraseña incorrectos';
  if (message.includes('User already registered')) return 'Este email ya está registrado';
  if (esCorreoSinConfirmar(error)) {
    return 'Tu correo todavía no está confirmado. Buscá el correo de Veltronik (también en Spam o Correo no deseado) o pedí otro abajo.';
  }
  if (message.includes('Password should be')) return 'La contraseña debe tener al menos 6 caracteres';
  if (message.includes('Unable to validate email')) return 'Email inválido';

  // Fallo de RED: el mensaje "revisá tu internet" suele ser engañoso (la internet anda,
  // pero el antivirus/firewall bloquea a Supabase). Diagnosticamos para mostrar la causa
  // real y un texto accionable, en vez del genérico.
  if (errorService.isNetworkError(error)) {
    const diagnosis = await diagnoseConnectivity();
    return errorService.messageForDiagnosis(diagnosis);
  }

  // Use generic error service for other errors
  return errorService.getMessage(error);
}
