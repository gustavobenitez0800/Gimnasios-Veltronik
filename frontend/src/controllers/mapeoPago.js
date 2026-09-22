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

const dos = (n) => String(n).padStart(2, '0');

/** "2026-09-22T19:40:05", en la hora de la PC (la del gimnasio), sin pasar por UTC. */
function momentoLocal(d) {
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`
    + `T${dos(d.getHours())}:${dos(d.getMinutes())}:${dos(d.getSeconds())}`;
}

/**
 * ⭐ El momento del cobro que se manda, a partir del DÍA que tiene el formulario.
 *
 * <p>El formulario solo tiene el día, y antes se mandaba siempre a las 00:00. Eso rompía dos cosas:</p>
 * <ul>
 *   <li><b>Editar un cobro le borraba la hora.</b> El de las 19:40 del mostrador pasaba a las
 *       00:00 aunque nadie hubiera tocado la fecha, y el Excel del contador mostraba otra hora.</li>
 *   <li><b>Un cobro de hoy quedaba a las 00:00</b>, antes del cierre del mediodía si lo hubo. El
 *       cierre ya no lo pierde (lo toma el siguiente), pero la hora es mentira.</li>
 * </ul>
 * <p>Ahora: si el día no cambió, viaja el momento original entero; si es hoy, la hora de ahora;
 * si es otro día, las 00:00 de ese día (no se sabe la hora, y el día es lo que cuenta).</p>
 *
 * @param {string} dia       'YYYY-MM-DD' del formulario
 * @param {string} [original] el momento que ya tenía el cobro, si se está editando
 * @param {Date}   [ahora]
 */
export function momentoDelCobro(dia, original, ahora = new Date()) {
  if (!dia) return null;
  if (original && String(original).slice(0, 10) === dia) return original;
  const hoy = `${ahora.getFullYear()}-${dos(ahora.getMonth() + 1)}-${dos(ahora.getDate())}`;
  return dia === hoy ? momentoLocal(ahora) : `${dia}T00:00:00`;
}

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
    paymentDate: momentoDelCobro(model.paymentDate, model.paymentDateOriginal),
    paymentMethod: (model.paymentMethod || 'cash').toUpperCase(),
    status: (model.status || 'paid').toUpperCase(),
    notes: model.notes || '',
    // El período arranca al abrir el día y termina al cerrarlo.
    periodStart: model.periodStart ? `${model.periodStart}T00:00:00` : null,
    periodEnd: model.periodEnd ? `${model.periodEnd}T23:59:59` : null,
  };
}
