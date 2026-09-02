// ============================================
// VELTRONIK - DE LO QUE SE ESCRIBE A LO QUE SE MANDA
// ============================================
// Vive afuera del hook para poder probarlo. No es una manía de arquitectura: acá se perdía
// un campo entero y nadie se enteraba.
//
// ⭐ EL BUG QUE ESTO ARREGLA: el mapeo no incluía `plan_id`. La pantalla de Pagos tenía el
// selector de arancel, se elegía, el monto se completaba solo... y el arancel NUNCA llegaba
// al servidor. La función entera de aranceles no se ejecutó nunca: no se guardaba en el
// cobro, no se aplicaba el período del plan, y no se descontaban las clases.
//
// Se veía como "los aranceles no hacen nada", y el motivo eran dos líneas de este archivo.

/** Los campos que viajan al backend. El test verifica que no falte ninguno. */
export const CAMPOS_DEL_PAGO = [
  'member_id', 'plan_id', 'amount', 'paymentDate', 'paymentMethod',
  'status', 'notes', 'periodStart', 'periodEnd',
];

/**
 * @param model lo que tiene el formulario
 * @returns el cuerpo del POST/PUT
 */
export function mapPaymentModelToDTO(model) {
  return {
    member_id: model.member_id,
    // ⚠️ En snake_case porque así lo espera el backend (`@JsonProperty("plan_id")`).
    // Mandarlo como `planId` es lo mismo que no mandarlo: Jackson lo ignora en silencio.
    plan_id: model.plan_id || null,
    amount: parseFloat(model.amount) || 0,
    paymentDate: model.paymentDate ? `${model.paymentDate}T00:00:00` : null,
    paymentMethod: (model.paymentMethod || 'cash').toUpperCase(),
    status: (model.status || 'paid').toUpperCase(),
    notes: model.notes || '',
    // El período arranca al abrir el día y termina al cerrarlo.
    periodStart: model.periodStart ? `${model.periodStart}T00:00:00` : null,
    periodEnd: model.periodEnd ? `${model.periodEnd}T23:59:59` : null,
  };
}
