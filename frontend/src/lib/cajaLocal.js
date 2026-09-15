// ============================================
// VELTRONIK - LA CAJA, CONTADA POR EL TERMINAL
// ============================================
//
// ⭐ POR QUÉ ESTO EXISTE, Y POR QUÉ ES INCÓMODO QUE EXISTA.
//
// Para que alguien pueda cerrar la caja sin internet, la pantalla tiene que mostrarle el
// número. Y para mostrarlo hay que calcularlo acá. O sea: son DOS cuentas de la misma plata
// —esta y la del servidor—, que es exactamente el patrón que en este proyecto salió mal
// todas las veces que se intentó (toda cuenta de fechas duplicada terminó diciendo números
// distintos en alguna de sus copias).
//
// La mitigación es la misma que ya funcionó con los días del socio: NO se elige cuál gana.
// El terminal manda lo que mostró, el servidor calcula lo suyo, y las dos quedan guardadas
// en el cierre. Si difieren, queda registrado y se hace ruido. No se corrige solo.
//
// ⚠️ Y POR ESO ESTE NÚMERO NUNCA SE PRESENTA COMO COMPLETO.
//
// El terminal sabe dos cosas: lo último que le bajó el servidor, y lo que él mismo encoló
// desde entonces. Lo que NO puede saber es lo que entró por el portal o por Mercado Pago
// durante el corte. Para el cajón eso no cambia nada —esa plata nunca pasó por ahí— pero
// para el total del período sí, así que la pantalla dice "según los datos de las HH:MM" en
// vez de fingir que sabe todo. Es la regla 6 de la fase 3: ningún total se muestra como si
// fuera completo cuando no lo es.

import { pendientes, disponible, orgActual } from './colaAccesos';

const KEY = 'veltronik_caja_espejo';

/** Las formas de pago que el servidor separa. Cualquier otra cae en `otros`. */
const METODOS = {
  CASH: 'efectivo',
  TRANSFER: 'transferencia',
  MERCADOPAGO: 'mercadopago',
  CARD: 'tarjeta',
};

/**
 * Guarda lo último que contestó el servidor sobre el período abierto.
 *
 * <p>Se llama en cada consulta que sale bien. No es un caché para ir más rápido: es lo único
 * sobre lo que se puede construir un total cuando la conexión se corta a mitad del día.</p>
 */
export function guardarEspejo(resumen, ahora = new Date()) {
  if (!resumen) return;
  try {
    // `contarDesde` en null: lo que el servidor contestó ya cubre el período entero, así que
    // todo lo que quede en la cola es, por definición, lo que él todavía no vio.
    localStorage.setItem(KEY, JSON.stringify({
      resumen, bajadoEn: ahora.toISOString(), contarDesde: null,
    }));
  } catch { /* sin almacenamiento: se vive sin espejo, no se rompe nada */ }
}

/** Lo último que bajó, o null si nunca bajó nada en esta máquina. */
export function espejo() {
  try {
    const crudo = localStorage.getItem(KEY);
    if (!crudo) return null;
    const { resumen, bajadoEn, contarDesde } = JSON.parse(crudo);
    return resumen ? { resumen, bajadoEn, contarDesde: contarDesde || null } : null;
  } catch {
    return null;
  }
}

/**
 * ⭐ Arranca el período siguiente en el propio terminal, después de cerrar sin conexión.
 *
 * <p><b>El problema que resuelve, que no es obvio.</b> Al cerrar, los cobros y egresos que
 * subieron ya se contaron en el período que se cerró — pero siguen en la cola, esperando. Sin
 * esto, el período nuevo los volvería a sumar y quien atiende vería el día de ayer otra vez.
 * Por eso el espejo nuevo nace en cero y anota <b>desde cuándo</b> contar la cola.</p>
 *
 * <p>Es provisorio a propósito: en cuanto vuelva la conexión, la primera respuesta del
 * servidor lo reemplaza entero. Si el cierre encolado terminara rechazado, este número se
 * corrige solo por esa misma vía.</p>
 *
 * @param quedaEnCaja lo que quedó en el cajón: es el fondo del período que empieza.
 * @param cuando      el momento del cierre, en hora del terminal (`YYYY-MM-DDTHH:mm:ss`).
 */
export function arrancarPeriodoLocal(quedaEnCaja, cuando, ahora = new Date()) {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      resumen: {
        desde: cuando,
        efectivo: 0, transferencia: 0, mercadopago: 0, tarjeta: 0, otros: 0,
        cantidadCobros: 0,
        egresos: 0, ingresosManuales: 0, cantidadMovimientos: 0,
        fondo: num(quedaEnCaja),
        ultimoCierre: cuando,
        ajustes: [],
      },
      bajadoEn: ahora.toISOString(),
      contarDesde: cuando,
    }));
  } catch { /* sin almacenamiento: al volver la conexión el servidor manda */ }
}

export function olvidarEspejo() {
  try { localStorage.removeItem(KEY); } catch { /* nada que limpiar */ }
}

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * El total del período según este terminal: lo último que bajó MÁS lo que la cola tiene sin
 * subir.
 *
 * <p><b>Por qué se suma todo lo que está en la cola, y NO se filtra por la hora del espejo.</b>
 * Si sigue en la cola es porque el servidor todavía no lo contó — esa es la definición de estar
 * en la cola. Filtrar por "lo posterior al espejo" dejaría afuera un cobro hecho a las 14:00
 * que no pudo subir, aunque el espejo sea de las 15:00.</p>
 *
 * <p><b>La única fecha que sí corta es la de un cierre hecho acá</b> ({@code contarDesde}).
 * Ahí el corte no es una optimización: lo anterior a ese momento ya lo contó ese cierre, y sin
 * el corte el período nuevo mostraría el día anterior otra vez, con su plata incluida.</p>
 *
 * <p>⚠️ El borde conocido: un cobro que salió, el servidor guardó, y cuya respuesta se
 * perdió, está en las dos cuentas y se suma dos veces acá. Es incómodo y es aceptable: el
 * número del terminal no decide nada —el que vale es el del servidor— y justamente para eso
 * se guardan los dos y se avisa cuando difieren.</p>
 *
 * @returns {Promise<object|null>} el resumen con la misma forma que el del servidor, más
 *          `incompleto`, `bajadoEn` y `enCola`. Null si nunca bajó nada.
 */
export async function resumenSegunElTerminal(tenantId = orgActual()) {
  const guardado = espejo();
  if (!guardado) return null;

  const base = { ...guardado.resumen };
  let enCola = 0;

  if (disponible()) {
    let lista = [];
    try {
      lista = await pendientes(tenantId);
    } catch {
      lista = [];
    }

    // Después de un cierre hecho acá, lo anterior a ese momento YA se contó en el período
    // que se cerró, aunque siga esperando en la cola. Sin este corte se contaría dos veces.
    //
    // La comparación es de texto y está bien: los dos son `YYYY-MM-DDTHH:mm:ss` en hora del
    // mostrador, un formato que ordena igual como texto que como fecha. Parsearlos sería
    // meter husos horarios en una comparación que no los necesita — y este proyecto ya pagó
    // ese error mandando `toISOString()` con tres horas de más.
    const desde = guardado.contarDesde;

    for (const item of lista) {
      if (desde && String(item.ocurridoEn || '') <= desde) continue;

      if (item.tipo === 'COBRO') {
        const donde = METODOS[String(item.paymentMethod || '').toUpperCase()] || 'otros';
        base[donde] = num(base[donde]) + num(item.amount);
        base.cantidadCobros = num(base.cantidadCobros) + 1;
        enCola++;
      } else if (item.tipo === 'EGRESO') {
        // ⚠️ Solo el efectivo mueve el cajón. Un gasto pagado por transferencia salió de la
        // cuenta, no del cajón, y restarlo acá inventaría un faltante.
        if (String(item.metodo || 'CASH').toUpperCase() !== 'CASH') continue;
        const esIngreso = String(item.movimientoTipo || 'EGRESO').toUpperCase() === 'INGRESO';
        if (esIngreso) {
          base.ingresosManuales = num(base.ingresosManuales) + num(item.monto);
        } else {
          base.egresos = num(base.egresos) + num(item.monto);
        }
        base.cantidadMovimientos = num(base.cantidadMovimientos) + 1;
        enCola++;
      }
    }
  }

  // ⭐ LA CUENTA DEL CAJÓN SE REHACE, NO SE ARRASTRA. El `esperadoEnElCajon` del espejo es
  // de cuando bajó; si se dejara el viejo, un cobro en efectivo encolado no aparecería en el
  // único número que quien cierra realmente mira.
  base.digital = num(base.transferencia) + num(base.mercadopago);
  base.esperadoEnElCajon = num(base.fondo) + num(base.efectivo)
    + num(base.ingresosManuales) - num(base.egresos);

  return {
    ...base,
    // Lo que hace honesta a la pantalla. No es un adorno: sin esto el número se lee como
    // definitivo y no lo es.
    incompleto: true,
    bajadoEn: guardado.bajadoEn,
    enCola,
  };
}
