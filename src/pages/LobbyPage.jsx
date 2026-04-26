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
import { gymService, supabase } from '../services';
import { getInitials } from '../lib/utils';
import Icon from '../components/Icon';
import logoSrc from '../assets/LogoPrincipalVeltronik.png';
import CONFIG from '../lib/config';

const TYPE_LABELS = { GYM: 'Gimnasio', RESTO: 'Restaurante', KIOSK: 'Kiosco', OTHER: 'Negocio' };
const TYPE_ICONS = { GYM: '/assets/VeltronikGym.png', RESTO: '/assets/VeltronikRestaurante.png', KIOSK: '🏪', OTHER: '📱' };
const TYPE_IS_IMAGE = { GYM: true, RESTO: true, KIOSK: false, OTHER: false };
const TYPE_BADGES = { GYM: 'badge-success', RESTO: 'badge-error', KIOSK: 'badge-warning', OTHER: 'badge-neutral' };

// ─── Helpers ───

function getTrialDays(org) {
  if (!org.trial_ends_at) return 0;
  const diff = new Date(org.trial_ends_at) - new Date();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function isTrialActive(org) {
  if (!org.trial_ends_at) return false;
  return new Date() < new Date(org.trial_ends_at);
}

/**
 * Determine the access status for an organization.
 * Returns: { canAccess, status, label, icon, color, sub }
 */
function computeOrgAccessStatus(org, sub) {
  // 1. Active subscription → full access
  if (sub?.status === 'active') {
    return {
      canAccess: true,
      status: 'active',
      label: 'Activo',
      icon: '✅',
      color: '#22c55e',
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
      icon: '✨',
      color: trialDays <= 7 ? '#f59e0b' : '#22c55e',
      sub,
      trialDays,
    };
  }

  // 3. Past due with grace period → access with warning
  if (sub?.status === 'past_due' && sub?.grace_period_ends_at) {
    const graceEnd = new Date(sub.grace_period_ends_at);
    if (new Date() < graceEnd) {
      const graceDays = Math.max(0, Math.ceil((graceEnd - new Date()) / (1000 * 60 * 60 * 24)));
      return {
        canAccess: true,
        status: 'past_due_grace',
        label: `Pago rechazado (${graceDays}d gracia)`,
        icon: '⚠️',
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
      icon: '💳',
      color: '#ef4444',
      blockReason: 'past_due',
      sub,
    };
  }

  // 5. Canceled → blocked
  if (sub?.status === 'canceled') {
    return {
      canAccess: false,
      status: 'canceled',
      label: 'Suscripción cancelada',
      icon: '🚫',
      color: '#64748b',
      blockReason: 'canceled',
      sub,
    };
  }

  // 6. Trial expired, no subscription → blocked
  if (org.trial_ends_at && new Date(org.trial_ends_at) < new Date()) {
    return {
      canAccess: false,
      status: 'trial_expired',
      label: 'Prueba finalizada',
      icon: '⏰',
      color: '#3b82f6',
      blockReason: 'trial_expired',
      sub,
    };
  }

  // 7. No trial, no subscription → blocked
  return {
    canAccess: false,
    status: 'no_subscription',
    label: 'Sin suscripción',
    icon: '🔒',
    color: '#ef4444',
    blockReason: 'no_subscription',
    sub,
  };
}

// ─── Block reason messages ───

const BLOCK_MESSAGES = {
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
    message: 'Tu período de prueba de 30 días ha finalizado. Tus datos están seguros. Suscribite para seguir usando Veltronik.',
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
  const { profile, logout, refreshAuth } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [orgs, setOrgs] = useState([]);
  const [orgStatuses, setOrgStatuses] = useState({});
  const [loading, setLoading] = useState(true);
  const [blockedOrg, setBlockedOrg] = useState(null); // For blocked modal
  const [updatingPayment, setUpdatingPayment] = useState(false);

  const userName = profile?.full_name || 'Usuario';
  const initials = getInitials(userName);

  // ─── Load all organizations + their subscription statuses ───
  const loadOrgs = useCallback(async () => {
    try {
      setLoading(true);
      const data = await gymService.getUserGyms();
      const orgsList = data || [];
      setOrgs(orgsList);

      // Batch load subscriptions for all orgs
      if (orgsList.length > 0) {
        const orgIds = orgsList.map(o => o.id);

        // Get the latest subscription for each org in one query
        const { data: allSubs } = await supabase
          .from('subscriptions')
          .select('*')
          .in('gym_id', orgIds)
          .order('created_at', { ascending: false });

        // Build a map: orgId → best subscription (active > latest)
        const subMap = {};
        for (const sub of (allSubs || [])) {
          const existing = subMap[sub.gym_id];
          if (!existing) {
            subMap[sub.gym_id] = sub;
          } else if (sub.status === 'active' && existing.status !== 'active') {
            subMap[sub.gym_id] = sub;
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

  // ─── Handle org selection ───
  const handleSelectOrg = (org) => {
    const orgType = org.type || 'GYM';
    const accessStatus = orgStatuses[org.id];

    // Store org context in localStorage
    localStorage.setItem('current_org_id', org.id);
    localStorage.setItem('current_org_role', org.role || 'owner');
    localStorage.setItem('current_org_name', org.name);
    localStorage.setItem('current_org_type', orgType);

    // If org has valid access → navigate to dashboard
    if (accessStatus?.canAccess) {
      navigate(CONFIG.ROUTES.DASHBOARD);
      return;
    }

    // If blocked → show modal (don't navigate)
    setBlockedOrg({ ...org, accessStatus });
  };

  // ─── Handle reactivation ───
  const handleReactivate = () => {
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
      const { data: sub } = await supabase
        .from('subscriptions')
        .select('mp_payer_email')
        .eq('gym_id', gymId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (sub?.mp_payer_email) payerEmail = sub.mp_payer_email;
    } catch { /* use fallback email */ }

    if (!gymId || !payerEmail) {
      showToast('No se encontraron los datos necesarios', 'error');
      return;
    }

    setUpdatingPayment(true);
    try {
      const response = await fetch(`${CONFIG.API_URL}/api/update-payment-method`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gym_id: gymId, payer_email: payerEmail }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
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
          <button className="btn btn-ghost" onClick={logout} title="Cerrar sesión">
            <Icon name="logout" /> Salir
          </button>
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
        ) : (
          <div className="lobby-grid">
            {/* Organization Cards */}
            {orgs.map((org) => {
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
                  {/* Blocked overlay */}
                  {isBlocked && (
                    <div className="lobby-card-blocked-overlay">
                      <span className="lobby-card-lock">🔒</span>
                    </div>
                  )}

                  <div className="lobby-card-icon" style={{ background: TYPE_IS_IMAGE[orgType] ? 'transparent' : '' }}>
                    {TYPE_IS_IMAGE[orgType] ? (
                      <img src={TYPE_ICONS[orgType]} alt={TYPE_LABELS[orgType]} style={{ width: '90%', height: '90%', objectFit: 'contain' }} />
                    ) : (
                      <span style={{ fontSize: '2rem' }}>{TYPE_ICONS[orgType] || '📱'}</span>
                    )}
                  </div>
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
                      <span>{accessStatus.icon}</span>
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
            })}

            {/* Create new business card */}
            <button
              className="lobby-card lobby-card-create card-hover"
              onClick={() => navigate(CONFIG.ROUTES.ONBOARDING)}
            >
              <div className="lobby-card-icon create-icon">
                <Icon name="plus" size="2rem" />
              </div>
              <h3 className="lobby-card-name">Crear Negocio</h3>
              <p className="lobby-card-role">Registrá tu gimnasio, restaurante o negocio</p>
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
              {blockedOrg.accessStatus?.icon || '🔒'}
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

            {/* Grace period bar (if past_due with sub) */}
            {blockedOrg.accessStatus?.sub?.grace_period_ends_at && (
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
                💳 Reactivar Suscripción
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
                    '🔄 Cambiar Método de Pago'
                  )}
                </button>
              )}

              <button className="btn btn-ghost" style={{ width: '100%' }} onClick={() => setBlockedOrg(null)}>
                ← Volver al Lobby
              </button>
            </div>

            {/* Data safety */}
            <div className="lobby-blocked-safety">
              🔒 Tus datos están seguros y no serán eliminados
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
