// ============================================
// VELTRONIK V2 - PLANS PAGE (contratación)
// ============================================
// Los planes los define el BACKEND (/public/plans), no esta pantalla.
//
// POR QUÉ
// Antes acá vivían el precio (`const price = 80000`) y la lista de funciones, escritos a
// mano. Dos problemas: bajar el precio en el servidor dejaba esta página mostrando el viejo
// —el cliente leía un número y le cobraban otro— y la lista prometía "Control de acceso
// automatizado", que pasó a ser una función del plan premium.
//
// Ahora el backend manda solo los planes CONTRATABLES: un plan en construcción existe en el
// catálogo para poder programarlo, pero no sale por el endpoint, así que esta pantalla no
// puede ofrecerlo ni por error.

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import CONFIG from '../lib/config';
import { hasAccess } from '../lib/access';
import { GYM } from '../lib/gym';
import apiClient from '../lib/apiClient';
import Icon from '../components/Icon';
import CardCheckout from '../components/CardCheckout';
import { useMonthlyPrice } from '../hooks/useMonthlyPrice';

export default function PlansPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { gym, subscription } = useAuth();
  const [subscribing, setSubscribing] = useState(false);
  const [planes, setPlanes] = useState(null);

  // Respaldo si el backend no contesta: el muro de pago NO puede quedar en blanco — es la
  // única pantalla desde donde un cliente bloqueado puede volver a entrar. El precio sale
  // del hook (que ya tiene su propia cadena de respaldo).
  const precioRespaldo = useMonthlyPrice();

  useEffect(() => {
    let vigente = true;
    apiClient.get('/public/plans')
      .then((res) => {
        const lista = Array.isArray(res.data) ? res.data : [];
        if (vigente && lista.length > 0) setPlanes(lista);
        else if (vigente) setPlanes([]); // respondió, pero sin planes → usamos el respaldo
      })
      .catch(() => { if (vigente) setPlanes([]); });
    return () => { vigente = false; };
  }, []);

  const planesAMostrar = (planes && planes.length > 0) ? planes : [{
    code: 'BASICO',
    name: 'Veltronik',
    tagline: 'Todo lo que necesitás para manejar el gimnasio.',
    price: precioRespaldo,
    features: [
      'Gestión ilimitada de socios activos',
      'Control de caja y pagos mensuales',
      'Dashboard inteligente con métricas clave',
      'Registro de asistencia y accesos',
      'Sigue funcionando sin internet',
      'Múltiples perfiles de usuario por equipo',
      'Soporte técnico y asistencia prioritaria',
      'Nuevas funciones y actualizaciones gratis',
    ],
  }];

  // Esta página NUNCA mete a nadie al sistema sola. Antes hacía
  // `if (isActiveSubscription(subscription)) navigate(DASHBOARD)`, con dos problemas:
  // el criterio miraba solo `status === 'active'` (ignoraba si el período pago venció) y
  // corría contra el contexto que hubiera cargado en ese instante — que al llegar desde el
  // muro de pago era el de OTRA sucursal. Resultado: el que venía a pagar entraba gratis.
  // Si ya está al día se lo decimos y que entre haciendo click; el riesgo de equivocarse
  // ahora es "un cliente al día ve la página de pago", no "un moroso entra sin pagar".
  const alDia = hasAccess(gym, subscription);

  // Sin sucursal elegida no hay a quién cobrarle: el backend resuelve el tenant del header
  // X-Tenant-ID y respondería "No hay gimnasio en la sesión" DESPUÉS de que el cliente cargó
  // la tarjeta. Mejor decirlo antes que hacerle pagar en el aire. (Pasa con un F5 acá: /plans
  // es una ruta que no exige contexto de gimnasio.)
  const sucursalElegida = gym?.id || localStorage.getItem('current_org_id');

  const handleSubscribe = async () => {
    setSubscribing(true);
    try {
      const response = await apiClient.post('/core/subscriptions/checkout');
      const { ok, init_point, error } = response.data;

      if (!ok || !init_point) {
        throw new Error(error || 'Tuvimos un problema al preparar la suscripción con Mercado Pago.');
      }

      showToast('Abriendo portal de pagos seguro...', 'info');
      setTimeout(() => { window.location.href = init_point; }, 1000);
    } catch (error) {
      const msg = error.response?.data?.error || error.message || 'Error de conexión';
      showToast('Error: ' + msg, 'error');
    } finally {
      setSubscribing(false);
    }
  };

  // Pago con tarjeta OK (Brick) → el backend ya reactivó. Volvemos al Lobby (re-chequea acceso).
  const handleSuccess = () => {
    showToast('¡Pago confirmado! Activando tu cuenta…', 'success');
    setTimeout(() => navigate(CONFIG.ROUTES.LOBBY), 1500);
  };

  return (
    <div className="plans-page">
      {/* Realce de fondo sutil (un solo gradiente tenue, sin orbes) */}
      <div className="plans-page-bg" />

      <div className="plans-page-content">
        {/* Volver */}
        <button className="plans-back" onClick={() => navigate(CONFIG.ROUTES.LOBBY)}>
          <Icon name="chevronLeft" size="1em" /> Volver al Lobby
        </button>

        {/* Hero */}
        <div className="plans-hero">
          <h1 className="plans-hero-title">Activá tu {GYM.placeLabel}</h1>
          <p className="plans-hero-subtitle">Suscripción mensual para acceso completo al sistema</p>
        </div>

        {/* Ya está al día: se lo decimos y entra con un click. No lo redirigimos solos. */}
        {alDia && (
          <div className="plans-uptodate">
            <div className="plans-uptodate-head">
              <Icon name="checkCircle" size="1.2em" />
              <strong>Tu suscripción está al día</strong>
            </div>
            <p className="plans-uptodate-text">
              No hace falta que pagues de nuevo. Si querés cambiar la tarjeta, podés hacerlo
              desde Ajustes.
            </p>
            <button className="btn btn-primary" style={{ width: '100%' }}
              onClick={() => navigate(CONFIG.ROUTES.DASHBOARD)}>
              Entrar al sistema <Icon name="arrowRight" size="1em" />
            </button>
          </div>
        )}

        {planesAMostrar.map((plan) => (
          <div className="plans-card" key={plan.code}>
            {/* El nombre va una sola vez, en el título. (Antes la chapita y el título decían
                los dos "Veltronik Premium"; con el nombre del plan servido por el backend la
                repetición quedaba a la vista: "Veltronik / Veltronik".) */}
            <div className="plans-card-head">
              <h2 className="plans-card-title">{plan.name}</h2>
              <p className="plans-card-desc">{plan.tagline}</p>
            </div>

            {/* Precio */}
            <div className="plans-price-box">
              <div className="plans-price">
                <span className="plans-price-currency">$</span>
                <span className="plans-price-amount tabular-nums">
                  {Number(plan.price).toLocaleString('es-AR')}
                </span>
              </div>
              <span className="plans-price-period">por mes</span>
            </div>

            {/* Features */}
            <ul className="plans-features">
              {(plan.features || []).map((f, i) => (
                <li key={i} className="plans-feature">
                  <span className="plans-feature-check"><Icon name="check" size="1.1em" /></span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>

            {sucursalElegida ? (
              <>
                {/* Cobro con tarjeta (Brick MP): el cliente paga acá mismo, sin login ni redirección */}
                <CardCheckout amount={Number(plan.price)} onSuccess={handleSuccess} />

                {/* Respaldo: link clásico de Mercado Pago */}
                <button className="btn btn-secondary plans-cta" disabled={subscribing} onClick={handleSubscribe} style={{ marginTop: '0.75rem' }}>
                  {subscribing ? <><span className="spinner" /> Procesando...</> : 'Prefiero pagar con el link de Mercado Pago'}
                </button>

                <div className="plans-secure">
                  <Icon name="lock" size="0.9em" />
                  <span>Pago seguro procesado por Mercado Pago</span>
                </div>
              </>
            ) : (
              <div className="plans-uptodate">
                <div className="plans-uptodate-head">
                  <Icon name="alertTriangle" size="1.2em" />
                  <strong>Elegí primero qué sucursal querés activar</strong>
                </div>
                <p className="plans-uptodate-text">
                  El cobro se hace sobre una sucursal en particular. Volvé al Lobby y entrá por
                  la que querés activar para que el pago quede asociado a ella.
                </p>
                <button className="btn btn-primary" style={{ width: '100%' }}
                  onClick={() => navigate(CONFIG.ROUTES.LOBBY)}>
                  Ir al Lobby <Icon name="arrowRight" size="1em" />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
