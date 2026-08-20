// ============================================
// VELTRONIK - ACCIONES DE SUSCRIPCIÓN (variante ESCRITORIO)
// ============================================
// La gemela de SubscriptionActionsWeb.jsx, sin nada que toque una tarjeta: ni Card
// Brick, ni SDK de Mercado Pago. Cambiar el medio de pago abre el portal en el navegador
// del sistema.
//
// "Verificar Estado con MP" SÍ se queda: no es un cobro, es una sincronización. Es
// justamente lo que sirve cuando el dueño pagó en el navegador y quiere que esta máquina
// se entere sin esperar al webhook.
// ============================================

import { useState } from 'react';
import { openPortal, portalUrl } from '../../lib/portal';
import Icon from '../Icon';

const PORTAL_BILLING_PATH = '/#/lobby';

export default function SubscriptionActionsDesktop({ verifying, onVerify }) {
  const [failed, setFailed] = useState(false);

  const handleOpenPortal = async () => {
    const ok = await openPortal(PORTAL_BILLING_PATH);
    setFailed(!ok);
  };

  return (
    <>
      <div className="subscription-actions" style={{ marginTop: '1.25rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <button
          className="btn btn-secondary"
          onClick={handleOpenPortal}
          style={{ flex: '1', minWidth: '200px' }}
        >
          <Icon name="globe" size="1em" /> Cambiar Tarjeta en el portal
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
        El medio de pago se cambia en el portal web, desde el navegador. Si ya pagaste y esta
        máquina todavía no lo refleja, usá "Verificar Estado con MP" para sincronizar.
      </p>

      {failed && (
        <p style={{ color: '#fbbf24', fontSize: 'var(--font-size-xs)', marginTop: '0.5rem', wordBreak: 'break-all' }}>
          No pudimos abrir el navegador desde acá. Entrá a mano a {portalUrl(PORTAL_BILLING_PATH)}
        </p>
      )}
    </>
  );
}
