// ============================================
// VELTRONIK - COBRAR LA CUOTA SIN IRSE DE SOCIOS
// ============================================
// El botón "Cobrar cuota" de la lista de socios te SACABA de la pantalla: navegaba a Pagos
// con el socio en la URL, y recién ahí se elegía el arancel. Para asignarle un arancel a
// alguien había que ir de Socios a Pagos y volver, con el socio ya elegido de nuevo.
//
// Acá se cobra donde está el socio. El arancel se elige, el monto se completa solo, y el
// vencimiento lo calcula el servidor desde el plan.
//
// ⚠️ LAS FECHAS NO SE PIDEN. Con arancel, el período lo calcula el backend desde el plan y
// desde la cobertura vigente del socio —arranca donde termina lo que ya tiene pago, no
// "hoy"— y además otorga las clases. Pedir la fecha acá sería invitar a pisar ese cálculo,
// que es exactamente cómo un socio terminó con el vencimiento en el pasado. Para un cobro
// con fechas a mano está la pantalla de Pagos, que es donde se corrigen cosas.

import { useState, useEffect } from 'react';
import { planService } from '../services/PlanService';
import { paymentService } from '../services';
import { mapPaymentModelToDTO } from '../controllers/mapeoPago';
import { invalidateQueries } from '../hooks/queryCacheStore';
import { toLocalDateString } from '../lib/utils';
import Modal, { ModalActions } from './ui/Modal';
import Icon from './Icon';

const METODOS = [
  { valor: 'cash', etiqueta: 'Efectivo' },
  { valor: 'transfer', etiqueta: 'Transferencia' },
  { valor: 'card', etiqueta: 'Tarjeta' },
];

/** "1 mes y 12 clases" — lo que el socio se lleva por ese precio. */
function queOtorga(plan) {
  const dias = plan.durationDays || 0;
  const tiempo = dias === 0 ? 'sin días'
    : dias % 30 === 0 && dias >= 30 ? `${dias / 30} ${dias / 30 === 1 ? 'mes' : 'meses'}`
    : `${dias} ${dias === 1 ? 'día' : 'días'}`;
  return plan.classes ? `${tiempo} y ${plan.classes} clases` : tiempo;
}

export default function CobroRapido({ socio, abierto, onCerrar, onCobrado, onError }) {
  const [aranceles, setAranceles] = useState([]);
  const [planId, setPlanId] = useState('');
  const [monto, setMonto] = useState('');
  const [metodo, setMetodo] = useState('cash');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    setMetodo('cash');
    let cancelado = false;
    planService.getVigentes()
      .then((lista) => {
        if (cancelado) return;
        setAranceles(lista || []);
        // ⭐ VIENE ELEGIDO EL DEL SOCIO. Es el punto de tener el arancel en la ficha: quien
        // atiende no elige nada, solo confirma. Elegir de memoria en cada cobro es como se
        // cobra el arancel equivocado, y como un socio termina con el vencimiento corrido.
        const suyo = (lista || []).find((a) => a.id === socio?.planId);
        setPlanId(suyo ? suyo.id : '');
        setMonto(suyo ? String(suyo.price ?? '') : '');
      })
      .catch(() => { /* sin aranceles se cobra a mano; no es un error */ });
    return () => { cancelado = true; };
  }, [abierto, socio]);

  const elegir = (id) => {
    setPlanId(id);
    const a = aranceles.find((x) => x.id === id);
    if (a) setMonto(String(a.price ?? ''));
  };

  const cobrar = async (e) => {
    e?.preventDefault();
    const valor = parseFloat(monto);
    if (!valor || valor <= 0) {
      onError?.('Poné un monto válido.');
      return;
    }
    setGuardando(true);
    try {
      await paymentService.createPayment(mapPaymentModelToDTO({
        member_id: socio.id,
        amount: monto,
        plan_id: planId,
        paymentDate: toLocalDateString(new Date()),
        paymentMethod: metodo,
        status: 'paid',
        // Sin período: con arancel lo calcula el servidor, y sin arancel el pago no mueve
        // la cobertura, que es lo correcto para un importe suelto.
      }));
      // Lo mismo que invalida la pantalla de Pagos: cobrar mueve el vencimiento del socio,
      // los ingresos del mes y la retención.
      invalidateQueries('payments');
      invalidateQueries('members');
      invalidateQueries('gym_dashboard');
      invalidateQueries('retention_analytics');
      onCobrado?.();
    } catch (e) {
      onError?.(e);
    } finally {
      setGuardando(false);
    }
  };

  const elegido = aranceles.find((a) => a.id === planId);

  return (
    <Modal
      isOpen={abierto}
      onClose={onCerrar}
      title={`Cobrar cuota — ${socio?.fullName || ''}`}
      actions={<ModalActions onCancel={onCerrar} saving={guardando} submitText="Cobrar" />}
    >
      {/* El botón de ModalActions es type="submit": necesita este formulario alrededor.
          Así además Enter cobra, que es como se trabaja en un mostrador. */}
      <form onSubmit={cobrar} noValidate>
      <div className="form-group">
        <label className="form-label">Arancel</label>
        <select className="form-input" value={planId} onChange={(e) => elegir(e.target.value)} autoFocus>
          <option value="">Sin arancel (importe suelto)</option>
          {aranceles.map((a) => (
            <option key={a.id} value={a.id}>{a.name} — {queOtorga(a)}</option>
          ))}
        </select>
        {elegido && (
          <p className="form-hint">
            <Icon name="checkCircle" size="0.9em" /> Le suma <strong>{queOtorga(elegido)}</strong>.
            El vencimiento lo calcula el sistema desde lo que ya tiene pago.
          </p>
        )}
        {!socio?.planId && aranceles.length > 0 && (
          <p className="form-hint">
            Este socio no tiene arancel asignado. Se le puede poner uno fijo desde su ficha,
            y no hay que elegirlo nunca más.
          </p>
        )}
        {!aranceles.length && (
          <p className="form-hint">
            No hay aranceles cargados. Se pueden crear en Ajustes, o cobrar un importe suelto acá.
          </p>
        )}
      </div>

      <div className="form-group">
        <label className="form-label">Monto</label>
        <input
          type="number"
          className="form-input"
          value={monto}
          onChange={(e) => setMonto(e.target.value)}
          placeholder="0"
          min="0"
        />
      </div>

      <div className="form-group">
        <label className="form-label">Cómo pagó</label>
        <select className="form-input" value={metodo} onChange={(e) => setMetodo(e.target.value)}>
          {METODOS.map((m) => <option key={m.valor} value={m.valor}>{m.etiqueta}</option>)}
        </select>
      </div>
      </form>
    </Modal>
  );
}
