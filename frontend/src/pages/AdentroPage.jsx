// ============================================
// VELTRONIK - EN EL GIMNASIO (quién está adentro ahora)
// ============================================
// La foto del momento: quiénes están adentro, cuántos entraron hoy, cuánto se quedan, y el
// registro del día.
//
// ⭐ POR QUÉ ES UN MÓDULO APARTE Y NO UNA SECCIÓN DEL MOSTRADOR.
//
// Son dos trabajos distintos con la misma información. El mostrador (Acceso) se usa como un
// MOLINETE: el socio teclea el DNI, aprieta Enter y pasa el que sigue — ahí todo lo que no
// sea registrar el paso de la gente estorba, y estas tres tarjetas más una tabla de treinta
// filas empujaban el buscador para abajo. Esta pantalla es para MIRAR: quién hay adentro
// cuando alguien pregunta "¿está fulano?", y quién quedó sin marcar salida al cerrar.
//
// Comparte la clave de caché 'mostrador' con Acceso a propósito: es el MISMO pedido
// (/gym/access/mostrador). Ir y volver entre las dos pantallas no dispara nada nuevo, y
// cualquiera de las dos deja los datos frescos para la otra.
//
// El ritmo de refresco es más tranquilo que el del mostrador (5 s contra 3 s): acá nadie
// está esperando ver su cartel aparecer, se mira una lista.
// ============================================

import { useMemo } from 'react';
import { useToast } from '../contexts/ToastContext';
import { accessService, errorService } from '../services';
import { getInitials, getRelativeTime } from '../lib/utils';
import { useQueryCache, useRefrescoAutomatico } from '../hooks';
import { GYM } from '../lib/gym';
import { PageHeader } from '../components/Layout';
import Icon from '../components/Icon';

export default function AdentroPage() {
  const orgLabel = GYM.placeLabel;
  const orgLabelCap = GYM.placeLabelCap;
  const { showToast } = useToast();

  const { data, loading, invalidate, isFetching } = useQueryCache(
    'mostrador',
    () => accessService.getMostrador(),
    { staleTime: 10000 },
  );

  const checkedIn = useMemo(() => data?.adentro || [], [data]);
  const todayLogs = useMemo(() => data?.hoy || [], [data]);

  useRefrescoAutomatico(invalidate, isFetching, { enFoco: 5000, deFondo: 20000 });

  // ⚠️ EL TOTAL Y EL PROMEDIO LOS MANDA EL BACKEND, no salen de `todayLogs`.
  //
  // `hoy` llega RECORTADO: la pantalla muestra 30 filas, y mandar los 250 accesos de un día
  // entero —cada uno con la ficha completa del socio— es cientos de fichas viajando por la
  // conexión del gimnasio para pintar 30 renglones. Contar esa lista diría "60 accesos" en
  // un gimnasio que tuvo 250, y el promedio saldría de una muestra cortada.
  //
  // Se conserva la cuenta local como respaldo: contra un backend que todavía no los mande,
  // un número aproximado es mejor que un hueco en la pantalla.
  const stats = useMemo(() => {
    // `null` en el promedio es una respuesta válida —"ninguna visita cerró todavía"— y es
    // distinto de que este backend no mande el dato. Por eso se pregunta por la CLAVE.
    const resumenDelBackend = !!data && 'hoyTotal' in data;
    const promedioLocal = () => {
      const completed = todayLogs.filter(l => l.checkOutAt);
      if (completed.length === 0) return '-';
      const avg = completed.reduce((sum, l) => {
        return sum + (new Date(l.checkOutAt) - new Date(l.checkInAt));
      }, 0) / completed.length;
      return `${Math.round(avg / 60000)} min`;
    };
    return {
      inGym: checkedIn.length,
      totalToday: resumenDelBackend ? data.hoyTotal : todayLogs.length,
      avgTime: resumenDelBackend
        ? (data.hoyPromedioMin == null ? '-' : `${data.hoyPromedioMin} min`)
        : promedioLocal(),
    };
  }, [checkedIn, todayLogs, data]);

  const handleCheckOut = async (logId, memberName) => {
    try {
      await accessService.checkOut(logId);
      showToast(`${memberName} salió`, 'success');
      invalidate();
    } catch (error) {
      showToast(errorService.getMessage(error), 'error');
    }
  };

  return (
    <div className="adentro-page">
      <PageHeader
        title={`En el ${orgLabelCap}`}
        subtitle="Quién está adentro ahora y cómo viene el día"
        icon="dumbbell"
      />

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

      {/* La gente que está adentro. Acá tiene la página entera, así que va en varias
          columnas: en el mostrador vivía en media pantalla y se leían cuatro nombres. */}
      <div className="card currently-in">
        <div className="table-header">
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Icon name="building" size="1.2em" />
            En el {orgLabelCap} ahora
          </h3>
          <span className="people-count"><Icon name="users" size="1em" /> {checkedIn.length}</span>
        </div>
        <div className="checked-in-list adentro-lista" style={{ padding: '0 1rem 1rem' }}>
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
            );
          })}
        </div>
      </div>

      <div className="card mt-3">
        <div className="table-header">
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}><Icon name="fileText" size="1em" /> Registro de hoy</h3>
          {/* El total real del día, no el largo de la lista recortada. */}
          <span className="text-muted">{stats.totalToday} accesos</span>
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
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
