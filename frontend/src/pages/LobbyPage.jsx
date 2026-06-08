// ============================================
// VELTRONIK - LOBBY PAGE (v2 — Per-Org Validation)
// ============================================
// Each organization card shows its payment status.
// Blocked orgs show an in-page modal instead of navigating.
// ============================================

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { gymService } from '../services';
import { groupService } from '../services/GroupService';
import UpdateIndicator from '../components/UpdateIndicator';
import { getInitials } from '../lib/utils';
import Icon from '../components/Icon';
import logoSrc from '../assets/LogoPrincipalVeltronik.png';
import gymLogoSrc from '../assets/VeltronikGym.png';
import restoLogoSrc from '../assets/VeltronikRestaurante.png';
import CONFIG from '../lib/config';
import { apiCall } from '../lib/api';
import apiClient from '../lib/apiClient';

// Solo existe el sistema Gimnasio. Los mapas conservan fallback por si llegara un tipo inesperado.
const TYPE_LABELS = { GYM: 'Gimnasio' };
const TYPE_ICONS = { GYM: gymLogoSrc };
const TYPE_IS_IMAGE = { GYM: true };
const TYPE_BADGES = { GYM: 'badge-success' };

// ─── Helpers ───

function getTrialDays(org) {
  if (!org.trialEndsAt) return 0;
  const diff = new Date(org.trialEndsAt) - new Date();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function isTrialActive(org) {
  if (!org.trialEndsAt) return false;
  return new Date() < new Date(org.trialEndsAt);
}

/**
 * ¿Esta sucursal NUNCA tuvo un período de prueba real? Las sucursales adicionales (2ª en
 * adelante) no incluyen trial: el backend deja `trialEndsAt` en null (sucursales nuevas) o
 * vencido al instante de crearse (≈ createdAt, sucursales legacy). Una 1ª sucursal real tiene
 * `trialEndsAt` MUY posterior a su creación. Sirve para no mostrarle "prueba finalizada" a una
 * sucursal que jamás tuvo prueba.
 */
function neverHadRealTrial(org) {
  if (!org.trialEndsAt) return true;
  if (!org.createdAt) return false; // sin createdAt no podemos inferir → asumimos trial real
  return new Date(org.trialEndsAt) <= new Date(org.createdAt);
}

/**
 * Determine the access status for an organization.
 * Returns: { canAccess, status, label, icon, color, sub }
 */
function computeOrgAccessStatus(org, sub) {
  // El DTO del backend manda camelCase (currentPeriodEnd, gracePeriodEndsAt).
  // Toleramos snake_case por compatibilidad con datos viejos. Sin esto, los campos
  // llegaban undefined y la lógica de período/gracia nunca evaluaba bien.
  const periodEndRaw = sub?.currentPeriodEnd ?? sub?.current_period_end;
  const graceEndRaw = sub?.gracePeriodEndsAt ?? sub?.grace_period_ends_at;
  const periodEnd = periodEndRaw ? new Date(periodEndRaw) : null;
  const graceEnd = graceEndRaw ? new Date(graceEndRaw) : null;
  const now = new Date();

  // 1. Active subscription → acceso SOLO si hay un período PAGO vigente (currentPeriodEnd futuro).
  //    Rigor tipo Netflix: 'active' SIN período real NO da acceso. Antes un período nulo
  //    (`!periodEnd`) habilitaba el sistema sin un cobro confirmado — agujero cerrado.
  if (sub?.status === 'active') {
    if (periodEnd && periodEnd > now) {
      return {
        canAccess: true,
        status: 'active',
        label: 'Activo',
        icon: 'checkCircle',
        color: '#22c55e',
        sub,
      };
    }
    // Período vencido pese a status 'active' → bloquear (esperando renovación/pago).
    return {
      canAccess: false,
      status: 'expired',
      label: 'Pago vencido',
      icon: 'creditCard',
      color: '#ef4444',
      blockReason: 'past_due',
      sub,
    };
  }

  // 2. Trial active → access with countdown
  const trialDays = getTrialDays(org);
  if (isTrialActive(org)) {
    return {
      canAccess: true,
      status: 'trial',
      label: `${trialDays} días de prueba`,
      icon: 'sparkles',
      color: trialDays <= 7 ? '#f59e0b' : '#22c55e',
      sub,
      trialDays,
    };
  }

  // 3. Past due with grace period → access with warning
  if (sub?.status === 'past_due' && graceEnd) {
    if (now < graceEnd) {
      const graceDays = Math.max(0, Math.ceil((graceEnd - now) / (1000 * 60 * 60 * 24)));
      return {
        canAccess: true,
        status: 'past_due_grace',
        label: `Pago rechazado (${graceDays}d gracia)`,
        icon: 'alertTriangle',
        color: '#f59e0b',
        sub,
        graceDays,
      };
    }
  }

  // 4. Past due without grace or grace expired → blocked
  if (sub?.status === 'past_due') {
    return {
      canAccess: false,
      status: 'past_due',
      label: 'Pago rechazado',
      icon: 'creditCard',
      color: '#ef4444',
      blockReason: 'past_due',
      sub,
    };
  }

  // 5. Canceled → blocked (unless el período pago en curso no terminó)
  if (sub?.status === 'canceled') {
    if (periodEnd && now < periodEnd) {
      const daysLeft = Math.max(0, Math.ceil((periodEnd - now) / (1000 * 60 * 60 * 24)));
      return {
        canAccess: true,
        status: 'canceled_active',
        label: `Cancelada (${daysLeft}d rest.)`,
        icon: 'alertTriangle',
        color: '#f59e0b',
        sub,
      };
    }

    return {
      canAccess: false,
      status: 'canceled',
      label: 'Suscripción cancelada',
      icon: 'xCircle',
      color: '#64748b',
      blockReason: 'canceled',
      sub,
    };
  }

  // ¿El cliente YA fue cliente pago alguna vez? Si tiene una suscripción registrada
  // (cualquier estado), no está en "prueba": es una reactivación. El mensaje debe ser
  // premium, no de trial. (Distingue al cliente que pagó del que nunca pagó.)
  const everSubscribed = !!sub;

  // 6. Vencido tras haber pagado → bloqueo PREMIUM de reactivación (no "prueba").
  if (everSubscribed) {
    return {
      canAccess: false,
      status: 'expired',
      label: 'Pago vencido',
      icon: 'creditCard',
      color: '#ef4444',
      blockReason: 'expired',
      sub,
    };
  }

  // 7. Sucursal adicional que nunca tuvo prueba real y nunca pagó → ACTIVACIÓN (no "prueba").
  //    Las sucursales 2ª+ no incluyen trial: deben activarse pagando.
  if (neverHadRealTrial(org)) {
    return {
      canAccess: false,
      status: 'needs_activation',
      label: 'Requiere activación',
      icon: 'creditCard',
      color: '#f59e0b',
      blockReason: 'additional_branch',
      sub,
    };
  }

  // 8. Trial real expirado y NUNCA pagó → mensaje de prueba finalizada.
  if (org.trialEndsAt && new Date(org.trialEndsAt) < now) {
    return {
      canAccess: false,
      status: 'trial_expired',
      label: 'Prueba finalizada',
      icon: 'clock',
      color: '#3b82f6',
      blockReason: 'trial_expired',
      sub,
    };
  }

  // 9. Sin trial ni suscripción → bloqueado.
  return {
    canAccess: false,
    status: 'no_subscription',
    label: 'Sin suscripción',
    icon: 'lock',
    color: '#ef4444',
    blockReason: 'no_subscription',
    sub,
  };
}

// ─── Block reason messages ───

const BLOCK_MESSAGES = {
  expired: {
    title: 'Renová tu suscripción',
    message: 'Tu período mensual finalizó. Reactivá tu suscripción para seguir gestionando tu negocio sin interrupciones. Tu información permanece intacta.',
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
  const { profile, logout, refreshAuth, refreshOrgContext } = useAuth();
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

  // ─── Load all organizations + their subscription statuses ───
  const loadOrgs = useCallback(async () => {
    try {
      setLoading(true);
      const data = await gymService.getUserGyms();
      // Filtrar duplicados en caso de errores en la DB
      const uniqueOrgs = Array.from(new Map((data || []).map(org => [org.id, org])).values());
      const orgsList = uniqueOrgs;
      setOrgs(orgsList);

      // Grupos del dueño (para organizar el lobby). Best-effort: si falla, lobby plano.
      try {
        setGroups(await groupService.getMyGroups() || []);
      } catch { setGroups([]); }

      // Batch load subscriptions for all orgs
      if (orgsList.length > 0) {
        const orgIds = orgsList.map(o => o.id);

        // Batch load subscriptions for all orgs using apiClient
        const subPromises = orgsList.map(org =>
          apiClient.get(`/tenants/${org.id}/subscription`, {
            // X-Tenant-ID explícito = la org que se está consultando (no la del localStorage).
            // Alinea el chequeo IDOR del backend Y el filtro de Hibernate sobre Subscription.
            headers: { 'X-Tenant-ID': org.id }
          })
            .then(res => res.data)
            .catch(() => null)
        );
        const allSubsRaw = await Promise.all(subPromises);
        const allSubs = allSubsRaw.filter(sub => sub !== null && sub !== "");

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
          statuses[org.id] = computeOrgAccessStatus(org, sub);
        }
        setOrgStatuses(statuses);
      }
    } catch (err) {
      console.error('Error loading orgs:', err);
      showToast('Error al cargar los negocios', 'error');
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

  // ─── Handle org selection ───
  const handleSelectOrg = async (org) => {
    const orgType = org.type || 'GYM';
    const accessStatus = orgStatuses[org.id];

    // Store org context in localStorage
    localStorage.setItem('current_org_id', org.id);
    localStorage.setItem('current_org_role', org.role || 'owner');
    localStorage.setItem('current_org_name', org.name);
    localStorage.setItem('current_org_type', orgType);

    // If org has valid access → navigate immediately, refresh in background (optimistic)
    if (accessStatus?.canAccess) {
      navigate(CONFIG.ROUTES.DASHBOARD);
      refreshOrgContext(org.id); // non-blocking — loads in background
      return;
    }

    // If blocked → show modal (don't navigate)
    setBlockedOrg({ ...org, accessStatus });
  };

  // ─── Handle reactivation ───
  const handleReactivate = () => {
    if (blockedOrg) {
      // Ensure AuthContext is synced with the blocked org before navigating
      refreshOrgContext(blockedOrg.id);
    }
    setBlockedOrg(null);
    navigate(CONFIG.ROUTES.PLANS);
  };

  // ─── Handle update payment method ───
  const handleUpdatePaymentMethod = async () => {
    if (!blockedOrg) return;

    const gymId = blockedOrg.id;
    let payerEmail = profile?.email;

    // Try to get the payer email from the subscription
    try {
      // Stubbed payerEmail logic
      payerEmail = profile?.email;
    } catch { /* use fallback email */ }

    if (!gymId || !payerEmail) {
      showToast('No se encontraron los datos necesarios', 'error');
      return;
    }

    setUpdatingPayment(true);
    try {
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

  // ─── Handle delete organization ───
  const handleDeleteOrg = async () => {
    if (!deleteTarget) return;
    if (deleteConfirmName.trim().toLowerCase() !== deleteTarget.name.trim().toLowerCase()) {
      showToast('El nombre no coincide. Escribí el nombre exacto del negocio para confirmar.', 'error');
      return;
    }

    setDeleting(true);
    try {
      await gymService.deleteOrg(deleteTarget.id);
      showToast(`"${deleteTarget.name}" eliminado correctamente`, 'success');
      setDeleteTarget(null);
      setDeleteConfirmName('');
      await loadOrgs(); // Refresh the list
    } catch (error) {
      showToast(error.message || 'Error al eliminar el negocio', 'error');
    } finally {
      setDeleting(false);
    }
  };

  // ─── Render de una card de negocio (extraído para poder agrupar) ───
  const renderOrgCard = (org) => {
    const orgType = org.type || 'GYM';
    const price = CONFIG.PRICES_BY_TYPE[orgType] || CONFIG.SUBSCRIPTION_PRICE;
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
            title="Eliminar negocio"
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

        <h3 className="lobby-card-name">{org.name}</h3>
        <span className={`badge ${TYPE_BADGES[orgType] || 'badge-neutral'}`}>
          {TYPE_LABELS[orgType] || orgType}
        </span>
        <p className="lobby-card-role">
          {{ owner: 'Dueño', admin: 'Administrador', staff: 'Staff', reception: 'Recepción' }[org.role] || org.role}
        </p>

        {/* Status indicator */}
        {accessStatus && (
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
            <UpdateIndicator />
            <button className="btn btn-ghost" onClick={logout} title="Cerrar sesión">
              <Icon name="logout" /> Salir
            </button>
          </div>
        </div>

        {/* Title */}
        <div className="lobby-title-section">
          <h1 className="lobby-title">Mis Negocios</h1>
          <p className="lobby-subtitle">Seleccioná un negocio para acceder al sistema</p>
        </div>

        {/* Loading */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '3rem' }}>
            <span className="spinner" /> Cargando negocios...
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
            <div className="lobby-grid">
              <button
                className="lobby-card lobby-card-create card-hover"
                onClick={() => navigate(CONFIG.ROUTES.ONBOARDING)}
              >
                <div className="lobby-card-icon create-icon">
                  <Icon name="plus" size="2rem" />
                </div>
                <h3 className="lobby-card-name">Crear Negocio</h3>
                <p className="lobby-card-role">Registrá un nuevo gimnasio</p>
              </button>
            </div>
          </>
        ) : (
          /* Vista PLANA (sin grupos definidos): idéntica al comportamiento anterior */
          <div className="lobby-grid">
            {orgs.map(renderOrgCard)}

            {/* Create new business card */}
            <button
              className="lobby-card lobby-card-create card-hover"
              onClick={() => navigate(CONFIG.ROUTES.ONBOARDING)}
            >
              <div className="lobby-card-icon create-icon">
                <Icon name="plus" size="2rem" />
              </div>
              <h3 className="lobby-card-name">Crear Negocio</h3>
              <p className="lobby-card-role">Registrá un nuevo gimnasio</p>
            </button>
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
              {TYPE_IS_IMAGE[blockedOrg.type || 'GYM'] ? (
                <img src={TYPE_ICONS[blockedOrg.type || 'GYM']} alt="" style={{ width: '20px', height: '20px', objectFit: 'contain' }} />
              ) : (
                <span>{TYPE_ICONS[blockedOrg.type || 'GYM']}</span>
              )}
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
              <strong>${(CONFIG.PRICES_BY_TYPE[blockedOrg.type || 'GYM'] || CONFIG.SUBSCRIPTION_PRICE).toLocaleString('es-AR')}/mes</strong>
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

      {/* ─── DELETE ORG CONFIRMATION MODAL ─── */}
      {deleteTarget && (
        <div className="lobby-blocked-overlay" onClick={() => { setDeleteTarget(null); setDeleteConfirmName(''); }}>
          <div className="lobby-blocked-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '440px' }}>
            <button className="lobby-blocked-close" onClick={() => { setDeleteTarget(null); setDeleteConfirmName(''); }}>
              <Icon name="x" size="1em" />
            </button>

            <div className="lobby-blocked-icon" style={{ color: '#ef4444' }}>
              <Icon name="alertTriangle" size="2rem" />
            </div>

            <h2 className="lobby-blocked-title" style={{ color: '#ef4444' }}>Eliminar Negocio</h2>
            <p className="lobby-blocked-message">
              Estás a punto de eliminar <strong>"{deleteTarget.name}"</strong> y <strong>todos sus datos</strong>: socios, pagos, accesos, equipo y suscripciones. Esta acción es <strong>irreversible</strong>.
            </p>

            <div style={{ margin: '1.25rem 0' }}>
              <label className="form-label" style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)' }}>
                Escribí <strong style={{ color: '#ef4444' }}>{deleteTarget.name}</strong> para confirmar:
              </label>
              <input
                type="text"
                className="form-input"
                placeholder={deleteTarget.name}
                value={deleteConfirmName}
                onChange={(e) => setDeleteConfirmName(e.target.value)}
                style={{ marginTop: '0.5rem', borderColor: deleteConfirmName.trim().toLowerCase() === deleteTarget.name.trim().toLowerCase() ? '#ef4444' : undefined }}
                autoFocus
              />
            </div>

            <div className="lobby-blocked-actions">
              <button
                className="btn lobby-blocked-btn-main"
                style={{ background: '#ef4444', borderColor: '#ef4444' }}
                onClick={handleDeleteOrg}
                disabled={deleting || deleteConfirmName.trim().toLowerCase() !== deleteTarget.name.trim().toLowerCase()}
              >
                {deleting ? (
                  <><span className="spinner" /> Eliminando...</>
                ) : (
                  <><Icon name="trash" size="1em" /> Eliminar Permanentemente</>
                )}
              </button>
              <button className="btn btn-ghost" style={{ width: '100%' }} onClick={() => { setDeleteTarget(null); setDeleteConfirmName(''); }}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
