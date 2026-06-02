// ============================================
// VELTRONIK - CARD CHECKOUT (Mercado Pago Card Payment Brick)
// ============================================
// Cobro "poné la tarjeta y listo": el Brick de MP tokeniza la tarjeta del lado del
// cliente (nunca exponemos el número — el PCI lo cubre MP) y el backend crea la
// suscripción autorizada. SIN login de Mercado Pago ni email que tenga que coincidir.

import { useEffect, useRef, useState } from 'react';
import { loadMercadoPago } from '@mercadopago/sdk-js';
import CONFIG from '../lib/config';
import { subscriptionService } from '../services/SubscriptionService';

const CONTAINER_ID = 'cardPaymentBrick_container';

export default function CardCheckout({ amount = CONFIG.SUBSCRIPTION_PRICE, onSuccess, onError }) {
  const [status, setStatus] = useState('loading'); // loading | ready | submitting | error
  const [message, setMessage] = useState('');

  // Refs para leer siempre los props frescos sin re-montar el Brick.
  const propsRef = useRef({ amount, onSuccess, onError });
  propsRef.current = { amount, onSuccess, onError };

  useEffect(() => {
    let controller = null;
    let cancelled = false;

    if (!CONFIG.MP_PUBLIC_KEY) {
      setStatus('error');
      setMessage('Falta configurar Mercado Pago (clave pública). Usá el método alternativo de pago.');
      return;
    }

    (async () => {
      try {
        await loadMercadoPago();
        if (cancelled) return;
        const mp = new window.MercadoPago(CONFIG.MP_PUBLIC_KEY, { locale: 'es-AR' });
        controller = await mp.bricks().create('cardPayment', CONTAINER_ID, {
          initialization: { amount: propsRef.current.amount },
          customization: {
            visual: { style: { theme: 'dark' } },
            // Suscripción = 1 cuota fija mensual (no mostrar selector de cuotas).
            paymentMethods: { minInstallments: 1, maxInstallments: 1 },
          },
          callbacks: {
            onReady: () => { if (!cancelled) setStatus('ready'); },
            onError: (err) => {
              console.error('[CardCheckout] brick error:', err);
              if (!cancelled) { setStatus('error'); setMessage('No se pudo cargar el formulario de pago.'); }
              propsRef.current.onError?.(err);
            },
            // El Brick tokeniza la tarjeta y nos da el token + email. Lo mandamos al backend,
            // que crea la suscripción autorizada (cobro directo, sin redirección).
            // El cardPayment brick pasa el cardFormData DIRECTO (no { formData }).
            onSubmit: async (cardFormData) => {
              if (cancelled) return;
              // Defensivo: soporta tanto el dato directo como envuelto en { formData }.
              const data = (cardFormData && cardFormData.formData) ? cardFormData.formData : cardFormData;
              const cardToken = data && data.token;
              const payerEmail = data && data.payer ? data.payer.email : undefined;
              if (!cardToken) {
                setStatus('ready');
                setMessage('No se pudo leer la tarjeta. Probá de nuevo.');
                throw new Error('card token ausente');
              }
              setStatus('submitting');
              setMessage('');
              try {
                await subscriptionService.subscribeWithCard({
                  card_token: cardToken,
                  payer_email: payerEmail,
                });
                propsRef.current.onSuccess?.();
              } catch (e) {
                console.error('[CardCheckout] subscribe error:', e);
                setStatus('ready');
                setMessage(e?.response?.data?.error || e?.message || 'No se pudo procesar el pago. Probá de nuevo.');
                propsRef.current.onError?.(e);
                throw e; // informa al Brick que el submit falló
              }
            },
          },
        });
        if (cancelled && controller?.unmount) controller.unmount();
      } catch (e) {
        console.error('[CardCheckout] init error:', e);
        if (!cancelled) { setStatus('error'); setMessage('No se pudo inicializar Mercado Pago.'); }
      }
    })();

    return () => {
      cancelled = true;
      try { controller?.unmount?.(); } catch { /* noop */ }
    };
    // Monta una sola vez; los props frescos se leen vía propsRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="card-checkout">
      {status === 'loading' && (
        <div style={{ color: '#9ca3af', padding: '1rem', textAlign: 'center' }}>
          <span className="spinner" /> Cargando formulario de pago seguro…
        </div>
      )}

      {/* El Brick monta acá. Debe existir SIEMPRE en el DOM antes de create(). */}
      <div id={CONTAINER_ID} />

      {status === 'submitting' && (
        <div style={{ color: '#9ca3af', padding: '0.75rem', textAlign: 'center' }}>
          Procesando pago…
        </div>
      )}

      {message && (
        <div style={{ color: '#fca5a5', marginTop: '0.75rem', fontSize: '0.9rem', textAlign: 'center' }}>
          {message}
        </div>
      )}
    </div>
  );
}
