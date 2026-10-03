// ============================================
// VELTRONIK V2 - RETENCIÓN (gym)
// ============================================
// Quién se está por ir: los que vencen en los próximos 7 días y los que ya tienen la cuota
// vencida sin haberse dado de baja, con el botón de WhatsApp para salir a buscarlos.
//
// ⚠️ Los días los dice el BACKEND (diasRestantes / diasVencido, de MemberAccessPolicy), igual
// que en Socios. Esta pantalla los calculaba con su propia cuenta y el mismo socio podía
// "vencer en 3 días" acá y en 2 en la lista de Socios.
// ============================================

import { useCallback } from 'react';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { dashboardStatsService } from '../services';
import { formatDate, getInitials } from '../lib/utils';
import { enlaceDeWhatsApp } from '../lib/whatsapp';
import { useQueryCache } from '../hooks';
import { PageHeader } from '../components/Layout';
import Icon from '../components/Icon';
import StatCard from '../components/ui/StatCard';

/** Un renglón de las dos listas: quién, qué le pasa, cuántos días y el botón para escribirle. */
function FilaDeSocio({ socio, tono, detalle, dias, apagado, onWhatsApp }) {
  return (
    <div className={`checked-in-item retencion-fila${apagado ? ' esta-actualizando' : ''}`}>
      <div className={`member-avatar retencion-avatar es-${tono}`}>{getInitials(socio.fullName)}</div>
      <div className="member-info">
        <div className="member-name">{socio.fullName}</div>
        <div className="retencion-detalle">{detalle}</div>
      </div>
      {dias}
      {socio.phone ? (
        <button
          type="button" className="action-btn-quick action-btn-whatsapp"
          onClick={() => onWhatsApp(socio)}
          title="Escribirle por WhatsApp" aria-label={`Escribirle a ${socio.fullName} por WhatsApp`}
        >
          <Icon name="messageCircle" size="1em" />
        </button>
      ) : (
        // Sin teléfono: el lugar del botón queda, para que las filas no se corran.
        <span className="action-btn-hueco" title="Sin teléfono en la ficha" />
      )}
    </div>
  );
}

export default function RetentionPage() {
  const { showToast } = useToast();
  const { orgName } = useAuth();

  const fetchRetentionData = useCallback(async () => {
    return await dashboardStatsService.getRetentionAnalytics();
  }, []);

  const { data, loading, isFetching } = useQueryCache(
    'retention_analytics',
    fetchRetentionData,
    { staleTime: 5 * 60 * 1000 } // 5 min stale time
  );

  const analytics = data || {
    total_members: 0,
    active_members: 0,
    inactive_members: 0,
    retention_rate: 0,
    expiring_soon: [],
    at_risk: []
  };
  // En orden de urgencia: primero el que vence antes, y de los vencidos primero el más
  // reciente, que es el más fácil de recuperar. El servidor los manda en cualquier orden.
  const porDias = (campo) => (a, b) => (a[campo] ?? Infinity) - (b[campo] ?? Infinity);
  const porVencer = [...(analytics.expiring_soon || [])].sort(porDias('diasRestantes'));
  const vencidos = [...(analytics.at_risk || [])].sort(porDias('diasVencido'));

  // El mensaje dice lo que le pasa a ESE socio: al que ya venció no se le escribe "está por
  // vencer" (antes los dos recibían el mismo texto).
  const openWhatsApp = (socio, yaVencio) => {
    const nombre = (socio.fullName || '').split(' ')[0];
    const gimnasio = orgName || 'el gimnasio';
    const fecha = formatDate(socio.membershipEnd);
    const mensaje = yaVencio
      ? `¡Hola ${nombre}! Te escribimos de ${gimnasio}. Tu cuota venció el ${fecha}. ¿Querés renovarla?`
      : `¡Hola ${nombre}! Te escribimos de ${gimnasio}. Tu cuota vence el ${fecha}. ¿Querés renovarla?`;
    const enlace = enlaceDeWhatsApp(socio.phone, mensaje);
    if (!enlace) {
      showToast(`El teléfono de la ficha (${socio.phone}) no parece un número completo`, 'warning');
      return;
    }
    window.open(enlace, '_blank', 'noopener');
  };

  if (loading) return <div className="dashboard-loading"><span className="spinner" /> Cargando…</div>;

  return (
    <div className="retention-page">
      <PageHeader
        title="Retención de socios"
        subtitle={isFetching && data ? 'Actualizando datos…' : 'A quién escribirle antes de que se vaya'}
        icon="heartHandshake"
      />

      {/* ⚠️ "Dados de alta" y no "activos": cuenta a los al día Y a los vencidos que no se dieron
          de baja. En el tablero "al día" y "vencidos" van por separado, y una tercera palabra
          para la suma hacía creer que eran tres números distintos del mismo padrón. */}
      <div className="stats-grid mb-3">
        <StatCard icon="users" color="success" value={`${analytics.retention_rate}%`} label="Tasa de retención"
          nota="Los que se anotaron y no se dieron de baja" />
        <StatCard icon="calendarEvent" color="warning" value={porVencer.length} label="Vencen esta semana" />
        <StatCard icon="alertTriangle" color="error" value={vencidos.length} label="Con la cuota vencida" />
        <StatCard icon="check" color="primary" value={analytics.active_members} label="Socios dados de alta" />
      </div>

      <div className="dashboard-grid">
        <div className="card">
          <div className="table-header">
            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Icon name="clock" size="1em" /> Vencen pronto</h3>
            <span className="badge badge-warning badge-count">{porVencer.length}</span>
          </div>
          <div className="retencion-lista">
            {porVencer.length === 0 ? (
              <div className="text-center text-muted retencion-vacio">Nadie vence en los próximos 7 días.</div>
            ) : porVencer.map((m) => (
              <FilaDeSocio
                key={m.id} socio={m} tono="aviso" apagado={isFetching}
                detalle={`Vence el ${formatDate(m.membershipEnd)}`}
                dias={m.diasRestantes != null && (
                  <span className="days-countdown days-warning">{m.diasRestantes}d</span>
                )}
                onWhatsApp={(s) => openWhatsApp(s, false)}
              />
            ))}
          </div>
        </div>

        <div className="card">
          <div className="table-header">
            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Icon name="alertTriangle" size="1em" /> Con la cuota vencida</h3>
            <span className="badge badge-error badge-count">{vencidos.length}</span>
          </div>
          <div className="retencion-lista">
            {vencidos.length === 0 ? (
              <div className="text-center text-muted retencion-vacio">Nadie tiene la cuota vencida.</div>
            ) : vencidos.map((m) => (
              <FilaDeSocio
                key={m.id} socio={m} tono="vencido" apagado={isFetching}
                // Decía "Sin pagos en 30+ días", que no es lo que cuenta el servidor: son los
                // que tienen la cuota vencida, desde el día que sea.
                detalle={`Venció el ${formatDate(m.membershipEnd)}`}
                dias={m.diasVencido != null && (
                  <span className="days-countdown days-expired">{m.diasVencido}d vencido</span>
                )}
                onWhatsApp={(s) => openWhatsApp(s, true)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
