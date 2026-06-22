// ============================================
// VELTRONIK V2 - DASHBOARD DE CANCHAS (FUTBOL_5)
// ============================================
// Tablero del dueño/admin: ganancias, ocupación (la métrica reina),
// no-shows (el enemigo), método de pago, mapa de calor día×hora y
// la capa Veltronik AI (predicción + insights accionables).
// Solo OWNER/ADMIN (el backend gatea /analytics con @PreAuthorize).
// ============================================

import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, ArcElement, Filler, Tooltip, Legend,
} from 'chart.js';
import { Line, Doughnut } from 'react-chartjs-2';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { courtService } from '../services';
import { formatCurrency } from '../lib/utils';
import { PageHeader } from '../components/Layout';
import { StatCard } from '../components/ui';
import Icon from '../components/Icon';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Filler, Tooltip, Legend);

const DAY_SHORT = ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const INSIGHT_ICON = { warning: 'alertTriangle', info: 'info', tip: 'lightbulb', success: 'checkCircle' };
const TREND_ICON = { up: 'trendingUp', down: 'trendingDown', flat: 'arrowRight' };

export default function CourtDashboardPage() {
  const { orgRole } = useAuth();
  const { showToast } = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    courtService.getDashboard()
      .then(setData)
      .catch((err) => showToast(err.message || 'Error al cargar el dashboard', 'error'))
      .finally(() => setLoading(false));
  }, [showToast]);

  // Defensa en profundidad: si no es dueño/admin, a la grilla (el backend igual lo bloquea).
  if (orgRole && orgRole !== 'owner' && orgRole !== 'admin') {
    return <Navigate to="/court-grid" replace />;
  }

  if (loading) {
    return (
      <div>
        <PageHeader title="Dashboard" subtitle="Vista general del complejo" icon="dashboard" />
        <div className="card text-center text-muted" style={{ padding: '3rem' }}>
          <span className="spinner" /> Cargando dashboard...
        </div>
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="dashboard">
      <PageHeader title="Dashboard" subtitle="Vista general del complejo" icon="dashboard" />

      {/* KPIs */}
      <div className="stats-grid">
        <StatCard icon="dollarSign" label="Ingresos del mes" value={formatCurrency(data.monthRevenue)} color="success" />
        <StatCard icon="grid" label="Ocupación promedio" value={`${data.occupancyPct}%`} color="primary" />
        <StatCard icon="futbol" label="Turnos jugados" value={data.completedCount} color="accent" />
        <StatCard icon="xCircle" label={`No-shows (${data.noShowRatePct}%)`} value={data.noShowCount} color="warning" />
      </div>

      {/* Veltronik AI */}
      <div className="ai-section">
        <h2 className="ai-section-title">
          <Icon name="brain" size="1.2em" /> Veltronik AI
          <span className="ai-badge">AI Powered</span>
        </h2>

        <div className="dashboard-grid-3">
          {/* Predicción */}
          <div className="prediction-card">
            <div className="prediction-header">
              <span className="prediction-label"><Icon name="chart" size="1em" /> Proyección del mes</span>
              <span className="prediction-confidence"><Icon name="target" size="1em" /> {data.prediction.confidence}% confianza</span>
            </div>
            <div className="prediction-value">{formatCurrency(data.prediction.predicted)}</div>
            <div className="prediction-trend">
              <span className={`trend-${data.prediction.trend}`}>
                <Icon name={TREND_ICON[data.prediction.trend] || 'arrowRight'} size="1em" />
                {' '}{data.prediction.percentChange > 0 ? '+' : ''}{data.prediction.percentChange}% vs mes pasado
              </span>
            </div>
          </div>

          {/* Ingresos por día */}
          <div className="card chart-card">
            <h4 className="chart-title"><Icon name="trendingUp" size="1em" /> Ingresos (últimos 14 días)</h4>
            <div className="chart-container"><Line data={revenueChart(data)} options={LINE_OPTS} /></div>
          </div>

          {/* Método de pago */}
          <div className="card chart-card">
            <h4 className="chart-title"><Icon name="wallet" size="1em" /> Cómo te pagan</h4>
            <div className="chart-container"><Doughnut data={methodChart(data)} options={DOUGHNUT_OPTS} /></div>
          </div>
        </div>
      </div>

      {/* Heatmap + insights */}
      <div className="dashboard-grid">
        <div className="card">
          <div className="card-header">
            <h3 className="card-title"><Icon name="grid" size="1em" /> Mapa de calor — ocupación por día y hora</h3>
          </div>
          <Heatmap cells={data.heatmap} />
        </div>

        <div className="card">
          <div className="card-header">
            <h3 className="card-title"><Icon name="lightbulb" size="1em" /> Insights</h3>
          </div>
          <div className="insights-panel">
            {data.insights.length === 0 ? (
              <div className="insight-item info">
                <span className="insight-icon"><Icon name="checkCircle" size="1.1em" /></span>
                <div className="insight-content">
                  <div className="insight-title">Todo en orden</div>
                  <div className="insight-message">Sin alertas por ahora.</div>
                </div>
              </div>
            ) : data.insights.map((it, i) => (
              <div key={i} className={`insight-item ${it.type === 'tip' ? 'info' : it.type}`}>
                <span className="insight-icon"><Icon name={INSIGHT_ICON[it.type] || 'info'} size="1.1em" /></span>
                <div className="insight-content">
                  <div className="insight-title">{it.title}</div>
                  <div className="insight-message">{it.message}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Por cancha + top clientes */}
      <div className="dashboard-grid">
        <div className="card">
          <div className="card-header"><h3 className="card-title"><Icon name="futbol" size="1em" /> Por cancha</h3></div>
          <div className="court-bycourt">
            {data.byCourt.length === 0 ? (
              <div className="text-muted text-center" style={{ padding: '1.5rem' }}>Sin datos del mes.</div>
            ) : data.byCourt.map((c) => (
              <div key={c.court} className="court-bycourt-row">
                <span className="court-bycourt-name">{c.court}</span>
                <div className="court-bycourt-bar"><span style={{ width: `${c.occupancyPct}%` }} /></div>
                <span className="court-bycourt-occ">{c.occupancyPct}%</span>
                <span className="court-bycourt-rev">{formatCurrency(c.revenue)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h3 className="card-title"><Icon name="star" size="1em" /> Mejores clientes del mes</h3></div>
          <div className="table-container">
            <table className="table">
              <thead><tr><th>Cliente</th><th>Turnos</th><th>Gastó</th></tr></thead>
              <tbody>
                {data.topCustomers.length === 0 ? (
                  <tr><td colSpan="3" className="text-center text-muted" style={{ padding: '1.5rem' }}>Sin clientes este mes</td></tr>
                ) : data.topCustomers.map((c, i) => (
                  <tr key={i}>
                    <td data-label="Cliente">{c.name}</td>
                    <td data-label="Turnos">{c.visits}</td>
                    <td data-label="Gastó">{formatCurrency(c.spent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.botConversations > 0 && (
            <div className="text-muted" style={{ fontSize: '0.75rem', padding: '0.75rem 0.25rem 0' }}>
              <Icon name="messageCircle" size="0.9em" /> Bot: {data.botConversations} conversación(es), {data.botHandoffs} derivada(s) a una persona.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Heatmap ───
function Heatmap({ cells }) {
  const { hours, byKey } = useMemo(() => {
    const hs = [...new Set(cells.map((c) => c.hour))].sort((a, b) => a - b);
    const map = {};
    cells.forEach((c) => { map[`${c.dayOfWeek}-${c.hour}`] = c.occupancyPct; });
    return { hours: hs, byKey: map };
  }, [cells]);

  if (hours.length === 0) return <div className="text-muted text-center" style={{ padding: '1.5rem' }}>Sin datos todavía.</div>;

  const cellColor = (pct) => pct == null
    ? 'transparent'
    : `color-mix(in srgb, #22c55e ${Math.max(6, pct)}%, transparent)`;

  return (
    <div className="court-heatmap-wrap">
      <table className="court-heatmap">
        <thead>
          <tr>
            <th />
            {[1, 2, 3, 4, 5, 6, 7].map((d) => <th key={d}>{DAY_SHORT[d]}</th>)}
          </tr>
        </thead>
        <tbody>
          {hours.map((h) => (
            <tr key={h}>
              <td className="court-heatmap-hour">{String(h).padStart(2, '0')}h</td>
              {[1, 2, 3, 4, 5, 6, 7].map((d) => {
                const pct = byKey[`${d}-${h}`];
                return (
                  <td key={d}>
                    <span
                      className="court-heatmap-cell"
                      style={{ background: cellColor(pct) }}
                      title={`${DAY_SHORT[d]} ${h}h · ${pct ?? 0}% ocupación`}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="court-heatmap-legend text-muted">
        Menos <span className="court-heatmap-scale" /> Más ocupación
      </div>
    </div>
  );
}

// ─── Chart configs ───
function revenueChart(d) {
  return {
    labels: d.revenueByDay.map((p) => p.date.slice(8, 10) + '/' + p.date.slice(5, 7)),
    datasets: [{
      label: 'Ingresos', data: d.revenueByDay.map((p) => Number(p.amount) || 0),
      borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.12)',
      borderWidth: 3, fill: true, tension: 0.4, pointRadius: 3, pointHoverRadius: 6,
    }],
  };
}
const LINE_OPTS = {
  responsive: true, maintainAspectRatio: false,
  plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => formatCurrency(c.raw) } } },
  scales: {
    x: { grid: { display: false }, ticks: { color: '#94A3B8', maxRotation: 0, autoSkip: true } },
    y: { grid: { color: 'rgba(148,163,184,0.1)' }, ticks: { color: '#94A3B8', callback: (v) => v >= 1000 ? '$' + (v / 1000).toFixed(0) + 'k' : '$' + v } },
  },
};
function methodChart(d) {
  return {
    labels: ['Efectivo', 'Transferencia', 'Mercado Pago'],
    datasets: [{
      data: [Number(d.collectedCash) || 0, Number(d.collectedTransfer) || 0, Number(d.collectedMp) || 0],
      backgroundColor: ['#22c55e', '#0ea5e9', '#6366f1'], borderWidth: 0, hoverOffset: 8,
    }],
  };
}
const DOUGHNUT_OPTS = {
  responsive: true, maintainAspectRatio: false, cutout: '70%',
  plugins: {
    legend: { position: 'bottom', labels: { color: '#94A3B8', padding: 12, usePointStyle: true, font: { size: 11 } } },
    tooltip: { callbacks: { label: (c) => `${c.label}: ${formatCurrency(c.raw)}` } },
  },
};
