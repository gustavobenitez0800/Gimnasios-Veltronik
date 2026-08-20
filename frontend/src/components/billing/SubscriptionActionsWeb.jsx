// ============================================
// VELTRONIK - ACCIONES DE SUSCRIPCIÓN (variante WEB)
// ============================================
// El bloque de Ajustes → Suscripción que TOCA PLATA: cambiar la tarjeta con el Card
// Payment Brick de Mercado Pago, embebido y sin redirección.
//
// Vive en un archivo aparte —y no dentro de SettingsPage— por una razón concreta de
// empaquetado (Fase 4): `import CardCheckout` arrastra el SDK de Mercado Pago a
// cualquier bundle que lo alcance, y Ajustes SÍ va en la app de escritorio. Si el import
// siguiera en SettingsPage, el instalador se llevaría el SDK aunque el formulario nunca
// se dibujara.
//
// Su gemela es SubscriptionActionsDesktop.jsx. Cuál se usa lo decide la TABLA DE RUTAS
// (routes/WebRoutes.jsx vs routes/DesktopRoutes.jsx), que se la pasa a SettingsPage como
// prop. Misma costura que usamos para las rutas: una sola idea de "acá se bifurca".
// ============================================

import { useState } from 'react';
import CardCheckout from '../CardCheckout';
import CONFIG from '../../lib/config';
import Icon from '../Icon';

export default function SubscriptionActionsWeb({ monthlyAmountLabel, verifying, onVerify, onCardSuccess }) {
  const [showCardForm, setShowCardForm] = useState(false);

  const handleSuccess = async () => {
    setShowCardForm(false);
    await onCardSuccess();
  };

  return (
    <>
      <div className="subscription-actions" style={{ marginTop: '1.25rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <button
          className="btn btn-secondary"
          onClick={() => setShowCardForm(v => !v)}
          style={{ flex: '1', minWidth: '200px' }}
        >
          <Icon name="creditCard" size="1em" /> {showCardForm ? 'Cerrar' : 'Cambiar Tarjeta / Método de Pago'}
        </button>
        <button
          className="btn btn-ghost"
          onClick={onVerify}
          disabled={verifying}
          style={{ flex: '1', minWidth: '200px' }}
        >
          {verifying ? (
            <><span className="spinner" /> Verificando...</>
          ) : (
            'Verificar Estado con MP'
          )}
        </button>
      </div>

      <p style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-xs)', marginTop: '0.75rem' }}>
        Si tu tarjeta fue rechazada o querés cambiar el método de pago, presioná "Cambiar Tarjeta".
        Si pagaste y el sistema no lo reconoce, usá "Verificar Estado con MP" para sincronizar.
      </p>

      {/* Formulario de tarjeta (Brick MP): cambiar método de pago sin redirección ni link */}
      {showCardForm && (
        <div style={{ marginTop: '1.25rem', padding: '1rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--border-radius-md)' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-sm)', marginBottom: '0.75rem' }}>
            Ingresá la tarjeta nueva. El cobro mensual seguirá siendo {monthlyAmountLabel}.
          </p>
          <CardCheckout
            amount={CONFIG.SUBSCRIPTION_PRICE}
            onSuccess={handleSuccess}
          />
        </div>
      )}
    </>
  );
}
