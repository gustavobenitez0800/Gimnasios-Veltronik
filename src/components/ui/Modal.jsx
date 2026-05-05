// ============================================
// VELTRONIK - Modal Component
// ============================================
// Modal genérico reutilizable con overlay,
// header, body y footer de acciones.
// ============================================

export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  className = '',
  actions = null,
  size = 'default', // 'small' | 'default' | 'large'
}) {
  if (!isOpen) return null;

  const sizeClass = {
    small: 'confirm-modal',
    default: 'member-modal',
    large: 'modal-large',
  }[size] || 'member-modal';

  return (
    <div className="modal-overlay modal-show" onClick={onClose}>
      <div
        className={`modal-container ${sizeClass} ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h2 className="modal-title" style={{ margin: 0 }}>{title}</h2>
            <button type="button" onClick={onClose} className="btn-icon" style={{ padding: '0.25rem' }}>
              &times;
            </button>
          </div>
        )}
        {children}
        {actions && (
          <div className="modal-actions" style={{ marginTop: '1.5rem' }}>
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Modal body with form grid layout.
 */
export function ModalForm({ children, onSubmit }) {
  return (
    <form onSubmit={onSubmit}>
      <div className="modal-form">{children}</div>
    </form>
  );
}

/**
 * Standard modal action buttons (Cancel + Submit).
 */
export function ModalActions({ onCancel, saving, submitText = 'Guardar', cancelText = 'Cancelar' }) {
  return (
    <div className="modal-actions" style={{ marginTop: '1.5rem' }}>
      <button type="button" className="btn btn-secondary" onClick={onCancel}>
        {cancelText}
      </button>
      <button type="submit" className="btn btn-primary" disabled={saving}>
        {saving ? (
          <>
            <span className="spinner" /> Guardando...
          </>
        ) : (
          submitText
        )}
      </button>
    </div>
  );
}
