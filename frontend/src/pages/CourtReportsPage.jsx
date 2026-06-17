// ============================================
// VELTRONIK V2 - REPORTES DE CANCHAS (FUTBOL_5)
// ============================================
// Exporta ingresos, no-shows y resumen a Excel/PDF en un rango de
// fechas, + cierre de caja del día (Z). Solo OWNER/ADMIN.
// ============================================

import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { courtService } from '../services';
import { formatCurrency } from '../lib/utils';
import { PageHeader } from '../components/Layout';
import Icon from '../components/Icon';

const pad = (n) => String(n).padStart(2, '0');
const fmtLocal = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function getQuickDates(period) {
  const today = new Date();
  let from, to;
  switch (period) {
    case 'today': from = to = fmtLocal(today); break;
    case 'week': {
      const ws = new Date(today); ws.setDate(today.getDate() - today.getDay() + 1);
      from = fmtLocal(ws); to = fmtLocal(today); break;
    }
    case 'month': from = fmtLocal(new Date(today.getFullYear(), today.getMonth(), 1)); to = fmtLocal(today); break;
    case 'year': from = fmtLocal(new Date(today.getFullYear(), 0, 1)); to = fmtLocal(today); break;
    default: break;
  }
  return { from, to };
}

async function downloadExcel(filename, headers, rows) {
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Reporte');
  XLSX.writeFile(wb, filename);
}

async function downloadPDF(title, filename, headers, rows) {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');
  const doc = new jsPDF();
  doc.setFontSize(16); doc.text(title, 14, 15);
  doc.setFontSize(10);
  doc.text(`Generado: ${new Date().toLocaleString('es-AR')}`, 14, 22);
  autoTable(doc, { head: [headers], body: rows, startY: 28, styles: { fontSize: 8 }, headStyles: { fillColor: [34, 197, 94] } });
  doc.save(filename);
}

const money = (v) => formatCurrency(v || 0);

export default function CourtReportsPage() {
  const { orgRole } = useAuth();
  const { showToast } = useToast();

  const [dateFrom, setDateFrom] = useState(() => getQuickDates('month').from);
  const [dateTo, setDateTo] = useState(() => getQuickDates('month').to);
  const [activePeriod, setActivePeriod] = useState('month');
  const [busy, setBusy] = useState({});

  if (orgRole && orgRole !== 'owner' && orgRole !== 'admin') {
    return <Navigate to="/court-grid" replace />;
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

  const exportIncome = (format) => run('income', async () => {
    const rep = await courtService.getReport(dateFrom, dateTo);
    const headers = ['Fecha', 'Cancha', 'Cliente', 'Concepto', 'Método', 'Monto'];
    const rows = (rep.income || []).map((r) => [r.date, r.court, r.customer, r.concept, r.method, money(r.amount)]);
    rows.push(['', '', '', '', '', '']);
    rows.push(['', '', '', '', 'Efectivo', money(rep.totalCash)]);
    rows.push(['', '', '', '', 'Transferencia', money(rep.totalTransfer)]);
    rows.push(['', '', '', '', 'Mercado Pago', money(rep.totalMp)]);
    rows.push(['', '', '', '', 'TOTAL', money(rep.total)]);
    const fn = format === 'excel' ? downloadExcel : (n, h, r) => downloadPDF('Reporte de Ingresos', n, h, r);
    await fn(`ingresos_${dateFrom}_${dateTo}.${format === 'excel' ? 'xlsx' : 'pdf'}`, headers, rows);
    showToast(`Ingresos exportados (${rep.income?.length || 0} movimientos)`, 'success');
  });

  const exportNoShows = (format) => run('noshows', async () => {
    const rep = await courtService.getReport(dateFrom, dateTo);
    const headers = ['Fecha', 'Cancha', 'Cliente', 'Teléfono'];
    const rows = (rep.noShows || []).map((r) => [r.date, r.court, r.customer, r.phone]);
    const fn = format === 'excel' ? downloadExcel : (n, h, r) => downloadPDF('Reporte de No-shows', n, h, r);
    await fn(`noshows_${dateFrom}_${dateTo}.${format === 'excel' ? 'xlsx' : 'pdf'}`, headers, rows);
    showToast(`No-shows exportados (${rep.noShows?.length || 0})`, 'success');
  });

  const exportSummary = (format) => run('summary', async () => {
    const rep = await courtService.getReport(dateFrom, dateTo);
    const headers = ['Métrica', 'Valor'];
    const rows = [
      ['Período', `${rep.from} a ${rep.to}`],
      ['Turnos', rep.totalBookings],
      ['Jugados', rep.completedCount],
      ['No-shows', rep.noShowCount],
      ['Ocupación', `${rep.occupancyPct}%`],
      ['Ingresos efectivo', money(rep.totalCash)],
      ['Ingresos transferencia', money(rep.totalTransfer)],
      ['Ingresos Mercado Pago', money(rep.totalMp)],
      ['TOTAL ingresos', money(rep.total)],
    ];
    const fn = format === 'excel' ? downloadExcel : (n, h, r) => downloadPDF('Resumen del período', n, h, r);
    await fn(`resumen_${dateFrom}_${dateTo}.${format === 'excel' ? 'xlsx' : 'pdf'}`, headers, rows);
    showToast('Resumen exportado', 'success');
  });

  const exportCajaZ = () => run('cajaz', async () => {
    const today = fmtLocal(new Date());
    const s = await courtService.getSummary(today);
    const headers = ['Concepto', 'Valor'];
    const rows = [
      ['Fecha', today],
      ['Turnos del día', s.totalBookings],
      ['Ocupación', `${s.occupancyPct}%`],
      ['— CAJA —', ''],
      ['Efectivo', money(s.collectedCash)],
      ['Transferencia', money(s.collectedTransfer)],
      ['Mercado Pago', money(s.collectedMp)],
      ['TOTAL COBRADO', money(s.collectedToday)],
      ['— PENDIENTE —', ''],
      [`Señas sin cobrar (${s.pendingDepositCount})`, money(s.pendingDepositAmount)],
      ['Saldo por cobrar', money(s.pendingBalance)],
    ];
    await downloadPDF(`Cierre de caja — ${today}`, `cierre_caja_${today}.pdf`, headers, rows);
    showToast('Cierre de caja generado', 'success');
  });

  const cards = [
    { key: 'income', title: 'Reporte de Ingresos', desc: 'Cobros del período (señas y saldos) por método, con totales.', icon: 'dollarSign', color: 'success', action: exportIncome },
    { key: 'noshows', title: 'Reporte de No-shows', desc: 'Clientes que no se presentaron, para identificar problemáticos.', icon: 'xCircle', color: 'warning', action: exportNoShows },
    { key: 'summary', title: 'Resumen del período', desc: 'Turnos, ocupación e ingresos del rango elegido.', icon: 'chart', color: 'primary', action: exportSummary },
  ];

  return (
    <div className="reports-page">
      <PageHeader title="Reportes" subtitle="Generá y descargá informes del complejo" icon="chart" />

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
          <button className="btn btn-sm btn-secondary" style={{ marginLeft: 'auto' }} onClick={exportCajaZ} disabled={busy.cajaz}>
            {busy.cajaz ? <span className="spinner" /> : <Icon name="wallet" size="1em" />} Cierre de caja de hoy
          </button>
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
