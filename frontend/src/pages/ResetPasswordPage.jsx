// ============================================
// VELTRONIK V2 - RESET PASSWORD PAGE
// ============================================

import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useToast } from '../contexts/ToastContext';
import { authService, errorService } from '../services';
import CONFIG from '../lib/config';
// La marca en vector y en el azul de la app: el PNG azul marino no se veía sobre lo oscuro.
import logoSrc from '../assets/marca-veltronik.svg';
import Icon from '../components/Icon';

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // 'verificando' → 'lista' (hay sesión de recuperación) o 'vencido' (el link no sirve).
  const [estado, setEstado] = useState('verificando');

  // El link del correo abre la sesión de recuperación de una de tres formas, en este orden:
  //   1. `?token_hash=…&type=recovery`: la plantilla nueva. Anda en cualquier navegador.
  //   2. `?code=…` (PKCE): la de fábrica. Vence a los 5 minutos de pedirlo y solo anda en el
  //      navegador donde se pidió; Supabase a veces ya lo canjeó solo al arrancar.
  //   3. El evento PASSWORD_RECOVERY de los links con el formato viejo.
  // ⚠️ Hasta el 2026-11-01, si ninguna anduvo, a los 4 s se mostraba el formulario igual: la
  // persona escribía la contraseña nueva dos veces y recién ahí le decía "Auth session missing".
  useEffect(() => {
    let mounted = true;
    const lista = () => { if (mounted) setEstado('lista'); };
    const vencido = () => { if (mounted) setEstado((e) => (e === 'verificando' ? 'vencido' : e)); };
    const haySesion = () => authService.getSession().then(() => true, () => false);

    (async () => {
      const porToken = await authService.verifyRecoveryLink().then((ok) => (ok ? 'ok' : null), () => 'fallo');
      if (porToken === 'ok') return lista();
      if (porToken === null && await authService.exchangeRecoveryCode().catch(() => false)) return lista();
      if (await haySesion()) return lista();
      // Un token que se probó y falló no tiene vuelta: no hay nada que esperar.
      if (porToken === 'fallo') vencido();
    })();

    const sub = authService.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') lista();
    });

    // El evento de un link viejo puede tardar un poco. Pasado eso, sin sesión no hay link que sirva.
    const t = setTimeout(async () => { if (await haySesion()) lista(); else vencido(); }, 4000);

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
      // En TODOS los dispositivos, y es una decisión: quien usa "olvidé mi contraseña" puede
      // estar recuperándose de que otro la tenga, y dejar abiertas las sesiones viejas sería
      // dejarle la puerta abierta. Es lo que hace cualquier banco. (Hasta la fase A de la
      // sesión esto también era global, pero sin que nadie lo decidiera: `signOut()` a secas.)
      await authService.signOutEverywhere().catch(() => {});
      navigate(CONFIG.ROUTES.LOGIN);
    } catch (error) {
      console.error('Reset error:', error);
      showToast(errorService.getMessage(error), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (estado === 'verificando') {
    return (
      <div className="auth-card" style={{ textAlign: 'center' }}>
        <span className="spinner" style={{ width: 32, height: 32 }} />
        <p style={{ marginTop: '1rem', color: 'var(--text-muted)' }}>Verificando enlace…</p>
      </div>
    );
  }

  if (estado === 'vencido') {
    return (
      <div className="auth-card">
        <div className="auth-logo">
          <img src={logoSrc} alt="Veltronik" className="auth-logo-img marca-centrada" />
          <h1 className="auth-logo-text">Veltronik</h1>
        </div>
        <h2 className="auth-title">Ese enlace ya no sirve</h2>
        <p className="auth-subtitle">
          Ya se usó o venció. Volvé al inicio de sesión y pedí uno nuevo con «¿Olvidaste tu
          contraseña?»: te llega otro correo en un minuto.
        </p>
        <p className="auth-links">
          <Link to={CONFIG.ROUTES.LOGIN}>Volver al inicio de sesión</Link>
        </p>
      </div>
    );
  }

  // Sin marco propio: el AuthLayout de la ruta ya pone el fondo y el ancho. Con los dos, la
  // tarjeta quedaba 64 px más angosta que la del login.
  return (
        <div className="auth-card">
          <div className="auth-logo">
            <img src={logoSrc} alt="Veltronik" className="auth-logo-img marca-centrada" />
            <h1 className="auth-logo-text">Veltronik</h1>
          </div>

          <h2 className="auth-title">Restablecer contraseña</h2>
          <p className="auth-subtitle">Ingresá tu nueva contraseña</p>

          <form className="auth-form" onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label" htmlFor="clave-nueva-reset">Nueva contraseña</label>
              <div className="password-wrapper">
                <input id="clave-nueva-reset" type={showPassword ? 'text' : 'password'} className="form-input"
                  placeholder="Mínimo 6 caracteres" value={password}
                  onChange={e => setPassword(e.target.value)} required minLength={6} autoComplete="new-password" />
                <button type="button" className="password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Ocultar la contraseña' : 'Mostrar la contraseña'}
                  aria-pressed={showPassword}>
                  <Icon name={showPassword ? 'eyeOff' : 'eye'} size="1.1em" />
                </button>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="clave-repetida-reset">Confirmar contraseña</label>
              <div className="password-wrapper">
                <input id="clave-repetida-reset" type={showPassword ? 'text' : 'password'} className="form-input"
                  placeholder="Repetí tu contraseña" value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)} required minLength={6} autoComplete="new-password" />
              </div>
            </div>

            <button type="submit" className="auth-submit" disabled={submitting}>
              {submitting ? <><span className="spinner" /> Cambiando...</> : 'Cambiar contraseña'}
            </button>
          </form>

          <p className="auth-links">
            <Link to={CONFIG.ROUTES.LOGIN}>Volver al inicio de sesión</Link>
          </p>
        </div>
  );
}
