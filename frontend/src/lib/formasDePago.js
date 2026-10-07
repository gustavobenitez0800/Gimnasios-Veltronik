// ============================================
// VELTRONIK - LAS FORMAS DE PAGO, EN UN SOLO LUGAR
// ============================================
// Hasta el 2026-09-22 había cinco listas con los mismos nombres: el cobro rápido, Pagos, la
// Caja, el Excel del contador y utils. Cada una con su orden y sus alias, y la que se olvidaba
// de "MERCADO_PAGO" mostraba el código crudo en pantalla. Es la contracara del backend:
// `MetodoDePago.java` reconoce los mismos alias y guarda los mismos códigos.
// ============================================

/** Las que se ofrecen al cobrar, en el orden en que se usan en un mostrador. */
export const FORMAS_DE_PAGO = [
  { codigo: 'CASH', valor: 'cash', etiqueta: 'Efectivo' },
  { codigo: 'TRANSFER', valor: 'transfer', etiqueta: 'Transferencia' },
  { codigo: 'MERCADOPAGO', valor: 'mercadopago', etiqueta: 'Mercado Pago' },
  { codigo: 'CARD', valor: 'card', etiqueta: 'Tarjeta' },
];

/** La que no es ninguna de las cuatro. No se ofrece al cobrar, pero existe en la base. */
export const OTRA_FORMA = { codigo: 'OTHER', valor: 'other', etiqueta: 'Otro' };

const clave = (crudo) => String(crudo ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * El código canónico (CASH, TRANSFER, MERCADOPAGO, CARD, OTHER) de lo que venga escrito.
 * Los mismos alias que `MetodoDePago.reconocer` del backend.
 */
export function codigoDeForma(crudo) {
  const c = clave(crudo);
  if (['cash', 'efectivo', 'contado', 'caja'].includes(c)) return 'CASH';
  if (c.startsWith('transf') || ['deposito', 'cbu', 'alias'].includes(c)) return 'TRANSFER';
  if (c.startsWith('mercadopago') || ['mp', 'qr', 'mercado'].includes(c)) return 'MERCADOPAGO';
  if (c === 'card' || c.startsWith('tarjeta') || ['debito', 'credito', 'posnet'].includes(c)) return 'CARD';
  return 'OTHER';
}

/** Cómo se lee: "CASH", "cash" o "MERCADO_PAGO" → "Efectivo", "Efectivo", "Mercado Pago". */
export function nombreDeForma(crudo) {
  if (crudo == null || crudo === '') return '';
  const codigo = codigoDeForma(crudo);
  return (FORMAS_DE_PAGO.find((f) => f.codigo === codigo) || OTRA_FORMA).etiqueta;
}

/** ¿Pasó por el cajón? Es lo único que la cuenta del efectivo puede contar. */
export function esEfectivo(crudo) {
  return codigoDeForma(crudo) === 'CASH';
}
