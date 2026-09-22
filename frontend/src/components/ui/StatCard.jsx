// ============================================
// VELTRONIK - StatCard Component
// ============================================
// Extraído de DashboardPage para uso global.
// ============================================

import Icon from '../Icon';

/**
 * @param {string} [detail]     segunda línea opcional, más chica ("+3% frente al 1 al 21 de agosto")
 * @param {string} [detailTone] "up" | "down": el color de esa línea
 * @param {string} [nota]       otra línea, apagada: de qué está hecho el número ("Incluye $ 30.000 de ventas")
 */
export default function StatCard({ icon, label, value, color = 'primary', detail, detailTone, nota }) {
  // Tamaño según longitud: montos largos ("$ 1.234.567") se achican para no desbordar
  // la card; los cortos ("221") quedan grandes. CSS: .stat-value-sm / .stat-value-xs.
  const valueStr = value == null ? '' : String(value);
  // ⚠️ Los umbrales son bajos a propósito: '$ 176.000' son 9 caracteres pero con el signo,
  // los puntos y el peso 800 ocupa como 12, y se cortaba con las 4 tarjetas en una fila de
  // 1366px. Un monto cortado ('$ 176.…') es peor que uno un punto más chico.
  const sizeClass = valueStr.length > 9 ? 'stat-value-xs' : valueStr.length > 5 ? 'stat-value-sm' : '';
  return (
    <div className="stat-card">
      <div className={`stat-icon stat-icon-${color}`}>
        <Icon name={icon} />
      </div>
      <div className="stat-content">
        <div className={`stat-value ${sizeClass}`} title={valueStr}>{value}</div>
        <div className="stat-label">{label}</div>
        {detail && <div className={`stat-detail${detailTone ? ` is-${detailTone}` : ''}`}>{detail}</div>}
        {nota && <div className="stat-detail stat-nota">{nota}</div>}
      </div>
    </div>
  );
}
