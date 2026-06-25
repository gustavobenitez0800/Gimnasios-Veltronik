// ============================================
// VELTRONIK - CARD CHECKOUT (flujo de pago riguroso, UX por estados)
// ============================================
// El cliente carga la tarjeta (Card Payment Brick de MP, que la tokeniza). El backend
// crea la suscripción pero NO activa: el acceso se otorga SOLO cuando el cobro entra.
// Este componente refleja el ESTADO REAL del backend, paso a paso (tipo Netflix):
//   validando tarjeta → procesando el cobro → confirmado / rechazado (con motivo).

import { useEffect, useRef, useState } from 'react';
import { loadMercadoPago } from '@mercadopago/sdk-js';
import CONFIG from '../lib/config';
import { subscriptionService } from '../services/SubscriptionService';
import { mpRejectionMessage } from '../lib/mpStatusDetail';
import { getMpPublicKey } from '../lib/paymentConfig';

const CONTAINER_ID = 'cardPaymentBrick_container';
const POLL_INTERVAL_MS = 3000;
const POLL_MAX = 40; // ~2 min
const SDK_TIMEOUT_MS = 12000; // corte si el SDK de MP no carga (red/Electron) — evita el spinner eterno

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

export default function CardCheckout({ amount = CONFIG.SUBSCRIPTION_PRICE, onSuccess, onError }) {
  const [status, setStatus] = useState(S.LOADING);
  const [message, setMessage] = useState('');
  const [attempt, setAttempt] = useState(0); // re-monta el Brick al reintentar
  const propsRef = useRef({ amount, onSuccess, onError });
  propsRef.current = { amount, onSuccess, onError };
  const pollRef = useRef(null);
  const statusRef = useRef(status);
  statusRef.current = status;

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

  // Montaje del Brick (se re-monta cuando cambia `attempt`).
  useEffect(() => {
    let controller = null;
    let cancelled = false;
    setStatus(S.LOADING);
    setMessage('');

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

        // El SDK de MP se baja de su CDN; con timeout para no quedar en "Cargando…" eterno.
        await withTimeout(loadMercadoPago(), SDK_TIMEOUT_MS, 'sdk-timeout');
        if (cancelled) return;
        const mp = new window.MercadoPago(mpKey, { locale: 'es-AR' });
        controller = await mp.bricks().create('cardPayment', CONTAINER_ID, {
          initialization: { amount: propsRef.current.amount },
          customization: {
            visual: { style: { theme: 'dark' } },
            paymentMethods: { minInstallments: 1, maxInstallments: 1 },
          },
          callbacks: {
            onReady: () => { if (!cancelled) setStatus(S.READY); },
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
                await subscriptionService.subscribeWithCard({ card_token: cardToken, payer_email: payerEmail });
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
      try { controller?.unmount?.(); } catch { /* noop */ }
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  const retry = () => { setMessage(''); setAttempt((a) => a + 1); };

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
      <div id={CONTAINER_ID} style={{ display: showBrick ? 'block' : 'none' }} />

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
            tu cuenta se activa sola — podés cerrar y volver en un rato.
          </p>
          <button className="btn btn-secondary" onClick={startPolling} style={{ marginTop: '0.5rem' }}>Volver a verificar</button>
        </div>
      )}

      {status === S.ERROR && message && (
        <div style={panelErr}><p style={pMuted}>{message}</p></div>
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
