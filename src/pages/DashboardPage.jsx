// ============================================
// VELTRONIK V2 - DASHBOARD PAGE (Refactored)
// ============================================

import { Suspense, lazy, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
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
import { useQueryCache } from '../hooks';
import { memberService, paymentService, insightsService, dashboardStatsService } from '../services';
import { formatCurrency, formatDate, getStatusLabel, getStatusBadgeClass } from '../lib/utils';
import { PageHeader } from '../components/Layout';
import { StatCard } from '../components/ui';
import Icon from '../components/Icon';
import CONFIG from '../lib/config';

const RestaurantDashboardPage = lazy(() => import('./restaurant/RestaurantDashboardPage'));

// Register Chart.js modules
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Filler, Tooltip, Legend);

export default function DashboardPage() {
  const { gym } = useAuth();

  // Si es restaurante, mostrar dashboard de restaurante
  if (gym?.type === 'RESTO') {
    return (
      <Suspense fallback={<div className="dashboard-loading"><span className="spinner" /> Cargando dashboard...</div>}>
        <RestaurantDashboardPage />
      </Suspense>
    );
  }

  return <GymDashboard gym={gym} />;
}

function GymDashboard({ gym }) {
  const { showToast } = useToast();

  const fetchDashboardData = useCallback(async () => {
    // Stats vienen de vista materializada (1 RPC)
    // Members y payments solo se cargan para AI/charts
    const [dashStats, membersData, paymentsData] = await Promise.all([
      dashboardStatsService.getDashboardStats(),
      memberService.getAll().catch(() => []),
      paymentService.getAll().catch(() => []),
    ]);
    return { dashStats, membersData, paymentsData };
  }, []);

  const { data, loading, isFetching, invalidate } = useQueryCache(
    ['gym_dashboard', gym?.id], 
    fetchDashboardData,
    { staleTime: 3 * 60 * 1000 } // 3 minutes stale time
  );

  const stats = data?.dashStats;
  const members = data?.membersData || [];
  const payments = data?.paymentsData || [];

  // Refrescar vistas materializadas manualmente
  const handleRefreshStats = useCallback(async () => {
    try {
      const ok = await dashboardStatsService.refreshStats();
      if (ok) {
        invalidate(); // Forzar recarga completa de caché
        showToast('Estadísticas actualizadas', 'success');
      } else {
        showToast('Las estadísticas se están calculando en tiempo real', 'info');
      }
    } catch {
      showToast('Error al actualizar', 'error');
    }
  }, [invalidate, showToast]);

  // ─── STATS FROM RPC (or fallback computed) ───
  const dashboardStats = useMemo(() => {
    if (stats) {
      return {
        activeMembers: stats.active_members || 0,
        expiredMembers: stats.expired_members || 0,
        expiringMembers: stats.expiring_this_week || 0,
        monthlyRevenue: parseFloat(stats.monthly_revenue || 0),
      };
    }
    return { activeMembers: 0, expiredMembers: 0, expiringMembers: 0, monthlyRevenue: 0 };
  }, [stats]);

  // ─── AI DATA ───
  const prediction = useMemo(() => insightsService.predictNextMonthRevenue(payments), [payments]);
  const alerts = useMemo(() => insightsService.getPaymentAlerts(members), [members]);
  const insights = useMemo(() => insightsService.generateDailyInsights({ members, payments, gym }), [members, payments, gym]);
  const revenueChartData = useMemo(() => insightsService.getMonthlyRevenueChartData(payments, 6), [payments]);
  const membersChartData = useMemo(() => insightsService.getMemberStatusChartData(members), [members]);

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
          callback: (v) => '$' + (v / 1000) + 'k',
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

  // ─── RECENT MEMBERS ───
  const recentMembers = members.slice(0, 5);

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
            <span className={`badge ${gym?.status === 'active' ? 'badge-success' : 'badge-warning'}`}>
              {gym?.status === 'active' ? 'Activo' : gym?.status || '--'}
            </span>
          </div>
        }
      />

      {/* Stats Cards */}
      <div className="stats-grid">
        <StatCard icon="users" label="Socios Activos" value={dashboardStats.activeMembers} color="primary" />
        <StatCard icon="wallet" label="Ingresos del Mes" value={formatCurrency(dashboardStats.monthlyRevenue)} color="success" />
        <StatCard icon="bell" label="Pagos Vencidos" value={dashboardStats.expiredMembers} color="warning" />
        <StatCard icon="calendar" label="Vencen esta semana" value={dashboardStats.expiringMembers} color="accent" />
      </div>

      {/* AI Section */}
      <div className="ai-section">
        <h2 className="ai-section-title">
          🧠 Inteligencia Artificial
          <span className="ai-badge">AI Powered</span>
        </h2>

        <div className="dashboard-grid-3">
          {/* Prediction Card */}
          <div className="prediction-card">
            <div className="prediction-header">
              <span className="prediction-label">📊 Predicción Próximo Mes</span>
              <span className="prediction-confidence">🎯 {prediction.confidence}% confianza</span>
            </div>
            <div className="prediction-value">{formatCurrency(prediction.predicted)}</div>
            <div className="prediction-trend">
              <span className={`trend-${prediction.trend}`}>
                {prediction.trend === 'up' ? '📈' : prediction.trend === 'down' ? '📉' : '➡️'}
                {' '}{parseFloat(prediction.percentChange) > 0 ? '+' : ''}{prediction.percentChange}% vs promedio
              </span>
            </div>
          </div>

          {/* Revenue Chart */}
          <div className="card chart-card">
            <h4 className="chart-title">📈 Ingresos Mensuales</h4>
            <div className="chart-container">
              <Line data={revenueChart} options={revenueChartOptions} />
            </div>
          </div>

          {/* Members Chart */}
          <div className="card chart-card">
            <h4 className="chart-title">👥 Estado de Socios</h4>
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
            <h3 className="card-title">💡 Insights del Día</h3>
          </div>
          <div className="insights-panel">
            {insights.length === 0 ? (
              <div className="insight-item info">
                <span className="insight-icon">💤</span>
                <div className="insight-content">
                  <div className="insight-title">Sin novedades</div>
                  <div className="insight-message">Todo está en orden por ahora</div>
                </div>
              </div>
            ) : (
              insights.map((insight, i) => (
                <div key={i} className={`insight-item ${insight.type}`}>
                  <span className="insight-icon">{insight.icon}</span>
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
            <h3 className="card-title">⚠️ Alertas de Vencimiento</h3>
          </div>
          <div className="alerts-panel">
            {alerts.length === 0 ? (
              <div className="alert-item success-alert">
                <span className="alert-icon">✅</span>
                <span className="alert-text">¡Excelente! No hay vencimientos próximos</span>
              </div>
            ) : (
              alerts.slice(0, 8).map((alert, i) => (
                <div key={i} className={`alert-item ${alert.priority === 'medium' ? 'medium' : ''}`}>
                  <span className="alert-icon">
                    {alert.type === 'expired' ? '🔴' : alert.type === 'urgent' ? '🟠' : '🟡'}
                  </span>
                  <span className="alert-text">{alert.message}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Recent Members + Quick Actions */}
      <div className="dashboard-grid">
        {/* Recent Members */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Últimos Socios</h3>
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
                      No hay socios registrados
                    </td>
                  </tr>
                ) : (
                  recentMembers.map((member) => (
                    <tr key={member.id}>
                      <td>{member.full_name}</td>
                      <td>{member.dni || '-'}</td>
                      <td>
                        <span className={`badge ${getStatusBadgeClass(member.status)}`}>
                          {getStatusLabel(member.status)}
                        </span>
                      </td>
                      <td>{formatDate(member.membership_end)}</td>
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
              <span className="quick-action-label">Nuevo Socio</span>
            </Link>
            <Link to={`${CONFIG.ROUTES.PAYMENTS}?action=new`} className="quick-action">
              <span className="quick-action-icon"><Icon name="wallet" /></span>
              <span className="quick-action-label">Registrar Pago</span>
            </Link>
            <Link to={CONFIG.ROUTES.MEMBERS} className="quick-action">
              <span className="quick-action-icon"><Icon name="search" /></span>
              <span className="quick-action-label">Buscar Socio</span>
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
