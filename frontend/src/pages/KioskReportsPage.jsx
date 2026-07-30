// ============================================
// VELTRONIK V2 - REPORTES DE KIOSCO (KIOSCO)
// ============================================
// Exporta a Excel/PDF en un rango de fechas: rentabilidad por
// producto (margen real), detalle de ventas ticket por ticket y
// el resumen del período (ventas, costo, ganancia, medios de
// pago). El backend es la autoridad del cálculo. Solo OWNER/ADMIN.
// ============================================

import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { kioskService } from '../services';
import { toLocalDateString } from '../lib/utils';
import { downloadExcel, downloadPDF } from '../lib/reportExport';
import { money } from '../lib/kioskFormat';
import { PageHeader } from '../components/Layout';
import Icon from '../components/Icon';
import CONFIG from '../lib/config';

function getQuickDates(period) {
  const today = new Date();
  let from, to;
  switch (period) {
    case 'today': from = to = toLocalDateString(today); break;
    case 'week': {
      const ws = new Date(today); ws.setDate(today.getDate() - today.getDay() + 1);
      from = toLocalDateString(ws); to = toLocalDateString(today); break;
    }
    case 'month': from = toLocalDateString(new Date(today.getFullYear(), today.getMonth(), 1)); to = toLocalDateString(today); break;
    case 'year': from = toLocalDateString(new Date(today.getFullYear(), 0, 1)); to = toLocalDateString(today); break;
    default: break;
  }
  return { from, to };
}

// En un reporte, un importe que el backend no mandó es 0 —vendiste cero— y no un dato
// faltante: así viaja al Excel, donde un guion no se podría sumar.
const amount = (v) => money(v || 0);

export default function KioskReportsPage() {
  const { orgRole } = useAuth();
  const { showToast } = useToast();

  const [dateFrom, setDateFrom] = useState(() => getQuickDates('month').from);
  const [dateTo, setDateTo] = useState(() => getQuickDates('month').to);
  const [activePeriod, setActivePeriod] = useState('month');
  const [busy, setBusy] = useState({});

  if (orgRole && orgRole !== 'owner' && orgRole !== 'admin') {
    return <Navigate to={CONFIG.ROUTES.POS} replace />;
  }

  const setQuick = (p) => {
    const { from, to } = getQuickDates(p);
    setDateFrom(from); setDateTo(to); setActivePeriod(p);
  };

  const run = async (key, fn) => {
    setBusy((b) => ({ ...b, [key]: true }));
    try { await fn(); }
    catch (err) { showToast(err.message || 'Error al exportar', 'error'); }
    finally { setBusy((b) => ({ ...b, [key]: false })); }
  };

  const exportProfit = (format) => run('profit', async () => {
    const rep = await kioskService.getReport(dateFrom, dateTo);
    const headers = ['Producto', 'Rubro', 'Unidades', 'Vendido', 'Costo', 'Ganancia', 'Margen'];
    const rows = (rep.products || []).map((r) => [
      r.name, r.category, Number(r.units).toLocaleString('es-AR'),
      amount(r.revenue), amount(r.cost), amount(r.profit), `${r.marginPct}%`,
    ]);
    rows.push(['', '', '', '', '', '', '']);
    rows.push(['TOTAL', '', '', amount(rep.totalRevenue), amount(rep.totalCogs), amount(rep.grossProfit), `${rep.marginPct}%`]);
    const fn = format === 'excel' ? downloadExcel : (n, h, r) => downloadPDF('Rentabilidad por producto', n, h, r);
    await fn(`rentabilidad_${dateFrom}_${dateTo}.${format === 'excel' ? 'xlsx' : 'pdf'}`, headers, rows);
    showToast(`Rentabilidad exportada (${rep.products?.length || 0} productos)`, 'success');
  });

  const exportSales = (format) => run('sales', async () => {
    const rep = await kioskService.getReport(dateFrom, dateTo);
    const headers = ['Fecha', 'Hora', 'Ítems', 'Total', 'Pago', 'Cliente'];
    const rows = (rep.sales || []).map((r) => [r.date, r.time, r.items, amount(r.total), r.methods, r.customer]);
    rows.push(['', '', '', '', '', '']);
    rows.push(['', '', '', amount(rep.totalRevenue), 'TOTAL', `${rep.salesCount} ventas`]);
    const fn = format === 'excel' ? downloadExcel : (n, h, r) => downloadPDF('Detalle de ventas', n, h, r);
    await fn(`ventas_${dateFrom}_${dateTo}.${format === 'excel' ? 'xlsx' : 'pdf'}`, headers, rows);
    showToast(`Ventas exportadas (${rep.sales?.length || 0})`, 'success');
  });

  const exportSummary = (format) => run('summary', async () => {
    const rep = await kioskService.getReport(dateFrom, dateTo);
    const headers = ['Métrica', 'Valor'];
    const rows = [
      ['Período', `${rep.from} a ${rep.to}`],
      ['Ventas', rep.salesCount],
      ['Facturación', amount(rep.totalRevenue)],
      ['Costo de la mercadería', amount(rep.totalCogs)],
      ['Ganancia bruta', amount(rep.grossProfit)],
      ['Margen', `${rep.marginPct}%`],
      ['— CÓMO TE PAGARON —', ''],
      ['Efectivo', amount(rep.totalCash)],
      ['Tarjeta', amount(rep.totalCard)],
      ['Transferencia', amount(rep.totalTransfer)],
      ['Mercado Pago', amount(rep.totalMp)],
      ['Fiado (cuenta corriente)', amount(rep.totalCuentaCorriente)],
    ];
    if (rep.itemsWithoutCost > 0) {
      rows.push(['— NOTA —', '']);
      rows.push(['Renglones sin costo cargado', `${rep.itemsWithoutCost} (margen aproximado)`]);
    }
    const fn = format === 'excel' ? downloadExcel : (n, h, r) => downloadPDF('Resumen del período', n, h, r);
    await fn(`resumen_${dateFrom}_${dateTo}.${format === 'excel' ? 'xlsx' : 'pdf'}`, headers, rows);
    showToast('Resumen exportado', 'success');
  });

  const cards = [
    { key: 'profit', title: 'Rentabilidad por producto', desc: 'Qué te deja plata: unidades, ventas, costo, ganancia y margen por producto.', icon: 'trendingUp', color: 'success', action: exportProfit },
    { key: 'sales', title: 'Detalle de ventas', desc: 'Cada ticket del período: fecha, hora, total, medio de pago y cliente.', icon: 'list', color: 'primary', action: exportSales },
    { key: 'summary', title: 'Resumen del período', desc: 'Facturación, costo, ganancia y desglose por medio de pago.', icon: 'chart', color: 'accent', action: exportSummary },
  ];

  return (
    <div className="reports-page">
      <PageHeader title="Reportes" subtitle="Generá y descargá informes del kiosco" icon="chart" />

      <div className="card mb-3" style={{ padding: '1.25rem' }}>
        <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
          <div className="flex gap-1 items-center">
            <label className="form-label mb-0" style={{ whiteSpace: 'nowrap' }}>Desde</label>
            <input type="date" className="form-input" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setActivePeriod(''); }} style={{ width: 'auto' }} />
          </div>
          <div className="flex gap-1 items-center">
            <label className="form-label mb-0" style={{ whiteSpace: 'nowrap' }}>Hasta</label>
            <input type="date" className="form-input" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setActivePeriod(''); }} style={{ width: 'auto' }} />
          </div>
          <div className="flex gap-1" style={{ flexWrap: 'wrap' }}>
            {['today', 'week', 'month', 'year'].map((p) => (
              <button key={p} className={`btn btn-sm ${activePeriod === p ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setQuick(p)}>
                {{ today: 'Hoy', week: 'Semana', month: 'Mes', year: 'Año' }[p]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="reports-grid">
        {cards.map((r) => (
          <div key={r.key} className="report-card">
            <div className={`report-icon stat-icon-${r.color}`} style={{ width: 56, height: 56, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
              <Icon name={r.icon} size="1.5rem" />
            </div>
            <div className="report-title">{r.title}</div>
            <div className="report-description">{r.desc}</div>
            <div className="flex gap-2" style={{ marginTop: 'auto', paddingTop: '1rem' }}>
              <button className="btn btn-primary btn-sm flex-1" onClick={() => r.action('excel')} disabled={busy[r.key]}>
                {busy[r.key] ? <span className="spinner" /> : <><Icon name="download" /> Excel</>}
              </button>
              <button className="btn btn-secondary btn-sm flex-1" onClick={() => r.action('pdf')} disabled={busy[r.key]}>
                {busy[r.key] ? <span className="spinner" /> : <><Icon name="download" /> PDF</>}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
