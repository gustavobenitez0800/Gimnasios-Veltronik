// ============================================
// VELTRONIK - CARD CHECKOUT (flujo de pago riguroso, UX por estados)
// ============================================
// El cliente carga la tarjeta (Card Payment Brick de MP, que la tokeniza). El backend
// crea la suscripción pero NO activa: el acceso se otorga SOLO cuando el cobro entra.
// Este componente refleja el ESTADO REAL del backend, paso a paso (tipo Netflix):
//   validando tarjeta → procesando el cobro → confirmado / rechazado (con motivo).

import { useEffect, useId, useRef, useState } from 'react';
import { loadMercadoPago } from '@mercadopago/sdk-js';
import CONFIG from '../lib/config';
import { subscriptionService } from '../services/SubscriptionService';
import { mpRejectionMessage } from '../lib/mpStatusDetail';
import { getMpPublicKey } from '../lib/paymentConfig';

const POLL_INTERVAL_MS = 3000;
const POLL_MAX = 40; // ~2 min
const SDK_TIMEOUT_MS = 12000; // corte si el SDK de MP no carga (red/Electron) — evita el spinner eterno
const READY_TIMEOUT_MS = 25000; // corte si el formulario no queda listo: se ofrece reintentar o el link

/** Promesa con timeout: si tarda más de `ms`, rechaza (en vez de colgarse para siempre). */
function withTimeout(promise, ms, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ]);
}

// Mensaje único cuando el brick no puede cargar: siempre apunta al método alternativo
// (link de Mercado Pago), que está disponible en cada pantalla de pago.
const FALLBACK_HINT = 'No pudimos cargar el formulario de tarjeta. Usá el método de pago alternativo (link de Mercado Pago) que aparece debajo.';

// Estados (espejo del backend)
const S = {
  LOADING: 'loading', READY: 'ready', SUBMITTING: 'submitting',
  PROCESSING: 'processing', SUCCESS: 'success', REJECTED: 'rejected',
  TIMEOUT: 'timeout', ERROR: 'error',
};

/**
 * @param plan  código del plan que se está comprando (BASICO / PREMIUM). Viaja el CÓDIGO, no el
 *              precio: el monto lo pone el catálogo del backend. Si el importe viniera de acá,
 *              cualquiera contrataría el premium por mil pesos editando la request. El `amount`
 *              es solo para que el Brick muestre la cifra correcta en pantalla.
 * @param onBusyChange  avisa true mientras NO conviene desmontar este componente, y false
 *              cuando ya se puede. La página de planes lo usa para no dejar cambiar de plan
 *              en el medio.
 *
 * ⚠️ UNO SOLO POR PANTALLA, Y NO SE LO SACA A MEDIO ARMAR. Mercado Pago admite un único Card
 * Payment Brick vivo por página: sus campos seguros (los iframes de número, vencimiento y
 * código) son únicos. Probado contra el SDK real:
 *   · dos a la vez → el segundo no termina de cargar nunca, ni en su propio contenedor;
 *   · desmontar uno mientras se está armando y montar otro enseguida → el nuevo queda en
 *     "Cargando…" ("Field 'cardNumber' already unmounted").
 * Quien ofrezca dos cobros en la misma pantalla muestra un formulario por vez y espera a
 * `onBusyChange(false)` antes de cambiarlo.
 */
export default function CardCheckout({ amount = CONFIG.SUBSCRIPTION_PRICE, plan, onSuccess, onError, onBusyChange }) {
  const [status, setStatus] = useState(S.LOADING);
  const [message, setMessage] = useState('');
  const [attempt, setAttempt] = useState(0); // re-monta el Brick al reintentar
  const propsRef = useRef({ amount, plan, onSuccess, onError, onBusyChange });
  const pollRef = useRef(null);
  const statusRef = useRef(status);
  // Un id por instancia, no uno fijo: con el id repetido el Brick se dibujaba en el primer
  // contenedor que encontraba, o sea adentro de OTRO formulario. (useId trae caracteres que
  // no sirven en un selector; se dejan solo letras y números.)
  const containerId = `cardPaymentBrick_${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

  // Patrón "latest ref": los callbacks async (polling, onSubmit del Brick) leen
  // siempre los valores vigentes sin re-suscribirse. Se sincronizan en un effect
  // (no durante el render) y ANTES del effect del Brick, que los consume.
  useEffect(() => {
    propsRef.current = { amount, plan, onSuccess, onError, onBusyChange };
    statusRef.current = status;
  });

  // Ocupado = sacarlo ahora rompe algo. Dos casos: el Brick se está armando (ver la nota de
  // arriba), o hay un cobro en curso —la tarjeta ya salió para el backend y todavía no hay un
  // rechazo que habilite reintentar—. Incluye TIMEOUT: MP sigue procesando aunque dejamos de
  // preguntar.
  const busy = status === S.LOADING || status === S.SUBMITTING || status === S.PROCESSING
    || status === S.SUCCESS || status === S.TIMEOUT;
  useEffect(() => {
    if (!busy) return undefined;
    propsRef.current.onBusyChange?.(true);
    return () => propsRef.current.onBusyChange?.(false);
  }, [busy]);

  // Polling del estado REAL del cobro en el backend.
  const startPolling = () => {
    setStatus(S.PROCESSING);
    let tries = 0;
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      tries++;
      try {
        const { state, detail } = await subscriptionService.getBillingStatus();
        if (state === 'active') {
          clearInterval(pollRef.current);
          setStatus(S.SUCCESS);
          setTimeout(() => propsRef.current.onSuccess?.(), 1200);
          return;
        }
        if (state === 'rejected') {
          clearInterval(pollRef.current);
          setStatus(S.REJECTED);
          setMessage(mpRejectionMessage(detail));
          propsRef.current.onError?.(new Error(detail || 'rejected'));
          return;
        }
        // processing / none → seguimos esperando el cobro
      } catch { /* reintenta el próximo tick */ }
      if (tries >= POLL_MAX) {
        clearInterval(pollRef.current);
        if (statusRef.current === S.PROCESSING) setStatus(S.TIMEOUT);
      }
    }, POLL_INTERVAL_MS);
  };

  // Montaje del Brick (se re-monta cuando cambia `attempt`). El estado ya nace
  // en LOADING (useState inicial) y `retry` lo resetea en el handler — acá no
  // hay setState sincrónico que dispare renders en cascada.
  useEffect(() => {
    let controller = null;
    let cancelled = false;

    // Vigía: pase lo que pase más abajo, "Cargando…" tiene un final. El create() de MP puede
    // volver bien y que onReady no llegue nunca (pasa si otro Brick le pisó los campos
    // seguros), y ahí no hay excepción que atrapar. Si el formulario termina llegando
    // después, onReady lo vuelve a mostrar.
    const vigia = setTimeout(() => {
      if (cancelled || statusRef.current !== S.LOADING) return;
      console.error('[CardCheckout] el formulario no quedó listo a tiempo');
      setStatus(S.ERROR);
      setMessage(FALLBACK_HINT);
    }, READY_TIMEOUT_MS);

    (async () => {
      try {
        // Clave pública resuelta en RUNTIME (backend → fallback build). Así un build sin la
        // clave no rompe el pago: la toma del backend, que es la fuente de verdad.
        const mpKey = await getMpPublicKey();
        if (cancelled) return;
        if (!mpKey) {
          setStatus(S.ERROR);
          setMessage(FALLBACK_HINT);
          return;
        }

        // El SDK de MP se baja de su CDN; con timeout para no quedar en "Cargando..." eterno.
        await withTimeout(loadMercadoPago(), SDK_TIMEOUT_MS, 'sdk-timeout');
        if (cancelled) return;
        const mp = new window.MercadoPago(mpKey, { locale: 'es-AR' });
        controller = await mp.bricks().create('cardPayment', containerId, {
          initialization: { amount: propsRef.current.amount },
          customization: {
            visual: { style: { theme: 'dark' } },
            paymentMethods: { minInstallments: 1, maxInstallments: 1 },
          },
          callbacks: {
            onReady: () => { if (!cancelled) { setStatus(S.READY); setMessage(''); } },
            onError: (err) => {
              console.error('[CardCheckout] brick error:', err);
              if (!cancelled) { setStatus(S.ERROR); setMessage(FALLBACK_HINT); }
              propsRef.current.onError?.(err);
            },
            onSubmit: async (cardFormData) => {
              const data = (cardFormData && cardFormData.formData) ? cardFormData.formData : cardFormData;
              const cardToken = data && data.token;
              const payerEmail = data && data.payer ? data.payer.email : undefined;
              if (!cardToken) {
                setStatus(S.READY);
                setMessage('No se pudo leer la tarjeta. Probá de nuevo.');
                throw new Error('card token ausente');
              }
              setStatus(S.SUBMITTING);
              setMessage('');
              try {
                // Crea la suscripción (NO activa). Arranca el polling del cobro real.
                await subscriptionService.subscribeWithCard({ card_token: cardToken, payer_email: payerEmail, plan: propsRef.current.plan });
                startPolling();
              } catch (e) {
                console.error('[CardCheckout] subscribe error:', e);
                setStatus(S.READY);
                setMessage(e?.response?.data?.error || e?.message || 'No se pudo iniciar el pago. Probá de nuevo.');
                propsRef.current.onError?.(e);
                throw e;
              }
            },
          },
        });
        if (cancelled && controller?.unmount) controller.unmount();
      } catch (e) {
        console.error('[CardCheckout] init error:', e);
        if (!cancelled) { setStatus(S.ERROR); setMessage(FALLBACK_HINT); }
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(vigia);
      try { controller?.unmount?.(); } catch { /* noop */ }
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [attempt, containerId]);

  // El reset del estado vive acá (handler), no en el effect: al reintentar, el
  // Brick se re-monta con la UI ya en "Cargando" en el mismo commit.
  const retry = () => { setStatus(S.LOADING); setMessage(''); setAttempt((a) => a + 1); };

  const showBrick = status === S.LOADING || status === S.READY;

  return (
    <div className="card-checkout">
      {/* Stepper: visible cuando hay un cobro en curso o resuelto */}
      {!showBrick && status !== S.ERROR && <PaymentStepper status={status} />}

      {status === S.LOADING && (
        <div style={{ color: '#9ca3af', padding: '1rem', textAlign: 'center' }}>
          <span className="spinner" /> Cargando pago seguro…
        </div>
      )}

      {/* Contenedor del Brick: SIEMPRE en el DOM; se oculta cuando ya hay un cobro en curso. */}
      <div id={containerId} style={{ display: showBrick ? 'block' : 'none' }} />

      {/* Mensajes en la fase de carga de tarjeta (token/subscribe error) */}
      {(status === S.READY || status === S.SUBMITTING) && message && (
        <div style={{ color: '#fca5a5', marginTop: '0.75rem', fontSize: '0.9rem', textAlign: 'center' }}>{message}</div>
      )}

      {/* Resultado: confirmado */}
      {status === S.SUCCESS && (
        <div style={panelOk}>
          <strong>✅ ¡Pago confirmado!</strong>
          <p style={pMuted}>Activando tu cuenta…</p>
        </div>
      )}

      {/* Resultado: rechazado (con motivo real de MP) */}
      {status === S.REJECTED && (
        <div style={panelErr}>
          <strong>El cobro fue rechazado</strong>
          <p style={pMuted}>{message}</p>
          <button className="btn btn-primary" onClick={retry} style={{ marginTop: '0.5rem' }}>Probar con otra tarjeta</button>
        </div>
      )}

      {/* Resultado: el cobro tarda (MP async) */}
      {status === S.TIMEOUT && (
        <div style={panelWarn}>
          <strong>Tu pago se está confirmando…</strong>
          <p style={pMuted}>
            Mercado Pago está procesando el cobro (puede tardar unos minutos). Cuando se confirme,
            tu cuenta se activa sola. Podés cerrar y volver en un rato.
          </p>
          <button className="btn btn-secondary" onClick={startPolling} style={{ marginTop: '0.5rem' }}>Volver a verificar</button>
        </div>
      )}

      {status === S.ERROR && message && (
        <div style={panelErr}>
          <p style={pMuted}>{message}</p>
          <button className="btn btn-secondary" onClick={retry} style={{ marginTop: '0.5rem' }}>Reintentar</button>
        </div>
      )}
    </div>
  );
}

// ─── Stepper de 3 etapas que refleja el estado real ───
function PaymentStepper({ status }) {
  const steps = ['Tarjeta validada', 'Procesando cobro', 'Cuenta activada'];
  // Estado de cada paso: done | active | fail | pending
  const stateOf = (i) => {
    if (status === 'submitting') return i === 0 ? 'active' : 'pending';
    if (status === 'processing') return i === 0 ? 'done' : i === 1 ? 'active' : 'pending';
    if (status === 'success') return 'done';
    if (status === 'rejected') return i === 0 ? 'done' : i === 1 ? 'fail' : 'pending';
    if (status === 'timeout') return i === 0 ? 'done' : i === 1 ? 'active' : 'pending';
    return 'pending';
  };
  const colors = { done: '#22c55e', active: 'var(--primary-500, #3b82f6)', fail: '#ef4444', pending: 'rgba(148,163,184,0.4)' };
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 4, margin: '0.5rem 0 1.25rem' }}>
      {steps.map((label, i) => {
        const st = stateOf(i);
        const c = colors[st];
        return (
          <div key={label} style={{ flex: 1, textAlign: 'center', position: 'relative' }}>
            {i < steps.length - 1 && (
              <div style={{ position: 'absolute', top: 13, left: '50%', width: '100%', height: 2, background: 'rgba(148,163,184,0.25)' }} />
            )}
            <div style={{
              position: 'relative', width: 28, height: 28, borderRadius: '50%', margin: '0 auto',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700,
              color: st === 'pending' ? '#94a3b8' : '#fff', background: st === 'pending' ? 'transparent' : c,
              border: `2px solid ${c}`,
            }}>
              {st === 'done' ? '✓' : st === 'fail' ? '✕' : st === 'active' ? <span className="spinner" style={{ width: 12, height: 12 }} /> : i + 1}
            </div>
            <div style={{ marginTop: 6, fontSize: '0.72rem', color: st === 'pending' ? '#94a3b8' : '#e5e7eb' }}>{label}</div>
          </div>
        );
      })}
    </div>
  );
}

const pMuted = { color: '#9ca3af', fontSize: '0.9rem', marginTop: '0.4rem', lineHeight: 1.5 };
const panelBase = { marginTop: '1rem', padding: '1rem', borderRadius: 12, textAlign: 'center' };
const panelOk = { ...panelBase, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', color: '#22c55e' };
const panelErr = { ...panelBase, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5' };
const panelWarn = { ...panelBase, background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.3)', color: '#fde68a' };
