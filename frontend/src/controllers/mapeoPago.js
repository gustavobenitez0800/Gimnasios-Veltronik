// ============================================
// VELTRONIK - CÓMO VIAJA UN PAGO AL SERVIDOR
// ============================================
// Vive afuera del controlador para que lo pueda usar CUALQUIER pantalla que cobre —la de
// Pagos y el cobro rápido desde Socios— y para que se pueda probar sin montar un hook.
//
// ⚠️ Que haya un solo mapeador no es prolijidad: es lo que evita que dos pantallas manden
// cosas distintas. El bug que motivó sacarlo de adentro del controlador fue exactamente
// eso al revés — el formulario guardaba el arancel, el backend lo esperaba, y el mapeador
// del medio no lo mandaba. La cadena estaba cortada en la mitad y nadie lo veía.

/**
 * Del formulario al contrato del backend.
 *
 * @param {object} model  lo que tiene el formulario en pantalla
 * @returns el cuerpo del POST/PUT de pagos
 */
export function mapPaymentModelToDTO(model) {
  return {
    member_id: model.member_id,
    amount: parseFloat(model.amount) || 0,

    /**
     * EL ARANCEL. Sin esto el backend no aplica ni el período ni las clases del plan:
     * `aplicarPeriodoDelPlan` y `sumarClasesDelPlan` solo corren si el pago trae plan.
     *
     * Vacío viaja como null y no como "": un "" llega al backend como UUID inválido y
     * rompe el cobro, y el cobro SIN arancel tiene que seguir andando — es como se cobra
     * una clase suelta o un importe a mano.
     */
    plan_id: model.plan_id || null,

    paymentDate: model.paymentDate ? `${model.paymentDate}T00:00:00` : null,
    paymentMethod: (model.paymentMethod || 'cash').toUpperCase(),
    status: (model.status || 'paid').toUpperCase(),
    notes: model.notes || '',

    // El período termina al FINAL del día: a las 00:00 el socio perdería su último día.
    // Vacío viaja como null a propósito — cuando hay arancel, el período lo calcula el
    // backend desde el plan y desde la cobertura vigente, y mandar una fecha se lo pisaría.
    periodStart: model.periodStart ? `${model.periodStart}T00:00:00` : null,
    periodEnd: model.periodEnd ? `${model.periodEnd}T23:59:59` : null,
  };
}

export default mapPaymentModelToDTO;
