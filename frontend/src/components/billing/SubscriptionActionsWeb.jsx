// ============================================
// VELTRONIK - SECCIÓN DE SUSCRIPCIÓN (variante WEB)
// ============================================
// La sección de Ajustes → Suscripción completa, tal como la ve el dueño en el portal:
// el plan, el estado de cobro, el próximo vencimiento, el monto mensual, y el formulario de
// tarjeta (CardCheckout) para cambiarla sin salir de la página.
//
// Vive en un archivo aparte —y no dentro de SettingsPage— por dos razones distintas:
//
// 1. EMPAQUETADO: `import CardCheckout` arrastra el SDK de Mercado Pago a cualquier
//    bundle que lo alcance, y Ajustes SÍ va en la app de escritorio. Con el import
//    dentro de SettingsPage, el instalador se llevaba el SDK aunque el formulario no se
//    dibujara nunca.
//
// 2. PRIVACIDAD: el monto que paga el dueño, el próximo cobro y el estado de la
//    suscripción no tienen por qué aparecer en una computadora de mostrador. Un
//    encargado con rol de admin veía cuánto paga su jefe por el sistema.
//
// Su gemela es SubscriptionActionsDesktop.jsx, que solo dice dónde se gestiona. Cuál se
// usa lo decide la TABLA DE RUTAS (routes/WebRoutes.jsx vs routes/DesktopRoutes.jsx).
// ============================================

import { useState } from 'react';
import CardCheckout from '../CardCheckout';
import Icon from '../Icon';

/**
 * @param planCode  el plan de la suscripción de esta sucursal. Va al formulario de tarjeta,
 *                  que de ahí saca el monto y lo manda al backend: cambiar la tarjeta sigue
 *                  cobrando ESTE plan. Hasta el 2026-10-22 no viajaba, el formulario mostraba
 *                  el precio base y el backend lo resolvía como básico: una sucursal Premium
 *                  que cambiaba la tarjeta pasaba a Básico.
 * @param prueba    `{ termina, dias }` cuando la sucursal está en la prueba gratis y todavía no
 *                  se suscribió; null si no. Con prueba no hay "próximo cobro" que mostrar.
 */
export default function SubscriptionActionsWeb({
  plan, planCode, statusLabel, blocked, nextPayment, prueba, monthlyAmountLabel,
  hasSubscription, verifying, onVerify, onCardSuccess,
}) {
  const [showCardForm, setShowCardForm] = useState(false);

  const handleSuccess = async () => {
    setShowCardForm(false);
    await onCardSuccess();
  };

  return (
    <div className="settings-section">
      <h2 className="settings-section-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Icon name="creditCard" size="1.1em" /> Suscripción
      </h2>

      <div className="subscription-card">
        <div className="subscription-plan">{plan}</div>
        <div className="subscription-status">{statusLabel}</div>
      </div>

      {blocked && (
        <div style={{
          padding: '0.75rem 1rem', marginBottom: '1rem',
          background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
          borderRadius: 'var(--border-radius-md)', color: '#ef4444', fontSize: 'var(--font-size-sm)',
        }}>
          <Icon name="alertTriangle" size="1em" style={{ flexShrink: 0 }} /> Tu suscripción tiene un pago pendiente. Actualizá tu método de pago para restaurar el acceso.
        </div>
      )}

      {/* En la prueba gratis no hay tarjeta cargada ni cobro agendado: decir "Próximo cobro"
          era prometer un cobro que no va a pasar. Lo que pasa ese día es que termina la prueba. */}
      {prueba ? (
        <div className="info-row">
          <span className="info-label">Fin de la prueba</span>
          <span className="info-value">{prueba.termina}</span>
        </div>
      ) : (
        <div className="info-row">
          <span className="info-label">Próximo cobro</span>
          <span className="info-value">{nextPayment}</span>
        </div>
      )}
      <div className="info-row">
        <span className="info-label">Monto mensual</span>
        <span className="info-value">{monthlyAmountLabel}</span>
      </div>

      {prueba && (
        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-xs)', marginTop: '0.75rem' }}>
          Durante la prueba no se cobra nada. Cuando termine, el sistema te va a pedir la tarjeta para seguir.
        </p>
      )}

      {hasSubscription && (
        <>
          <div className="subscription-actions" style={{ marginTop: '1.25rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button
              className="btn btn-secondary"
              onClick={() => setShowCardForm(v => !v)}
              style={{ flex: '1', minWidth: '200px' }}
            >
              <Icon name="creditCard" size="1em" /> {showCardForm ? 'Cerrar' : 'Cambiar la tarjeta'}
            </button>
            <button
              className="btn btn-ghost"
              onClick={onVerify}
              disabled={verifying}
              style={{ flex: '1', minWidth: '200px' }}
            >
              {verifying ? (<><span className="spinner" /> Verificando...</>) : ('Verificar el estado en Mercado Pago')}
            </button>
          </div>

          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-xs)', marginTop: '0.75rem' }}>
            Si tu tarjeta fue rechazada o querés cambiar el método de pago, presioná "Cambiar la tarjeta".
            Si pagaste y el sistema no lo reconoce, usá "Verificar el estado en Mercado Pago" para sincronizar.
          </p>

          {/* Formulario de tarjeta (campos seguros de MP): cambiar método de pago sin redirección ni link */}
          {showCardForm && (
            <div style={{ marginTop: '1.25rem', padding: '1rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--border-radius-md)' }}>
              <p style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-sm)', marginBottom: '0.75rem' }}>
                Ingresá la tarjeta nueva. El cobro mensual seguirá siendo {monthlyAmountLabel}.
              </p>
              <CardCheckout plan={planCode} onSuccess={handleSuccess} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
