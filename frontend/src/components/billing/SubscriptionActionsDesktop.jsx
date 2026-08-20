// ============================================
// VELTRONIK - SECCIÓN DE SUSCRIPCIÓN (variante ESCRITORIO)
// ============================================
// La gemela de SubscriptionActionsWeb.jsx, y la diferencia no es de estilo: acá NO hay
// un solo número de plata.
//
// Sin monto mensual, sin próximo cobro, sin estado de cobro, sin formulario de tarjeta.
// Solo dónde se gestiona.
//
// POR QUÉ
// Esta pantalla vive en una computadora de mostrador. La facturación del dueño no tiene
// por qué estar a la vista de cualquiera que pase por atrás — y con el rol de admin la
// veía también un encargado, que es un empleado: le estaríamos mostrando cuánto paga su
// jefe por el sistema.
//
// Es la misma línea que trazamos con el resto: lo que es relación dueño↔Veltronik va al
// portal, lo que es operación del gimnasio queda acá.
//
// "Verificar Estado con MP" SÍ se queda: no es un cobro ni muestra plata, es una
// sincronización. Es justo lo que sirve cuando el dueño pagó en el navegador y quiere que
// esta máquina se entere sin esperar al webhook.
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
    <div className="settings-section">
      <h2 className="settings-section-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Icon name="creditCard" size="1.1em" /> Suscripción
      </h2>

      <p style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-sm)', marginBottom: '1rem', lineHeight: 1.6 }}>
        El plan, el medio de pago y los comprobantes se gestionan en el portal web, desde el
        navegador. No se muestran acá para que no queden a la vista en una computadora de
        mostrador.
      </p>

      <div className="subscription-actions" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <button
          className="btn btn-secondary"
          onClick={handleOpenPortal}
          style={{ flex: '1', minWidth: '200px' }}
        >
          <Icon name="globe" size="1em" /> Abrir el portal
        </button>
        <button
          className="btn btn-ghost"
          onClick={onVerify}
          disabled={verifying}
          style={{ flex: '1', minWidth: '200px' }}
        >
          {verifying ? (<><span className="spinner" /> Verificando...</>) : ('Verificar Estado con MP')}
        </button>
      </div>

      <p style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-xs)', marginTop: '0.75rem', lineHeight: 1.5 }}>
        Si ya pagaste y esta máquina todavía no lo refleja, usá "Verificar Estado con MP" para
        sincronizar. No muestra ni cobra nada: solo vuelve a preguntar.
      </p>

      {failed && (
        <p style={{ color: '#fbbf24', fontSize: 'var(--font-size-xs)', marginTop: '0.5rem', wordBreak: 'break-all' }}>
          No pudimos abrir el navegador desde acá. Entrá a mano a {portalUrl(PORTAL_BILLING_PATH)}
        </p>
      )}
    </div>
  );
}
