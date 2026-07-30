// ============================================
// VELTRONIK - FORMATO DEL VERTICAL KIOSCO
// ============================================
// Cómo se muestran plata, cantidades y fechas en el mostrador.
//
// No usa `formatCurrency` de lib/utils a propósito: el gimnasio muestra importes
// con el formato completo de Intl y el kiosco los quiere cortos, sin centavos,
// porque van en tablas densas y en el ticket. Son dos decisiones de producto
// distintas, no un descuido.
//
// Antes esto vivía copiado en seis páginas —con TRES variantes de `fmtMoney`,
// una por página según qué devolvía para un valor vacío—. Acá hay una sola.
// ============================================

/** Valor vacío. Un guion largo se lee mejor que un 0 mentiroso en una tabla. */
const EMPTY = '—';

const isEmpty = (v) => v === null || v === undefined || v === '';

/** Plata: "$1.234". Sin centavos (en el mostrador no se usan) y sin espacio. */
export function money(v) {
  return isEmpty(v) ? EMPTY : `$${Number(v).toLocaleString('es-AR')}`;
}

/** Cantidades: enteras o con decimales si el producto se pesa. */
export function qty(v) {
  return isEmpty(v) ? EMPTY : Number(v).toLocaleString('es-AR');
}

/** Fecha 'YYYY-MM-DD' del backend → "31/07/2026". El T00:00:00 la ancla al día local. */
export function date(d) {
  return d ? new Date(`${d}T00:00:00`).toLocaleDateString('es-AR') : EMPTY;
}

/** Timestamp ISO → "31/07 14:35" (en una tabla del día, el año sobra). */
export function dateTime(iso) {
  return iso
    ? new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : EMPTY;
}

/** Timestamp ISO → "14:35". */
export function time(iso) {
  return iso ? new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : EMPTY;
}

// ─── Medios de pago ───
// El `value` es el enum del backend. Estaba en dos listas separadas: el POS tenía las
// cinco opciones y la Caja un mapa de cuatro, así que una venta fiada se mostraba como
// "CUENTA_CORRIENTE" crudo en la tabla de ventas del día.
export const PAYMENT_METHODS = [
  { value: 'CASH', label: 'Efectivo' },
  { value: 'CARD', label: 'Tarjeta' },
  { value: 'TRANSFER', label: 'Transferencia' },
  { value: 'MP', label: 'Mercado Pago' },
  { value: 'CUENTA_CORRIENTE', label: 'Cuenta corriente (fiado)' },
];

const PAYMENT_LABELS = Object.fromEntries(PAYMENT_METHODS.map((m) => [m.value, m.label]));

/** Etiqueta del medio de pago; si llega uno desconocido devuelve el valor crudo (nunca vacío). */
export function paymentLabel(method) {
  return PAYMENT_LABELS[method] || method || EMPTY;
}
