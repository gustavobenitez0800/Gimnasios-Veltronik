// ============================================
// VELTRONIK - StatCard Component
// ============================================
// Extraído de DashboardPage para uso global.
// ============================================

import Icon from '../Icon';

export default function StatCard({ icon, label, value, color = 'primary' }) {
  return (
    <div className="stat-card">
      <div className={`stat-icon stat-icon-${color}`}>
        <Icon name={icon} />
      </div>
      <div className="stat-content">
        <div className="stat-value">{value}</div>
        <div className="stat-label">{label}</div>
      </div>
    </div>
  );
}
