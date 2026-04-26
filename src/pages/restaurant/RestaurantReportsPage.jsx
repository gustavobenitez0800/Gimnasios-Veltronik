// ============================================
// VELTRONIK RESTAURANT - REPORTS PAGE
// ============================================

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { orderService } from '../../services';
import { formatCurrency, getMethodLabel } from '../../lib/utils';
import { PageHeader } from '../../components/Layout';
import Icon from '../../components/Icon';

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
  const XLSX = await import('xlsx');
  const data = [headers, ...rows];
  const worksheet = XLSX.utils.aoa_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Reporte");
  XLSX.writeFile(workbook, filename);
}

async function downloadPDF(title, filename, headers, rows) {
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

export default function RestaurantReportsPage() {
  const { showToast } = useToast();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [dateFrom, setDateFrom] = useState(() => getQuickDates('month').from);
  const [dateTo, setDateTo] = useState(() => getQuickDates('month').to);
  const [activePeriod, setActivePeriod] = useState('month');
  const [exporting, setExporting] = useState(null);

  const loadData = useCallback(async () => {
    try { 
      setLoading(true); 
      const allOrders = await orderService.getAll() || [];
      
      // Filter locally by date
      const filtered = allOrders.filter(o => {
        if (!dateFrom || !dateTo) return true;
        const d = o.created_at ? o.created_at.split('T')[0] : null;
        if (!d) return true;
        return d >= dateFrom && d <= dateTo;
      });
      
      setOrders(filtered); 
    }
    catch { showToast('Error al cargar reportes', 'error'); }
    finally { setLoading(false); }
  }, [dateFrom, dateTo, showToast]);

  useEffect(() => { loadData(); }, [loadData]);

  const setQuickDate = (period) => {
    const { from, to } = getQuickDates(period);
    setDateFrom(from);
    setDateTo(to);
    setActivePeriod(period);
  };

  const paid = orders.filter(o => o.status === 'paid');
  const totalRevenue = paid.reduce((s, o) => s + parseFloat(o.total || 0), 0);
  const totalTips = paid.reduce((s, o) => s + parseFloat(o.tip || 0), 0);
  const avgTicket = paid.length > 0 ? totalRevenue / paid.length : 0;

  const byMethod = paid.reduce((acc, o) => {
    const m = o.payment_method || 'other';
    acc[m] = (acc[m] || 0) + parseFloat(o.total || 0);
    return acc;
  }, {});

  const methodLabels = { cash: '💵 Efectivo', card: '💳 Tarjeta', transfer: '🏦 Transferencia', mercadopago: '📱 MercadoPago', mixed: '🔄 Mixto' };

  const exportReport = async (format) => {
    setExporting(format);
    try {
      const headers = ['Pedido #', 'Tipo', 'Fecha', 'Método', 'Subtotal', 'Propina', 'Total'];
      const rows = paid.map(o => [
        o.order_number,
        o.table?.table_number ? `Mesa ${o.table.table_number}` : (o.order_type === 'takeaway' ? 'Para llevar' : 'Delivery'),
        new Date(o.created_at).toLocaleDateString('es-AR'),
        methodLabels[o.payment_method] || o.payment_method || 'N/A',
        formatCurrency(o.subtotal || 0),
        formatCurrency(o.tip || 0),
        formatCurrency(o.total || 0)
      ]);

      rows.push(['', '', '', '', '', '', '']); // Separador visual
      rows.push(['TOTAL SUMADO', '', '', '', formatCurrency(totalRevenue - totalTips), formatCurrency(totalTips), formatCurrency(totalRevenue)]);

      if (format === 'excel') {
        await downloadExcel(`reporte_resto_${dateFrom}_${dateTo}.xlsx`, headers, rows);
      } else {
        await downloadPDF('Reporte de Ventas (Restaurante)', `reporte_resto_${dateFrom}_${dateTo}.pdf`, headers, rows);
      }
      showToast('Reporte exportado con éxito', 'success');
    } catch (err) {
      showToast('Error al exportar: ' + err.message, 'error');
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="restaurant-reports">
      <PageHeader title="Reportes" subtitle="Análisis de ventas" icon="chart">
        <div className="flex gap-2">
          <button className="btn btn-primary" onClick={() => exportReport('excel')} disabled={exporting || loading}>
            {exporting === 'excel' ? <><span className="spinner" /> ...</> : <><Icon name="download" /> Excel</>}
          </button>
          <button className="btn btn-secondary" onClick={() => exportReport('pdf')} disabled={exporting || loading}>
            {exporting === 'pdf' ? <><span className="spinner" /> ...</> : <><Icon name="download" /> PDF</>}
          </button>
        </div>
      </PageHeader>

      {/* Date Range Selector */}
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

      {loading ? (
        <div className="dashboard-loading"><span className="spinner" /> Cargando reportes...</div>
      ) : (
        <>
          <div className="stats-grid mb-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            <div className="stat-card"><div className="stat-icon stat-icon-success">💰</div>
              <div className="stat-content"><div className="stat-value">{formatCurrency(totalRevenue)}</div><div className="stat-label">Ingresos Totales</div></div></div>
            <div className="stat-card"><div className="stat-icon stat-icon-primary">📋</div>
              <div className="stat-content"><div className="stat-value">{paid.length}</div><div className="stat-label">Pedidos Cobrados</div></div></div>
            <div className="stat-card"><div className="stat-icon stat-icon-warning">🎫</div>
              <div className="stat-content"><div className="stat-value">{formatCurrency(avgTicket)}</div><div className="stat-label">Ticket Promedio</div></div></div>
            <div className="stat-card"><div className="stat-icon stat-icon-accent">💝</div>
              <div className="stat-content"><div className="stat-value">{formatCurrency(totalTips)}</div><div className="stat-label">Propinas</div></div></div>
          </div>

          <div className="dashboard-grid">
            <div className="card">
              <div className="table-header"><h3 style={{margin:0}}>💳 Ingresos por Método de Pago</h3></div>
              <div style={{padding:'0 1rem 1rem'}}>
                {Object.entries(byMethod).length === 0 ? <p className="text-muted text-center" style={{padding:'2rem'}}>Sin datos</p> :
                  Object.entries(byMethod).sort((a,b) => b[1]-a[1]).map(([method, amount]) => (
                    <div key={method} className="payment-history-item">
                      <span>{methodLabels[method] || method}</span>
                      <strong>{formatCurrency(amount)}</strong>
                    </div>
                  ))
                }
              </div>
            </div>

            <div className="card">
              <div className="table-header"><h3 style={{margin:0}}>📊 Pedidos Recientes</h3></div>
              <div style={{maxHeight:400,overflowY:'auto',padding:'0 1rem 1rem'}}>
                {paid.length === 0 ? <p className="text-muted text-center" style={{padding:'2rem'}}>Sin pedidos</p> : paid.slice(0,15).map(o => (
                  <div key={o.id} className="payment-history-item">
                    <div><strong>#{o.order_number}</strong><div style={{fontSize:'0.7rem',color:'var(--text-muted)'}}>
                      {o.table?.table_number ? `Mesa ${o.table.table_number}` : o.order_type} · {new Date(o.created_at).toLocaleDateString('es-AR')}</div></div>
                    <strong>{formatCurrency(o.total||0)}</strong>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
