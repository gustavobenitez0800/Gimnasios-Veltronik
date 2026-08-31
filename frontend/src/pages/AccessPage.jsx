// ============================================
// VELTRONIK V2 - CONTROL DE ACCESO (gym)
// ============================================
// Mostrador de recepción: buscar al socio, registrar su entrada/salida y ver
// quién está adentro ahora mismo.
// ============================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { memberService, accessService, errorService } from '../services';
import { getInitials, getRelativeTime, debounce } from '../lib/utils';
import EstadoCopiaLocal from '../components/EstadoCopiaLocal';
import AvisosMostrador from '../components/AvisosMostrador';
import CheckinQrPanel from '../components/CheckinQrPanel';
import { prepararSocios, refrescarSocios, REFRESCO_MS } from '../lib/localMembers';
import { useQueryCache } from '../hooks';
import { GYM } from '../lib/gym';
import { PageHeader } from '../components/Layout';
import Icon from '../components/Icon';

export default function AccessPage() {
  const orgLabel = GYM.placeLabel;
  const orgLabelCap = GYM.placeLabelCap;

  const { showToast } = useToast();
  const { orgRole } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  // Success popup
  const [popup, setPopup] = useState(null);

  // ─── Un pedido, y la vuelta a la pantalla es instantánea ───
  //
  // Antes esta pantalla pedía TRES cosas por separado (adentro, hoy, avisos) y las volvía a
  // pedir de cero en cada visita al módulo — spinner en blanco cada vez que la recepcionista
  // iba a Socios y volvía. Eso es exactamente lo que los dueños describen como "va lento".
  //
  // Ahora es un solo viaje, y con caché: al volver, la pantalla se pinta AL INSTANTE con lo
  // último que se sabía y se refresca por detrás. El dato puede tener unos segundos, y para
  // "quién está adentro" eso no cambia nada; lo que cambia es que ya no hay pantalla en
  // blanco entre un clic y el siguiente.
  //
  // 10 segundos de frescura, contra un refresco cada 15: cada ciclo lo encuentra vencido y
  // vuelve a pedir, pero ir y volver entre módulos no dispara nada.
  const { data, loading, invalidate } = useQueryCache(
    'mostrador',
    () => accessService.getMostrador(),
    { staleTime: 10000 },
  );

  const checkedIn = useMemo(() => data?.adentro || [], [data]);
  const todayLogs = useMemo(() => data?.hoy || [], [data]);
  const avisos = useMemo(() => data?.avisos || [], [data]);

  const loadData = invalidate;

  // ── El mostrador se entera solo de lo que pasa en la puerta ──
  //
  // Antes esta pantalla cargaba UNA vez, al abrirla, y nunca más. Con el mostrador manual no
  // se notaba: la recepcionista marcaba y la lista se refrescaba después de su propio clic.
  // Con el QR el que marca es el socio desde su celular, así que acá no llegaba nada — había
  // que salir del módulo y volver a entrar para que apareciera, y lo mismo al salir.
  //
  // Solo con la pestaña a la vista: un terminal olvidado abierto toda la noche no tiene por
  // qué seguir preguntando. Y al volver a la pestaña refresca en el acto, sin esperar el
  // próximo ciclo — que es justo cuando la recepcionista vuelve a mirar la pantalla.
  useEffect(() => {
    const refrescarSiVisible = () => {
      if (document.visibilityState === 'visible') loadData();
    };
    const t = setInterval(refrescarSiVisible, 15000);
    document.addEventListener('visibilitychange', refrescarSiVisible);
    window.addEventListener('focus', refrescarSiVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', refrescarSiVisible);
      window.removeEventListener('focus', refrescarSiVisible);
    };
  }, [loadData]);

  // La copia local de socios: se prepara al abrir la pantalla —no en la primera búsqueda—
  // así el buscador ya está instantáneo cuando llega el primer socio del día. Después se
  // refresca sola cada tanto, en el fondo y sin que nadie la espere.
  useEffect(() => {
    const tenantId = localStorage.getItem('current_org_id');
    if (!tenantId) return undefined;
    prepararSocios(tenantId);
    const t = setInterval(() => { refrescarSocios(tenantId).catch(() => {}); }, REFRESCO_MS);
    return () => clearInterval(t);
  }, []);

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

  // ─── La situación del socio la dice el BACKEND ───
  //
  // Acá también se calculaba a mano, con su propio redondeo. Sumado al de la lista de socios
  // y al del check-in, el mismo socio podía deber una cantidad de días distinta en cada
  // pantalla — y eso efectivamente pasó: "hace 2 días" en el aviso, "4d vencido" en la lista.
  const getDaysInfo = (member) => {
    const { situacion, diasVencido, diasRestantes } = member || {};
    if (!situacion || situacion === 'SIN_DATOS') return { label: 'Sin fecha', type: 'unknown' };
    if (situacion === 'INACTIVO') return { label: 'Dado de baja', type: 'expired' };
    if (situacion === 'VENCIDO' || situacion === 'EN_GRACIA') {
      return { label: `${diasVencido}d vencido`, type: 'expired' };
    }
    const d = diasRestantes ?? 0;
    if (d <= 3) return { label: `${d}d restantes`, type: 'danger' };
    if (d <= 7) return { label: `${d}d restantes`, type: 'warning' };
    return { label: `${d}d restantes`, type: 'ok' };
  };

  // ─── ¿Este socio está adentro AHORA? ───
  //
  // Se cruza contra la lista de "quién está adentro", que esta pantalla ya trae y ahora se
  // refresca sola. Sirve para dos cosas, y la segunda es la que importa:
  //   · mostrarlo en el resultado de la búsqueda ("adentro desde 09:14"), y
  //   · que el botón diga lo que REALMENTE va a pasar.
  //
  // Porque el botón decía siempre "Registrar entrada", pero el servidor decide solo mirando
  // el estado: si el socio ya estaba adentro, ese clic graba una SALIDA. La recepcionista
  // apretaba "entrada", se grababa "salida", y el cartel solo decía "Fulano registrado".
  const visitaAbierta = useCallback(
    (memberId) => checkedIn.find((l) => (l.member?.id || l.memberId) === memberId) || null,
    [checkedIn],
  );

  // Marcar el paso de un socio. La DIRECCIÓN la decide el backend; acá solo se muestra.
  const handleCheckIn = async (member) => {
    try {
      const r = await accessService.checkIn(member.id, 'manual');
      const daysInfo = getDaysInfo(member);
      const salio = r?.direccion === 'SALIDA';
      const rebote = r?.direccion === 'REBOTE';

      setPopup({
        name: member.fullName,
        // La salida no se colorea por el estado de la cuota: al que se está yendo ya no se
        // le reclama nada, y pintarle la pantalla de rojo en la puerta no sirve para nada.
        type: salio || rebote ? 'success'
          : daysInfo.type === 'expired' ? 'error'
          : daysInfo.type === 'danger' ? 'warning' : 'success',
        accion: rebote ? 'Ya estaba registrado' : salio ? 'Salida registrada' : 'Entrada registrada',
        daysLabel: salio || rebote ? '' : daysInfo.label,
        initials: getInitials(member.fullName),
      });

      setTimeout(() => setPopup(null), 3000);

      setSearchQuery('');
      setSearchResults([]);
      loadData();

      // El mensaje nombra la dirección REAL. Antes decía "registrado" a secas y la
      // recepcionista no tenía forma de saber qué había quedado grabado.
      showToast(
        rebote ? `${member.fullName}: ya estaba registrado`
          : salio ? `Salida de ${member.fullName}`
          : r?.recuperado
            ? `Entrada de ${member.fullName} — la vez anterior se fue sin marcar salida`
            : `Entrada de ${member.fullName}`,
        'success',
      );
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
      const completed = todayLogs.filter(l => l.checkOutAt);
      if (completed.length === 0) return '-';
      const avg = completed.reduce((sum, l) => {
        return sum + (new Date(l.checkOutAt) - new Date(l.checkInAt));
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
            <div className="stat-label">En el {orgLabel}</div>
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
        {/* El cartel del QR vive acá y no en Ajustes: es parte de operar la puerta, no de
            configurar el negocio. Quien maneja los accesos es quien lo necesita a mano. */}
        <CheckinQrPanel puedeAdministrar={['owner', 'admin'].includes(orgRole)} />

        {/* Los avisos van DEBAJO del cartel y ARRIBA del buscador. Lo segundo es lo que
            importa y no cambió: si un socio entró vencido, eso tiene que verse antes que
            lo que la recepcionista esté por hacer ahora. El cartel del QR no compite por
            esa atención — no es una acción, es un papel que se imprime una vez. */}
        <AvisosMostrador avisos={avisos} onAtendido={loadData} />

        {/* Check-in Search */}
        <div className="checkin-section">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Icon name="checkCircle" size="1em" /> Registrar Entrada</h3>
          <div className="search-box">
            <input type="text" className="search-input" placeholder="Buscar por nombre o DNI..."
              value={searchQuery} onChange={e => handleSearch(e.target.value)} />
          </div>
          <EstadoCopiaLocal />
          {searching && <div className="text-center text-muted mb-1"><span className="spinner" /> Buscando...</div>}
          {searchResults.length > 0 && (
            <div className="search-results">
              {searchResults.map(member => {
                const daysInfo = getDaysInfo(member);
                const isExpired = daysInfo.type === 'expired';
                const visita = visitaAbierta(member.id);
                const adentro = !!visita;
                return (
                  <div key={member.id} className="search-result-item">
                    <div className="member-avatar">{getInitials(member.fullName)}</div>
                    <div className="member-info">
                      <div className="member-name">{member.fullName}</div>
                      <div className="member-dni">DNI: {member.dni || '-'}</div>
                      {/* Estado visible al instante (sin tener que registrar entrada) */}
                      <span className={`member-access-status ${isExpired ? 'is-expired' : 'is-active'}`}>
                        <Icon name={isExpired ? 'xCircle' : 'checkCircle'} size="0.85em" />
                        {isExpired ? 'Vencido' : 'Activo'}
                      </span>
                      {/* Que ya esté adentro es lo primero que la recepcionista necesita
                          saber: cambia qué hace ese botón. Si marcó entrada por el QR y
                          nadie lo dice acá, el mostrador lo vuelve a "ingresar" y en
                          realidad lo está sacando. */}
                      {adentro && (
                        <span className="member-access-status is-inside">
                          <Icon name="door" size="0.85em" />
                          Adentro desde {new Date(visita.checkInAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>
                    <div className="search-result-right">
                      <div className={`days-countdown ${daysInfo.type === 'ok' ? 'days-ok' : daysInfo.type === 'warning' ? 'days-warning' : daysInfo.type === 'expired' || daysInfo.type === 'danger' ? 'days-danger' : 'days-none'}`}>
                        {daysInfo.label}
                      </div>
                      {/* El botón dice lo que va a pasar de verdad. Antes decía siempre
                          "Registrar entrada" y grababa una SALIDA si el socio ya estaba
                          adentro — la recepcionista no tenía forma de saberlo. */}
                      {adentro ? (
                        <button className="btn btn-sm btn-secondary" onClick={() => handleCheckIn(member)}>
                          <Icon name="door" size="0.9em" /> Registrar salida
                        </button>
                      ) : (
                        <button className="btn btn-sm btn-primary" onClick={() => handleCheckIn(member)}>
                          <Icon name="checkCircle" size="0.9em" /> Registrar entrada
                        </button>
                      )}
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
            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Icon name="building" size="1.2em" />
              En el {orgLabelCap}
            </h3>
            <span className="people-count"><Icon name="users" size="1em" /> {checkedIn.length}</span>
          </div>
          <div className="checked-in-list" style={{ padding: '0 1rem 1rem' }}>
            {loading ? (
              <div className="text-center text-muted" style={{ padding: '2rem' }}><span className="spinner" /> Cargando...</div>
            ) : checkedIn.length === 0 ? (
              <div className="text-center text-muted" style={{ padding: '2rem' }}>Nadie en el {orgLabel}</div>
            ) : checkedIn.map(log => {
              const member = log.member;
              const memberName = member?.fullName || 'Socio';
              return (
              <div key={log.id} className="checked-in-item">
                <div className="member-avatar">{getInitials(memberName)}</div>
                <div className="member-info">
                  <div className="member-name">{memberName}</div>
                  <div className="checkin-time">Entrada: {getRelativeTime(log.checkInAt)}</div>
                </div>
                <button className="checkout-btn" onClick={() => handleCheckOut(log.id, memberName)}>
                  <Icon name="handWave" size="1em" /> Salida
                </button>
              </div>
            )})}
          </div>
        </div>
      </div>

      {/* Today's Log */}
      <div className="card mt-3">
        <div className="table-header">
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}><Icon name="fileText" size="1em" /> Registro de hoy</h3>
          <span className="text-muted">{todayLogs.length} accesos</span>
        </div>
        <div className="table-container">
          <table className="table">
            <thead><tr><th>Socio</th><th>DNI</th><th>Entrada</th><th>Salida</th><th>Método</th></tr></thead>
            <tbody>
              {todayLogs.length === 0 ? (
                <tr><td colSpan="5" className="text-center text-muted" style={{ padding: '2rem' }}>Sin accesos hoy</td></tr>
              ) : todayLogs.slice(0, 30).map(log => {
                const member = log.member;
                return (
                <tr key={log.id}>
                  <td data-label="Socio"><strong>{member?.fullName || 'Socio'}</strong></td>
                  <td data-label="DNI">{member?.dni || '-'}</td>
                  <td data-label="Entrada">{log.checkInAt ? new Date(log.checkInAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '-'}</td>
                  <td data-label="Salida">{log.checkOutAt ? new Date(log.checkOutAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : <span className="badge badge-success">Adentro</span>}</td>
                  <td data-label="Método">
                    {(log.accessMethod || '').toLowerCase() === 'manual' ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}><Icon name="hand" size="0.9em" /> Manual</span>
                    ) : (log.accessMethod || '').toLowerCase() === 'qr' ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}><Icon name="qrCode" size="0.9em" /> QR</span>
                    ) : (log.accessMethod || '-')}
                  </td>
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
            {/* QUÉ se registró, no solo a quién. Este cartel decía únicamente el nombre, así
                que la recepcionista podía apretar "entrada", grabarse una salida, y no
                enterarse jamás. */}
            <div className="popup-accion">{popup.accion}</div>
            {popup.daysLabel && (
              <div className="popup-days-info"><span className="popup-days-label">{popup.daysLabel}</span></div>
            )}
            <div className="popup-progress-container"><div className="popup-progress-bar" /></div>
          </div>
        </>
      )}
    </div>
  );
}
