// ============================================
// VELTRONIK - LOBBY PAGE
// ============================================

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { getInitials } from '../lib/utils';
import { createGym } from '../lib/supabase';
import Icon from '../components/Icon';
import logoSrc from '../assets/LogoPrincipalVeltronik.png';
import CONFIG from '../lib/config';

export default function LobbyPage() {
  const { profile, gym, subscription, logout, refreshAuth, hasValidAccess } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [showCreateModal, setShowCreateModal] = useState(false);

  const userName = profile?.full_name || 'Usuario';
  const initials = getInitials(userName);

  // If user has a gym, show it as an org card
  const orgs = gym
    ? [{ id: gym.id, name: gym.name, type: 'GYM', role: 'owner', gym }]
    : [];

  const handleSelectOrg = (org) => {
    localStorage.setItem('current_org_id', org.id);
    localStorage.setItem('current_org_role', org.role);
    localStorage.setItem('current_org_name', org.name);
    localStorage.setItem('current_org_type', org.type);

    // Check if user has valid access before entering dashboard
    if (hasValidAccess && !hasValidAccess(org.gym, subscription)) {
      navigate(CONFIG.ROUTES.BLOCKED);
    } else {
      navigate(CONFIG.ROUTES.DASHBOARD);
    }
  };

  const handleCreateGym = async (gymData) => {
    try {
      await createGym(gymData);
      showToast('¡Negocio creado exitosamente!', 'success');
      setShowCreateModal(false);
      await refreshAuth();
    } catch (error) {
      console.error('Create gym error:', error);
      showToast('Error al crear el negocio. Intenta de nuevo.', 'error');
    }
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

        {/* Org Cards */}
        <div className="lobby-grid">
          {orgs.map((org) => (
            <button
              key={org.id}
              className="lobby-card card-hover"
              onClick={() => handleSelectOrg(org)}
            >
              <div className="lobby-card-icon">
                <Icon name="building" size="2rem" />
              </div>
              <h3 className="lobby-card-name">{org.name}</h3>
              <span className="badge badge-success">
                {org.type === 'GYM' ? 'Gimnasio' : org.type}
              </span>
              <p className="lobby-card-role">{org.role}</p>
            </button>
          ))}

          {/* Create new business card */}
          <button
            className="lobby-card lobby-card-create card-hover"
            onClick={() => {
              if (gym) {
                showToast('Ya tienes un negocio asociado', 'warning');
              } else {
                navigate(CONFIG.ROUTES.ONBOARDING);
              }
            }}
          >
            <div className="lobby-card-icon create-icon">
              <Icon name="plus" size="2rem" />
            </div>
            <h3 className="lobby-card-name">Crear Negocio</h3>
            <p className="lobby-card-role">Registrá tu gimnasio o negocio</p>
          </button>
        </div>
      </div>
    </div>
  );
}
