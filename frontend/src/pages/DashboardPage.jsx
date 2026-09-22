// ============================================
// VELTRONIK V2 - DASHBOARD PAGE (Refactored)
// ============================================

import { Link, Navigate } from 'react-router-dom';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js';
import { Line, Doughnut } from 'react-chartjs-2';
import { useAuth } from '../contexts/AuthContext';
import { useDashboardController } from '../controllers/useDashboardController';
import { formatCurrency, formatDate, getStatusLabel, getStatusBadgeClass } from '../lib/utils';
import { montoCorto } from '../lib/resumenDashboard';
import { GYM } from '../lib/gym';
import { PageHeader } from '../components/Layout';
import { StatCard } from '../components/ui';
import Icon from '../components/Icon';
import CONFIG from '../lib/config';

// Register Chart.js modules
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Filler, Tooltip, Legend);

/** Cuántas alertas entran en el panel antes de "y N más". */
const ALERTAS_VISIBLES = 8;

export default function DashboardPage() {
  const { gym, orgRole } = useAuth();

  // El backend restringe los KPIs financieros (stats/pagos) a OWNER/ADMIN. Para
  // staff/reception esta página solo produciría 403s: los mandamos a su pantalla
  // de trabajo (Acceso). Cubre deep-links; el sidebar ya no les ofrece Dashboard.
  if (orgRole === 'staff' || orgRole === 'reception') {
    return <Navigate to={CONFIG.ROUTES.ACCESS} replace />;
  }

  // Solo dashboard de GYM (resto de rubros fueron eliminados)

  return <GymDashboard gym={gym} />;
}

function GymDashboard({ gym }) {
  const { membersLabel, memberLabel } = GYM;

  const {
    dashboardStats,
    comparacion,
    prediction,
    alerts,
    alertsTotal,
    insights,
    revenueChartData,
    membersChartData,
    recentMembers,
    loading,
    error,
    reintentar,
  } = useDashboardController(gym);

  // ─── CHART CONFIGS ───
  //
  // ⭐ El último punto es el MES EN CURSO: se dibuja hueco y con el tramo que llega a él
  // punteado. Sin eso, el día 5 el gráfico mostraba un derrumbe que no existía — un mes de
  // cinco días al lado de meses enteros, dibujado igual que ellos.
  const { enCurso } = revenueChartData;
  const esEnCurso = (i) => i === enCurso;
  const revenueChart = {
    labels: revenueChartData.labels,
    datasets: [
      {
        label: 'Ingresos',
        data: revenueChartData.data,
        borderColor: '#0EA5E9',
        backgroundColor: 'rgba(14, 165, 233, 0.1)',
        borderWidth: 3,
        fill: true,
        tension: 0.4,
        // "monotone": la curva pasa POR los puntos sin inventar picos entre ellos. Con el spline
        // común, entre marzo y abril dibujaba una cresta más alta que los dos meses, un récord
        // que nunca existió.
        cubicInterpolationMode: 'monotone',
        segment: { borderDash: (ctx) => (esEnCurso(ctx.p1DataIndex) ? [6, 6] : undefined) },
        pointBackgroundColor: revenueChartData.data.map((_, i) => (esEnCurso(i) ? '#0F172A' : '#0EA5E9')),
        pointBorderColor: revenueChartData.data.map((_, i) => (esEnCurso(i) ? '#0EA5E9' : '#fff')),
        pointBorderWidth: 2,
        pointRadius: 5,
        pointHoverRadius: 7,
      },
    ],
  };

  const revenueChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.9)',
        titleFont: { size: 12 },
        bodyFont: { size: 14 },
        padding: 12,
        callbacks: {
          title: (items) => {
            const i = items[0]?.dataIndex;
            return esEnCurso(i)
              ? `${items[0].label} (en curso, al día ${revenueChartData.dia})`
              : items[0]?.label;
          },
          label: (ctx) => formatCurrency(ctx.raw),
        },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: '#94A3B8' } },
      // "$8,5 M" y "$850 mil", no "$8500.0k": un gimnasio que factura millones leía cuatro
      // cifras con un punto y una "k" en inglés.
      // Desde CERO: con el eje arrancando en $5 M, pasar de $5,4 M a $5,3 M se veía como un
      // derrumbe. La altura de cada punto tiene que ser proporcional a la plata.
      y: {
        beginAtZero: true,
        grid: { color: 'rgba(148, 163, 184, 0.1)' },
        ticks: { color: '#94A3B8', callback: montoCorto },
      },
    },
  };

  // Total real de socios contados por el gráfico. Si es 0 no hay torta que dibujar
  // (ver el bloque del gráfico más abajo).
  const membersTotal = membersChartData.data.reduce((sum, n) => sum + n, 0);

  const membersChart = {
    labels: membersChartData.labels,
    datasets: [
      {
        data: membersChartData.data,
        backgroundColor: membersChartData.colors,
        borderWidth: 0,
        hoverOffset: 8,
      },
    ],
  };

  const membersChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '70%',
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          color: '#94A3B8',
          padding: 15,
          usePointStyle: true,
          font: { size: 11 },
        },
      },
      tooltip: { backgroundColor: 'rgba(15, 23, 42, 0.9)', padding: 12 },
    },
  };



  if (loading) {
    return (
      <div>
        <PageHeader title="Dashboard" subtitle="Vista general de tu gimnasio" icon="layoutDashboard" />
        <div className="dashboard-loading">
          <div className="loading-spinner" />
          <p className="text-muted">Cargando dashboard...</p>
        </div>
      </div>
    );
  }

  // ⚠️ Sin datos no se pintan ceros. "0 socios al día" y "$0 de ingresos" son afirmaciones, y
  // el día que el servidor no contestaba el dueño leía que su gimnasio estaba vacío.
  if (error) {
    return (
      <div>
        <PageHeader title="Dashboard" subtitle="Vista general de tu gimnasio" icon="layoutDashboard" />
        <div className="card dashboard-error" role="alert">
          <strong>No se pudo cargar el panel.</strong>
          <span className="text-muted">
            Puede ser la conexión o el servidor. Tus datos están bien: es solo esta pantalla.
          </span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={reintentar}>
            <Icon name="rotateCw" size="1em" /> Reintentar
          </button>
        </div>
      </div>
    );
  }

  // Cómo viene el mes, frente al mismo tramo del mes pasado.
  const detalleDelMes = comparacion && comparacion.cambio !== null
    ? `${comparacion.cambio > 0 ? '+' : ''}${comparacion.cambio}% frente al 1 al ${comparacion.dia} de ${comparacion.mesAnterior}`
    : null;
  const tonoDelMes = comparacion?.cambio > 0 ? 'up' : comparacion?.cambio < 0 ? 'down' : undefined;
  // De qué está hecho el número: las ventas de la caja y el historial importado suman adentro
  // (es el mismo total de la caja, Pagos y el Excel), y se dice en su propio renglón.
  const notaDelMes = [
    dashboardStats.ventasDelMes > 0 && `${formatCurrency(dashboardStats.ventasDelMes)} de ventas`,
    dashboardStats.historialDelMes > 0 && `${formatCurrency(dashboardStats.historialDelMes)} del historial importado`,
  ].filter(Boolean).join(' · ');

  return (
    <div className="dashboard">
      {/* Sin badge "Activo" ni botón de recargar.
          El badge decía siempre lo mismo (un gimnasio inactivo no puede ni abrir esta
          pantalla: el Kill Switch del backend lo manda al muro de pago antes), así que
          era un cartel que informaba lo obvio. Y el botón de refrescar competía con él
          por el mismo rincón, parpadeando un spinner cada vez que la caché revalidaba.
          Los datos se refrescan solos; si alguien quiere forzarlo, F5. */}
      <PageHeader
        title="Dashboard"
        subtitle="Vista general de tu gimnasio"
        icon="layoutDashboard"
      />

      {/* Stats Cards
          En el ESCRITORIO quedan solo las dos de operación —quién debe y quién está por
          vencer—, que son las que la recepcionista puede accionar en el momento. El total
          de socios activos y los ingresos del mes son números de dueño, y el mostrador
          está a la vista de cualquiera que pase: en el portal siguen estando los cuatro. */}
      <div className="stats-grid">
        {!CONFIG.IS_DESKTOP && (
          <>
            {/* ⚠️ "Al día" y "vencidos" son dos cosas distintas y juntas dan el total de
                socios dados de alta. Antes esta tarjeta decía "Socios Activos" y contaba a
                los dos juntos, mientras el insight de abajo decía "6 de 10 activos"
                contando solo a los que pagaron: dos números para la misma palabra, en la
                misma pantalla. */}
            <StatCard icon="users" label={`${membersLabel} al día`} value={dashboardStats.alDia} color="primary" />
            <StatCard icon="cash" label="Ingresos del Mes" value={formatCurrency(dashboardStats.monthlyRevenue)}
              color="success" detail={detalleDelMes} detailTone={tonoDelMes}
              nota={notaDelMes ? `Incluye ${notaDelMes}` : undefined} />
          </>
        )}
        {/* Cuenta SOCIOS con la cuota vencida, no pagos: se llamaba "Pagos Vencidos" y no
            era lo que contaba. */}
        <StatCard icon="bell" label={`${membersLabel} vencidos`} value={dashboardStats.expiredMembers} color="warning" />
        <StatCard icon="calendarEvent" label="Vencen esta semana" value={dashboardStats.expiringMembers} color="accent" />
      </div>

      {/* AI Section — solo en el portal: la predicción de ingresos y los dos gráficos son
          para mirar el negocio, no para atender la puerta. */}
      {!CONFIG.IS_DESKTOP && (
      <div className="ai-section">
        <h2 className="ai-section-title">
          <Icon name="brain" size="1.2em" /> Inteligencia Artificial
          <span className="ai-badge">AI Powered</span>
        </h2>

        <div className="dashboard-grid-3">
          {/* Prediction Card */}
          {/* ⭐ Con meses CERRADOS. El mes en curso no entra: a mitad de mes es un mes a medias,
              y con él la predicción se desplomaba el día 1 y se recuperaba a fin de mes. */}
          <div className="prediction-card">
            <div className="prediction-header">
              <span className="prediction-label"><Icon name="chart" size="1em" /> Predicción de {prediction.mes}</span>
              {prediction.suficiente && (
                <span className="prediction-confidence"><Icon name="target" size="1em" /> {prediction.confidence}% confianza</span>
              )}
            </div>
            {prediction.suficiente ? (
              <>
                <div className="prediction-value">{formatCurrency(prediction.predicted)}</div>
                <div className="prediction-trend">
                  <span className={`trend-${prediction.trend}`}>
                    <Icon name={prediction.trend === 'up' ? 'trendingUp' : prediction.trend === 'down' ? 'trendingDown' : 'arrowRight'} size="1em" />
                    {' '}{parseFloat(prediction.percentChange) > 0 ? '+' : ''}
                    {/* Con coma, como se escribe acá: decía "-10.1%". */}
                    {Number(prediction.percentChange).toLocaleString('es-AR', { maximumFractionDigits: 1 })}% vs el promedio de {prediction.mesesCerrados} meses cerrados
                  </span>
                </div>
              </>
            ) : (
              <p className="prediction-pendiente">
                Se calcula con dos meses cerrados.{' '}
                {prediction.mesesCerrados === 1
                  ? 'Falta que cierre este mes.'
                  : 'Van a hacer falta este mes y el que viene.'}
              </p>
            )}
          </div>

          {/* Revenue Chart */}
          <div className="card chart-card">
            <h4 className="chart-title">
              <Icon name="trendingUp" size="1em" /> Ingresos Mensuales
              <span className="chart-subtitle">· {revenueChartData.mesEnCurso} en curso, al día {revenueChartData.dia}</span>
            </h4>
            <div className="chart-container">
              <Line data={revenueChart} options={revenueChartOptions} />
            </div>
          </div>

          {/* Members Chart */}
          <div className="card chart-card">
            <h4 className="chart-title"><Icon name="users" size="1em" /> Estado de {membersLabel}</h4>
            <div className="chart-container">
              {/* Un doughnut cuyos valores suman CERO no dibuja nada: Chart.js reparte
                  la circunferencia en proporción a los datos, y sin datos no hay arco
                  que pintar. El gimnasio nuevo veía un recuadro vacío y parecía que el
                  gráfico estaba roto. Cuando todavía no hay socios lo decimos con
                  palabras, que es lo único útil que se puede decir ahí. */}
              {membersTotal > 0 ? (
                <Doughnut data={membersChart} options={membersChartOptions} />
              ) : (
                <div className="chart-empty">
                  <Icon name="users" size="1.75rem" />
                  <p className="chart-empty-title">Todavía no hay {membersLabel.toLowerCase()}</p>
                  <Link to={`${CONFIG.ROUTES.MEMBERS}?action=new`} className="btn btn-sm btn-secondary">
                    <Icon name="plus" size="1em" /> Cargar el primero
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      )}

      {/* Insights + Alerts */}
      <div className="dashboard-grid">
        {/* Insights — solo en el portal, por lo mismo que la sección de arriba: son
            lecturas del negocio, no cosas que se accionen en el mostrador. */}
        {!CONFIG.IS_DESKTOP && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title"><Icon name="lightbulb" size="1em" /> Insights del Día</h3>
          </div>
          <div className="insights-panel">
            {insights.length === 0 ? (
              <div className="insight-item info">
                <span className="insight-icon"><Icon name="checkCircle" size="1.1em" /></span>
                <div className="insight-content">
                  <div className="insight-title">Sin novedades</div>
                  <div className="insight-message">Todo está en orden por ahora</div>
                </div>
              </div>
            ) : (
              insights.map((insight) => (
                <div key={`${insight.type}-${insight.title}`} className={`insight-item ${insight.type}`}>
                  <span className="insight-icon"><Icon name={insight.icon} size="1.1em" /></span>
                  <div className="insight-content">
                    <div className="insight-title">{insight.title}</div>
                    <div className="insight-message">{insight.message}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
        )}

        {/* Alerts */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title"><Icon name="alertTriangle" size="1em" /> Alertas de Vencimiento</h3>
          </div>
          <div className="alerts-panel">
            {alerts.length === 0 ? (
              <div className="alert-item success-alert">
                <span className="alert-icon" style={{ color: 'var(--success-500)' }}><Icon name="checkCircle" size="1.1em" /></span>
                <span className="alert-text">¡Excelente! No hay vencimientos próximos</span>
              </div>
            ) : (
              <>
                {/* La clave es el socio: con el nombre, dos "Juan Pérez" repetían clave y React
                    podía dejar pegada la alerta de uno en el renglón del otro. */}
                {alerts.slice(0, ALERTAS_VISIBLES).map((alert) => {
                  const dotColor = alert.type === 'expired' ? 'var(--error-500)' : alert.type === 'urgent' ? 'var(--warning-500)' : 'var(--info-500)';
                  return (
                    <div key={alert.id} className={`alert-item ${alert.priority === 'medium' ? 'medium' : ''}`}>
                      <span className="alert-dot" style={{ background: dotColor, boxShadow: `0 0 0 3px color-mix(in srgb, ${dotColor} 18%, transparent)` }} />
                      <span className="alert-text">{alert.message}</span>
                    </div>
                  );
                })}
                {/* Se muestran los más cercanos a hoy. El resto se cuenta y se llega con un clic:
                    antes la lista cortaba en 8 sin decir que había 170 más. */}
                {alertsTotal > Math.min(alerts.length, ALERTAS_VISIBLES) && (
                  <div className="alerts-mas">
                    <span>y {alertsTotal - Math.min(alerts.length, ALERTAS_VISIBLES)} más</span>
                    <Link to={`${CONFIG.ROUTES.MEMBERS}?estado=expired`} className="btn btn-sm btn-ghost">
                      Ver vencidos →
                    </Link>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Recent Members + Quick Actions */}
      <div className="dashboard-grid">
        {/* Recent Members */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Últimos {membersLabel}</h3>
            <Link to={CONFIG.ROUTES.MEMBERS} className="btn btn-sm btn-ghost">
              Ver todos →
            </Link>
          </div>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>DNI</th>
                  <th>Estado</th>
                  <th>Vencimiento</th>
                </tr>
              </thead>
              <tbody>
                {recentMembers.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="text-center text-muted" style={{ padding: '2rem' }}>
                      No hay {membersLabel.toLowerCase()} registrados
                    </td>
                  </tr>
                ) : (
                  recentMembers.map((member) => (
                    <tr key={member.id}>
                      <td data-label="Nombre">{member.fullName}</td>
                      <td data-label="DNI">{member.dni || '-'}</td>
                      <td data-label="Estado">
                        <span className={`badge ${getStatusBadgeClass(member.status)}`}>
                          {getStatusLabel(member.status)}
                        </span>
                      </td>
                      <td data-label="Vencimiento">{formatDate(member.membershipEnd)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Acciones Rápidas</h3>
          </div>
          <div className="quick-actions">
            <Link to={`${CONFIG.ROUTES.MEMBERS}?action=new`} className="quick-action">
              <span className="quick-action-icon"><Icon name="plus" /></span>
              <span className="quick-action-label">Nuevo {memberLabel}</span>
            </Link>
            <Link to={`${CONFIG.ROUTES.PAYMENTS}?action=new`} className="quick-action">
              <span className="quick-action-icon"><Icon name="cash" /></span>
              <span className="quick-action-label">Registrar Pago</span>
            </Link>
            <Link to={CONFIG.ROUTES.MEMBERS} className="quick-action">
              <span className="quick-action-icon"><Icon name="search" /></span>
              <span className="quick-action-label">Buscar {memberLabel}</span>
            </Link>
            <Link to={CONFIG.ROUTES.SETTINGS} className="quick-action">
              <span className="quick-action-icon"><Icon name="settings" /></span>
              <span className="quick-action-label">Configuración</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
