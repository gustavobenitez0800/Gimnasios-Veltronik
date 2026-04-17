// ============================================
// VELTRONIK - LOBBY PAGE
// ============================================

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { gymService } from '../services';
import { getInitials } from '../lib/utils';
import Icon from '../components/Icon';
import logoSrc from '../assets/LogoPrincipalVeltronik.png';
import CONFIG from '../lib/config';

const TYPE_LABELS = { GYM: 'Gimnasio', RESTO: 'Restaurante', KIOSK: 'Kiosco', OTHER: 'Negocio' };
const TYPE_ICONS = { GYM: '🏋️', RESTO: '🍽️', KIOSK: '🏪', OTHER: '📱' };
const TYPE_BADGES = { GYM: 'badge-success', RESTO: 'badge-error', KIOSK: 'badge-warning', OTHER: 'badge-neutral' };

export default function LobbyPage() {
  const { profile, logout } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);

  const userName = profile?.full_name || 'Usuario';
  const initials = getInitials(userName);

  // Load ALL organizations from organization_members
  const loadOrgs = useCallback(async () => {
    try {
      setLoading(true);
      const data = await gymService.getUserGyms();
      setOrgs(data || []);
    } catch (err) {
      console.error('Error loading orgs:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadOrgs(); }, [loadOrgs]);

  const handleSelectOrg = (org) => {
    const orgType = org.type || 'GYM';

    localStorage.setItem('current_org_id', org.id);
    localStorage.setItem('current_org_role', org.role || 'owner');
    localStorage.setItem('current_org_name', org.name);
    localStorage.setItem('current_org_type', orgType);

    // Check if trial is still active OR has active subscription
    const trialActive = org.trial_ends_at && new Date(org.trial_ends_at) > new Date();

    if (!trialActive) {
      // No trial → check if we should redirect to blocked
      // We'll let AuthContext handle this after it refreshes, just navigate to dashboard
      navigate(CONFIG.ROUTES.DASHBOARD);
    } else {
      navigate(CONFIG.ROUTES.DASHBOARD);
    }
  };

  const getTrialDays = (org) => {
    if (!org.trial_ends_at) return 0;
    const diff = new Date(org.trial_ends_at) - new Date();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  };

  return (
    <div className="lobby-wrapper">
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
              const trialDays = getTrialDays(org);
              const trialActive = trialDays > 0;
              const price = CONFIG.PRICES_BY_TYPE[orgType] || CONFIG.SUBSCRIPTION_PRICE;

              return (
                <button
                  key={org.id}
                  className="lobby-card card-hover"
                  onClick={() => handleSelectOrg(org)}
                >
                  <div className="lobby-card-icon">
                    <span style={{ fontSize: '2rem' }}>{TYPE_ICONS[orgType] || '📱'}</span>
                  </div>
                  <h3 className="lobby-card-name">{org.name}</h3>
                  <span className={`badge ${TYPE_BADGES[orgType] || 'badge-neutral'}`}>
                    {TYPE_LABELS[orgType] || orgType}
                  </span>
                  <p className="lobby-card-role">
                    {{ owner: 'Dueño', admin: 'Administrador', staff: 'Staff', reception: 'Recepción' }[org.role] || org.role}
                  </p>
                  {/* Trial info */}
                  {trialActive && (
                    <div style={{
                      marginTop: '0.5rem', fontSize: '0.7rem', padding: '0.25rem 0.5rem',
                      borderRadius: '6px',
                      background: trialDays <= 7 ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)',
                      color: trialDays <= 7 ? '#ef4444' : '#22c55e',
                      fontWeight: 600
                    }}>
                      ✨ {trialDays} días de prueba restantes
                    </div>
                  )}
                  {!trialActive && (
                    <div style={{
                      marginTop: '0.5rem', fontSize: '0.65rem', padding: '0.2rem 0.5rem',
                      borderRadius: '6px', background: 'rgba(14,165,233,0.1)', color: 'var(--primary-400)'
                    }}>
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
    </div>
  );
}
