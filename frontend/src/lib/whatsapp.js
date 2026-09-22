// ============================================
// VELTRONIK - EL ENLACE DE WHATSAPP DE UN SOCIO
// ============================================
// Un solo lugar arma el wa.me: lo usan Socios y Retención. Antes cada pantalla le pegaba
// "54" adelante a lo que hubiera en la ficha, y un teléfono cargado como "+54 9 3756 …"
// terminaba en "54549…", un número que no existe.
//
// WhatsApp quiere el número internacional sin signos. Para un celular argentino es
// 54 + 9 + característica + número (sin el 0 ni el 15). Acá se aceptan las formas en que
// se carga en un mostrador: "3756 42-9495", "03756 429495", "+54 9 3756 429495",
// "54 3756 429495". El "15" pegado a la característica ("3756 15 429495") no se puede
// sacar sin saber cuántos dígitos tiene la característica, así que ese se deja como está.
// ============================================

/**
 * El número como lo quiere wa.me, o null si en la ficha no hay un teléfono usable.
 * @param {string} telefono lo que está cargado en la ficha
 */
export function numeroDeWhatsApp(telefono) {
  let digitos = String(telefono || '').replace(/\D/g, '');
  if (digitos.startsWith('00')) digitos = digitos.slice(2); // 0054…: el prefijo internacional
  if (digitos.startsWith('549')) return digitos.length >= 12 ? digitos : null;
  if (digitos.startsWith('54') && digitos.length >= 12) digitos = digitos.slice(2);
  if (digitos.startsWith('0')) digitos = digitos.slice(1); // 03756…: el 0 de larga distancia
  // Un número argentino sin el 54 tiene 10 dígitos (característica + número).
  if (digitos.length < 10) return null;
  return `549${digitos}`;
}

/**
 * El enlace para abrir la conversación, con el mensaje ya escrito si se pasa uno.
 * null si el teléfono no sirve: quien llama avisa en vez de abrir un chat que no existe.
 */
export function enlaceDeWhatsApp(telefono, mensaje) {
  const numero = numeroDeWhatsApp(telefono);
  if (!numero) return null;
  return mensaje
    ? `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`
    : `https://wa.me/${numero}`;
}
