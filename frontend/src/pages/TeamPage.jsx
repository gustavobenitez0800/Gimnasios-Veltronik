// ============================================
// VELTRONIK V2 - TEAM PAGE
// ============================================

import { useState } from 'react';
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
  const { user, orgRole } = useAuth();
  const {
    teamMembers,
    activityLog,
    loading: isFetching,
    activityLoading,
    loadActivity,
    inviteMember: controllerInvite,
    updateRole: controllerUpdateRole,
    removeMember: controllerRemoveMember
  } = useTeamController();

  const [tab, setTab] = useState('team');

  // Invite
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState('staff');
  /** Datos de la cuenta recién creada, para mostrar la contraseña temporal una única vez. */
  const [nuevaCuenta, setNuevaCuenta] = useState(null);
  const [inviting, setInviting] = useState(false);

  // Role change
  const [roleModal, setRoleModal] = useState(false);
  const [roleTarget, setRoleTarget] = useState(null);
  const [newRole, setNewRole] = useState('staff');

  // Delete
  const [deleteTarget, setDeleteTarget] = useState(null);

  const handleTabChange = (t) => {
    setTab(t);
    if (t === 'activity') loadActivity();
  };

  // Invite
  const handleInvite = async () => {
    if (!inviteEmail.trim()) { showToast('Ingresá el email del empleado', 'error'); return; }
    setInviting(true);
    try {
      const creado = await controllerInvite(inviteEmail.trim(), inviteRole, inviteName.trim());

      if (creado?.temporaryPassword) {
        // Cuenta recién creada: la contraseña viaja UNA sola vez y no queda guardada en
        // ningún lado legible. Va a un cartel que hay que cerrar a mano, no a un toast que
        // se va solo en tres segundos — si el dueño no la copia, hay que resetearla.
        setNuevaCuenta({
          email: inviteEmail.trim(),
          nombre: inviteName.trim(),
          rol: ROLE_LABELS[inviteRole],
          password: creado.temporaryPassword,
        });
      } else {
        showToast(`${inviteEmail} agregado como ${ROLE_LABELS[inviteRole]}`, 'success');
      }

      setInviteEmail('');
      setInviteName('');
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
      showToast(`${deleteTarget.fullName || deleteTarget.email} eliminado del equipo`, 'success');
      setDeleteTarget(null);
    } catch (err) { showToast(err.message || 'Error', 'error'); }
  };

  const currentRole = orgRole;
  const isOwner = currentRole === 'owner';
  const isAdmin = currentRole === 'admin';
  const canManageTeam = isOwner || isAdmin;

  const getActivityIcon = (type) => {
    switch (type) {
      case 'access': return 'doorOpen';
      case 'payment': return 'creditCard';
      case 'member': return 'plus';
      default: return 'fileText';
    }
  };

  return (
    <div className="team-page">
      <PageHeader title="Equipo" subtitle="Gestión de miembros del equipo" icon="users" />

      {/* Tabs */}
      <div className="team-tabs">
        <button className={`team-tab ${tab === 'team' ? 'active' : ''}`} onClick={() => handleTabChange('team')}>
          <Icon name="users" size="1em" /> Miembros
        </button>
        <button className={`team-tab ${tab === 'activity' ? 'active' : ''}`} onClick={() => handleTabChange('activity')}>
          <Icon name="clock" size="1em" /> Actividad
        </button>
      </div>

      {tab === 'team' ? (
        <>
          {/* Invite Section (owner / admin) */}
          {canManageTeam && (
            <div className="card mb-3" style={{ padding: '1.25rem' }}>
              <h3 style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '8px' }}><Icon name="send" size="1em" /> Sumar al equipo</h3>
              <p className="text-muted mb-2" style={{ fontSize: 'var(--font-size-sm)' }}>
                Poné su nombre y su email. Si todavía no tiene cuenta en Veltronik, se la creamos
                acá mismo y te damos una contraseña para pasarle — no necesita registrarse por su cuenta.
              </p>
              <div className="flex gap-1" style={{ flexWrap: 'wrap' }}>
                <input type="text" className="form-input" placeholder="Nombre y apellido"
                  value={inviteName} onChange={e => setInviteName(e.target.value)} style={{ flex: 1, minWidth: 180 }} />
                <input type="email" className="form-input" placeholder="empleado@email.com"
                  value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
                <select className="form-select" value={inviteRole} onChange={e => setInviteRole(e.target.value)} style={{ width: 'auto' }}>
                  <option value="staff">Empleado</option>
                  <option value="admin">Administrador</option>
                  <option value="reception">Recepción</option>
                </select>
                <button className="btn btn-primary" onClick={handleInvite} disabled={inviting}>
                  {inviting ? <span className="spinner" /> : <><Icon name="send" size="1em" /> Agregar</>}
                </button>
              </div>
            </div>
          )}

          {/* Team Grid */}
          {isFetching ? (
            <div className="dashboard-loading"><span className="spinner" /> Cargando equipo...</div>
          ) : teamMembers.length === 0 ? (
            <div className="card" style={{ padding: '3rem', textAlign: 'center' }}>
              <div style={{ marginBottom: '1rem', opacity: 0.35, color: 'var(--text-muted)', display: 'flex', justifyContent: 'center' }}><Icon name="users" size="2.25rem" /></div>
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
                        {getInitials(m.fullName || m.email)}
                      </div>
                      <div className="member-info">
                        <h4 style={{ margin: 0, fontSize: '0.95rem' }}>
                          {m.fullName || 'Sin nombre'} {isMe && <span style={{ color: 'var(--primary-400)', fontSize: '0.7rem' }}>(Tú)</span>}
                        </h4>
                        <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>{m.email || ''}</p>
                      </div>
                    </div>
                    <div className="member-card-body">
                      <span className={`role-badge role-${m.role}`}>{ROLE_LABELS[m.role] || m.role}</span>
                      {isOwner && !isMe && m.role !== 'owner' ? (
                        <div className="member-actions">
                          <button onClick={() => openRoleModal(m)} title="Cambiar rol"><Icon name="edit" size="0.9em" /> Rol</button>
                          <button className="btn-remove" onClick={() => setDeleteTarget(m)} title="Eliminar"><Icon name="trash" size="0.9em" /></button>
                        </div>
                      ) : m.role === 'owner' ? (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '4px' }}><Icon name="crown" size="1em" /> Dueño</span>
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
            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}><Icon name="fileText" size="1em" /> Historial de Actividad</h3>
          </div>
          <div style={{ maxHeight: 500, overflowY: 'auto' }}>
            {activityLoading ? (
              <div className="text-center text-muted" style={{ padding: '3rem' }}>
                <span className="spinner" /> Cargando actividad...
              </div>
            ) : activityLog.length === 0 ? (
              <div className="text-center text-muted" style={{ padding: '3rem' }}>
                <div style={{ marginBottom: '0.5rem', opacity: 0.35, display: 'flex', justifyContent: 'center' }}><Icon name="clock" size="2rem" /></div>
                Sin actividad reciente
              </div>
            ) : activityLog.map((log, i) => (
              <div key={log.id || `${log.created_at}-${i}`} className="activity-item" style={{ display: 'flex', gap: '0.75rem', padding: '0.85rem 1rem', borderBottom: '1px solid var(--border-color)' }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-tertiary)', color: 'var(--primary-400)' }}>
                  <Icon name={getActivityIcon(log.type)} size="1em" />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.82rem' }}>
                    <strong>{log.user_name || 'Usuario'}</strong> {log.action}
                    {log.entity_type && <span style={{ color: 'var(--text-muted)' }}> · {log.entity_type}</span>}
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
      {/* Cuenta recién creada: la contraseña temporal se muestra UNA sola vez.
          Va en un cartel que hay que cerrar a mano y no en un toast que se va solo: si el
          dueño no la copia, no hay dónde volver a buscarla — no queda guardada en ningún
          lado legible. Mismo criterio que la credencial de un equipo al enrolarlo. */}
      {nuevaCuenta && (
        <div className="modal-overlay modal-show">
          <div className="modal-container" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <div className="modal-header" style={{ marginBottom: '1.25rem' }}>
              <h2 className="modal-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Icon name="checkCircle" size="1.1em" /> Cuenta creada
              </h2>
            </div>

            <p className="text-muted mb-2" style={{ lineHeight: 1.6 }}>
              {nuevaCuenta.nombre ? <strong>{nuevaCuenta.nombre}</strong> : 'La persona'} ya puede entrar
              como <strong>{nuevaCuenta.rol}</strong>. Pasale estos datos:
            </p>

            <div style={{
              background: 'var(--bg-tertiary)', borderRadius: 'var(--border-radius-md)',
              padding: '1rem', marginBottom: '1rem',
            }}>
              <div style={{ marginBottom: '0.75rem' }}>
                <div className="text-muted" style={{ fontSize: 'var(--font-size-xs)' }}>Usuario</div>
                <code style={{ fontSize: '0.95rem', wordBreak: 'break-all' }}>{nuevaCuenta.email}</code>
              </div>
              <div>
                <div className="text-muted" style={{ fontSize: 'var(--font-size-xs)' }}>Contraseña temporal</div>
                <code style={{ fontSize: '1.15rem', letterSpacing: '0.05em', fontWeight: 700 }}>{nuevaCuenta.password}</code>
              </div>
            </div>

            <div style={{
              display: 'flex', gap: '0.6rem', alignItems: 'flex-start',
              background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)',
              borderRadius: 'var(--border-radius-md)', padding: '0.75rem 0.9rem',
              color: '#fbbf24', fontSize: 'var(--font-size-sm)', lineHeight: 1.5, marginBottom: '1.25rem',
            }}>
              <Icon name="alertTriangle" size="1.1em" />
              <span>Esta contraseña no se vuelve a mostrar. Copiala antes de cerrar — si se pierde, hay que generar una nueva.</span>
            </div>

            <div className="flex gap-1">
              <button
                className="btn btn-secondary"
                style={{ flex: 1 }}
                onClick={() => {
                  navigator.clipboard?.writeText(`Usuario: ${nuevaCuenta.email}\nContraseña: ${nuevaCuenta.password}`)
                    .then(() => showToast('Copiado', 'success'))
                    .catch(() => showToast('No se pudo copiar — anotala a mano', 'error'));
                }}
              >
                <Icon name="fileText" size="1em" /> Copiar
              </button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => setNuevaCuenta(null)}>
                Ya la copié
              </button>
            </div>
          </div>
        </div>
      )}

      {roleModal && roleTarget && (
        <div className="modal-overlay modal-show" onClick={() => setRoleModal(false)}>
          <div className="modal-container" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 className="modal-title" style={{ margin: 0 }}>Cambiar Rol</h2>
              <button type="button" onClick={() => setRoleModal(false)} className="btn-icon" style={{ padding: '0.25rem' }}>&times;</button>
            </div>
            <p className="text-muted mb-2">Cambiar rol de: {roleTarget.fullName || roleTarget.email}</p>
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
        message={`¿Eliminar a "${deleteTarget?.fullName || deleteTarget?.email}" del equipo?`}
        icon="trash" confirmText="Eliminar" confirmClass="btn-danger" onConfirm={handleRemove} onCancel={() => setDeleteTarget(null)} />
    </div>
  );
}
