// ============================================
// VELTRONIK - LA SITUACIÓN DEL SOCIO, CONTADA EN EL TERMINAL
// ============================================
// ⚠️⚠️ LEER ESTO ANTES DE TOCAR NADA ACÁ ADENTRO.
//
// Esta es la ÚNICA copia en el cliente de una regla que vive en el servidor
// (`MemberAccessPolicy`). Y este proyecto ya se quemó tres de tres veces con cuentas de
// fechas duplicadas: hubo un momento en que la misma cuenta estaba escrita en CINCO lugares
// del frontend y ninguno daba lo mismo — el aviso del mostrador decía "hace 2 días" y la
// lista de socios "4d vencido", para la misma persona.
//
// POR QUÉ EXISTE IGUAL
// Porque la alternativa es peor. El servidor manda su veredicto ya resuelto, y eso es
// perfecto mientras haya internet y se refresque cada pocos minutos. Pero la copia local vale
// 30 DÍAS por decisión del dueño, y un veredicto es una respuesta con fecha de vencimiento:
//
//     un socio con 10 días restantes cuando se cortó internet, al día 25 sin conexión
//     seguiría mostrando "10d restantes" y AL_DIA — cuando hace 15 días que está vencido.
//
// Eso no es un dato viejo. Es un dato equivocado con cara de correcto, y nadie mirando la
// pantalla puede darse cuenta. Entre mostrar un número que envejece y no mostrar nada, la
// respuesta es contar acá.
//
// LO QUE HACE QUE ESTA COPIA SEA DISTINTA DE AQUELLAS CINCO
//   1. Es UNA sola, y todas las pantallas la usan. No hay una cuenta por pantalla.
//   2. Los DÍAS DE GRACIA los manda el servidor (`graceDays` en el pedido del mostrador).
//      Si mañana pasan de 3 a 5, no queda un número viejo escrito de este lado.
//   3. Los tests fijan los mismos bordes que la clase de Java, incluido el que ya salió caro:
//      un socio SIN FECHA CARGADA no es un moroso.
//   4. Cuando hay internet llegan las DOS respuestas, y `compararConElServidor` avisa si
//      difieren. Eso convierte una divergencia de invisible en ruidosa, que es la única forma
//      de que un bug así no viva seis meses escondido.
//
// ⚠️ EL RIESGO QUE QUEDA, Y NO LO TAPA NINGÚN DISEÑO: si alguien cambia el SIGNIFICADO de la
// regla en Java —no el número— hay que tocar los dos lados. Queda escrito acá para que el que
// lo lea sepa que este archivo es su hermano.

/** Los días de gracia, por defecto, hasta que el servidor diga los suyos. */
const GRACIA_POR_DEFECTO = 3;

const CLAVE_GRACIA = 'veltronik_grace_days';

/**
 * Guarda los días de gracia que dijo el servidor.
 *
 * <p>Se persisten porque hacen falta justamente cuando NO hay servidor. Un terminal que nunca
 * estuvo online no puede existir —hay que iniciar sesión para llegar acá— así que el valor
 * por defecto es solo para el primer instante.</p>
 */
export function recordarGraceDays(dias) {
  if (typeof dias !== 'number' || dias < 0) return;
  try {
    localStorage.setItem(CLAVE_GRACIA, String(dias));
  } catch {
    // Sin almacenamiento se usa el valor por defecto. No vale romper por esto.
  }
}

/** Los días de gracia vigentes: los del servidor si ya los dijo, el por defecto si no. */
export function graceDays() {
  try {
    const crudo = localStorage.getItem(CLAVE_GRACIA);
    // ⚠️ SE PREGUNTA POR EL CRUDO ANTES DE CONVERTIR, y no es prolijidad.
    //
    // `Number(null)` es CERO, y cero pasa cualquier validación de "es un número válido y no
    // es negativo". Escrito al revés, un terminal que todavía no habló con el servidor se
    // quedaba con CERO días de gracia — y todo socio recién vencido caía en VENCIDO en vez de
    // EN_GRACIA, en la cara del que acaba de llegar a pagar. Lo agarró el test.
    if (crudo === null || crudo === '') return GRACIA_POR_DEFECTO;
    const guardado = Number(crudo);
    return Number.isFinite(guardado) && guardado >= 0 ? guardado : GRACIA_POR_DEFECTO;
  } catch {
    return GRACIA_POR_DEFECTO;
  }
}

/**
 * Parsea el vencimiento tal como lo manda el backend.
 *
 * <p>⚠️ Llega como `LocalDateTime` sin zona: `"2026-10-05T23:59:59"`. Pasado a `new Date()`
 * tal cual, un navegador lo interpreta como HORA LOCAL — que es lo que queremos, porque el
 * servidor ya lo pensó en hora del negocio. Lo que NO hay que hacer nunca es tratarlo como
 * UTC: ese es el bug que ya costó tres horas de corrimiento y que hacía que un vencimiento
 * "del 5" se leyera como del 4 a la noche.</p>
 */
function aFecha(valor) {
  if (!valor) return null;
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

const MINUTOS_POR_DIA = 1440;

/**
 * La situación de un socio en un momento dado.
 *
 * <p>Puerto fiel de `MemberAccessPolicy.evaluate`. Mismo orden de decisiones, mismos
 * redondeos, mismos nombres de estado.</p>
 *
 * @returns {{situacion: string, diasRestantes: number, diasVencido: number}}
 */
export function situacionDe(socio, ahora = new Date(), gracia = graceDays()) {
  if (!socio) return { situacion: 'INACTIVO', diasRestantes: 0, diasVencido: 0 };

  // La baja manda sobre todo lo demás: el que fue dado de baja no "debe", ya no es socio.
  const activo = (socio.isActive ?? socio.active) !== false;
  if (!activo) return { situacion: 'INACTIVO', diasRestantes: 0, diasVencido: 0 };

  const vence = aFecha(socio.membershipEnd);
  // ⚠️ UN SOCIO SIN FECHA NO ES UN MOROSO. Es un dato que falta —pasa con los migrados y los
  // cargados a las apuradas— y tratarlo como deudor haría sonar la alarma en la cara de
  // alguien que está al día.
  if (!vence) return { situacion: 'SIN_DATOS', diasRestantes: 0, diasVencido: 0 };

  if (vence.getTime() > ahora.getTime()) {
    // Se redondea HACIA ARRIBA: al que le quedan 12 horas le faltan "1 día", no cero. Decirle
    // "0 días" a alguien que todavía puede entrenar hoy es alarmarlo de más.
    const minutos = (vence.getTime() - ahora.getTime()) / 60000;
    const faltan = Math.ceil(minutos / MINUTOS_POR_DIA);
    return { situacion: 'AL_DIA', diasRestantes: Math.max(1, faltan), diasVencido: 0 };
  }

  // Vencido por fecha, y la fecha es lo único que manda: pagó el mes o no lo pagó.
  // Truncado hacia abajo, igual que `Duration.toDays()` del otro lado.
  const dias = Math.floor((ahora.getTime() - vence.getTime()) / 60000 / MINUTOS_POR_DIA);
  return {
    situacion: dias <= gracia ? 'EN_GRACIA' : 'VENCIDO',
    diasRestantes: 0,
    diasVencido: dias,
  };
}

/**
 * ⭐ LA RED DE SEGURIDAD CONTRA LA DERIVA.
 *
 * <p>Mientras haya internet llegan las dos respuestas: la que calculó el servidor y la que
 * calculamos acá. Tienen que coincidir. Si algún día no coinciden, es que una de las dos
 * copias de la regla cambió sin la otra — y eso, sin este chequeo, es un bug que vive seis
 * meses escondido porque nadie mira dos números que nunca se muestran juntos.</p>
 *
 * <p>No corrige nada ni bloquea nada: solo hace ruido. Corregir sería decidir cuál de las dos
 * tiene razón, y esa decisión ya está tomada — la del servidor.</p>
 */
export function compararConElServidor(socio, ahora = new Date()) {
  if (!socio?.situacion) return true; // sin respuesta del servidor no hay nada que comparar
  const mia = situacionDe(socio, ahora);
  if (mia.situacion === socio.situacion) return true;

  console.warn(
    '[situacion] el terminal y el servidor no dicen lo mismo — una de las dos copias de la '
    + 'regla cambió sin la otra',
    { socio: socio.id, servidor: socio.situacion, terminal: mia.situacion, vence: socio.membershipEnd },
  );
  return false;
}

/**
 * El socio, con su situación puesta al día contra el reloj de AHORA.
 *
 * <p>Esto es lo que usan las pantallas. Reemplaza los tres campos que mandó el servidor por
 * los calculados acá: no son dos fuentes conviviendo, es una sola —la del servidor— a la que
 * se le hizo pasar el tiempo.</p>
 */
export function conSituacionAlDia(socio, ahora = new Date()) {
  if (!socio) return socio;
  return { ...socio, ...situacionDe(socio, ahora) };
}
