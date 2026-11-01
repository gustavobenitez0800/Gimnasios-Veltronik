import { formatDate, formatCurrency, getMethodLabel } from '../../lib/utils';
import { Badge } from '../ui';
import Modal from '../ui/Modal';

/** El historial de pagos de un socio, del más reciente al más viejo. */
export default function HistorialDePagos({ paymentsModal, setPaymentsModal, paymentsMember, paymentsLoading, memberPayments }) {
  return (
    <Modal
      isOpen={paymentsModal}
      onClose={() => setPaymentsModal(false)}
      title="Historial de pagos"
      actions={
        <button className="btn btn-secondary" onClick={() => setPaymentsModal(false)}>Cerrar</button>
      }
    >
      <p className="text-muted mb-2">{paymentsMember?.fullName || ''}</p>
      <div className="payment-history-list">
        {paymentsLoading ? (
          <div className="text-center text-muted" style={{ padding: '2rem' }}>
            <span className="spinner" /> Cargando...
          </div>
        ) : memberPayments.length === 0 ? (
          <div className="text-center text-muted" style={{ padding: '2rem' }}>
            Sin pagos registrados
          </div>
        ) : (
          memberPayments.map((p) => (
            <div key={p.id} className="payment-history-item">
              <div className="payment-info">
                <span className="payment-amount">{formatCurrency(p.amount)}</span>
                <span className="payment-date">
                  {formatDate(p.paymentDate)}
                  {p.paymentMethod ? ` · ${getMethodLabel(p.paymentMethod)}` : ''}
                </span>
              </div>
              <Badge status={p.status} />
            </div>
          ))
        )}
      </div>
    </Modal>
  );
}
