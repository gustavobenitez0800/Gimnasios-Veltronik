// ============================================
// VELTRONIK V2 - REPORTS PAGE (CSV Export)
// ============================================

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '../contexts/ToastContext';
import { getMembers, getMemberPayments, getTodayAccessLogs, getAccessLogs } from '../lib/supabase';
import { getStatusLabel, getMethodLabel } from '../lib/utils';
import { PageHeader } from '../components/Layout';
import Icon from '../components/Icon';

function getQuickDates(period) {
  const today = new Date();
  let from, to;
  switch (period) {
    case 'today': from = to = today.toISOString().split('T')[0]; break;
    case 'week': {
      const ws = new Date(today);
      ws.setDate(today.getDate() - today.getDay() + 1);
      from = ws.toISOString().split('T')[0];
      to = today.toISOString().split('T')[0];
      break;
    }
    case 'month':
      from = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
      to = today.toISOString().split('T')[0]; break;
    case 'year':
      from = new Date(today.getFullYear(), 0, 1).toISOString().split('T')[0];
      to = today.toISOString().split('T')[0]; break;
    default: break;
  }
  return { from, to };
}

function downloadCSV(filename, headers, rows) {
  const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ReportsPage() {
  const { showToast } = useToast();
  const [members, setMembers] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState(() => getQuickDates('month').from);
  const [dateTo, setDateTo] = useState(() => getQuickDates('month').to);
  const [activePeriod, setActivePeriod] = useState('month');
  const [exporting, setExporting] = useState({});
  const [exportHistory, setExportHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem('veltronik_export_history') || '[]'); } catch { return []; }
  });

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [m, p] = await Promise.all([getMembers(), getMemberPayments()]);
      setMembers(m || []);
      setPayments(p || []);
    } catch { showToast('Error al cargar datos', 'error'); }
    finally { setLoading(false); }
  }, [showToast]);

  useEffect(() => { loadData(); }, [loadData]);

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
    localStorage.setItem('veltronik_export_history', JSON.stringify(history));
  };

  const exportMembers = async () => {
    setExporting(e => ({ ...e, members: true }));
    try {
      downloadCSV(`socios_${dateFrom}.csv`,
        ['Nombre', 'DNI', 'Teléfono', 'Email', 'Estado', 'Inicio Membresía', 'Fin Membresía'],
        members.map(m => [m.full_name, m.dni || '', m.phone || '', m.email || '', getStatusLabel(m.status), m.membership_start || '', m.membership_end || ''])
      );
      addToHistory('Socios', 'CSV');
      showToast('Reporte de socios exportado', 'success');
    } catch (err) { showToast('Error: ' + err.message, 'error'); }
    finally { setExporting(e => ({ ...e, members: false })); }
  };

  const exportPayments = async () => {
    setExporting(e => ({ ...e, payments: true }));
    try {
      const filtered = payments.filter(p => {
        if (!dateFrom || !dateTo) return true;
        return p.payment_date >= dateFrom && p.payment_date <= dateTo;
      });
      downloadCSV(`pagos_${dateFrom}_${dateTo}.csv`,
        ['Socio', 'Monto', 'Fecha', 'Método', 'Estado'],
        filtered.map(p => [p.member?.full_name || '', p.amount || 0, p.payment_date || '', getMethodLabel(p.payment_method), p.status || ''])
      );
      addToHistory('Pagos', 'CSV');
      showToast(`Reporte de pagos exportado (${filtered.length} registros)`, 'success');
    } catch (err) { showToast('Error: ' + err.message, 'error'); }
    finally { setExporting(e => ({ ...e, payments: false })); }
  };

  const exportAccess = async () => {
    setExporting(e => ({ ...e, access: true }));
    try {
      let logs;
      if (dateFrom && dateTo) {
        logs = await getAccessLogs(dateFrom, dateTo);
      } else {
        logs = await getTodayAccessLogs();
      }
      downloadCSV(`accesos_${dateFrom}_${dateTo}.csv`,
        ['Socio', 'DNI', 'Entrada', 'Salida', 'Método'],
        (logs || []).map(l => [l.member?.full_name || '', l.member?.dni || '', l.check_in_at || '', l.check_out_at || '', l.access_method || ''])
      );
      addToHistory('Accesos', 'CSV');
      showToast('Reporte de accesos exportado', 'success');
    } catch (err) { showToast('Error: ' + err.message, 'error'); }
    finally { setExporting(e => ({ ...e, access: false })); }
  };

  const exportSummary = () => {
    const active = members.filter(m => m.status === 'active').length;
    const totalIncome = payments.filter(p => p.status === 'paid').reduce((s, p) => s + (p.amount || 0), 0);
    downloadCSV(`resumen_${new Date().toISOString().split('T')[0]}.csv`,
      ['Métrica', 'Valor'],
      [['Socios Activos', active], ['Ingresos Totales', totalIncome], ['Total Socios', members.length], ['Total Pagos', payments.length]]
    );
    addToHistory('Resumen', 'CSV');
    showToast('Resumen exportado', 'success');
  };

  const reports = [
    { key: 'members', title: 'Reporte de Socios', desc: 'Lista de socios + datos de contacto, estado, vencimiento.', icon: '👥', color: 'primary', action: exportMembers },
    { key: 'payments', title: 'Reporte de Ingresos', desc: 'Pagos recibidos con totales, filtrados por rango de fecha.', icon: '💰', color: 'success', action: exportPayments },
    { key: 'access', title: 'Reporte de Asistencia', desc: 'Registro de entradas y salidas para análisis de afluencia.', icon: '🚪', color: 'accent', action: exportAccess },
    { key: 'summary', title: 'Resumen General', desc: 'Socios activos, ingresos totales y métricas clave.', icon: '📊', color: 'warning', action: exportSummary },
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
            <div className={`report-icon stat-icon-${r.color}`} style={{ width: 56, height: 56, borderRadius: 12, fontSize: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
              {r.icon}
            </div>
            <div className="report-title">{r.title}</div>
            <div className="report-description">{r.desc}</div>
            <button className="btn btn-primary btn-sm" onClick={r.action} disabled={loading || exporting[r.key]}>
              {exporting[r.key] ? <><span className="spinner" /> Exportando...</> : <><Icon name="download" /> Exportar CSV</>}
            </button>
          </div>
        ))}
      </div>

      {/* Export History */}
      <div className="card mt-3" style={{ padding: '1.25rem' }}>
        <h3 style={{ marginBottom: '1rem' }}>📁 Exportaciones Recientes</h3>
        {exportHistory.length === 0 ? (
          <div className="text-center text-muted" style={{ padding: '1.5rem' }}>Los archivos exportados aparecerán aquí</div>
        ) : (
          exportHistory.map((exp, i) => (
            <div key={i} className="payment-history-item">
              <div className="payment-info">
                <span className="payment-amount">{exp.type} ({exp.format})</span>
                <span className="payment-date">{exp.date}</span>
              </div>
              <span className="badge badge-success">✓</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
