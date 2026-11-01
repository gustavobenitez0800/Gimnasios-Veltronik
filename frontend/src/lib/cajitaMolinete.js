// ============================================
// VELTRONIK - LA CAJITA DEL MOLINETE (relé por USB)
// ============================================
// Una Raspberry Pi Pico con un relé, enchufada por USB a la PC del mostrador, que va cableada
// al molinete. Sirve para cualquier gimnasio que tenga un molinete con traba eléctrica o con
// entrada de "abrir": es la pieza que conecta su molinete con Veltronik. Cómo armarla e
// instalarla: docs/molinete/cajita.md.
//
// Corre un programa nuestro (firmware/cajita-molinete/main.py), que esta app le instala y le
// actualiza sola. Tiene dos modos según cómo se cablea: SOSTENER (el relé prendido traba, como
// el del primer gimnasio) o PULSO (el molinete tiene su placa y abre con una señal). El modo y
// el tiempo quedan guardados ADENTRO de la cajita: si se cambia la PC, la cajita sigue igual.
//
// No decide nada: el escritorio le dice "abrí" cuando entra alguien que puede pasar, con la
// MISMA regla que el molinete facial (lib/situacionSocio → puedePasarElMolinete).
//
// Se le habla con la API serie de Chromium (navigator.serial), que ya viene en el escritorio:
// sin librerías nativas que compilar. El proceso principal elige el puerto (electron/main.cjs,
// 'select-serial-port') y ya tiene permiso para los dispositivos serie.
//
// ⚠️ Nunca abrir el puerto a 1200 baudios: en una RP2040 eso la reinicia en modo cargador.
// ============================================

import PROGRAMA from '../../firmware/cajita-molinete/main.py?raw';

/** La placa de la cajita: Raspberry Pi Pico con MicroPython (VID 2E8A, PID 0005). */
export const FILTRO_CAJITA = Object.freeze({ usbVendorId: 0x2e8a, usbProductId: 0x0005 });

/** La versión del programa que trae esta app (la del archivo, para no tener dos números). */
export const VERSION_DEL_PROGRAMA = Number(/VERSION = 'veltronik-molinete (\d+)'/.exec(PROGRAMA)?.[1] || 0);

export const MODOS = Object.freeze({
  SOSTENER: 'SOSTENER',
  PULSO: 'PULSO',
});

const VELOCIDAD = 115200;
const ESPERA_RESPUESTA_MS = 1500;
const CLAVE_SALIDA = 'cajita_abrir_en_salida';

function leerOpcionSalida() {
  try { return localStorage.getItem(CLAVE_SALIDA) === '1'; } catch { return false; }
}

const ESTADO_INICIAL = {
  fase: 'sin-conectar', version: null, versionNumero: 0, modo: null, abrirMs: null, habilitada: false,
};

/**
 * fase: 'sin-conectar' | 'buscando' | 'conectada' | 'sin-cajita' | 'no-soportado' | 'muda' | 'programando'
 *   · sin-cajita    no hay ninguna placa de cajita enchufada a esta PC
 *   · muda          hay una placa, pero no contesta el PING: sin nuestro programa, o abierta
 *                   por otro programa
 * versionNumero / desactualizada: la del programa que tiene adentro, contra el que trae la app.
 * modo / abrirMs: lo guardado en la cajita (null en las de la versión 1, que no lo saben decir).
 * habilitada: el plan de la sucursal incluye el control de acceso (lo dice el servidor).
 * abrirEnLaSalida: esta PC también abre cuando se registra una salida (molinete de dos sentidos).
 */
let estado = { ...ESTADO_INICIAL, desactualizada: false, abrirEnLaSalida: leerOpcionSalida() };
const oyentes = new Set();

let puerto = null;
let escritor = null;
let lector = null;
let lectura = null;
let esperando = null;
let crudo = '';
const esperasDeTexto = new Set();
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

/** Si esta PC abre también al registrar una SALIDA. Es de la PC, como la cajita. */
export function fijarAbrirEnLaSalida(si) {
  try { localStorage.setItem(CLAVE_SALIDA, si ? '1' : '0'); } catch { /* sin almacenamiento */ }
  cambiar({ abrirEnLaSalida: !!si });
}

function serie() {
  return typeof navigator !== 'undefined' ? navigator.serial : undefined;
}

function esLaCajita(p) {
  const info = p?.getInfo?.() || {};
  return info.usbVendorId === FILTRO_CAJITA.usbVendorId && info.usbProductId === FILTRO_CAJITA.usbProductId;
}

const pausa = (ms) => new Promise((r) => { setTimeout(r, ms); });

/**
 * Lee todo lo que manda la placa. Cada renglón completo se le entrega a quien espera una
 * respuesta; el texto crudo (la consola de MicroPython no siempre termina en renglón) queda en
 * `crudo` para quien espera un texto, como al instalar el programa.
 */
function leer(p) {
  lector = p.readable.getReader();
  const decodificador = new TextDecoder();
  let resto = '';
  lectura = (async () => {
    try {
      for (;;) {
        const { value, done } = await lector.read();
        if (done) break;
        const texto = decodificador.decode(value, { stream: true });
        crudo = (crudo + texto).slice(-8000);
        esperasDeTexto.forEach((e) => { if (crudo.includes(e.texto)) e.resolver(true); });
        resto += texto;
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
    } catch { /* se desenchufó o se soltó: lo atiende quien corresponda */ } finally {
      try { lector.releaseLock(); } catch { /* ya estaba suelto */ }
    }
  })();
}

async function escribir(texto) {
  await escritor.write(new TextEncoder().encode(texto));
}

const enviar = (orden) => escribir(`${orden}\n`);

/** Manda una orden y espera el renglón que matchee `patron`; null si no contesta a tiempo. */
function preguntar(orden, patron, ms = ESPERA_RESPUESTA_MS) {
  return new Promise((resolver) => {
    const pedido = { patron, resolver };
    esperando = pedido;
    enviar(orden).catch(() => {});
    setTimeout(() => {
      if (esperando === pedido) {
        esperando = null;
        resolver(null);
      }
    }, ms);
  });
}

/** Espera que la placa diga `texto` (en cualquier parte de lo último que mandó). */
function esperarTexto(texto, ms) {
  if (crudo.includes(texto)) return Promise.resolve(true);
  return new Promise((resolver) => {
    const espera = {
      texto,
      resolver: (ok) => { esperasDeTexto.delete(espera); resolver(ok); },
    };
    esperasDeTexto.add(espera);
    setTimeout(() => espera.resolver(false), ms);
  });
}

/** Suelta el puerto: primero la lectura y la escritura (Chromium no cierra un puerto tomado). */
async function soltar() {
  const p = puerto;
  puerto = null;
  try { await lector?.cancel(); } catch { /* ya terminó */ }
  try { await lectura; } catch { /* idem */ }
  lector = null;
  lectura = null;
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
      cambiar({ fase: 'sin-cajita', version: null, versionNumero: 0, modo: null, abrirMs: null, desactualizada: false });
    }
  });
  s.addEventListener('connect', (e) => {
    if (esLaCajita(e.target) && !['conectada', 'buscando', 'programando'].includes(estado.fase)) conectarCajita();
  });
}

/** Busca la placa y abre su puerto (sin preguntarle nada). null si no está o no se pudo abrir. */
async function abrirPuerto(s, conGesto) {
  let p = (await s.getPorts().catch(() => [])).find(esLaCajita);
  if (!p && conGesto) p = await s.requestPort({ filters: [FILTRO_CAJITA] }).catch(() => null);
  if (!p) return { motivo: 'sin-cajita' };
  try {
    await p.open({ baudRate: VELOCIDAD });
  } catch {
    // Abierto por otro programa (el monitor serie de Thonny, por ejemplo), o se desenchufó justo.
    return { motivo: 'muda' };
  }
  puerto = p;
  escritor = p.writable.getWriter();
  crudo = '';
  leer(p);
  return { puerto: p };
}

/** "ESTADO TRABADO MODO=SOSTENER ABRIR_MS=5000 …" → { modo, abrirMs } */
function leerConfiguracion(renglon) {
  const modo = /MODO=(\w+)/.exec(renglon || '')?.[1] || null;
  const ms = Number(/ABRIR_MS=(\d+)/.exec(renglon || '')?.[1]);
  return { modo, abrirMs: Number.isFinite(ms) && ms > 0 ? ms : null };
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
  if (estado.fase === 'buscando' || estado.fase === 'programando') return false;
  cambiar({ fase: 'buscando' });

  const abierto = await abrirPuerto(s, conGesto);
  if (!abierto.puerto) {
    cambiar({ fase: abierto.motivo, version: null, versionNumero: 0, modo: null, abrirMs: null, desactualizada: false });
    return false;
  }

  const pong = await preguntar('PING', /^PONG\b/);
  if (!pong) {
    await soltar();
    cambiar({ fase: 'muda', version: null, versionNumero: 0, modo: null, abrirMs: null, desactualizada: false });
    return false;
  }
  const version = pong.replace(/^PONG\s*/, '') || null;
  const versionNumero = Number(/(\d+)\s*$/.exec(version || '')?.[1] || 0);
  // La versión 1 (la primera, la del gimnasio de Nelson) no sabe decir su configuración.
  const config = versionNumero >= 2 ? leerConfiguracion(await preguntar('ESTADO', /^ESTADO\b/)) : { modo: null, abrirMs: null };
  cambiar({
    fase: 'conectada', version, versionNumero, ...config,
    desactualizada: versionNumero < VERSION_DEL_PROGRAMA,
  });
  return true;
}

/**
 * Una orden a mano: 'ABRIR' (por el tiempo guardado en la cajita), 'TRABAR' o 'LIBRE'.
 * true si salió. No depende del plan: es el botón de quien atiende.
 */
export async function ordenarALaCajita(orden) {
  if (estado.fase !== 'conectada' || !escritor) return false;
  try {
    await enviar(orden);
    return true;
  } catch {
    await soltar();
    cambiar({ fase: 'sin-cajita', version: null, versionNumero: 0, modo: null, abrirMs: null, desactualizada: false });
    return false;
  }
}

/**
 * Abre el molinete si corresponde. Lo llama el mostrador después de registrar un paso (a mano,
 * con el DNI, o por QR). No espera: el cartel no se demora.
 *
 * @param {{ pasa?: boolean, salida?: boolean }} paso
 *   pasa: el veredicto de la entrada (lib/situacionSocio → puedePasarElMolinete).
 *   salida: se registró una SALIDA; abre solo si esta PC tiene «abrir también en la salida».
 * @returns {boolean} si mandó la orden
 */
export function abrirSiPasa({ pasa = false, salida = false }) {
  if (!estado.habilitada || estado.fase !== 'conectada') return false;
  if (salida ? !estado.abrirEnLaSalida : !pasa) return false;
  ordenarALaCajita('ABRIR');
  return true;
}

/**
 * Cambia el modo y/o el tiempo guardados EN la cajita (versión 2 en adelante).
 * @param {{ modo?: 'SOSTENER'|'PULSO', abrirMs?: number }} cambios
 * @returns {Promise<boolean>}
 */
export async function configurarCajita({ modo, abrirMs }) {
  if (estado.fase !== 'conectada' || estado.versionNumero < 2) return false;
  const nuevo = {};
  if (modo) {
    const r = await preguntar(`MODO ${modo}`, /^(OK MODO|ERROR)\b/);
    if (!r?.startsWith('OK')) return false;
    nuevo.modo = modo;
  }
  if (abrirMs) {
    const r = await preguntar(`TIEMPO ${Math.round(abrirMs)}`, /^(OK TIEMPO|ERROR)\b/);
    const ms = Number(/^OK TIEMPO (\d+)/.exec(r || '')?.[1]);
    if (!ms) return false;
    nuevo.abrirMs = ms;
  }
  cambiar(nuevo);
  return true;
}

/**
 * Le instala (o le actualiza) a la cajita el programa que trae esta app.
 *
 * <p>La placa tiene que tener MicroPython (viene de fábrica en las que armamos nosotros; para
 * una nueva, ver docs/molinete/cajita.md). Se corta el programa que esté corriendo (Ctrl-C), se
 * entra a la consola cruda de MicroPython (Ctrl-A), se escribe main.py, y se reinicia. Lo
 * guardado en cajita.json (el modo y el tiempo) no se toca.</p>
 *
 * @returns {Promise<{ ok: boolean, motivo?: string }>}
 */
export async function programarCajita({ conGesto = false } = {}) {
  const s = serie();
  if (!s) return { ok: false, motivo: 'Esta versión no puede hablarle a la cajita.' };
  if (estado.fase === 'programando' || estado.fase === 'buscando') return { ok: false, motivo: 'La cajita está ocupada.' };
  cambiar({ fase: 'programando' });
  escucharConexiones(s);

  try {
    if (!puerto) {
      const abierto = await abrirPuerto(s, conGesto);
      if (!abierto.puerto) {
        cambiar({ fase: abierto.motivo });
        return {
          ok: false,
          motivo: abierto.motivo === 'sin-cajita'
            ? 'No hay ninguna cajita enchufada a esta computadora.'
            : 'No se pudo abrir la cajita: puede que otro programa la tenga abierta.',
        };
      }
    }

    // Cortar lo que esté corriendo y entrar a la consola cruda de MicroPython.
    await escribir('\r\x03\x03');
    await pausa(200);
    crudo = '';
    await escribir('\x01');
    if (!(await esperarTexto('raw REPL', 2000))) {
      throw new Error('La placa no responde como MicroPython. Si es nueva, primero hay que instalarle MicroPython (ver la guía).');
    }

    crudo = '';
    const codigo = `f=open('main.py','w')\nf.write(${JSON.stringify(PROGRAMA)})\nf.close()\nprint('GUARDADO')\n`;
    // De a pedazos: la consola cruda lee lo que entra, y un chorro de golpe se puede perder.
    for (let i = 0; i < codigo.length; i += 256) {
      await escribir(codigo.slice(i, i + 256));
      await pausa(10);
    }
    await escribir('\x04');
    if (!(await esperarTexto('GUARDADO', 8000))) throw new Error('La cajita no guardó el programa.');

    // Salir de la consola cruda y reiniciar: arranca el programa nuevo.
    await escribir('\x02');
    await pausa(100);
    await escribir('\x04');
    await pausa(1500);
  } catch (e) {
    await soltar();
    cambiar({ fase: 'muda', version: null, versionNumero: 0, modo: null, abrirMs: null, desactualizada: false });
    return { ok: false, motivo: e.message };
  }

  await soltar();
  cambiar({ fase: 'sin-conectar' });
  const ok = await conectarCajita();
  if (!ok || estado.versionNumero !== VERSION_DEL_PROGRAMA) {
    return { ok: false, motivo: 'La cajita no contesta con el programa nuevo. Desenchufala, volvé a enchufarla y probá de nuevo.' };
  }
  return { ok: true };
}

/** Solo para los tests: vuelve todo a cero. */
export function _reiniciarCajita() {
  puerto = null;
  escritor = null;
  lector = null;
  lectura = null;
  esperando = null;
  crudo = '';
  esperasDeTexto.clear();
  escuchandoConexiones = false;
  estado = { ...ESTADO_INICIAL, desactualizada: false, abrirEnLaSalida: leerOpcionSalida() };
  oyentes.clear();
}
