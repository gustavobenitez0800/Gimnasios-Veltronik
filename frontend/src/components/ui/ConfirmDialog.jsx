// ============================================
// VELTRONIK - Diálogo de confirmación
// ============================================
// Vivía dentro de Layout.jsx. Se sacó a su propio archivo porque Layout importa Sidebar,
// y Sidebar necesita confirmar el cierre de sesión: importarlo desde Layout habría creado
// un ciclo entre los dos módulos. Layout lo sigue re-exportando, así que todo lo que ya lo
// usaba (`import { ConfirmDialog } from '../components/Layout'`) sigue funcionando igual.
// ============================================

import Icon from '../Icon';

export default function ConfirmDialog({
  open,
  title,
  message,
  /**
   * Una segunda línea, destacada, para la consecuencia que hay que leer sí o sí.
   *
   * Existe porque hundirla dentro de `message` la vuelve parte del párrafo y se saltea:
   * justo lo que no puede pasar con un aviso del tipo "a 40 de estos les vas a reemplazar
   * el arancel que ya tenían".
   */
  extra = null,
  icon = 'alertTriangle',
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  confirmClass = 'btn-danger',
  onConfirm,
  onCancel,
}) {
  if (!open) return null;

  return (
    <div className="modal-overlay modal-show" onClick={onCancel}>
      <div className="modal-container confirm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-icon">{typeof icon === 'string' && icon.length > 2 ? <Icon name={icon} size="2rem" /> : icon}</div>
        <h2 className="modal-title">{title}</h2>
        <p className="modal-message">{message}</p>
        {extra && <p className="modal-message modal-message-aviso">{extra}</p>}
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onCancel}>{cancelText}</button>
          <button className={`btn ${confirmClass}`} onClick={onConfirm}>{confirmText}</button>
        </div>
      </div>
    </div>
  );
}
