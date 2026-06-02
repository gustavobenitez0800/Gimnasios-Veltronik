// ============================================
// VELTRONIK - StatCard Component
// ============================================
// Extraído de DashboardPage para uso global.
// ============================================

import Icon from '../Icon';

export default function StatCard({ icon, label, value, color = 'primary' }) {
  // Tamaño según longitud: montos largos ("$ 1.234.567") se achican para no desbordar
  // la card; los cortos ("221") quedan grandes. CSS: .stat-value-sm / .stat-value-xs.
  const valueStr = value == null ? '' : String(value);
  const sizeClass = valueStr.length > 10 ? 'stat-value-xs' : valueStr.length > 6 ? 'stat-value-sm' : '';
  return (
    <div className="stat-card">
      <div className={`stat-icon stat-icon-${color}`}>
        <Icon name={icon} />
      </div>
      <div className="stat-content">
        <div className={`stat-value ${sizeClass}`} title={valueStr}>{value}</div>
        <div className="stat-label">{label}</div>
      </div>
    </div>
  );
}
