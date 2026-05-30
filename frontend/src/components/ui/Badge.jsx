// ============================================
// VELTRONIK - Badge Component
// ============================================
// Badge de estado con resolución automática
// de clase CSS y label en español.
// ============================================

const STATUS_CONFIG = {
  active: { className: 'badge-success', label: 'Activo' },
  inactive: { className: 'badge-neutral', label: 'Inactivo' },
  expired: { className: 'badge-error', label: 'Vencido' },
  suspended: { className: 'badge-warning', label: 'Suspendido' },
  paid: { className: 'badge-success', label: 'Pagado' },
  pending: { className: 'badge-warning', label: 'Pendiente' },
  cancelled: { className: 'badge-error', label: 'Cancelado' },
  available: { className: 'badge-success', label: 'Disponible' },
  occupied: { className: 'badge-warning', label: 'Ocupada' },
  reserved: { className: 'badge-info', label: 'Reservada' },
};

/**
 * @param {string} status — Clave de estado
 * @param {string} label — Label override (opcional)
 * @param {string} className — Clase CSS override (opcional)
 */
export default function Badge({ status, label = null, className = null }) {
  const config = STATUS_CONFIG[status] || { className: 'badge-neutral', label: status };

  return (
    <span className={`badge ${className || config.className}`}>
      {label || config.label}
    </span>
  );
}
