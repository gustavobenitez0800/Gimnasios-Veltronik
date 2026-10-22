// ============================================
// VELTRONIK - LO QUE SE PUEDE MOSTRAR DE UNA TARJETA QUE SE ESTÁ CARGANDO
// ============================================
// El cobro dibuja la tarjeta y la va completando mientras el dueño escribe (CardCheckout).
//
// ⭐ VELTRONIK NUNCA TIENE EL NÚMERO. Número, vencimiento y código se escriben en los campos
// seguros de Mercado Pago (iframes de su dominio): la página no puede leerlos, ni queremos.
// Lo único que llega acá es lo que Mercado Pago avisa:
//   · mientras se escribe: si cada campo es válido, y los primeros 6 a 8 dígitos (el "bin",
//     que dice la marca y el banco; no identifica a nadie);
//   · al confirmar, en la respuesta del token: los últimos 4 y el vencimiento.
// Por eso la tarjeta dibujada muestra "4509 95•• •••• ••••" mientras se escribe, y recién
// "4509 95•• •••• 3704" cuando se aprieta Pagar.

const PUNTO = '•';

/**
 * El número tal como se dibuja en la tarjeta: lo que se sabe, y puntos en lo demás.
 *
 * @param {string|null} bin       los primeros dígitos que avisó Mercado Pago (o nada)
 * @param {string|null} ultimos4  los últimos 4, que llegan con el token
 * @param {number}      largo     cuántos dígitos tiene esta marca (Amex 15, el resto 16)
 */
export function numeroEnLaTarjeta({ bin = null, ultimos4 = null, largo = 16 } = {}) {
  const total = Number.isInteger(largo) && largo >= 13 && largo <= 19 ? largo : 16;
  const digitos = String(bin || '').replace(/\D/g, '').slice(0, total).split('');
  while (digitos.length < total) digitos.push(PUNTO);
  const fin = String(ultimos4 || '').replace(/\D/g, '');
  if (fin.length === 4) digitos.splice(total - 4, 4, ...fin.split(''));
  // Amex se agrupa 4-6-5; el resto, de a 4.
  const grupos = total === 15 ? [4, 6, 5] : Array.from({ length: Math.ceil(total / 4) }, () => 4);
  const partes = [];
  let i = 0;
  for (const g of grupos) {
    partes.push(digitos.slice(i, i + g).join(''));
    i += g;
  }
  return partes.join(' ');
}

/** El titular como se graba en una tarjeta: en mayúsculas y sin pasarse del renglón. */
export function nombreEnLaTarjeta(nombre) {
  const limpio = String(nombre || '').replace(/\s+/g, ' ').trim().toUpperCase();
  if (!limpio) return 'NOMBRE Y APELLIDO';
  return limpio.length > 26 ? `${limpio.slice(0, 25)}…` : limpio;
}

/**
 * El vencimiento: el real cuando ya llegó con el token; puntos cuando el campo es válido
 * (se sabe que está bien escrito, no qué dice); el molde cuando todavía falta.
 */
export function vencimientoEnLaTarjeta({ valido = false, mes = null, anio = null } = {}) {
  if (mes && anio) return `${String(mes).padStart(2, '0')}/${String(anio).slice(-2)}`;
  return valido ? `${PUNTO}${PUNTO}/${PUNTO}${PUNTO}` : 'MM/AA';
}

/**
 * La marca, de lo que contesta Mercado Pago para un bin (`mp.getPaymentMethods`). Con lo que
 * hace falta para dibujarla y para ajustar los campos: Amex tiene 15 dígitos y código de 4.
 */
export function marcaDeLaTarjeta(metodo) {
  if (!metodo || !metodo.id) return null;
  const ajustes = Array.isArray(metodo.settings) ? metodo.settings[0] : null;
  return {
    id: String(metodo.id),
    nombre: metodo.name || String(metodo.id),
    debito: metodo.payment_type_id === 'debit_card',
    largo: ajustes?.card_number?.length || 16,
    largoCodigo: ajustes?.security_code?.length || 3,
    ajustesNumero: ajustes?.card_number || null,
    ajustesCodigo: ajustes?.security_code || null,
  };
}

/** Lo que se escribe en el dorso: tantos puntos como dígitos pide el código de esa marca. */
export function codigoEnLaTarjeta(largoCodigo = 3) {
  return PUNTO.repeat(largoCodigo === 4 ? 4 : 3);
}

// Los avisos de Mercado Pago vienen en inglés y con jerga ("invalid_length"). El dueño de un
// gimnasio necesita saber qué corregir, en su idioma.
const MENSAJES = {
  cardNumber: {
    invalid_length: 'Al número le faltan dígitos.',
    invalid_value: 'El número no es válido. Revisalo.',
    invalid_type: 'El número lleva solo dígitos.',
  },
  expirationDate: {
    invalid_value: 'Revisá el vencimiento: ¿ya pasó, o el mes está mal?',
    invalid_length: 'El vencimiento va como MM/AA.',
    invalid_type: 'El vencimiento va como MM/AA.',
  },
  securityCode: {
    invalid_length: 'Al código le faltan dígitos.',
    invalid_type: 'El código lleva solo dígitos.',
    invalid_value: 'Revisá el código de seguridad.',
  },
};

/**
 * El primer error de un campo, en castellano, o null si está bien. Recibe lo que manda el
 * evento `validityChange` de Mercado Pago: `errorMessages: [{ cause, message }]`.
 */
export function mensajeDelCampo(campo, errores) {
  if (!Array.isArray(errores) || errores.length === 0) return null;
  const causa = errores[0]?.cause;
  return MENSAJES[campo]?.[causa] || 'Revisá este dato.';
}
