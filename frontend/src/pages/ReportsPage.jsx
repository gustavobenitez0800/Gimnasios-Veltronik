// ============================================
// VELTRONIK V2 - REPORTES (gym)
// ============================================
// Exportador de informes (Excel/PDF). Los datos se piden recién al apretar el botón: la
// página no carga nada al abrirse.
//
// Qué columnas lleva cada uno lo decide lib/reportesDelGimnasio (con sus tests). Acá solo se
// piden los datos y se bajan.
//
// ⭐ EL DE INGRESOS ES EL LIBRO DE INGRESOS. En Excel baja EL MISMO libro que la Caja le arma
// al contador (resumen, cobros, gastos e ingresos, con los totales del servidor); en PDF, sus
// renglones. Antes sumaba los pagos por su cuenta y su total no coincidía con ningún otro.
// ============================================

import { useState } from 'react';
import { useToast } from '../contexts/ToastContext';
import { memberService, accessService, errorService } from '../services';
import { cajaService } from '../services/CajaService';
import { formatDate, toLocalDateString } from '../lib/utils';
import { downloadExcel, downloadPDF } from '../lib/reportExport';
import { descargarExcelDeCaja } from '../lib/excelDeCaja';
import { tablaDeSocios, tablaDeIngresos, tablaDeAccesos, tablaDelResumen } from '../lib/reportesDelGimnasio';
import { useRangoDeFechas } from '../hooks/useRangoDeFechas';
import SelectorDeFechas from '../components/SelectorDeFechas';
import { PageHeader } from '../components/Layout';
import Icon from '../components/Icon';

const FORMATO = { excel: 'Excel', pdf: 'PDF' };

export default function ReportsPage() {
  const { showToast } = useToast();
  const rango = useRangoDeFechas('month');
  const { desde, hasta } = rango;
  const periodo = desde === hasta ? formatDate(desde) : `${formatDate(desde)} al ${formatDate(hasta)}`;
  const enArchivo = `${desde}_${hasta}`;

  const orgId = localStorage.getItem('current_org_id');
  const historyKey = `veltronik_export_history_${orgId}`;

  const [exporting, setExporting] = useState({});
  const [exportHistory, setExportHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem(historyKey) || '[]'); } catch { return []; }
  });

  const addToHistory = (type, format) => {
    const entry = { type, format: FORMATO[format], date: new Date().toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short', hourCycle: 'h23' }) };
    const history = [entry, ...exportHistory].slice(0, 10);
    setExportHistory(history);
    try { localStorage.setItem(historyKey, JSON.stringify(history)); } catch { /* sin almacenamiento: la lista vive hasta cerrar */ }
  };

  const rangoValido = () => {
    if (!desde || !hasta || desde > hasta) {
      showToast('Elegí un rango de fechas válido.', 'error');
      return false;
    }
    return true;
  };

  /** Pide, arma y baja; con el aviso y el historial. Un error NO baja un archivo a medias. */
  const exportar = async (clave, nombre, format, armar) => {
    setExporting((e) => ({ ...e, [clave]: format }));
    try {
      await armar();
      addToHistory(nombre, format);
      showToast(`Listo: ${nombre.toLowerCase()} en ${FORMATO[format]}.`, 'success');
    } catch (err) {
      showToast(errorService.getMessage(err), 'error');
    } finally {
      setExporting((e) => ({ ...e, [clave]: null }));
    }
  };

  const bajarTabla = (format, titulo, archivo, { headers, rows }) => (format === 'excel'
    ? downloadExcel(`${archivo}.xlsx`, headers, rows)
    : downloadPDF(titulo, `${archivo}.pdf`, headers, rows));

  // El padrón es el de HOY: no depende del rango. Filtrarlo por fecha de alta (como hacía)
  // bajaba "el reporte de socios" con los tres que se anotaron este mes.
  const exportMembers = (format) => exportar('members', 'Socios', format, async () => {
    const socios = await memberService.getAllMembers();
    await bajarTabla(format, 'Socios', `socios_${toLocalDateString()}`, tablaDeSocios(socios));
  });

  const exportPayments = (format) => {
    if (!rangoValido()) return;
    exportar('payments', 'Ingresos', format, async () => {
      const reporte = await cajaService.reporte(desde, hasta);
      if (format === 'excel') await descargarExcelDeCaja(reporte);
      else await bajarTabla(format, `Ingresos del ${periodo}`, `ingresos_${enArchivo}`, tablaDeIngresos(reporte));
    });
  };

  const exportAccess = (format) => {
    if (!rangoValido()) return;
    exportar('access', 'Asistencia', format, async () => {
      const accesos = await accessService.getLogsByDateRange(desde, hasta);
      await bajarTabla(format, `Asistencia del ${periodo}`, `asistencia_${enArchivo}`, tablaDeAccesos(accesos));
    });
  };

  // ⚠️ Si falla cualquiera de los tres pedidos, no se baja nada. Un resumen con "0 entradas"
  // porque no se pudo preguntar (como hacía) es un número inventado con formato de dato.
  const exportSummary = (format) => {
    if (!rangoValido()) return;
    exportar('summary', 'Resumen', format, async () => {
      const [socios, reporte, accesos] = await Promise.all([
        memberService.getAllMembers(),
        cajaService.reporte(desde, hasta),
        accessService.getLogsByDateRange(desde, hasta),
      ]);
      await bajarTabla(format, `Resumen del ${periodo}`, `resumen_${enArchivo}`,
        tablaDelResumen({ socios, reporte, accesos, desde, hasta }));
    });
  };

  const reports = [
    { key: 'members', title: 'Socios', desc: 'Todos los socios con su estado de hoy, contacto, arancel y vencimiento. No depende de las fechas.', icon: 'users', color: 'primary', action: exportMembers },
    { key: 'payments', title: 'Ingresos', desc: 'Las cuotas, las ventas y otros ingresos del período, con los mismos totales de la Caja. En Excel es el libro del contador.', icon: 'cash', color: 'success', action: exportPayments },
    { key: 'access', title: 'Asistencia', desc: 'Cada entrada y salida del período, con la hora y cómo entró.', icon: 'doorEnter', color: 'accent', action: exportAccess },
    { key: 'summary', title: 'Resumen', desc: 'Cuántos socios hay al día y vencidos, las altas, lo que entró y las entradas del período.', icon: 'chart', color: 'warning', action: exportSummary },
  ];

  return (
    <div className="reports-page">
      <PageHeader title="Reportes" subtitle="Bajá la información del gimnasio en Excel o PDF" icon="chart" />

      <div className="card mb-3" style={{ padding: '1.25rem' }}>
        <SelectorDeFechas rango={rango} />
      </div>

      <div className="reports-grid">
        {reports.map((r) => (
          <div key={r.key} className="report-card">
            <div className={`report-icon stat-icon-${r.color}`}>
              <Icon name={r.icon} size="1.5rem" />
            </div>
            <div className="report-title">{r.title}</div>
            <div className="report-description">{r.desc}</div>
            <div className="report-botones">
              <button className="btn btn-primary btn-sm" onClick={() => r.action('excel')} disabled={!!exporting[r.key]}>
                {exporting[r.key] === 'excel' ? <><span className="spinner" /> Armando…</> : <><Icon name="download" /> Excel</>}
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => r.action('pdf')} disabled={!!exporting[r.key]}>
                {exporting[r.key] === 'pdf' ? <><span className="spinner" /> Armando…</> : <><Icon name="download" /> PDF</>}
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="card mt-3" style={{ padding: '1.25rem' }}>
        <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Icon name="folder" size="1em" /> Lo último que se bajó</h3>
        {exportHistory.length === 0 ? (
          <div className="text-center text-muted" style={{ padding: '1.5rem' }}>Lo que bajes aparece acá.</div>
        ) : (
          exportHistory.map((exp) => (
            <div key={`${exp.date}-${exp.type}-${exp.format}`} className="payment-history-item">
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
