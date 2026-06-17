// ============================================
// VELTRONIK V2 - REPORTS PAGE (Refactored to Fetch-on-Demand)
// ============================================

import { Suspense, useState } from 'react';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { memberService, paymentService, accessService } from '../services';
import { getStatusLabel, getMethodLabel } from '../lib/utils';
import { PageHeader } from '../components/Layout';
import Icon from '../components/Icon';
import CourtReportsPage from './CourtReportsPage';

// El DTO de socios de V2 trae `active` (boolean) + membershipEnd, NO un campo `status`.
// Derivamos el estado real para que los reportes no muestren estado vacío/erróneo.
function deriveMemberStatus(m) {
  if (m.active === false) return 'inactive';
  if (m.membershipEnd && new Date(m.membershipEnd) < new Date()) return 'expired';
  return 'active';
}

function getQuickDates(period) {
  const today = new Date();
  const formatLocal = (d) => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  let from, to;
  switch (period) {
    case 'today': from = to = formatLocal(today); break;
    case 'week': {
      const ws = new Date(today);
      ws.setDate(today.getDate() - today.getDay() + 1);
      from = formatLocal(ws);
      to = formatLocal(today);
      break;
    }
    case 'month':
      from = formatLocal(new Date(today.getFullYear(), today.getMonth(), 1));
      to = formatLocal(today); break;
    case 'year':
      from = formatLocal(new Date(today.getFullYear(), 0, 1));
      to = formatLocal(today); break;
    default: break;
  }
  return { from, to };
}

async function downloadExcel(filename, headers, rows) {
  // Dynamic import para no bloquear el bundle principal
  const XLSX = await import('xlsx');
  const data = [headers, ...rows];
  const worksheet = XLSX.utils.aoa_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Reporte");
  XLSX.writeFile(workbook, filename);
}

async function downloadPDF(title, filename, headers, rows) {
  // Dynamic imports
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');
  
  const doc = new jsPDF();
  
  doc.setFontSize(16);
  doc.text(title, 14, 15);
  doc.setFontSize(10);
  doc.text(`Generado el: ${new Date().toLocaleDateString('es-AR')} ${new Date().toLocaleTimeString('es-AR')}`, 14, 22);

  autoTable(doc, {
    head: [headers],
    body: rows,
    startY: 28,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [41, 128, 185] },
  });

  doc.save(filename);
}

export default function ReportsPage() {
  const { gym } = useAuth();

  // Canchas: reportes propios del vertical (ingresos, no-shows, caja Z).
  if (gym?.type === 'FUTBOL_5') {
    return <CourtReportsPage />;
  }

  // Si es restaurante, mostrar reportes de restaurante
  if (gym?.type === 'RESTO') {
    return (
      <Suspense fallback={<div className="dashboard-loading"><span className="spinner" /> Cargando reportes...</div>}>
        <RestaurantReportsPage />
      </Suspense>
    );
  }

  return <GymReportsPage />;
}

function GymReportsPage() {
  const { showToast } = useToast();
  
  const [dateFrom, setDateFrom] = useState(() => getQuickDates('month').from);
  const [dateTo, setDateTo] = useState(() => getQuickDates('month').to);
  const [activePeriod, setActivePeriod] = useState('month');
  
  const orgId = localStorage.getItem('current_org_id');
  const historyKey = `veltronik_export_history_${orgId}`;

  const [exporting, setExporting] = useState({});
  const [exportHistory, setExportHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem(historyKey) || '[]'); } catch { return []; }
  });

  const setQuickDate = (period) => {
    const { from, to } = getQuickDates(period);
    setDateFrom(from);
    setDateTo(to);
    setActivePeriod(period);
  };

  const addToHistory = (type, format) => {
    const entry = { type, format, date: new Date().toLocaleString('es-AR') };
    const history = [entry, ...exportHistory].slice(0, 10);
    setExportHistory(history);
    localStorage.setItem(historyKey, JSON.stringify(history));
  };

  const exportMembers = async (format) => {
    setExporting(e => ({ ...e, members: format }));
    try {
      // Fetch-on-demand
      let members = await memberService.getAll();
      
      if (dateFrom && dateTo) {
        members = (members || []).filter(m => {
          const d = m.membershipStart || (m.createdAt ? m.createdAt.split('T')[0] : null);
          if (!d) return true; // keep members with no date
          return d >= dateFrom && d <= dateTo;
        });
      }
      
      const headers = ['Nombre', 'DNI', 'Teléfono', 'Email', 'Estado', 'Inicio Membresía', 'Fin Membresía'];
      const rows = (members || []).map(m => [m.fullName, m.dni || '', m.phone || '', m.email || '', getStatusLabel(deriveMemberStatus(m)), m.membershipStart || '', m.membershipEnd || '']);
      
      if (format === 'excel') {
        await downloadExcel(`socios_${dateFrom}.xlsx`, headers, rows);
      } else {
        await downloadPDF('Reporte de Socios', `socios_${dateFrom}.pdf`, headers, rows);
      }
      
      addToHistory('Socios', format === 'excel' ? 'Excel' : 'PDF');
      showToast(`Reporte de socios exportado`, 'success');
    } catch (err) { showToast('Error: ' + err.message, 'error'); }
    finally { setExporting(e => ({ ...e, members: null })); }
  };

  const exportPayments = async (format) => {
    setExporting(e => ({ ...e, payments: format }));
    try {
      // El filtrado por fecha lo hace el BACKEND (params from/to). El front solo dibuja.
      const payments = await paymentService.getAllPayments(dateFrom, dateTo);

      const headers = ['Socio', 'Monto', 'Fecha', 'Método', 'Estado'];
      const formatCurrency = (val) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(val);

      // El backend manda method/status en MAYÚSCULA (CASH/PAID). Normalizamos para mostrar.
      const STATUS_ES = { paid: 'Pagado', pending: 'Pendiente' };
      const rows = (payments || []).map(p => [
        `${p.member?.firstName || ''} ${p.member?.lastName || ''}`.trim(),
        formatCurrency(p.amount || 0),
        p.paymentDate || '',
        getMethodLabel((p.paymentMethod || '').toLowerCase()),
        STATUS_ES[(p.status || '').toLowerCase()] || p.status || ''
      ]);

      // Calcular total sumado (solo de pagos completados). El backend manda 'PAID' (mayúscula).
      const totalSum = (payments || []).filter(p => (p.status || '').toLowerCase() === 'paid').reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
      
      // Agregar filas de total al final
      rows.push(['', '', '', '', '']); // Separador visual
      rows.push(['TOTAL SUMADO (Aprobados)', formatCurrency(totalSum), '', '', '']);
      
      if (format === 'excel') {
        await downloadExcel(`pagos_${dateFrom}_${dateTo}.xlsx`, headers, rows);
      } else {
        await downloadPDF('Reporte de Pagos', `pagos_${dateFrom}_${dateTo}.pdf`, headers, rows);
      }
      
      addToHistory('Pagos', format === 'excel' ? 'Excel' : 'PDF');
      showToast(`Reporte de pagos exportado (${payments.length} registros)`, 'success');
    } catch (err) { showToast('Error: ' + err.message, 'error'); }
    finally { setExporting(e => ({ ...e, payments: null })); }
  };

  const exportAccess = async (format) => {
    setExporting(e => ({ ...e, access: format }));
    try {
      let logs;
      if (dateFrom && dateTo) {
        logs = await accessService.getLogsByDateRange(dateFrom, dateTo);
      } else {
        logs = await accessService.getTodayLogs();
      }
      
      const headers = ['Socio', 'DNI', 'Entrada', 'Salida', 'Método'];
      const rows = (logs || []).map(l => [l.member?.fullName || '', l.member?.dni || '', l.checkInAt || '', l.checkOutAt || '', l.accessMethod || '']);
      
      if (format === 'excel') {
        await downloadExcel(`accesos_${dateFrom}_${dateTo}.xlsx`, headers, rows);
      } else {
        await downloadPDF('Reporte de Accesos', `accesos_${dateFrom}_${dateTo}.pdf`, headers, rows);
      }
      
      addToHistory('Accesos', format === 'excel' ? 'Excel' : 'PDF');
      showToast('Reporte de accesos exportado', 'success');
    } catch (err) { showToast('Error: ' + err.message, 'error'); }
    finally { setExporting(e => ({ ...e, access: null })); }
  };

  const exportSummary = async (format) => {
    setExporting(e => ({ ...e, summary: format }));
    try {
      // Para el resumen, obtenemos solo contadores sin cargar las tablas enteras

      // Socios activos y total
      const members = await memberService.getAll();
      const active = members.filter(m => deriveMemberStatus(m) === 'active').length;
      const newMembers = members.filter(m => {
        if (!dateFrom || !dateTo || !m.membershipStart) return true;
        return m.membershipStart >= dateFrom && m.membershipStart <= dateTo;
      });

      // 3. Accesos del período
      let logs = [];
      try {
        if (dateFrom && dateTo) {
          logs = await accessService.getLogsByDateRange(dateFrom, dateTo);
        } else {
          logs = await accessService.getTodayLogs();
        }
      } catch (err) {
        console.error("Error obteniendo accesos:", err);
      }

      const headers = ['Métrica', 'Valor'];
      const rows = [
        ['Socios Activos (Total Histórico)', active], 
        ['Total Socios (Total Histórico)', members.length], 
        [`Nuevos Socios (${dateFrom || 'Inicio'} al ${dateTo || 'Fin'})`, newMembers.length],
        [`Accesos Registrados (${dateFrom || 'Inicio'} al ${dateTo || 'Fin'})`, logs?.length || 0]
      ];
      
      if (format === 'excel') {
        await downloadExcel(`resumen_${dateFrom || 'total'}_${dateTo || 'total'}.xlsx`, headers, rows);
      } else {
        await downloadPDF('Resumen General', `resumen_${dateFrom || 'total'}_${dateTo || 'total'}.pdf`, headers, rows);
      }
      
      addToHistory('Resumen', format === 'excel' ? 'Excel' : 'PDF');
      showToast('Resumen exportado', 'success');
    } catch (err) { showToast('Error: ' + err.message, 'error'); }
    finally { setExporting(e => ({ ...e, summary: null })); }
  };

  const reports = [
    { key: 'members', title: 'Reporte de Socios', desc: 'Lista de socios + datos de contacto, estado, vencimiento.', icon: 'users', color: 'primary', action: exportMembers },
    { key: 'payments', title: 'Reporte de Ingresos', desc: 'Pagos recibidos con totales, filtrados por rango de fecha.', icon: 'dollarSign', color: 'success', action: exportPayments },
    { key: 'access', title: 'Reporte de Asistencia', desc: 'Registro de entradas y salidas para análisis de afluencia.', icon: 'doorOpen', color: 'accent', action: exportAccess },
    { key: 'summary', title: 'Resumen General', desc: 'Métricas de socios, nuevas altas y análisis de asistencia.', icon: 'chart', color: 'warning', action: exportSummary },
  ];

  return (
    <div className="reports-page">
      <PageHeader title="Reportes y Exportación" subtitle="Genera y descarga informes de tu negocio" icon="chart" />

      {/* Date Range */}
      <div className="card mb-3" style={{ padding: '1.25rem' }}>
        <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
          <div className="flex gap-1 items-center">
            <label className="form-label mb-0" style={{ whiteSpace: 'nowrap' }}>Desde</label>
            <input type="date" className="form-input" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setActivePeriod(''); }} style={{ width: 'auto' }} />
          </div>
          <div className="flex gap-1 items-center">
            <label className="form-label mb-0" style={{ whiteSpace: 'nowrap' }}>Hasta</label>
            <input type="date" className="form-input" value={dateTo} onChange={e => { setDateTo(e.target.value); setActivePeriod(''); }} style={{ width: 'auto' }} />
          </div>
          <div className="flex gap-1" style={{ flexWrap: 'wrap' }}>
            {['today', 'week', 'month', 'year'].map(p => (
              <button key={p} className={`btn btn-sm ${activePeriod === p ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setQuickDate(p)}>
                {{ today: 'Hoy', week: 'Semana', month: 'Mes', year: 'Año' }[p]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Report Cards */}
      <div className="reports-grid">
        {reports.map(r => (
          <div key={r.key} className="report-card">
            <div className={`report-icon stat-icon-${r.color}`} style={{ width: 56, height: 56, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
              <Icon name={r.icon} size="1.5rem" />
            </div>
            <div className="report-title">{r.title}</div>
            <div className="report-description">{r.desc}</div>
            <div className="flex gap-2" style={{ marginTop: 'auto', paddingTop: '1rem' }}>
              <button className="btn btn-primary btn-sm flex-1" onClick={() => r.action('excel')} disabled={exporting[r.key]}>
                {exporting[r.key] === 'excel' ? <><span className="spinner" /> ...</> : <><Icon name="download" /> Excel</>}
              </button>
              <button className="btn btn-secondary btn-sm flex-1" onClick={() => r.action('pdf')} disabled={exporting[r.key]}>
                {exporting[r.key] === 'pdf' ? <><span className="spinner" /> ...</> : <><Icon name="download" /> PDF</>}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Export History */}
      <div className="card mt-3" style={{ padding: '1.25rem' }}>
        <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Icon name="folder" size="1em" /> Exportaciones Recientes</h3>
        {exportHistory.length === 0 ? (
          <div className="text-center text-muted" style={{ padding: '1.5rem' }}>Los archivos exportados aparecerán aquí</div>
        ) : (
          exportHistory.map((exp, i) => (
            <div key={i} className="payment-history-item">
              <div className="payment-info">
                <span className="payment-amount">{exp.type} ({exp.format})</span>
                <span className="payment-date">{exp.date}</span>
              </div>
              <span className="badge badge-success" style={{ padding: '0.35rem 0.5rem' }}><Icon name="check" size="0.9em" /></span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
