// ============================================
// VELTRONIK V2 - DASHBOARD PAGE (Refactored)
// ============================================

import { useCallback } from 'react';
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
import { useToast } from '../contexts/ToastContext';
import { useDashboardController } from '../controllers/useDashboardController';
import { formatCurrency, formatDate, getStatusLabel, getStatusBadgeClass } from '../lib/utils';
import { PageHeader } from '../components/Layout';
import { StatCard } from '../components/ui';
import Icon from '../components/Icon';
import CONFIG from '../lib/config';
import CourtDashboardPage from './CourtDashboardPage';

// Register Chart.js modules
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Filler, Tooltip, Legend);

export default function DashboardPage() {
  const { gym, orgRole } = useAuth();

  // FUTBOL_5: dueño/admin ven el Dashboard de canchas (ganancias, ocupación, predicción);
  // staff/reception trabajan en la grilla (el tablero operativo). Va ANTES del redirect
  // por rol de gym para no caer en el loop con el OrgTypeGuard.
  const orgTypeCurrent = gym?.type || localStorage.getItem('current_org_type') || 'GYM';
  if (orgTypeCurrent === 'FUTBOL_5') {
    if (orgRole === 'owner' || orgRole === 'admin') {
      return <CourtDashboardPage />;
    }
    return <Navigate to={CONFIG.ROUTES.COURT_GRID} replace />;
  }

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
  const { showToast } = useToast();
  const orgType = gym?.type || 'GYM';
  const membersLabel = (orgType === 'PILATES' || orgType === 'ACADEMY') ? 'Alumnos' : 'Socios';

  const {
    dashboardStats,
    prediction,
    alerts,
    insights,
    revenueChartData,
    membersChartData,
    recentMembers,
    loading,
    isFetching,
    handleRefreshStats: controllerRefreshStats
  } = useDashboardController(gym);

  const handleRefreshStats = useCallback(async () => {
    const ok = await controllerRefreshStats();
    if (ok) {
      showToast('Estadísticas actualizadas', 'success');
    } else {
      showToast('Las estadísticas se están calculando en tiempo real', 'info');
    }
  }, [controllerRefreshStats, showToast]);

  // ─── CHART CONFIGS ───
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
        pointBackgroundColor: '#0EA5E9',
        pointBorderColor: '#fff',
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
          label: (ctx) => formatCurrency(ctx.raw),
        },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: '#94A3B8' } },
      y: {
        grid: { color: 'rgba(148, 163, 184, 0.1)' },
        ticks: {
          color: '#94A3B8',
          callback: (v) => v >= 1000 ? '$' + (v / 1000).toFixed(1) + 'k' : '$' + Math.round(v),
        },
      },
    },
  };

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
        <PageHeader title="Dashboard" subtitle="Vista general de tu negocio" icon="dashboard" />
        <div className="dashboard-loading">
          <div className="loading-spinner" />
          <p className="text-muted">Cargando dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <PageHeader
        title="Dashboard"
        subtitle={isFetching ? "Actualizando datos..." : "Vista general de tu negocio"}
        icon="dashboard"
        actions={
          <div className="flex gap-2 items-center">
            <button
              className="btn btn-sm btn-ghost"
              onClick={handleRefreshStats}
              disabled={isFetching}
              title="Actualizar estadísticas"
            >
              {isFetching ? <span className="spinner" /> : <Icon name="refresh" />}
            </button>
            <span className={`badge ${(gym?.active ?? gym?.isActive) ? 'badge-success' : 'badge-warning'}`}>
              {(gym?.active ?? gym?.isActive) ? 'Activo' : 'Inactivo'}
            </span>
          </div>
        }
      />

      {/* Stats Cards */}
      <div className="stats-grid">
        <StatCard icon="users" label={`${membersLabel} Activos`} value={dashboardStats.activeMembers} color="primary" />
        <StatCard icon="wallet" label="Ingresos del Mes" value={formatCurrency(dashboardStats.monthlyRevenue)} color="success" />
        <StatCard icon="bell" label="Pagos Vencidos" value={dashboardStats.expiredMembers} color="warning" />
        <StatCard icon="calendar" label="Vencen esta semana" value={dashboardStats.expiringMembers} color="accent" />
      </div>

      {/* AI Section */}
      <div className="ai-section">
        <h2 className="ai-section-title">
          <Icon name="brain" size="1.2em" /> Inteligencia Artificial
          <span className="ai-badge">AI Powered</span>
        </h2>

        <div className="dashboard-grid-3">
          {/* Prediction Card */}
          <div className="prediction-card">
            <div className="prediction-header">
              <span className="prediction-label"><Icon name="chart" size="1em" /> Predicción Próximo Mes</span>
              <span className="prediction-confidence"><Icon name="target" size="1em" /> {prediction.confidence}% confianza</span>
            </div>
            <div className="prediction-value">{formatCurrency(prediction.predicted)}</div>
            <div className="prediction-trend">
              <span className={`trend-${prediction.trend}`}>
                <Icon name={prediction.trend === 'up' ? 'trendingUp' : prediction.trend === 'down' ? 'trendingDown' : 'arrowRight'} size="1em" />
                {' '}{parseFloat(prediction.percentChange) > 0 ? '+' : ''}{prediction.percentChange}% vs promedio
              </span>
            </div>
          </div>

          {/* Revenue Chart */}
          <div className="card chart-card">
            <h4 className="chart-title"><Icon name="trendingUp" size="1em" /> Ingresos Mensuales</h4>
            <div className="chart-container">
              <Line data={revenueChart} options={revenueChartOptions} />
            </div>
          </div>

          {/* Members Chart */}
          <div className="card chart-card">
            <h4 className="chart-title"><Icon name="users" size="1em" /> Estado de {membersLabel}</h4>
            <div className="chart-container">
              <Doughnut data={membersChart} options={membersChartOptions} />
            </div>
          </div>
        </div>
      </div>

      {/* Insights + Alerts */}
      <div className="dashboard-grid">
        {/* Insights */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title"><Icon name="lightbulb" size="1em" /> Insights del Día</h3>
          </div>
          <div className="insights-panel">
            {insights.length === 0 ? (
              <div className="insight-item info">
                <span className="insight-icon"><Icon name="moon2" size="1.1em" /></span>
                <div className="insight-content">
                  <div className="insight-title">Sin novedades</div>
                  <div className="insight-message">Todo está en orden por ahora</div>
                </div>
              </div>
            ) : (
              insights.map((insight, i) => (
                <div key={i} className={`insight-item ${insight.type}`}>
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
              alerts.slice(0, 8).map((alert, i) => {
                const dotColor = alert.type === 'expired' ? 'var(--error-500)' : alert.type === 'urgent' ? 'var(--warning-500)' : 'var(--info-500)';
                return (
                  <div key={i} className={`alert-item ${alert.priority === 'medium' ? 'medium' : ''}`}>
                    <span className="alert-dot" style={{ background: dotColor, boxShadow: `0 0 0 3px color-mix(in srgb, ${dotColor} 18%, transparent)` }} />
                    <span className="alert-text">{alert.message}</span>
                  </div>
                );
              })
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
                      <td>{member.fullName}</td>
                      <td>{member.dni || '-'}</td>
                      <td>
                        <span className={`badge ${getStatusBadgeClass(member.status)}`}>
                          {getStatusLabel(member.status)}
                        </span>
                      </td>
                      <td>{formatDate(member.membershipEnd)}</td>
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
              <span className="quick-action-label">Nuevo {membersLabel === 'Alumnos' ? 'Alumno' : 'Socio'}</span>
            </Link>
            <Link to={`${CONFIG.ROUTES.PAYMENTS}?action=new`} className="quick-action">
              <span className="quick-action-icon"><Icon name="wallet" /></span>
              <span className="quick-action-label">Registrar Pago</span>
            </Link>
            <Link to={CONFIG.ROUTES.MEMBERS} className="quick-action">
              <span className="quick-action-icon"><Icon name="search" /></span>
              <span className="quick-action-label">Buscar {membersLabel === 'Alumnos' ? 'Alumno' : 'Socio'}</span>
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
