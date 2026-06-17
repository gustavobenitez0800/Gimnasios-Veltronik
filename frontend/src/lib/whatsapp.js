// ============================================
// VELTRONIK V2 - WHATSAPP 1-CLICK (canchas)
// ============================================
// El canal real de una cancha de F5 es WhatsApp. Estos helpers arman el link
// wa.me con el mensaje ya escrito (confirmar / pedir seña / recordatorio), así
// el encargado no sale del sistema ni vuelve a tipear lo mismo cada vez.
// Es 100% frontend: cero infra, no es el bot (ese es Fase 3).
// ============================================

/**
 * Normaliza un teléfono argentino a formato internacional para wa.me (solo dígitos).
 * Heurística: si ya trae 54 lo respeta; si no, asume celular AR (54 9 ...).
 * No es infalible (los números se cargan a mano) pero acierta en la enorme mayoría.
 */
export function toIntlPhone(phone) {
  let d = String(phone || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('54')) {
    // 54 + (9?) + número. Insertamos el 9 de celular si falta.
    const rest = d.slice(2);
    return rest.startsWith('9') ? d : `549${rest}`;
  }
  if (d.startsWith('0')) d = d.slice(1);      // 0 inicial de larga distancia
  if (d.startsWith('9')) return `54${d}`;
  return `549${d}`;
}

/** Link wa.me listo para abrir (texto URL-encodeado). '' si no hay teléfono. */
export function waLink(phone, text) {
  const intl = toIntlPhone(phone);
  if (!intl) return '';
  return `https://wa.me/${intl}?text=${encodeURIComponent(text)}`;
}

// ─── Plantillas de mensaje ───
// Reciben { booking, venueName, alias } y devuelven el texto. Tono argentino, claro.

const fmt = (v) => `$${Number(v || 0).toLocaleString('es-AR')}`;

const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** "viernes 13/6 a las 21:00" a partir del startAt ISO. */
function whenLabel(startAt) {
  if (!startAt) return '';
  const d = new Date(startAt);
  const time = startAt.slice(11, 16);
  return `${DAYS[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1} a las ${time}`;
}

const firstName = (full) => String(full || '').trim().split(/\s+/)[0] || '';
const greet = (name) => (firstName(name) ? `Hola ${firstName(name)}! ` : 'Hola! ');
const sign = (venueName) => (venueName ? `\n\n— ${venueName}` : '');

/** Confirmación de turno reservado. */
export function confirmMessage({ booking, venueName }) {
  const when = whenLabel(booking.startAt);
  const price = booking.totalPrice != null ? `\nValor del turno: ${fmt(booking.totalPrice)}.` : '';
  return `${greet(booking.customerName)}Te confirmo tu turno en ${booking.courtName} para el ${when}. ⚽${price}\nCualquier cosa avisanos. ¡Te esperamos!${sign(venueName)}`;
}

/** Pedido de seña con alias/CBU para asegurar el turno. */
export function depositMessage({ booking, venueName, alias }) {
  const when = whenLabel(booking.startAt);
  const monto = booking.depositAmount != null ? ` de ${fmt(booking.depositAmount)}` : '';
  const aliasLine = alias
    ? `\n\nTransferí a:\n${alias}\n\nY mandanos el comprobante por acá para dejarlo confirmado. 🙌`
    : '\n\nPasanos el comprobante por acá para dejarlo confirmado. 🙌';
  return `${greet(booking.customerName)}Para reservarte ${booking.courtName} el ${when} necesitamos una seña${monto}.${aliasLine}${sign(venueName)}`;
}

/** Recordatorio del turno (anti no-show). */
export function reminderMessage({ booking, venueName }) {
  const when = whenLabel(booking.startAt);
  return `${greet(booking.customerName)}Te recordamos tu turno en ${booking.courtName} el ${when}. ⚽ ¡Te esperamos! Si no podés venir, avisanos así liberamos la cancha. 🙏${sign(venueName)}`;
}
