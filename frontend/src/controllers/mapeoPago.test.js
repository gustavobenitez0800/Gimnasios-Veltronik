// @vitest-environment happy-dom
//
// ============================================
// VELTRONIK - Tests del mapeo de un pago
// ============================================
// ⭐ EL BUG: el selector de arancel guardaba `plan_id` en el formulario, el backend lo
// esperaba como `plan_id`… y el mapeador del medio no lo mandaba. La cadena estaba cortada
// justo en la mitad, en silencio.
//
// No era solo un dato de reporte que se perdía. El backend aplica el período Y las clases
// del arancel SOLO si el pago trae plan:
//
//     if (payment.getPlan() != null) { aplicarPeriodoDelPlan(...); sumarClasesDelPlan(...); }
//
// Sin el plan, nada de eso corre. O sea que la función entera de aranceles —que el plan
// decida hasta cuándo cubre y cuántas clases otorga— nunca se ejecutó, aunque quien
// atiende eligiera el arancel y viera el monto completarse solo.
//
// Se vio en los datos de HaA Fitness: 789 pagos, CERO con arancel, incluidos los tres que
// se cobraron eligiendo "Pase Libre" el 31/08. Y explica el vencimiento equivocado de
// FERNANDO MENENDEZ: como el plan no llegaba, el backend no calculaba el período y quedó
// el que estaba tipeado a mano en el formulario.

import { describe, it, expect } from 'vitest';
import { mapPaymentModelToDTO } from './mapeoPago';

const base = {
  member_id: 'socio-1',
  amount: '48000',
  paymentDate: '2026-09-01',
  paymentMethod: 'cash',
  status: 'paid',
};

describe('lo que viaja al servidor al cobrar', () => {
  it('⭐ manda el arancel elegido', () => {
    // Sin esto, el backend no aplica ni el período ni las clases del plan.
    const dto = mapPaymentModelToDTO({ ...base, plan_id: 'plan-pase-libre' });
    expect(dto.plan_id).toBe('plan-pase-libre');
  });

  it('sin arancel manda null, no una cadena vacía', () => {
    // Un "" llegaría al backend como un UUID inválido y reventaría el cobro. El cobro
    // suelto —sin plan— tiene que seguir funcionando: es como se cobra una clase suelta.
    expect(mapPaymentModelToDTO({ ...base, plan_id: '' }).plan_id).toBeNull();
    expect(mapPaymentModelToDTO(base).plan_id).toBeNull();
  });

  it('el monto viaja como número', () => {
    expect(mapPaymentModelToDTO(base).amount).toBe(48000);
  });

  it('las fechas llevan la hora puesta', () => {
    const dto = mapPaymentModelToDTO({ ...base, periodStart: '2026-09-01', periodEnd: '2026-09-30' });
    expect(dto.paymentDate).toBe('2026-09-01T00:00:00');
    expect(dto.periodStart).toBe('2026-09-01T00:00:00');
    // El período termina al final del día: si terminara a las 00:00 el socio perdería su
    // último día de cuota.
    expect(dto.periodEnd).toBe('2026-09-30T23:59:59');
  });

  it('el período vacío viaja como null, para que lo calcule el arancel', () => {
    // Cuando hay plan, el backend calcula el período solo. Mandar "" o una fecha inventada
    // le pisaría ese cálculo.
    const dto = mapPaymentModelToDTO({ ...base, plan_id: 'plan-1', periodStart: '', periodEnd: '' });
    expect(dto.periodStart).toBeNull();
    expect(dto.periodEnd).toBeNull();
  });

  it('el método y el estado van en mayúscula, como espera el backend', () => {
    const dto = mapPaymentModelToDTO({ ...base, paymentMethod: 'transfer', status: 'paid' });
    expect(dto.paymentMethod).toBe('TRANSFER');
    expect(dto.status).toBe('PAID');
  });
});
