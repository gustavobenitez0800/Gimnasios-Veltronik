// ============================================
// VELTRONIK - Modal Component
// ============================================
// Modal genérico reutilizable con overlay,
// header, body y footer de acciones.
//
// Se cierra con la ×, con Escape o tocando AFUERA. "Afuera" es donde se APRETÓ el mouse, no
// donde se soltó: seleccionar el texto de un campo arrastrando hasta fuera de la ventana la
// cerraba, y se perdía lo que se estaba cargando.
// ============================================

import { useEffect, useId, useRef } from 'react';
import Icon from '../Icon';

export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  className = '',
  actions = null,
  size = 'default', // 'small' | 'default' | 'large'
}) {
  const tituloId = useId();
  const apretoAfuera = useRef(false);
  // Escape cierra, como en cualquier ventana. onClose por ref: si el padre lo recrea en cada
  // render, el listener no se desarma y vuelve a armar con cada tecla.
  const cerrarRef = useRef(onClose);
  useEffect(() => { cerrarRef.current = onClose; });
  useEffect(() => {
    if (!isOpen) return undefined;
    const alTeclear = (e) => { if (e.key === 'Escape') cerrarRef.current?.(); };
    document.addEventListener('keydown', alTeclear);
    return () => document.removeEventListener('keydown', alTeclear);
  }, [isOpen]);

  if (!isOpen) return null;

  const sizeClass = {
    small: 'confirm-modal',
    default: 'member-modal',
    large: 'modal-large',
  }[size] || 'member-modal';

  return (
    <div
      className="modal-overlay modal-show"
      onMouseDown={(e) => { apretoAfuera.current = e.target === e.currentTarget; }}
      onClick={(e) => { if (e.target === e.currentTarget && apretoAfuera.current) onClose?.(); }}
    >
      <div
        className={`modal-container ${sizeClass} ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? tituloId : undefined}
      >
        {title && (
          <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h2 className="modal-title" id={tituloId} style={{ margin: 0 }}>{title}</h2>
            <button type="button" onClick={onClose} className="modal-cerrar" aria-label="Cerrar" title="Cerrar">
              <Icon name="x" size="1.1em" />
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
/** @param {string} [submitClass] el color del botón: 'btn-danger' para lo que no tiene vuelta atrás (anular). */
export function ModalActions({ onCancel, saving, submitText = 'Guardar', cancelText = 'Cancelar', submitClass = 'btn-primary' }) {
  return (
    <div className="modal-actions" style={{ marginTop: '1.5rem' }}>
      <button type="button" className="btn btn-secondary" onClick={onCancel}>
        {cancelText}
      </button>
      <button type="submit" className={`btn ${submitClass}`} disabled={saving}>
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
