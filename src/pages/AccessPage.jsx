// ============================================
// VELTRONIK V2 - ACCESS CONTROL PAGE (Refactored)
// ============================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useToast } from '../contexts/ToastContext';
import { memberService, accessService, errorService } from '../services';
import { getInitials, getRelativeTime, debounce } from '../lib/utils';
import { PageHeader } from '../components/Layout';
import { StatCard } from '../components/ui';
import Icon from '../components/Icon';

export default function AccessPage() {
  const { showToast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [checkedIn, setCheckedIn] = useState([]);
  const [todayLogs, setTodayLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  // Success popup
  const [popup, setPopup] = useState(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [inGym, logs] = await Promise.all([
        accessService.getCurrentlyCheckedIn(),
        accessService.getTodayLogs(),
      ]);
      setCheckedIn(inGym || []);
      setTodayLogs(logs || []);
    } catch (error) {
      console.error('Access load error:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Search
  const doSearch = useMemo(() => debounce(async (query) => {
    if (!query || query.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const results = await memberService.searchForAccess(query);
      setSearchResults(results || []);
    } catch { setSearchResults([]); }
    finally { setSearching(false); }
  }, 300), []);

  const handleSearch = (val) => {
    setSearchQuery(val);
    doSearch(val);
  };

  // Days remaining helper
  const getDaysInfo = (membershipEnd) => {
    if (!membershipEnd) return { days: null, label: 'Sin fecha', type: 'unknown' };
    const diff = Math.ceil((new Date(membershipEnd) - new Date()) / (1000 * 60 * 60 * 24));
    if (diff < 0) return { days: Math.abs(diff), label: `${Math.abs(diff)}d vencido`, type: 'expired' };
    if (diff <= 3) return { days: diff, label: `${diff}d restantes`, type: 'danger' };
    if (diff <= 7) return { days: diff, label: `${diff}d restantes`, type: 'warning' };
    return { days: diff, label: `${diff}d restantes`, type: 'ok' };
  };

  // Check-in
  const handleCheckIn = async (member) => {
    try {
      await accessService.checkIn(member.id, 'manual');
      const daysInfo = getDaysInfo(member.membership_end);

      // Show success popup
      setPopup({
        name: member.full_name,
        type: daysInfo.type === 'expired' ? 'error' : daysInfo.type === 'danger' ? 'warning' : 'success',
        daysLabel: daysInfo.label,
        initials: getInitials(member.full_name),
      });

      setTimeout(() => setPopup(null), 3000);

      setSearchQuery('');
      setSearchResults([]);
      loadData();

      showToast(`${member.full_name} registrado`, 'success');
    } catch (error) {
      showToast(errorService.getMessage(error), 'error');
    }
  };

  // Check-out
  const handleCheckOut = async (logId, memberName) => {
    try {
      await accessService.checkOut(logId);
      showToast(`${memberName} salió`, 'success');
      loadData();
    } catch (error) {
      showToast(errorService.getMessage(error), 'error');
    }
  };

  // Stats
  const stats = useMemo(() => ({
    inGym: checkedIn.length,
    totalToday: todayLogs.length,
    avgTime: todayLogs.length > 0 ? (() => {
      const completed = todayLogs.filter(l => l.check_out_at);
      if (completed.length === 0) return '-';
      const avg = completed.reduce((sum, l) => {
        return sum + (new Date(l.check_out_at) - new Date(l.check_in_at));
      }, 0) / completed.length;
      return `${Math.round(avg / 60000)} min`;
    })() : '-',
  }), [checkedIn, todayLogs]);

  return (
    <div className="access-page">
      <PageHeader title="Control de Acceso" subtitle="Registro de entradas y salidas" icon="door" />

      {/* Stats */}
      <div className="stats-grid mb-3" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className="stat-card">
          <div className="stat-icon stat-icon-success"><Icon name="users" /></div>
          <div className="stat-content">
            <div className="stat-value">{stats.inGym}</div>
            <div className="stat-label">En el gimnasio</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon stat-icon-primary"><Icon name="door" /></div>
          <div className="stat-content">
            <div className="stat-value">{stats.totalToday}</div>
            <div className="stat-label">Accesos hoy</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon stat-icon-accent"><Icon name="clock" /></div>
          <div className="stat-content">
            <div className="stat-value">{stats.avgTime}</div>
            <div className="stat-label">Tiempo promedio</div>
          </div>
        </div>
      </div>

      {/* Check-in + Currently In */}
      <div className="access-grid">
        {/* Check-in Search */}
        <div className="checkin-section">
          <h3>✅ Registrar Entrada</h3>
          <div className="search-box">
            <input type="text" className="search-input" placeholder="Buscar por nombre o DNI..."
              value={searchQuery} onChange={e => handleSearch(e.target.value)} />
          </div>
          {searching && <div className="text-center text-muted mb-1"><span className="spinner" /> Buscando...</div>}
          {searchResults.length > 0 && (
            <div className="search-results">
              {searchResults.map(member => {
                const daysInfo = getDaysInfo(member.membership_end);
                return (
                  <div key={member.id} className="search-result-item" onClick={() => handleCheckIn(member)}>
                    <div className="member-avatar">{getInitials(member.full_name)}</div>
                    <div className="member-info">
                      <div className="member-name">{member.full_name}</div>
                      <div className="member-dni">DNI: {member.dni || '-'}</div>
                    </div>
                    <div className={`days-countdown ${daysInfo.type === 'ok' ? 'days-ok' : daysInfo.type === 'warning' ? 'days-warning' : daysInfo.type === 'expired' || daysInfo.type === 'danger' ? 'days-danger' : 'days-none'}`}>
                      {daysInfo.label}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Currently In Gym */}
        <div className="card currently-in">
          <div className="table-header">
            <h3 style={{ margin: 0 }}>🏋️ En el Gimnasio</h3>
            <span className="people-count">👥 {checkedIn.length}</span>
          </div>
          <div className="checked-in-list" style={{ padding: '0 1rem 1rem' }}>
            {loading ? (
              <div className="text-center text-muted" style={{ padding: '2rem' }}><span className="spinner" /> Cargando...</div>
            ) : checkedIn.length === 0 ? (
              <div className="text-center text-muted" style={{ padding: '2rem' }}>Nadie en el gimnasio</div>
            ) : checkedIn.map(log => {
              const member = Array.isArray(log.member) ? log.member[0] : log.member;
              const memberName = member?.full_name || 'Socio';
              return (
              <div key={log.id} className="checked-in-item">
                <div className="member-avatar">{getInitials(memberName)}</div>
                <div className="member-info">
                  <div className="member-name">{memberName}</div>
                  <div className="checkin-time">Entrada: {getRelativeTime(log.check_in_at)}</div>
                </div>
                <button className="checkout-btn" onClick={() => handleCheckOut(log.id, memberName)}>
                  👋 Salida
                </button>
              </div>
            )})}
          </div>
        </div>
      </div>

      {/* Today's Log */}
      <div className="card mt-3">
        <div className="table-header">
          <h3 style={{ margin: 0 }}>📋 Registro de hoy</h3>
          <span className="text-muted">{todayLogs.length} accesos</span>
        </div>
        <div className="table-container">
          <table className="table">
            <thead><tr><th>Socio</th><th>DNI</th><th>Entrada</th><th>Salida</th><th>Método</th></tr></thead>
            <tbody>
              {todayLogs.length === 0 ? (
                <tr><td colSpan="5" className="text-center text-muted" style={{ padding: '2rem' }}>Sin accesos hoy</td></tr>
              ) : todayLogs.slice(0, 30).map(log => {
                const member = Array.isArray(log.member) ? log.member[0] : log.member;
                return (
                <tr key={log.id}>
                  <td><strong>{member?.full_name || 'Socio'}</strong></td>
                  <td>{member?.dni || '-'}</td>
                  <td>{new Date(log.check_in_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</td>
                  <td>{log.check_out_at ? new Date(log.check_out_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : <span className="badge badge-success">Adentro</span>}</td>
                  <td>{log.access_method === 'manual' ? '✋ Manual' : log.access_method === 'qr' ? '📱 QR' : log.access_method || '-'}</td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
      </div>

      {/* Success Popup */}
      {popup && (
        <>
          <div className="access-popup-overlay active" onClick={() => setPopup(null)} />
          <div className={`checkin-success active ${popup.type}`}>
            <div className="popup-member-photo"><span className="initials">{popup.initials}</span></div>
            <div className="popup-member-name">{popup.name}</div>
            <div className="popup-days-info"><span className="popup-days-label">{popup.daysLabel}</span></div>
            <div className="popup-progress-container"><div className="popup-progress-bar" /></div>
          </div>
        </>
      )}
    </div>
  );
}
