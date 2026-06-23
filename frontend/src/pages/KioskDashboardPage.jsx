// ============================================
// VELTRONIK V2 - DASHBOARD DE KIOSCO (KIOSCO)
// ============================================
// Tablero del dueño/admin: rentabilidad (vender con margen, no
// solo vender), producto estrella, hora pico, cómo te pagan,
// fiado por cobrar y stock para reponer, + la capa Veltronik AI
// (insights accionables). Solo OWNER/ADMIN (el backend gatea
// /analytics con @PreAuthorize).
// ============================================

import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, ArcElement, Filler, Tooltip, Legend,
} from 'chart.js';
import { Line, Doughnut, Bar } from 'react-chartjs-2';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { kioskService } from '../services';
import { formatCurrency } from '../lib/utils';
import { PageHeader } from '../components/Layout';
import { StatCard } from '../components/ui';
import Icon from '../components/Icon';
import CONFIG from '../lib/config';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Filler, Tooltip, Legend);

const INSIGHT_ICON = { warning: 'alertTriangle', info: 'info', tip: 'lightbulb', success: 'checkCircle' };

export default function KioskDashboardPage() {
  const { orgRole } = useAuth();
  const { showToast } = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    // Reintento transitorio: el backend puede estar frío/reiniciando (recién deployado) y el primer
    // request falla; el segundo suele andar. Evita el "dashboard en blanco" del primer ingreso.
    const load = (attempt = 0) => {
      kioskService.getDashboard()
        .then((d) => { if (alive) { setData(d); setLoading(false); } })
        .catch((err) => {
          if (!alive) return;
          if (attempt < 2) { setTimeout(() => load(attempt + 1), 1000); return; }
          setLoading(false);
          showToast(err.message || 'Error al cargar el dashboard', 'error');
        });
    };
    load();
    return () => { alive = false; };
  }, [showToast, reloadKey]);

  // Defensa en profundidad: si no es dueño/admin, al mostrador (el backend igual lo bloquea).
  if (orgRole && orgRole !== 'owner' && orgRole !== 'admin') {
    return <Navigate to={CONFIG.ROUTES.POS} replace />;
  }

  if (loading) {
    return (
      <div>
        <PageHeader title="Dashboard" subtitle="Vista general del kiosco" icon="dashboard" />
        <div className="card text-center text-muted" style={{ padding: '3rem' }}>
          <span className="spinner" /> Cargando dashboard...
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div>
        <PageHeader title="Dashboard" subtitle="Vista general del kiosco" icon="dashboard" />
        <div className="card text-center text-muted" style={{ padding: '3rem' }}>
          <div style={{ marginBottom: '1rem' }}>No se pudo cargar el dashboard.</div>
          <button className="btn btn-primary btn-sm" onClick={() => setReloadKey((k) => k + 1)}>
            <Icon name="refresh" size="1em" /> Reintentar
          </button>
        </div>
      </div>
    );
  }

  const hasSales = data.monthSalesCount > 0;

  return (
    <div className="dashboard">
      <PageHeader title="Dashboard" subtitle="Vista general del kiosco" icon="dashboard" />

      {/* KPIs */}
      <div className="stats-grid">
        <StatCard icon="dollarSign" label="Ventas del mes" value={formatCurrency(data.monthRevenue)} color="success" />
        <StatCard icon="trendingUp" label={`Ganancia (margen ${data.monthMarginPct}%)`} value={formatCurrency(data.monthGrossProfit)} color="primary" />
        <StatCard icon="creditCard" label="Ventas del mes" value={data.monthSalesCount} color="accent" />
        <StatCard icon="wallet" label="Ticket promedio" value={formatCurrency(data.avgTicket)} color="warning" />
      </div>

      {/* Veltronik AI */}
      <div className="ai-section">
        <h2 className="ai-section-title">
          <Icon name="brain" size="1.2em" /> Veltronik AI
          <span className="ai-badge">AI Powered</span>
        </h2>

        <div className="dashboard-grid-3">
          {/* Hoy */}
          <div className="prediction-card">
            <div className="prediction-header">
              <span className="prediction-label"><Icon name="dollarSign" size="1em" /> Vendido hoy</span>
              <span className="prediction-confidence"><Icon name="creditCard" size="1em" /> {data.todaySalesCount} venta(s)</span>
            </div>
            <div className="prediction-value">{formatCurrency(data.todayRevenue)}</div>
            <div className="prediction-trend">
              <span className="trend-flat">
                <Icon name="store" size="1em" /> Costo del mes: {formatCurrency(data.monthCogs)}
              </span>
            </div>
          </div>

          {/* Ventas por día */}
          <div className="card chart-card">
            <h4 className="chart-title"><Icon name="trendingUp" size="1em" /> Ventas (últimos 14 días)</h4>
            <div className="chart-container"><Line data={revenueChart(data)} options={LINE_OPTS} /></div>
          </div>

          {/* Método de pago */}
          <div className="card chart-card">
            <h4 className="chart-title"><Icon name="wallet" size="1em" /> Cómo te pagan</h4>
            <div className="chart-container"><Doughnut data={methodChart(data)} options={DOUGHNUT_OPTS} /></div>
          </div>
        </div>
      </div>

      {/* Ventas por hora + insights */}
      <div className="dashboard-grid">
        <div className="card chart-card">
          <h4 className="chart-title"><Icon name="clock" size="1em" /> Ventas por hora (mes) — tu hora pico</h4>
          <div className="chart-container"><Bar data={hourChart(data)} options={BAR_OPTS} /></div>
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

      {/* Top productos + fiado */}
      <div className="dashboard-grid">
        <div className="card">
          <div className="card-header"><h3 className="card-title"><Icon name="star" size="1em" /> Productos estrella del mes</h3></div>
          <div className="table-container">
            <table className="table">
              <thead><tr><th>Producto</th><th>Unid.</th><th>Vendido</th><th>Ganancia</th></tr></thead>
              <tbody>
                {!hasSales || data.topProducts.length === 0 ? (
                  <tr><td colSpan="4" className="text-center text-muted" style={{ padding: '1.5rem' }}>Sin ventas este mes</td></tr>
                ) : data.topProducts.map((p, i) => (
                  <tr key={i}>
                    <td data-label="Producto">{p.name}</td>
                    <td data-label="Unid.">{Number(p.units).toLocaleString('es-AR')}</td>
                    <td data-label="Vendido">{formatCurrency(p.revenue)}</td>
                    <td data-label="Ganancia">{Number(p.profit) > 0 ? formatCurrency(p.profit) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h3 className="card-title"><Icon name="users" size="1em" /> Fiado por cobrar</h3></div>
          <div className="stats-grid" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: '0.75rem' }}>
            <StatCard icon="dollarSign" label="Deuda total" value={formatCurrency(data.debtTotal)} color="warning" />
            <StatCard icon="package" label="Stock para reponer" value={data.lowStockCount} color={data.lowStockCount > 0 ? 'warning' : 'success'} />
          </div>
          <div className="table-container">
            <table className="table">
              <thead><tr><th>Cliente</th><th>Teléfono</th><th>Debe</th></tr></thead>
              <tbody>
                {data.topDebtors.length === 0 ? (
                  <tr><td colSpan="3" className="text-center text-muted" style={{ padding: '1.5rem' }}>Nadie te debe. Bien ahí.</td></tr>
                ) : data.topDebtors.map((c, i) => (
                  <tr key={i}>
                    <td data-label="Cliente">{c.name}</td>
                    <td data-label="Teléfono">{c.phone || '—'}</td>
                    <td data-label="Debe">{formatCurrency(c.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Chart configs ───
function revenueChart(d) {
  return {
    labels: d.revenueByDay.map((p) => p.date.slice(8, 10) + '/' + p.date.slice(5, 7)),
    datasets: [{
      label: 'Ventas', data: d.revenueByDay.map((p) => Number(p.amount) || 0),
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
    labels: ['Efectivo', 'Tarjeta', 'Transferencia', 'Mercado Pago', 'Fiado'],
    datasets: [{
      data: [
        Number(d.collectedCash) || 0, Number(d.collectedCard) || 0,
        Number(d.collectedTransfer) || 0, Number(d.collectedMp) || 0,
        Number(d.collectedCuentaCorriente) || 0,
      ],
      backgroundColor: ['#22c55e', '#f59e0b', '#0ea5e9', '#6366f1', '#ef4444'], borderWidth: 0, hoverOffset: 8,
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

function hourChart(d) {
  return {
    labels: d.salesByHour.map((h) => String(h.hour).padStart(2, '0')),
    datasets: [{
      label: 'Ventas', data: d.salesByHour.map((h) => Number(h.amount) || 0),
      backgroundColor: '#6366f1', borderRadius: 4, maxBarThickness: 22,
      _counts: d.salesByHour.map((h) => h.count),
    }],
  };
}
const BAR_OPTS = {
  responsive: true, maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: { callbacks: {
      title: (items) => `${items[0].label}:00 a ${items[0].label}:59`,
      label: (c) => `${formatCurrency(c.raw)} · ${c.dataset._counts?.[c.dataIndex] || 0} venta(s)`,
    } },
  },
  scales: {
    x: { grid: { display: false }, ticks: { color: '#94A3B8', maxRotation: 0, autoSkip: true } },
    y: { grid: { color: 'rgba(148,163,184,0.1)' }, ticks: { color: '#94A3B8', callback: (v) => v >= 1000 ? '$' + (v / 1000).toFixed(0) + 'k' : '$' + v } },
  },
};
