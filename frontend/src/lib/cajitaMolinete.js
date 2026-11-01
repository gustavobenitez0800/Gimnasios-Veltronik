// ============================================
// VELTRONIK - LA CAJITA DEL MOLINETE (relé por USB)
// ============================================
// Una Raspberry Pi Pico con un relé, enchufada por USB a la PC del mostrador. El relé SOSTIENE
// el molinete trabado (cruz roja); suelto, el molinete queda libre (flecha verde). Es a prueba
// de fallas a propósito: sin PC o sin la cajita, la gente puede salir igual.
//
// La cajita corre un programa nuestro ("veltronik-molinete 1", MicroPython) que arranca TRABADO
// y entiende una orden por renglón:
//
//   ABRIR [ms]   flecha verde esos milisegundos y vuelve a trabar sola (5000 por defecto)
//   TRABAR       cruz roja
//   LIBRE        flecha verde hasta nueva orden
//   PING         contesta "PONG veltronik-molinete 1"
//
// No decide nada: el veredicto de cada socio es el del mostrador, el mismo que pinta el cartel
// y hace sonar la X. Acá solo se le dice "abrí" cuando ese veredicto deja pasar.
//
// Se le habla con la API serie de Chromium (navigator.serial), que ya viene en el escritorio:
// sin librerías nativas que compilar. El proceso principal elige el puerto (electron/main.cjs,
// 'select-serial-port') y ya tiene permiso para los dispositivos serie.
//
// ⚠️ Nunca abrir el puerto a 1200 baudios: en una RP2040 eso la reinicia en modo cargador.
// ============================================

/** La placa de la cajita: Raspberry Pi Pico con MicroPython (VID 2E8A, PID 0005). */
export const FILTRO_CAJITA = Object.freeze({ usbVendorId: 0x2e8a, usbProductId: 0x0005 });

/** Cuánto queda abierto el molinete con cada entrada. */
export const APERTURA_MS = 5000;

const VELOCIDAD = 115200;
const ESPERA_RESPUESTA_MS = 1500;

/**
 * fase: 'sin-conectar' | 'buscando' | 'conectada' | 'sin-cajita' | 'no-soportado' | 'muda'
 *   · sin-cajita    no hay ninguna placa de cajita enchufada a esta PC
 *   · muda          hay una placa, pero no contesta el PING (otro programa adentro)
 * habilitada: el plan de la sucursal incluye el control de acceso (lo dice el servidor).
 */
let estado = { fase: 'sin-conectar', version: null, habilitada: false };
const oyentes = new Set();

let puerto = null;
let escritor = null;
let esperando = null;
let escuchandoConexiones = false;

function cambiar(cambios) {
  estado = { ...estado, ...cambios };
  oyentes.forEach((fn) => fn(estado));
}

/** El estado actual (siempre el mismo objeto hasta que algo cambia: sirve para useSyncExternalStore). */
export function estadoDeLaCajita() {
  return estado;
}

export function suscribirseALaCajita(fn) {
  oyentes.add(fn);
  return () => oyentes.delete(fn);
}

/** Lo que diga el servidor sobre el plan. Sin esto la cajita no abre con ningún DNI. */
export function fijarHabilitacion(habilitada) {
  if (estado.habilitada !== !!habilitada) cambiar({ habilitada: !!habilitada });
}

function serie() {
  return typeof navigator !== 'undefined' ? navigator.serial : undefined;
}

function esLaCajita(p) {
  const info = p?.getInfo?.() || {};
  return info.usbVendorId === FILTRO_CAJITA.usbVendorId && info.usbProductId === FILTRO_CAJITA.usbProductId;
}

/** Lee los renglones que manda la cajita y le entrega cada uno a quien esté esperando respuesta. */
async function leer(p) {
  const lector = p.readable.getReader();
  const decodificador = new TextDecoder();
  let resto = '';
  try {
    for (;;) {
      const { value, done } = await lector.read();
      if (done) break;
      resto += decodificador.decode(value, { stream: true });
      const renglones = resto.split(/\r?\n/);
      resto = renglones.pop();
      for (const r of renglones.map((x) => x.trim()).filter(Boolean)) {
        if (esperando?.patron.test(r)) {
          const { resolver } = esperando;
          esperando = null;
          resolver(r);
        }
      }
    }
  } catch { /* se desenchufó: lo atiende el aviso de 'disconnect' */ } finally {
    lector.releaseLock();
  }
}

async function enviar(orden) {
  await escritor.write(new TextEncoder().encode(`${orden}\n`));
}

/** Manda una orden y espera el renglón que matchee `patron`; null si no contesta a tiempo. */
function preguntar(orden, patron) {
  return new Promise((resolver) => {
    const pedido = { patron, resolver };
    esperando = pedido;
    enviar(orden).catch(() => {});
    setTimeout(() => {
      if (esperando === pedido) {
        esperando = null;
        resolver(null);
      }
    }, ESPERA_RESPUESTA_MS);
  });
}

async function soltar() {
  const p = puerto;
  puerto = null;
  try { escritor?.releaseLock(); } catch { /* ya estaba suelto */ }
  escritor = null;
  try { await p?.close(); } catch { /* ya estaba cerrado o desenchufado */ }
}

/** Si la cajita se desenchufa y se vuelve a enchufar, se reconecta sola. */
function escucharConexiones(s) {
  if (escuchandoConexiones || !s.addEventListener) return;
  escuchandoConexiones = true;
  s.addEventListener('disconnect', (e) => {
    if (e.target === puerto || (puerto === null && esLaCajita(e.target))) {
      soltar();
      cambiar({ fase: 'sin-cajita', version: null });
    }
  });
  s.addEventListener('connect', (e) => {
    if (esLaCajita(e.target) && estado.fase !== 'conectada') conectarCajita();
  });
}

/**
 * Busca la cajita, abre su puerto y le pregunta PING. true si contestó.
 *
 * @param {{ conGesto?: boolean }} opciones conGesto: el pedido viene de un clic (en Ajustes).
 *        Solo así se puede pedir un puerto que esta PC todavía no tenía permitido; al arrancar
 *        alcanza con los que ya están (el proceso principal da permiso a todos los serie).
 */
export async function conectarCajita({ conGesto = false } = {}) {
  const s = serie();
  if (!s) {
    cambiar({ fase: 'no-soportado' });
    return false;
  }
  escucharConexiones(s);
  if (estado.fase === 'conectada') return true;
  if (estado.fase === 'buscando') return false;
  cambiar({ fase: 'buscando' });

  let p = (await s.getPorts().catch(() => [])).find(esLaCajita);
  if (!p && conGesto) p = await s.requestPort({ filters: [FILTRO_CAJITA] }).catch(() => null);
  if (!p) {
    cambiar({ fase: 'sin-cajita', version: null });
    return false;
  }

  try {
    await p.open({ baudRate: VELOCIDAD });
  } catch {
    // Abierto por otro programa (el monitor serie de Thonny, por ejemplo), o se desenchufó justo.
    cambiar({ fase: 'muda', version: null });
    return false;
  }
  puerto = p;
  escritor = p.writable.getWriter();
  leer(p);

  const pong = await preguntar('PING', /^PONG\b/);
  if (!pong) {
    await soltar();
    cambiar({ fase: 'muda', version: null });
    return false;
  }
  cambiar({ fase: 'conectada', version: pong.replace(/^PONG\s*/, '') || null });
  return true;
}

/**
 * Una orden a mano: 'ABRIR' (por APERTURA_MS), 'TRABAR' o 'LIBRE'. true si salió.
 * No depende del plan: es el botón de quien atiende, y la cajita la instaló el gimnasio.
 */
export async function ordenarALaCajita(orden) {
  if (estado.fase !== 'conectada' || !escritor) return false;
  const linea = orden === 'ABRIR' ? `ABRIR ${APERTURA_MS}` : orden;
  try {
    await enviar(linea);
    return true;
  } catch {
    await soltar();
    cambiar({ fase: 'sin-cajita', version: null });
    return false;
  }
}

/**
 * Abre el molinete si el veredicto del mostrador deja pasar. Lo llama el mostrador después de
 * registrar una ENTRADA (a mano, con el DNI, o por QR). No espera: el cartel no se demora.
 *
 * @param {{ pasa: boolean }} veredicto
 * @returns {boolean} si mandó la orden
 */
export function abrirSiPasa({ pasa }) {
  if (!pasa || !estado.habilitada || estado.fase !== 'conectada') return false;
  ordenarALaCajita('ABRIR');
  return true;
}

/** Solo para los tests: vuelve todo a cero. */
export function _reiniciarCajita() {
  puerto = null;
  escritor = null;
  esperando = null;
  escuchandoConexiones = false;
  estado = { fase: 'sin-conectar', version: null, habilitada: false };
  oyentes.clear();
}
