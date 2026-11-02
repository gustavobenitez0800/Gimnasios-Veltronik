import { formatCurrency } from '../../lib/utils';
import { DaySelector } from '../ui';
import Modal, { ModalActions } from '../ui/Modal';
import Icon from '../Icon';
import LlaverosDelSocio from './LlaverosDelSocio';

/**
 * La ficha del socio: el alta y la edición.
 *
 * El alta va en dos niveles: lo esencial (nombre, DNI, teléfono y arancel) arriba, y el resto
 * plegado bajo "Más datos". Al editar se abre todo. El porqué está en usePantallaDeSocios.
 */
export default function FichaDelSocio({
  modal, memberLabel, handleSave, hayAranceles, aranceles,
  mostrarMasDatos, setMasDatos, cambiarInicioMembresia,
}) {
  return (
    <Modal
      isOpen={modal.isOpen}
      onClose={modal.close}
      title={modal.isEditing ? `Editar ${memberLabel.toLowerCase()}` : `Nuevo ${memberLabel.toLowerCase()}`}
    >
      <form onSubmit={handleSave} noValidate>
        {/* ─── LO ESENCIAL: con esto el socio ya puede pagar y entrar ─── */}
        <div className="modal-form">
          <div className="form-group full-width">
            <label className="form-label">Nombre completo *</label>
            <input type="text" className="form-input" value={modal.form.fullName} autoFocus
              onChange={(e) => modal.handleChange('fullName', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">DNI</label>
            <input type="text" className="form-input" placeholder="12345678" pattern="\d*"
              onInput={(e) => e.target.value = e.target.value.replace(/\D/g, '')}
              value={modal.form.dni} onChange={(e) => modal.handleChange('dni', e.target.value)} />
            <small className="form-hint">Con el DNI entra por la puerta y por el QR.</small>
          </div>
          <div className="form-group">
            <label className="form-label">Teléfono</label>
            <input type="tel" className="form-input" placeholder="11-1234-5678"
              value={modal.form.phone} onChange={(e) => modal.handleChange('phone', e.target.value)} />
          </div>
          {hayAranceles && (
            <div className="form-group full-width">
              <label className="form-label">Arancel</label>
              <select className="form-select" value={modal.form.planId || ''}
                onChange={(e) => modal.handleChange('planId', e.target.value)}>
                <option value="">Sin arancel (se cobra escribiendo el monto)</option>
                {/* Igual que en la lista: si el suyo se dio de baja, se muestra igual para
                    no borrárselo sin querer al primer guardado. */}
                {modal.form.planId && !aranceles.some((a) => a.id === modal.form.planId) && (
                  <option value={modal.form.planId}>Su arancel actual · de baja</option>
                )}
                {aranceles.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} · {formatCurrency(a.price)}
                  </option>
                ))}
              </select>
              <small className="form-hint">
                {/* ⚠️ Acá NO se toca el vencimiento. El arancel dice cuánto suma cada cobro,
                    y esa cuenta la hace el backend al cobrar. Si la ficha además moviera la
                    fecha, habría dos lugares decidiendo lo mismo. */}
                Es lo que se le va a cobrar cada mes. El vencimiento se corre solo al registrar el pago.
              </small>
            </div>
          )}
          {/* Los llaveros (ADR-016): solo al editar, porque se le asignan a un socio que ya
              existe en el servidor. Se guardan en el acto, no con el «Guardar» de la ficha. */}
          {modal.isEditing && modal.editingId && (
            <LlaverosDelSocio socioId={modal.editingId} nombre={modal.form.fullName} />
          )}
        </div>

        {/* ─── MÁS DATOS: todo lo demás, a un clic ─── */}
        {!mostrarMasDatos && (
          <button type="button" className="form-more-toggle" onClick={() => setMasDatos(true)}>
            <Icon name="chevronRight" size="1em" /> Más datos
            <span className="text-muted">: email, nacimiento, fechas, notas, días</span>
          </button>
        )}
        {mostrarMasDatos && (
          <div className="modal-form form-more">
            <div className="form-group">
              <label className="form-label">Email</label>
              <input type="email" className="form-input"
                value={modal.form.email} onChange={(e) => modal.handleChange('email', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Fecha de nacimiento</label>
              <input type="date" className="form-input"
                value={modal.form.birthDate} onChange={(e) => modal.handleChange('birthDate', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Inicio de membresía</label>
              <input type="date" className="form-input"
                value={modal.form.membershipStart} onChange={(e) => cambiarInicioMembresia(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Fin de membresía</label>
              <input type="date" className="form-input"
                value={modal.form.membershipEnd} onChange={(e) => modal.handleChange('membershipEnd', e.target.value)} />
              <small className="form-hint">
                Hasta cuándo puede entrar. Cobrarle la cuota la corre sola: acá se toca
                solo para dar de alta a alguien que ya venía pagando, o para corregir.
              </small>
            </div>
            <div className="form-group">
              <label className="form-label">Estado</label>
              <select className="form-select" value={modal.form.status}
                onChange={(e) => modal.handleChange('status', e.target.value)}>
                <option value="active">Activo</option>
                <option value="inactive">Inactivo</option>
                <option value="expired">Vencido</option>
                <option value="suspended">Suspendido</option>
              </select>
            </div>
            <div className="form-group full-width">
              <label className="form-label">Notas</label>
              <textarea className="form-textarea" rows="2"
                value={modal.form.notes} onChange={(e) => modal.handleChange('notes', e.target.value)} />
            </div>
            <div className="form-group full-width">
              <label className="form-label">Días de asistencia</label>
              <DaySelector
                selectedDays={modal.form.attendanceDays}
                onChange={(days) => modal.handleChange('attendanceDays', days)}
              />
            </div>
          </div>
        )}
        <ModalActions onCancel={modal.close} saving={modal.saving} />
      </form>
    </Modal>
  );
}
