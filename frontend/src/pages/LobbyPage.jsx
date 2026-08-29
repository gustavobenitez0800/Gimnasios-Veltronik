// ============================================
// VELTRONIK - LOBBY (selector de sucursal)
// ============================================
// La puerta de entrada: el dueño elige a cuál de sus gimnasios entrar. Cada card
// muestra el estado de cobro de ESA sucursal (activa, en prueba, en gracia, vencida),
// que se calcula acá y lo vuelve a validar el backend en cada request.
// Una sucursal bloqueada no navega: abre el muro de pago sin salir de esta pantalla.
// ============================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { gymService } from '../services';
import { groupService } from '../services/GroupService';
import UpdateIndicator from '../components/UpdateIndicator';
import { getInitials } from '../lib/utils';
import { computeAccess } from '../lib/access';
import { roleLabel } from '../lib/gym';
import { useVisualViewport, useMonthlyPrice } from '../hooks';
import { accountService } from '../services/AccountService';
import CuentaEnBorrado from '../components/CuentaEnBorrado';
import Icon from '../components/Icon';
import GymLogo from '../components/GymLogo';
import logoSrc from '../assets/LogotipoSecundario.png';
import CONFIG from '../lib/config';
import { openPortal } from '../lib/portal';
import { apiCall } from '../lib/api';
import apiClient from '../lib/apiClient';

// ¿Es un dispositivo táctil? Decide si el campo de confirmación se enfoca solo:
// en escritorio ahorra un click, en un teléfono abre el teclado a destiempo.
const IS_TOUCH = typeof window !== 'undefined'
  && window.matchMedia?.('(hover: none), (pointer: coarse)').matches;

// ─── Block reason messages ───

const BLOCK_MESSAGES = {
  expired: {
    title: 'Renová tu suscripción',
    message: 'Tu período mensual finalizó. Reactivá tu suscripción para seguir gestionando tu gimnasio sin interrupciones. Tu información permanece intacta.',
    showUpdateCard: false,
  },
  past_due: {
    title: 'Pago Rechazado',
    message: 'No pudimos procesar tu pago mensual. Actualizá tu método de pago para recuperar el acceso.',
    showUpdateCard: true,
  },
  canceled: {
    title: 'Suscripción Cancelada',
    message: 'Tu suscripción fue cancelada. Tus datos están seguros y no serán eliminados. Reactivá tu suscripción para continuar.',
    showUpdateCard: false,
  },
  trial_expired: {
    title: 'Prueba Gratuita Finalizada',
    message: 'Tu período de prueba de 14 días ha finalizado. Tus datos están seguros. Suscribite para seguir usando Veltronik.',
    showUpdateCard: false,
  },
  additional_branch: {
    title: 'Activá esta sucursal',
    message: 'Las sucursales adicionales no incluyen período de prueba. Activá tu suscripción para empezar a usar esta sucursal — se cobra el mismo precio mensual por cada una.',
    showUpdateCard: false,
  },
  no_subscription: {
    title: 'Acceso Suspendido',
    message: 'Este sistema necesita una suscripción activa para funcionar. Suscribite para activar el acceso.',
    showUpdateCard: false,
  },
};

// ============================================
// LOBBY PAGE COMPONENT
// ============================================

export default function LobbyPage() {
  const precioMensual = useMonthlyPrice(); // el que cobra el backend, no el horneado en el build
  const [borradoPendiente, setBorradoPendiente] = useState(null);

  // Se pregunta en cada entrada al Lobby. Falla en silencio: si el backend no contesta, el
  // Lobby se comporta como siempre. Un problema de red no puede hacer aparecer —ni
  // desaparecer— una pantalla de borrado de cuenta.
  useEffect(() => {
    let vigente = true;
    accountService.getDeletionStatus()
      .then((e) => { if (vigente) setBorradoPendiente(e); })
      .catch(() => {});
    return () => { vigente = false; };
  }, []);
  const { profile, logout, refreshOrgContext } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [orgs, setOrgs] = useState([]);
  const [orgStatuses, setOrgStatuses] = useState({});
  const [groups, setGroups] = useState([]); // Grupos de sucursales del dueño
  const [loading, setLoading] = useState(true);
  const [blockedOrg, setBlockedOrg] = useState(null); // For blocked modal
  const [updatingPayment, setUpdatingPayment] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null); // For delete confirmation
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [deleting, setDeleting] = useState(false);

  const userName = profile?.fullName || 'Usuario';
  const initials = getInitials(userName);

  // El spinner de pantalla completa solo corresponde a la PRIMERA carga; los refrescos
  // (focus, polling del muro de pago) actualizan en silencio sin parpadear la grilla.
  const hasLoadedOnceRef = useRef(false);

  // ─── Load all organizations + their subscription statuses ───
  const loadOrgs = useCallback(async () => {
    try {
      if (!hasLoadedOnceRef.current) setLoading(true);
      const data = await gymService.getUserGyms();
      // Filtrar duplicados en caso de errores en la DB
      const orgsList = Array.from(new Map((data || []).map(org => [org.id, org])).values());
      setOrgs(orgsList);
      // Mostrar las cards YA: los estados de pago y los grupos llegan en background.
      // Antes la pantalla quedaba en "Cargando negocios..." hasta terminar TODO
      // (negocios → grupos → 1 request de suscripción POR negocio, en serie).
      hasLoadedOnceRef.current = true;
      setLoading(false);

      // Grupos del dueño (para organizar el lobby), en paralelo. Best-effort.
      const groupsPromise = groupService.getMyGroups()
        .then(g => setGroups(g || []))
        .catch(() => setGroups([]));

      if (orgsList.length > 0) {
        // 1 sola request batch con TODAS las suscripciones del usuario. Si el backend
        // aún no tiene el endpoint (deploy desfasado), cae al método viejo por-negocio.
        let allSubsRaw;
        try {
          const res = await apiClient.get('/tenants/my/subscriptions');
          allSubsRaw = res.data || [];
        } catch {
          const subPromises = orgsList.map(org =>
            apiClient.get(`/tenants/${org.id}/subscription`, {
              // X-Tenant-ID explícito = la org que se está consultando (no la del localStorage).
              // Alinea el chequeo IDOR del backend Y el filtro de Hibernate sobre Subscription.
              headers: { 'X-Tenant-ID': org.id }
            })
              .then(res => res.data)
              .catch(() => null)
          );
          allSubsRaw = await Promise.all(subPromises);
        }
        const allSubs = (allSubsRaw || []).filter(sub => sub !== null && sub !== "");

        // Build a map: orgId → best subscription (active > latest)
        const subMap = {};
        for (const sub of allSubs) {
          const existing = subMap[sub.tenantId || sub.gym_id];
          if (!existing) {
            subMap[sub.tenantId || sub.gym_id] = sub;
          } else if (sub.status === 'active' && existing.status !== 'active') {
            subMap[sub.tenantId || sub.gym_id] = sub;
          }
        }

        // Compute access status for each org
        const statuses = {};
        for (const org of orgsList) {
          const sub = subMap[org.id] || null;
          statuses[org.id] = computeAccess(org, sub);
        }
        setOrgStatuses(statuses);
      } else {
        setOrgStatuses({});
      }

      await groupsPromise;
    } catch (err) {
      console.error('Error loading orgs:', err);
      showToast('Error al cargar tus gimnasios', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { loadOrgs(); }, [loadOrgs]);

  // Auto-refresh al volver a la app (ej: tras pagar en Mercado Pago): re-chequea el estado de
  // cobro para que un pago recién acreditado desbloquee SOLO, sin que el cliente tenga que
  // cerrar y reabrir la app (era el síntoma: pagaba, se acreditaba en el backend, pero la
  // pantalla seguía mostrando "Pago Rechazado").
  useEffect(() => {
    const refresh = () => { if (!document.hidden) loadOrgs(); };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [loadOrgs]);

  // Si el negocio que estaba bloqueado pasó a tener acceso (se acreditó el pago), cerrar el muro.
  useEffect(() => {
    if (blockedOrg && orgStatuses[blockedOrg.id]?.canAccess) setBlockedOrg(null);
  }, [orgStatuses, blockedOrg]);

  // Mientras el muro de pago está abierto, re-chequear cada 8s: si el pago se acredita
  // (webhook) mientras el cliente espera, el muro se cierra solo (efecto de arriba).
  useEffect(() => {
    if (!blockedOrg) return;
    const t = setInterval(() => { if (!document.hidden) loadOrgs(); }, 8000);
    return () => clearInterval(t);
  }, [blockedOrg, loadOrgs]);

  /**
   * Deja la sucursal `org` como la ACTIVA antes de navegar a ningún lado.
   *
   * Todo lo que sale de la app (incluido el cobro) viaja con el header X-Tenant-ID, que el
   * apiClient lee de `current_org_id`. Cualquier camino que navegue sin pasar por acá le
   * cobra a la sucursal equivocada: era exactamente lo que pasaba con los botones del muro
   * de pago, que llamaban a refreshOrgContext() sin esperarlo y se iban.
   */
  const selectOrgContext = (org) => {
    const role = org.role || 'owner';
    localStorage.setItem('current_org_id', org.id);
    localStorage.setItem('current_org_role', role);
    localStorage.setItem('current_org_name', org.name);
    return { role };
  };

  // ─── Handle org selection ───
  const handleSelectOrg = async (org) => {
    const accessStatus = orgStatuses[org.id];
    const { role } = selectOrgContext(org);

    // Landing por rol: el Dashboard (KPIs financieros) es OWNER/ADMIN en el backend;
    // staff/reception aterrizan en Acceso (su pantalla de trabajo real).
    const landingRoute = (role === 'owner' || role === 'admin')
      ? CONFIG.ROUTES.DASHBOARD
      : CONFIG.ROUTES.ACCESS;

    // Acceso válido O estado aún verificándose → navegar YA (optimista). Si el negocio
    // estuviera bloqueado, el KillSwitch del backend responde 402 y la app redirige a
    // BLOCKED igual — la velocidad no compromete el cobro. El contexto se refresca en
    // background sin frenar el click.
    if (!accessStatus || accessStatus.canAccess) {
      navigate(landingRoute);
      refreshOrgContext(org.id); // non-blocking — loads in background
      return;
    }

    // If blocked → show modal (don't navigate)
    setBlockedOrg({ ...org, accessStatus });
  };

  // ─── Handle reactivation ───
  // Fija la sucursal a cobrar ANTES de ir a Planes: el pago se hace contra el tenant que
  // el backend lee del header, no contra el que el usuario tiene en la cabeza. Antes esto
  // navegaba sin esperar el refresh, y la suscripción se creaba para otra sucursal.
  const handleReactivate = async () => {
    if (!blockedOrg) return;
    selectOrgContext(blockedOrg);
    setBlockedOrg(null);
    await refreshOrgContext(blockedOrg.id);
    navigate(CONFIG.ROUTES.PLANS);
  };

  // ─── Handle update payment method ───
  const handleUpdatePaymentMethod = async () => {
    if (!blockedOrg) return;

    // En el escritorio la tarjeta no se toca acá (Fase 4): el checkout de Mercado Pago
    // vive en el portal. Se fija la sucursal igual —para que el portal abra sobre la
    // correcta— y se manda al navegador. Ni siquiera se llama al backend: el init_point
    // que devolvía solo servía para navegar la ventana, que es justo lo que ya no se hace.
    if (CONFIG.IS_DESKTOP) {
      selectOrgContext(blockedOrg);
      setBlockedOrg(null);
      const ok = await openPortal('/#/lobby');
      showToast(
        ok ? 'Abrimos el portal en tu navegador para cambiar la tarjeta.'
           : 'No pudimos abrir el navegador. Entrá al portal desde otro dispositivo.',
        ok ? 'info' : 'error',
      );
      return;
    }

    const gymId = blockedOrg.id;
    // El email del pagador es el de la cuenta. (Acá había un try/catch que se asignaba
    // a sí mismo el mismo valor, con un comentario que decía "stubbed": ceremonia vacía.)
    const payerEmail = profile?.email;

    if (!gymId || !payerEmail) {
      showToast('No se encontraron los datos necesarios', 'error');
      return;
    }

    setUpdatingPayment(true);
    try {
      // La sucursal a la que se le cambia la tarjeta la resuelve el BACKEND desde el
      // header X-Tenant-ID (el body es informativo), así que hay que fijarla primero.
      selectOrgContext(blockedOrg);

      const { ok, data: result } = await apiCall('/update-payment-method', {
        gym_id: gymId,
        payer_email: payerEmail,
      });

      if (!ok) {
        throw new Error(result.error || 'Error al actualizar método de pago');
      }

      const checkoutUrl = CONFIG.DEBUG
        ? (result.data?.sandbox_init_point || result.data?.init_point)
        : (result.data?.init_point || result.data?.sandbox_init_point);

      if (checkoutUrl) {
        showToast('Redirigiendo a Mercado Pago...', 'info');
        setTimeout(() => { window.location.href = checkoutUrl; }, 800);
      } else {
        throw new Error('No se obtuvo URL de checkout');
      }
    } catch (error) {
      showToast(error.message || 'Error al actualizar método de pago', 'error');
    } finally {
      setUpdatingPayment(false);
    }
  };

  // ─── Eliminar un gimnasio ───

  // Mientras el diálogo está abierto seguimos el área visible: con el teclado abierto,
  // `100dvh` miente y el campo queda debajo de las teclas.
  useVisualViewport(!!deleteTarget);

  const closeDeleteModal = useCallback(() => {
    // No se puede cerrar en medio del borrado: el DELETE ya salió y cerrar la ventana
    // solo lograba que el dueño no viera si terminó bien.
    if (deleting) return;
    setDeleteTarget(null);
    setDeleteConfirmName('');
  }, [deleting]);

  // Comparación tolerante a mayúsculas y a espacios de más (el nombre se copia a mano
  // desde la etiqueta de arriba, y un espacio final invisible bloqueaba el botón sin
  // que hubiera forma de darse cuenta).
  const nameMatches = !!deleteTarget
    && deleteConfirmName.trim().toLowerCase() === deleteTarget.name.trim().toLowerCase();

  const handleDeleteOrg = async () => {
    if (!deleteTarget || deleting) return;
    if (!nameMatches) {
      showToast('El nombre no coincide. Escribí el nombre exacto del gimnasio para confirmar.', 'error');
      return;
    }

    const { id, name } = deleteTarget;
    setDeleting(true);
    try {
      await gymService.deleteOrg(id);
      // El estado se limpia ANTES de recargar: si no, la lista vuelve mientras el
      // diálogo sigue en pantalla apuntando a un gimnasio que ya no existe.
      setDeleteTarget(null);
      setDeleteConfirmName('');
      showToast(`"${name}" eliminado correctamente`, 'success');
      await loadOrgs();
    } catch (error) {
      // El backend contesta 403 si no sos el dueño y 404 si ya no está; en los dos
      // casos el mensaje crudo no le dice nada a nadie.
      const status = error?.response?.status;
      const msg = status === 403
        ? 'Solo el dueño del gimnasio puede eliminarlo.'
        : status === 404
          ? 'Ese gimnasio ya no existe.'
          : (error?.response?.data?.message || error.message || 'No pudimos eliminar el gimnasio. Probá de nuevo.');
      showToast(msg, 'error');
      if (status === 404) { setDeleteTarget(null); setDeleteConfirmName(''); await loadOrgs(); }
    } finally {
      setDeleting(false);
    }
  };

  // ─── Render de una card de negocio (extraído para poder agrupar) ───
  const renderOrgCard = (org) => {
    const price = precioMensual;
    const accessStatus = orgStatuses[org.id];
    const isBlocked = accessStatus && !accessStatus.canAccess;

    return (
      <button
        key={org.id}
        className={`lobby-card card-hover ${isBlocked ? 'lobby-card-blocked' : ''}`}
        onClick={() => handleSelectOrg(org)}
      >
        {/* Delete button (owner only) */}
        {org.role === 'owner' && (
          <button
            className="lobby-card-delete"
            title="Eliminar gimnasio"
            onClick={(e) => {
              e.stopPropagation();
              setDeleteTarget(org);
              setDeleteConfirmName('');
            }}
          >
            <Icon name="trash" size="0.9em" />
          </button>
        )}

        {/* Blocked overlay */}
        {isBlocked && (
          <div className="lobby-card-blocked-overlay">
            <span className="lobby-card-lock"><Icon name="lock" size="1.2em" /></span>
          </div>
        )}

        {/* La marca DEL GIMNASIO, no la de Veltronik: la imagen que subió el dueño,
            el emoji que eligió, o la inicial de su nombre. */}
        <div className="lobby-card-logo">
          <GymLogo logoUrl={org.logoUrl} logoEmoji={org.logoEmoji} name={org.name} size={72} />
        </div>
        <h3 className="lobby-card-name">{org.name}</h3>
        <p className="lobby-card-role">
          {roleLabel(org.role)}
        </p>

        {/* Status indicator (chip neutro mientras se verifica el estado de pago) */}
        {accessStatus ? (
          <div
            className="lobby-card-status"
            style={{
              background: `${accessStatus.color}18`,
              color: accessStatus.color,
              borderColor: `${accessStatus.color}30`,
            }}
          >
            <Icon name={accessStatus.icon} size="0.95em" />
            <span>{accessStatus.label}</span>
          </div>
        ) : (
          <div
            className="lobby-card-status"
            style={{
              background: 'rgba(148, 163, 184, 0.12)',
              color: '#94a3b8',
              borderColor: 'rgba(148, 163, 184, 0.25)',
            }}
          >
            <span className="spinner" style={{ width: '0.85em', height: '0.85em' }} />
            <span>Verificando…</span>
          </div>
        )}

        {/* Price — only show when not in active trial */}
        {accessStatus?.status !== 'trial' && (
          <div className="lobby-card-price">
            ${price.toLocaleString('es-AR')}/mes
          </div>
        )}
      </button>
    );
  };

  // Agrupa las orgs por groupId. Las sin grupo van a una sección "Sin grupo".
  // Si no hay grupos definidos, todo cae en una sola sección sin encabezado
  // → el lobby se ve EXACTAMENTE como antes (comportamiento por defecto seguro).
  const orgsByGroup = (() => {
    const map = new Map(); // groupId|null → [orgs]
    for (const org of orgs) {
      const key = org.groupId || null;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(org);
    }
    return map;
  })();
  const hasGroups = groups.length > 0;

  // La card de alta cierra las dos vistas (agrupada y plana).
  // El texto cambia según si es su PRIMER gimnasio o una sucursal más: a alguien que
  // ya tiene tres locales decirle "Registrá tu Gimnasio" le suena a empezar de cero.
  const isFirstGym = orgs.length === 0;

  // El resumen cross-sucursal solo tiene sentido con dos o más gimnasios PROPIOS: suma lo
  // que es del dueño, no los locales donde alguien trabaja como empleado.
  const puedeVerResumen = !CONFIG.IS_DESKTOP
    && orgs.filter((o) => o.role === 'owner').length >= 2;

  // Dar de alta un gimnasio es trámite de cuenta, no operación: vive en el portal (Fase 4).
  // En el escritorio la card abre el navegador en vez de navegar a una pantalla que ese
  // bundle ya no tiene, y el subtítulo lo dice para que nadie se sorprenda del salto.
  const handleCreateOrg = () => {
    if (CONFIG.IS_DESKTOP) {
      openPortal('/#/onboarding').then((ok) => {
        if (!ok) showToast('No pudimos abrir el navegador. Entrá al portal de Veltronik para dar de alta el gimnasio.', 'error');
      });
      return;
    }
    navigate(CONFIG.ROUTES.ONBOARDING);
  };

  const createOrgCard = (
    <button
      className="lobby-card lobby-card-create card-hover"
      onClick={handleCreateOrg}
    >
      <div className="lobby-card-icon create-icon">
        <Icon name={CONFIG.IS_DESKTOP ? 'globe' : 'plus'} size="2rem" />
      </div>
      <h3 className="lobby-card-name">{isFirstGym ? 'Registrá tu Gimnasio' : 'Nueva sucursal'}</h3>
      <p className="lobby-card-role">
        {CONFIG.IS_DESKTOP
          ? 'Se abre en tu navegador'
          : (isFirstGym ? 'Empezá tus 14 días gratis' : 'Sumá otro local a tu cuenta')}
      </p>
    </button>
  );

  // ─── Cuenta pidiendo borrarse ───
  // El Lobby es por donde pasa todo el mundo al entrar, y con la cuenta marcada para borrar
  // TODOS sus gimnasios quedan cerrados: no puede ir a ningún otro lado. Así que este es el
  // lugar donde tiene que aparecer la puerta para arrepentirse.
  //
  // Se muestra en vez del Lobby, no encima: con todas las sucursales bloqueadas, la lista de
  // cards no ofrece nada que hacer y solo confundiría.
  if (borradoPendiente?.pendiente) {
    return <CuentaEnBorrado estado={borradoPendiente} onCancelado={() => window.location.reload()} />;
  }

  // ─── Render ───
  return (
    <div className="lobby-wrapper">
      {/* ─── Liquid Glass Background ─── */}
      <div className="liquid-bg">
        <div className="liquid-orb liquid-orb-1"></div>
        <div className="liquid-orb liquid-orb-2"></div>
        <div className="liquid-orb liquid-orb-3"></div>
      </div>

      <div className="lobby-container">
        {/* Header */}
        <div className="lobby-header">
          <div className="lobby-user">
            <img src={logoSrc} alt="Veltronik" className="lobby-logo" />
            <div className="lobby-user-info">
              <div className="lobby-avatar">{initials}</div>
              <div>
                <h2 className="lobby-user-name">{userName}</h2>
                <p className="lobby-user-email">{profile?.email || ''}</p>
              </div>
            </div>
          </div>
          <div className="lobby-header-actions">
            {/* Resumen de todas las sucursales. Aparece solo con DOS o más propias: con
                una sola no suma nada que el Dashboard de esa sucursal no muestre ya, y
                sería un botón que lleva a una tabla de una fila. */}
            {puedeVerResumen && (
              <button
                className="btn lobby-logout-btn"
                onClick={() => navigate(CONFIG.ROUTES.OWNER_INSIGHTS)}
                title="Ver el total de todas tus sucursales"
              >
                <Icon name="chart" /> <span>Resumen</span>
              </button>
            )}
            {/* Salir dejó de ser un `btn-ghost` (transparente + gris): sobre el fondo
                oscuro del lobby y sin hover —en un teléfono no hay hover— se leía como
                texto decorativo. Ahora es un botón con borde propio. */}
            <button className="btn lobby-logout-btn" onClick={logout} title="Cerrar sesión">
              <Icon name="logout" /> <span>Salir</span>
            </button>
          </div>
        </div>

        {/* Title */}
        <div className="lobby-title-section">
          <h1 className="lobby-title">Mis Gimnasios</h1>
          <p className="lobby-subtitle">Elegí una sucursal para entrar al sistema</p>
        </div>

        {/* Loading */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '3rem' }}>
            <span className="spinner" /> Cargando tus gimnasios...
          </div>
        ) : hasGroups ? (
          /* Vista AGRUPADA: una sección por grupo + "Sin grupo" + crear */
          <>
            {groups.map((g) => {
              const groupOrgs = orgsByGroup.get(g.id) || [];
              if (groupOrgs.length === 0) return null;
              return (
                <div key={g.id} className="lobby-group">
                  <h2 className="lobby-group-title" style={g.color ? { borderColor: g.color } : undefined}>
                    {g.name} <span className="lobby-group-count">{groupOrgs.length}</span>
                  </h2>
                  <div className="lobby-grid">
                    {groupOrgs.map(renderOrgCard)}
                  </div>
                </div>
              );
            })}
            {(orgsByGroup.get(null) || []).length > 0 && (
              <div className="lobby-group">
                <h2 className="lobby-group-title">Sin grupo <span className="lobby-group-count">{(orgsByGroup.get(null) || []).length}</span></h2>
                <div className="lobby-grid">
                  {(orgsByGroup.get(null) || []).map(renderOrgCard)}
                </div>
              </div>
            )}
            <div className="lobby-grid">{createOrgCard}</div>
          </>
        ) : (
          /* Vista PLANA (sin grupos definidos): idéntica al comportamiento anterior */
          <div className="lobby-grid">
            {orgs.map(renderOrgCard)}
            {createOrgCard}
          </div>
        )}
      </div>

      {/* ─── BLOCKED ORG MODAL ─── */}
      {blockedOrg && (
        <div className="lobby-blocked-overlay" onClick={() => setBlockedOrg(null)}>
          <div className="lobby-blocked-modal" onClick={(e) => e.stopPropagation()}>
            {/* Close button */}
            <button className="lobby-blocked-close" onClick={() => setBlockedOrg(null)}>
              ✕
            </button>

            {/* Icon */}
            <div className="lobby-blocked-icon" style={{ color: blockedOrg.accessStatus?.color }}>
              <Icon name={blockedOrg.accessStatus?.icon || 'lock'} size="1em" />
            </div>

            {/* Org name */}
            <div className="lobby-blocked-org-badge">
              <GymLogo logoUrl={blockedOrg.logoUrl} logoEmoji={blockedOrg.logoEmoji} name={blockedOrg.name} size={22} />
              <span>{blockedOrg.name}</span>
            </div>

            {/* Title & message */}
            <h2 className="lobby-blocked-title">
              {BLOCK_MESSAGES[blockedOrg.accessStatus?.blockReason]?.title || 'Acceso Suspendido'}
            </h2>
            <p className="lobby-blocked-message">
              {BLOCK_MESSAGES[blockedOrg.accessStatus?.blockReason]?.message || 'Necesitás una suscripción activa para acceder a este sistema.'}
            </p>

            {/* Grace period bar (if past_due with sub) — DTO camelCase + fallback snake */}
            {(blockedOrg.accessStatus?.sub?.gracePeriodEndsAt ?? blockedOrg.accessStatus?.sub?.grace_period_ends_at) && (
              <div className="lobby-blocked-grace">
                <div className="lobby-blocked-grace-header">
                  <span>Período de gracia</span>
                  <span style={{ color: '#ef4444' }}>Expirado</span>
                </div>
                <div className="lobby-blocked-grace-track">
                  <div className="lobby-blocked-grace-fill" style={{ width: '100%' }} />
                </div>
              </div>
            )}

            {/* Price info */}
            <div className="lobby-blocked-price-info">
              <span>Precio del sistema:</span>
              <strong>${precioMensual.toLocaleString('es-AR')}/mes</strong>
            </div>

            {/* Actions */}
            <div className="lobby-blocked-actions">
              <button className="btn btn-primary lobby-blocked-btn-main" onClick={handleReactivate}>
                <Icon name="creditCard" size="1.1em" /> {blockedOrg.accessStatus?.blockReason === 'additional_branch' ? 'Activar Suscripción' : 'Reactivar Suscripción'}
              </button>

              {BLOCK_MESSAGES[blockedOrg.accessStatus?.blockReason]?.showUpdateCard && (
                <button
                  className="btn btn-secondary"
                  style={{ width: '100%' }}
                  onClick={handleUpdatePaymentMethod}
                  disabled={updatingPayment}
                >
                  {updatingPayment ? (
                    <><span className="spinner" /> Procesando...</>
                  ) : (
                    <><Icon name="rotateCw" size="1.1em" /> Cambiar Método de Pago</>
                  )}
                </button>
              )}

              <button className="btn btn-ghost" style={{ width: '100%' }} onClick={() => setBlockedOrg(null)}>
                <Icon name="chevronLeft" size="1.1em" /> Volver al Lobby
              </button>
            </div>

            {/* Data safety */}
            <div className="lobby-blocked-safety">
              <Icon name="lock" size="1em" /> Tus datos están seguros y no serán eliminados
            </div>
          </div>
        </div>
      )}

      {/* ─── ELIMINAR GIMNASIO ───
          Este diálogo NO es un bottom sheet como el resto de los modales de la app, y
          es a propósito: es el único que pide TECLADO. Una hoja pegada abajo con el
          teclado abierto deja el campo y el botón "Eliminar" fuera de la pantalla, y
          desde afuera parece que el borrado está roto cuando lo que está roto es que
          no llegás a tocarlo.
          Se dibuja centrado sobre el área REALMENTE visible (ver useVisualViewport):
          se abre el teclado, el diálogo se reacomoda solo y el campo queda a mano. */}
      {deleteTarget && (
        <div className="lobby-delete-overlay" onClick={closeDeleteModal}>
          <div className="lobby-blocked-modal lobby-delete-modal" onClick={(e) => e.stopPropagation()}>
            <button className="lobby-blocked-close" onClick={closeDeleteModal} aria-label="Cerrar">
              <Icon name="x" size="1em" />
            </button>

            <div className="lobby-blocked-icon" style={{ color: '#ef4444' }}>
              <Icon name="alertTriangle" size="2rem" />
            </div>

            <h2 className="lobby-blocked-title" style={{ color: '#ef4444' }}>Eliminar Gimnasio</h2>
            <p className="lobby-blocked-message">
              Estás a punto de eliminar <strong>"{deleteTarget.name}"</strong> y <strong>todos sus datos</strong>: socios, pagos, accesos, equipo y suscripciones. Esta acción es <strong>irreversible</strong>.
            </p>

            <div className="lobby-delete-confirm">
              {/* label + htmlFor: en un teléfono tocar el texto también abre el teclado,
                  así el objetivo táctil deja de ser solo la cajita. */}
              <label className="form-label lobby-delete-label" htmlFor="delete-confirm-name">
                Escribí <strong style={{ color: '#ef4444' }}>{deleteTarget.name}</strong> para confirmar:
              </label>
              <input
                id="delete-confirm-name"
                type="text"
                className="form-input"
                placeholder={deleteTarget.name}
                value={deleteConfirmName}
                onChange={(e) => setDeleteConfirmName(e.target.value)}
                style={{ borderColor: nameMatches ? '#ef4444' : undefined }}
                // Nada de autocorrección: acá se copia un nombre propio letra por letra
                // y el corrector del teléfono lo "arreglaba" hasta que no coincidía nunca.
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck="false"
                enterKeyHint="done"
                // autoFocus SOLO con teclado físico. En un celular abría el teclado
                // encima del diálogo que todavía se estaba animando.
                autoFocus={!IS_TOUCH}
              />
            </div>

            <div className="lobby-blocked-actions">
              <button
                className="btn lobby-blocked-btn-main"
                style={{ background: '#ef4444', borderColor: '#ef4444' }}
                onClick={handleDeleteOrg}
                disabled={deleting || !nameMatches}
              >
                {deleting ? (
                  <><span className="spinner" /> Eliminando...</>
                ) : (
                  <><Icon name="trash" size="1em" /> Eliminar Permanentemente</>
                )}
              </button>
              <button className="btn btn-ghost" style={{ width: '100%' }} onClick={closeDeleteModal}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── VERSIÓN ───
          Vivía arriba, al lado de "Salir", compitiendo por atención con lo único que
          importa en esta pantalla (elegir el gimnasio). Ahora es una marca de agua en
          la esquina de abajo: se lee si la buscás y desaparece si no.
          El componente crece solo cuando tiene algo que decir (hay una actualización
          descargada y lista para instalar). */}
      <div className="lobby-version-footer">
        <UpdateIndicator />
      </div>
    </div>
  );
}
