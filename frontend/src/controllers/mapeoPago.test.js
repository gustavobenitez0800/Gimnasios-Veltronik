// @vitest-environment happy-dom
//
// ============================================
// VELTRONIK - Tests del mapeo de un cobro
// ============================================
// ⭐ ESTE ES EL TEST DEL BUG QUE MATABA A LOS ARANCELES.
//
// El mapeo no incluía `plan_id`. La pantalla tenía el selector, se elegía el arancel, el
// monto se completaba solo... y el arancel NUNCA salía del navegador. La función entera no
// se ejecutó nunca: no quedaba guardada en el cobro, no se aplicaba el período del plan, y
// no se descontaban las clases.
//
// Desde afuera se veía como "los aranceles no hacen nada", y eran dos líneas.

import { describe, it, expect } from 'vitest';
import { CAMPOS_DEL_PAGO, mapPaymentModelToDTO } from './mapeoPago';

const formulario = {
  member_id: 'socio-1',
  plan_id: 'plan-mensual',
  amount: '45000',
  paymentDate: '2026-09-02',
  paymentMethod: 'transfer',
  status: 'paid',
  notes: 'pagó en dos veces',
  periodStart: '2026-09-02',
  periodEnd: '2026-10-02',
};

describe('el cobro que se manda al servidor', () => {

  // ⭐ EL TEST DEL BUG
  it('manda el arancel', () => {
    // Sin esto los aranceles no existen: se pueden crear, elegir y ver, y no pasa nada.
    expect(mapPaymentModelToDTO(formulario).plan_id).toBe('plan-mensual');
  });

  it('lo manda como plan_id, NO como planId', () => {
    // El backend lo lee con @JsonProperty("plan_id"). Mandarlo en camelCase es lo mismo que
    // no mandarlo: Jackson lo descarta sin avisar y el cobro se guarda sin arancel.
    const dto = mapPaymentModelToDTO(formulario);
    expect(dto).toHaveProperty('plan_id');
    expect(dto).not.toHaveProperty('planId');
  });

  it('NINGÚN campo se pierde en el camino', () => {
    // El guardián: si mañana alguien suma un campo al formulario y se olvida del mapeo, ese
    // campo no llega nunca y el bug es invisible desde la pantalla.
    const dto = mapPaymentModelToDTO(formulario);
    for (const campo of CAMPOS_DEL_PAGO) {
      expect(dto, `"${campo}" no viaja al servidor`).toHaveProperty(campo);
    }
  });

  it('un cobro sin arancel manda null, no undefined', () => {
    // `undefined` desaparece al serializar a JSON, y entonces el backend no puede
    // distinguir "sin arancel" de "no me lo mandaron".
    expect(mapPaymentModelToDTO({ ...formulario, plan_id: '' }).plan_id).toBe(null);
  });

  it('el método viaja en MAYÚSCULAS', () => {
    // El backend compara con "CASH"/"TRANSFER". Ya pasó que los ingresos del mes dieran $0
    // por comparar mayúsculas contra minúsculas.
    expect(mapPaymentModelToDTO(formulario).paymentMethod).toBe('TRANSFER');
    expect(mapPaymentModelToDTO({ ...formulario, paymentMethod: undefined }).paymentMethod).toBe('CASH');
  });

  it('el monto viaja como número', () => {
    expect(mapPaymentModelToDTO(formulario).amount).toBe(45000);
    expect(mapPaymentModelToDTO({ ...formulario, amount: 'roto' }).amount).toBe(0);
  });

  it('el período cubre el día entero', () => {
    const dto = mapPaymentModelToDTO(formulario);
    expect(dto.periodStart).toBe('2026-09-02T00:00:00');
    expect(dto.periodEnd).toBe('2026-10-02T23:59:59');
  });

  it('sin fechas no inventa ninguna', () => {
    // Cobrar desde Socios no pide fechas: las decide el backend según el arancel. Si acá se
    // mandara "hoy" por las dudas, estaríamos pisando esa decisión con una cuenta hecha en
    // el navegador — que es el error que ya costó los vencimientos en cinco lugares.
    const dto = mapPaymentModelToDTO({ member_id: 'x', amount: '1000' });
    expect(dto.periodStart).toBe(null);
    expect(dto.periodEnd).toBe(null);
    expect(dto.paymentDate).toBe(null);
  });
});
