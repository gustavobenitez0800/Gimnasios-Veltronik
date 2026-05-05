// ============================================
// VELTRONIK V2 - TEAM PAGE
// ============================================

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { useTeamController } from '../controllers/useTeamController';
import { getInitials, getRelativeTime } from '../lib/utils';
import { PageHeader, ConfirmDialog } from '../components/Layout';
import Icon from '../components/Icon';

const ROLE_LABELS = { owner: 'Dueño', admin: 'Administrador', staff: 'Empleado', reception: 'Recepción' };
const ROLE_COLORS = {
  owner: 'linear-gradient(135deg, #f59e0b, #d97706)',
  admin: 'linear-gradient(135deg, #8b5cf6, #6d28d9)',
  staff: 'linear-gradient(135deg, #06b6d4, #0891b2)',
  reception: 'linear-gradient(135deg, #22c55e, #16a34a)',
};

export default function TeamPage() {
  const { showToast } = useToast();
  const { user } = useAuth();
  const {
    teamMembers,
    activityLog,
    loading: isFetching,
    loadTeam,
    loadActivity,
    inviteMember: controllerInvite,
    updateRole: controllerUpdateRole,
    removeMember: controllerRemoveMember
  } = useTeamController();

  const [tab, setTab] = useState('team');

  // Invite
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('staff');
  const [inviting, setInviting] = useState(false);

  // Role change
  const [roleModal, setRoleModal] = useState(false);
  const [roleTarget, setRoleTarget] = useState(null);
  const [newRole, setNewRole] = useState('staff');

  // Delete
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => { loadTeam(); }, [loadTeam]);

  const handleTabChange = (t) => {
    setTab(t);
    if (t === 'activity') loadActivity();
  };

  // Invite
  const handleInvite = async () => {
    if (!inviteEmail.trim()) { showToast('Ingresá el email del empleado', 'error'); return; }
    setInviting(true);
    try {
      await controllerInvite(inviteEmail.trim(), inviteRole);
      showToast(`${inviteEmail} agregado como ${ROLE_LABELS[inviteRole]}`, 'success');
      setInviteEmail('');
    } catch (err) {
      showToast(err.message || 'Error al invitar', 'error');
    } finally { setInviting(false); }
  };

  // Role change
  const openRoleModal = (member) => {
    setRoleTarget(member);
    setNewRole(member.role);
    setRoleModal(true);
  };

  const confirmRoleChange = async () => {
    if (!roleTarget) return;
    try {
      await controllerUpdateRole(roleTarget.user_id, newRole);
      showToast(`Rol actualizado a ${ROLE_LABELS[newRole]}`, 'success');
      setRoleModal(false);
    } catch (err) { showToast(err.message || 'Error', 'error'); }
  };

  // Remove
  const handleRemove = async () => {
    if (!deleteTarget) return;
    try {
      await controllerRemoveMember(deleteTarget.user_id);
      showToast(`${deleteTarget.full_name || deleteTarget.email} eliminado del equipo`, 'success');
      setDeleteTarget(null);
    } catch (err) { showToast(err.message || 'Error', 'error'); }
  };

  const currentRole = localStorage.getItem('current_org_role');
  const isOwner = currentRole === 'owner';
  const isAdmin = currentRole === 'admin';
  const canManageTeam = isOwner || isAdmin;

  const getActivityEmoji = (action) => {
    if (action?.includes('create') || action?.includes('invite')) return '➕';
    if (action?.includes('update') || action?.includes('role')) return '✏️';
    if (action?.includes('delete') || action?.includes('remove')) return '🗑️';
    if (action?.includes('checkin') || action?.includes('access')) return '🚪';
    if (action?.includes('payment')) return '💳';
    return '📋';
  };

  return (
    <div className="team-page">
      <PageHeader title="Equipo" subtitle="Gestión de miembros del equipo" icon="users" />

      {/* Tabs */}
      <div className="team-tabs">
        <button className={`team-tab ${tab === 'team' ? 'active' : ''}`} onClick={() => handleTabChange('team')}>
          👥 Miembros
        </button>
        <button className={`team-tab ${tab === 'activity' ? 'active' : ''}`} onClick={() => handleTabChange('activity')}>
          🕐 Actividad
        </button>
      </div>

      {tab === 'team' ? (
        <>
          {/* Invite Section (owner / admin) */}
          {canManageTeam && (
            <div className="card mb-3" style={{ padding: '1.25rem' }}>
              <h3 style={{ marginBottom: '0.75rem' }}>✉️ Invitar al equipo</h3>
              <p className="text-muted mb-2" style={{ fontSize: 'var(--font-size-sm)' }}>
                El empleado debe tener cuenta en Veltronik. Ingresá su email para agregarlo.
              </p>
              <div className="flex gap-1" style={{ flexWrap: 'wrap' }}>
                <input type="email" className="form-input" placeholder="empleado@email.com"
                  value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
                <select className="form-select" value={inviteRole} onChange={e => setInviteRole(e.target.value)} style={{ width: 'auto' }}>
                  <option value="staff">Empleado</option>
                  <option value="admin">Administrador</option>
                  <option value="reception">Recepción</option>
                </select>
                <button className="btn btn-primary" onClick={handleInvite} disabled={inviting}>
                  {inviting ? <span className="spinner" /> : '📨 Invitar'}
                </button>
              </div>
            </div>
          )}

          {/* Team Grid */}
          {isFetching ? (
            <div className="dashboard-loading"><span className="spinner" /> Cargando equipo...</div>
          ) : teamMembers.length === 0 ? (
            <div className="card" style={{ padding: '3rem', textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', marginBottom: '1rem', opacity: 0.3 }}>👥</div>
              <h3>No hay miembros en el equipo</h3>
              <p className="text-muted">Invitá a tu primer empleado usando el formulario de arriba</p>
            </div>
          ) : (
            <div className="team-grid">
              {teamMembers.map(m => {
                const isMe = m.user_id === user?.id;
                return (
                  <div key={m.user_id} className="member-card">
                    <div className="member-card-header">
                      <div className="member-avatar" style={{ background: ROLE_COLORS[m.role] || ROLE_COLORS.staff }}>
                        {getInitials(m.full_name || m.email)}
                      </div>
                      <div className="member-info">
                        <h4 style={{ margin: 0, fontSize: '0.95rem' }}>
                          {m.full_name || 'Sin nombre'} {isMe && <span style={{ color: 'var(--primary-400)', fontSize: '0.7rem' }}>(Tú)</span>}
                        </h4>
                        <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>{m.email || ''}</p>
                      </div>
                    </div>
                    <div className="member-card-body">
                      <span className={`role-badge role-${m.role}`}>{ROLE_LABELS[m.role] || m.role}</span>
                      {isOwner && !isMe && m.role !== 'owner' ? (
                        <div className="member-actions">
                          <button onClick={() => openRoleModal(m)} title="Cambiar rol">✏️ Rol</button>
                          <button className="btn-remove" onClick={() => setDeleteTarget(m)} title="Eliminar">🗑️</button>
                        </div>
                      ) : m.role === 'owner' ? (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>👑 Dueño</span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : (
        /* Activity Tab */
        <div className="card">
          <div className="table-header">
            <h3 style={{ margin: 0 }}>📋 Historial de Actividad</h3>
          </div>
          <div style={{ maxHeight: 500, overflowY: 'auto' }}>
            {activityLog.length === 0 ? (
              <div className="text-center text-muted" style={{ padding: '3rem' }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.5rem', opacity: 0.3 }}>🕐</div>
                Sin actividad reciente
              </div>
            ) : activityLog.map((log, i) => (
              <div key={i} className="activity-item" style={{ display: 'flex', gap: '0.75rem', padding: '0.85rem 1rem', borderBottom: '1px solid var(--border-color)' }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-tertiary)', fontSize: '0.8rem' }}>
                  {getActivityEmoji(log.action)}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.82rem' }}>
                    <strong>{log.user_name || 'Usuario'}</strong> — {log.action} en {log.entity_type}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>
                    {getRelativeTime(log.created_at)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Role Modal */}
      {roleModal && roleTarget && (
        <div className="modal-overlay modal-show" onClick={() => setRoleModal(false)}>
          <div className="modal-container" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <h2 className="modal-title">Cambiar Rol</h2>
            <p className="text-muted mb-2">Cambiar rol de: {roleTarget.full_name || roleTarget.email}</p>
            <div className="form-group mb-2">
              <select className="form-select" value={newRole} onChange={e => setNewRole(e.target.value)}>
                <option value="admin">Administrador — Acceso completo</option>
                <option value="staff">Empleado — Acceso operativo</option>
                <option value="reception">Recepción — Solo acceso/check-in</option>
              </select>
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setRoleModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={confirmRoleChange}>Guardar</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog open={!!deleteTarget} title="Eliminar del Equipo"
        message={`¿Eliminar a "${deleteTarget?.full_name || deleteTarget?.email}" del equipo?`}
        icon="🗑️" confirmText="Eliminar" confirmClass="btn-danger" onConfirm={handleRemove} onCancel={() => setDeleteTarget(null)} />
    </div>
  );
}
