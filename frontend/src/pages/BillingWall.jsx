// ============================================
// VELTRONIK - MURO DE COBRO DE LA APP DE ESCRITORIO (Fase 4)
// ============================================
// El reemplazo de BlockedPage/PlansPage en el escritorio. La diferencia no es de estilo:
// acá NO se cobra. Ni formulario de tarjeta, ni SDK de Mercado Pago, ni una navegación
// que saque la app de su pantalla. Solo un puente al portal web.
//
// DOS RAZONES, Y LA SEGUNDA PESA MÁS QUE LA PRIMERA:
//
// 1. Técnica — el checkout adentro de Electron estaba roto de origen. El Card Brick
//    pedía el número de tarjeta dentro de un .exe sin firmar, y el link de MP hacía
//    `window.location.href`, o sea llevaba la ventana de la app a Mercado Pago; MP
//    devolvía al cliente a la URL web y la app nunca se enteraba del pago. El cliente
//    reintentaba, y cada reintento sumaba un rechazo más en MP.
//
// 2. De producto — quien está parado frente a esta máquina a las 7 de la mañana es la
//    recepcionista, no el dueño. Ponerle un checkout adelante es apuntarle a la persona
//    equivocada. Por eso el texto cambia según el rol: al dueño se le ofrece pagar, al
//    empleado se le dice a quién avisar.
// ============================================

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { useAuth } from '../contexts/AuthContext';
import { openPortal, portalUrl } from '../lib/portal';
import CONFIG from '../lib/config';
import Icon from '../components/Icon';
import { useMonthlyPriceLabel } from '../hooks/useMonthlyPrice';

/** Ruta del portal a la que se manda para pagar. */
const PORTAL_BILLING_PATH = '/#/plans';

export default function BillingWall() {
  const { logout, orgName, orgRole } = useAuth();
  const navigate = useNavigate();
  const [opened, setOpened] = useState(false);
  const [failed, setFailed] = useState(false);
  const precio = useMonthlyPriceLabel(); // el monto real del backend, no el del build

  // El rol puede no estar en el contexto todavía (el muro se puede pintar antes de que
  // termine de resolverse la sesión); el localStorage lo escribe el Lobby al entrar.
  const role = orgRole || localStorage.getItem('current_org_role') || 'owner';
  const canPay = role === 'owner' || role === 'admin';

  const branch = orgName || localStorage.getItem('current_org_name') || 'Esta sucursal';
  const url = portalUrl(PORTAL_BILLING_PATH);

  const handleOpenPortal = async () => {
    const ok = await openPortal(PORTAL_BILLING_PATH);
    setOpened(ok);
    setFailed(!ok);
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', background: '#0a0a0a', color: '#fff', textAlign: 'center', padding: '2rem',
      fontFamily: "'Inter', sans-serif",
    }}>
      <div style={{
        background: 'rgba(255, 255, 255, 0.03)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        backdropFilter: 'blur(10px)',
        padding: '2.5rem',
        borderRadius: '24px',
        maxWidth: '520px',
        width: '100%',
        boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
      }}>
        <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'center', color: 'var(--primary-400)' }}>
          <Icon name="lock" size="3rem" />
        </div>

        {/* Qué sucursal es: en una máquina de mostrador no se da por obvio. */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
          background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: '999px', padding: '0.35rem 0.9rem', marginBottom: '1rem',
          fontSize: '0.85rem', color: '#d1d5db',
        }}>
          <Icon name="building" size="0.95em" />
          <span>{branch}</span>
        </div>

        <h1 style={{
          fontSize: '1.6rem', fontWeight: '800', marginBottom: '0.75rem',
          background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        }}>
          {canPay ? 'Renová la suscripción' : 'Esta sucursal necesita renovar'}
        </h1>

        <p style={{ color: '#d1d5db', marginBottom: '1.5rem', lineHeight: '1.6', fontSize: '0.98rem' }}>
          {canPay ? (
            <>
              El cobro se hace desde el portal web, en tu navegador — más seguro y con todos
              los medios de pago. Son <b style={{ color: '#fff' }}>${precio} ARS</b> por
              mes. Tus socios, cuotas y accesos quedan intactos mientras tanto.
            </>
          ) : (
            <>
              Avisale al dueño para que la renueve desde el portal. Los datos del gimnasio
              están seguros y no se borran.
            </>
          )}
        </p>

        {canPay && (
          <button
            onClick={handleOpenPortal}
            style={{
              background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)', color: '#fff',
              padding: '0.95rem', borderRadius: '12px', border: 'none', cursor: 'pointer',
              width: '100%', fontSize: '0.98rem', fontWeight: 600,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
            }}
          >
            <Icon name="creditCard" size="1.1em" /> Abrir el portal de pago
          </button>
        )}

        {/* Plan B de verdad: si el navegador no abrió —o si esta máquina directamente no
            tiene uno a mano— la dirección tiene que poder leerse y escanearse. Sin esto,
            un fallo de shell.openExternal deja al dueño sin ningún camino. */}
        {(opened || failed || !canPay) && (
          <div style={{
            marginTop: '1.25rem', padding: '1.1rem',
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '16px',
          }}>
            <p style={{ color: failed ? '#fbbf24' : '#9ca3af', fontSize: '0.88rem', marginBottom: '0.85rem', lineHeight: 1.5 }}>
              {failed
                ? 'No pudimos abrir el navegador desde acá. Entrá a mano o escaneá el código con el celular:'
                : opened
                  ? 'Abrimos tu navegador. Si no apareció, entrá a mano o escaneá el código:'
                  : 'El dueño puede renovar desde acá:'}
            </p>

            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.85rem' }}>
              <div style={{ background: '#fff', padding: '0.6rem', borderRadius: '12px', lineHeight: 0 }}>
                <QRCodeSVG value={url} size={132} level="M" />
              </div>
            </div>

            <code style={{
              display: 'block', wordBreak: 'break-all', color: '#e5e7eb',
              fontSize: '0.8rem', background: 'rgba(0,0,0,0.35)',
              padding: '0.6rem 0.75rem', borderRadius: '8px',
            }}>
              {url}
            </code>
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
          {/* Cierra el círculo sin deep links: el dueño paga en el navegador, vuelve acá
              y toca esto. El Lobby recarga el estado de cobro y, si el pago entró, deja pasar. */}
          <button
            onClick={() => navigate(CONFIG.ROUTES.LOBBY)}
            style={{
              flex: 1, background: 'rgba(255,255,255,0.08)', color: '#fff', padding: '0.85rem',
              borderRadius: '12px', border: '1px solid rgba(255,255,255,0.15)', cursor: 'pointer', fontSize: '0.9rem',
            }}
          >
            Ya pagué (reintentar)
          </button>
          <button
            onClick={logout}
            style={{
              flex: 1, background: 'transparent', color: '#9ca3af', padding: '0.85rem',
              borderRadius: '12px', border: '1px solid #374151', cursor: 'pointer', fontSize: '0.9rem',
            }}
          >
            Cerrar sesión
          </button>
        </div>

        <div style={{ marginTop: '1.25rem', color: '#6b7280', fontSize: '0.82rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}>
          <Icon name="lock" size="0.95em" /> Tus datos están seguros y no serán eliminados
        </div>
      </div>
    </div>
  );
}
