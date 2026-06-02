// ============================================
// VELTRONIK - Traducción de motivos de rechazo de Mercado Pago
// ============================================
// Convierte el status_detail técnico de MP en un mensaje claro para el cliente.
// Fuente: códigos cc_rejected_* de la doc de Mercado Pago.

const MESSAGES = {
  cc_rejected_insufficient_amount: 'La tarjeta no tiene cupo o fondos suficientes para el cobro. Probá con otra tarjeta.',
  cc_rejected_call_for_authorize: 'Tu banco necesita autorizar este pago. Llamá al banco para habilitarlo y reintentá.',
  cc_rejected_card_disabled: 'La tarjeta está inhabilitada para pagos por internet. Activala con tu banco o usá otra.',
  cc_rejected_card_type_not_allowed: 'Ese tipo de tarjeta no se acepta para suscripciones. Probá con una tarjeta de crédito.',
  cc_rejected_bad_filled_card_number: 'El número de tarjeta es incorrecto. Revisalo e intentá de nuevo.',
  cc_rejected_bad_filled_date: 'La fecha de vencimiento es incorrecta.',
  cc_rejected_bad_filled_security_code: 'El código de seguridad (CVV) es incorrecto.',
  cc_rejected_bad_filled_other: 'Hay un dato de la tarjeta mal cargado. Revisá los campos.',
  cc_rejected_high_risk: 'Mercado Pago rechazó el pago por seguridad. Probá con otra tarjeta o medio de pago.',
  cc_rejected_max_attempts: 'Se alcanzó el límite de intentos con esta tarjeta. Esperá un rato o usá otra.',
  cc_rejected_duplicated_payment: 'Detectamos un pago igual reciente. Esperá unos minutos antes de reintentar.',
  cc_rejected_other_reason: 'El banco rechazó el pago. Probá con otra tarjeta o consultá con tu banco.',
  cc_rejected_blacklist: 'No se pudo procesar el pago con esta tarjeta. Probá con otra.',
  cc_rejected_invalid_installments: 'La tarjeta no admite esta modalidad de cobro. Probá con otra.',
};

/** Mensaje claro a partir del status_detail de MP (con fallback). */
export function mpRejectionMessage(detail) {
  if (!detail) return 'El cobro fue rechazado. Probá con otra tarjeta o medio de pago.';
  return MESSAGES[detail] || `El cobro fue rechazado (${detail}). Probá con otra tarjeta o consultá con tu banco.`;
}
