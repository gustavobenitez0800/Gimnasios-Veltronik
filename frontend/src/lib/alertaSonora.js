// ============================================
// VELTRONIK - LOS SONIDOS DEL MOSTRADOR
// ============================================
// Tres avisos, para que quien atiende se entere sin estar mirando la pantalla (en muchos
// gimnasios el que atiende también da clases o cobra):
//
//   · VENCIDO: una "X" de chicharra cuando entra alguien con la cuota vencida —a mano, con el
//     llavero, por QR o frenado por el molinete—. Baja la música un momento para que se oiga.
//   · ENTRADA: un "din-din" corto cuando alguien entra con el llavero y está todo bien. Es la
//     confirmación que el socio espera del lector.
//   · DESCONOCIDO: dos pitidos cuando pasan un llavero que no es de nadie. También baja la música:
//     hay que acercarse a asignarlo.
//
// SOLO EN EL ESCRITORIO. El portal web es del dueño, que lo mira desde su casa o su celular:
// que le suene una alarma ahí no avisa a nadie en el mostrador.
//
// Se sintetizan en vez de ser archivos: suenan en el acto, no pesan nada y no dependen de que un
// .mp3 se haya descargado.
//
// ⚠️ POR QUÉ SE REHIZO (02/11/2026). El dueño de un gimnasio: «no está bajando la música ni está
// sonando, lo hace muy rara vez». Había tres causas, y estaban las tres:
//   1. La X era un zumbido de 150-200 Hz al 35%: los parlantes chicos de una PC casi no
//      reproducen esos graves, y con la música del gimnasio no se oía. Ahora es una chicharra en
//      los medios (donde el oído es más sensible y cualquier parlante suena) y más fuerte.
//   2. Sonaba a los 120 ms de pedir que baje la música, bajara o no. Ahora espera a que el
//      ayudante CONTESTE que bajó (como mucho medio segundo: el aviso importa más que la música).
//   3. El mismo socio no volvía a sonar por 90 segundos, para que una entrada por QR que llega
//      dos veces no sonara doble. Eso tapaba de más: el socio que vuelve a entrar, o cualquier
//      prueba en el mostrador. Ahora lo que hace una persona (el Enter, el llavero) suena SIEMPRE,
//      y lo que llega solo (QR, molinete facial) tiene una ventana de 20 s.
// ============================================

import CONFIG from './config';

/** Dos avisos de vencido en menos de esto suenan una sola vez: no una ametralladora de X. */
const PAUSA_MINIMA_MS = 1500;

/**
 * Lo que llega SOLO (una entrada por QR, un rechazo del molinete facial) puede aparecer más de
 * una vez con los refrescos de la puerta, que son cada 2 a 15 segundos. Dentro de este rato, el
 * mismo socio por ese camino suena una sola vez.
 */
const MISMO_SOCIO_MS = 20_000;
const ultimaPorSocio = new Map();

/** Cuánto se espera, como mucho, a que la música baje antes de sonar igual. */
const ESPERA_A_LA_MUSICA_MS = 500;

/** El volumen de los avisos es de cada PC (cada mostrador tiene sus parlantes). */
const CLAVE_VOLUMEN = 'avisos_volumen';
const VOLUMEN_POR_DEFECTO = 0.8;

/**
 * Los avisos. Cada nota: cuándo empieza y cuánto dura (segundos), la frecuencia (y a dónde baja,
 * si baja) y la forma de onda. La chicharra suma dos sierras desafinadas: sus armónicos caen
 * entre 500 y 3.000 Hz, que es donde se oye por encima de la música en cualquier parlante.
 */
export const SONIDOS = {
  vencido: {
    bajarMusica: true,
    duracionMs: 650,
    volumen: 0.9,
    filtroHz: 3500,
    notas: [
      { desde: 0, dura: 0.24, hz: 233, forma: 'sawtooth' },
      { desde: 0, dura: 0.24, hz: 311, forma: 'sawtooth' },
      { desde: 0.32, dura: 0.26, hz: 233, hastaHz: 207, forma: 'sawtooth' },
      { desde: 0.32, dura: 0.26, hz: 311, hastaHz: 277, forma: 'sawtooth' },
    ],
  },
  entrada: {
    bajarMusica: false,
    duracionMs: 260,
    volumen: 0.55,
    filtroHz: 8000,
    notas: [
      { desde: 0, dura: 0.1, hz: 880, forma: 'triangle' },
      { desde: 0.11, dura: 0.15, hz: 1319, forma: 'triangle' },
    ],
  },
  desconocido: {
    bajarMusica: true,
    duracionMs: 450,
    volumen: 0.7,
    filtroHz: 4000,
    notas: [
      { desde: 0, dura: 0.15, hz: 660, forma: 'square' },
      { desde: 0.25, dura: 0.15, hz: 660, forma: 'square' },
    ],
  },
};

let ultimaVez = -Infinity;
let contexto = null;

/** El volumen de los avisos en esta PC, de 0,2 a 1. */
export function volumenDeAvisos() {
  try {
    const guardado = Number(localStorage.getItem(CLAVE_VOLUMEN));
    if (Number.isFinite(guardado) && guardado >= 0.2 && guardado <= 1) return guardado;
  } catch { /* sin almacenamiento: el de siempre */ }
  return VOLUMEN_POR_DEFECTO;
}

export function fijarVolumenDeAvisos(valor) {
  const v = Math.min(1, Math.max(0.2, Number(valor) || VOLUMEN_POR_DEFECTO));
  try { localStorage.setItem(CLAVE_VOLUMEN, String(v)); } catch { /* se pierde al cerrar */ }
  return v;
}

/**
 * Deja el audio listo ANTES del primer aviso (lo llama Accesos al abrir): crear y despertar el
 * motor de audio en el momento del primer vencido le agregaba demora justo a ese.
 */
export function prepararSonido() {
  if (!CONFIG.IS_DESKTOP) return;
  motorDeAudio();
}

/**
 * Suena la X del socio vencido (y baja la música un momento).
 *
 * @param {string|null} quien el socio (o la entrada)
 * @param {number} ahora
 * @param {{ directo?: boolean }} opciones directo: lo hizo una persona en el mostrador (el Enter,
 *        el llavero). Suena siempre; la ventana por socio es solo para lo que llega solo.
 * @returns {boolean} true si va a sonar; false si no correspondía (web, o sonó hace un instante)
 */
export function sonarVencido(quien = null, ahora = Date.now(), { directo = false } = {}) {
  if (!CONFIG.IS_DESKTOP) return false;
  if (ahora - ultimaVez < PAUSA_MINIMA_MS) return false;
  if (quien != null && !directo) {
    const antes = ultimaPorSocio.get(quien);
    if (antes != null && ahora - antes < MISMO_SOCIO_MS) return false;
  }
  if (quien != null) {
    ultimaPorSocio.set(quien, ahora);
    // Que la memoria no crezca todo el día: se olvida lo que ya no puede repetirse.
    for (const [k, t] of ultimaPorSocio) if (ahora - t >= MISMO_SOCIO_MS) ultimaPorSocio.delete(k);
  }
  ultimaVez = ahora;
  sonar('vencido');
  return true;
}

/**
 * La X de algo que hizo una persona en el mostrador (el Enter con el DNI, el llavero): suena
 * SIEMPRE, aunque sea el mismo socio de hace un rato. Solo la frena la pausa de 1,5 s.
 */
export function sonarVencidoDirecto(quien) {
  return sonarVencido(quien, Date.now(), { directo: true });
}

/** El "din-din" de una entrada con llavero que está todo bien. */
export function sonarEntrada() {
  if (!CONFIG.IS_DESKTOP) return false;
  sonar('entrada');
  return true;
}

/** Los dos pitidos de un llavero que no es de nadie. */
export function sonarLlaveroDesconocido() {
  if (!CONFIG.IS_DESKTOP) return false;
  sonar('desconocido');
  return true;
}

/**
 * Para el botón «Probar» de Ajustes: suena sin las ventanas de arriba y dice qué pasó con la
 * música, que es lo que no se puede ver.
 *
 * @returns {Promise<number|null>} cuántos programas bajó (0 = ninguno sonando en esta PC; -1 =
 *          no se pudo), o null si ese aviso no baja la música
 */
export function probarSonido(nombre) {
  return sonar(nombre);
}

/**
 * Lo que significa la respuesta de «bajar la música», dicho para quien está en el mostrador.
 * @param {number|null} cuantos lo que devolvió {@link probarSonido}
 * @returns {{ok: boolean, texto: string}|null}
 */
export function queHizoLaMusica(cuantos) {
  if (cuantos == null) return null;
  if (cuantos > 0) {
    return { ok: true, texto: cuantos === 1 ? 'Bajó la música de 1 programa y volvió sola.' : `Bajó la música de ${cuantos} programas y volvió sola.` };
  }
  if (cuantos === 0) {
    return {
      ok: false,
      texto: 'No encontré música sonando en esta computadora. Si la música sale de otro aparato '
        + '(un celular, un parlante bluetooth, otra PC), Veltronik no la puede bajar: subí el volumen de los avisos.',
    };
  }
  return { ok: false, texto: 'No se pudo bajar la música en esta computadora. El aviso suena igual, sin bajarla.' };
}

/** Baja la música si el aviso lo pide, y suena. */
function sonar(nombre) {
  const sonido = SONIDOS[nombre];
  if (!sonido) return Promise.resolve(null);
  if (!sonido.bajarMusica) {
    tocar(sonido);
    return Promise.resolve(null);
  }
  return bajarMusica(sonido.duracionMs + 300).then((cuantos) => {
    tocar(sonido);
    return cuantos;
  });
}

/**
 * Le pide al escritorio que baje la música de los otros programas y espera a que conteste,
 * como mucho {@link ESPERA_A_LA_MUSICA_MS}. Si no hay puente (una versión vieja) o falla, -1.
 */
function bajarMusica(ms) {
  let pedido = null;
  try {
    pedido = window.electronAPI?.audio?.bajarMusica?.(ms) ?? null;
  } catch {
    pedido = null;
  }
  if (!pedido || typeof pedido.then !== 'function') return Promise.resolve(-1);
  const respuesta = pedido
    .then((cuantos) => (typeof cuantos === 'number' ? cuantos : -1))
    .catch(() => -1);
  const plazo = new Promise((resolver) => { setTimeout(() => resolver(-1), ESPERA_A_LA_MUSICA_MS); });
  return Promise.race([respuesta, plazo]);
}

/** El motor de audio: uno solo, y despierto. Si se cerró (cambió la salida de audio), uno nuevo. */
function motorDeAudio() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    if (!contexto || contexto.state === 'closed') contexto = new Ctx();
    if (contexto.state !== 'running') contexto.resume?.()?.catch?.(() => {});
    return contexto;
  } catch {
    return null;
  }
}

/** Toca las notas, con el volumen redondeado al principio y al final para que no "clickee". */
function tocar(sonido) {
  try {
    const ctx = motorDeAudio();
    if (!ctx) return;
    const t0 = ctx.currentTime + 0.02;

    const salida = ctx.createGain();
    salida.gain.value = volumenDeAvisos() * sonido.volumen;
    const filtro = ctx.createBiquadFilter();
    filtro.type = 'lowpass';
    filtro.frequency.value = sonido.filtroHz;
    filtro.connect(salida);
    salida.connect(ctx.destination);

    for (const nota of sonido.notas) {
      const inicio = t0 + nota.desde;
      const fin = inicio + nota.dura;
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = nota.forma;
      osc.frequency.setValueAtTime(nota.hz, inicio);
      if (nota.hastaHz) osc.frequency.linearRampToValueAtTime(nota.hastaHz, fin);
      env.gain.setValueAtTime(0.0001, inicio);
      env.gain.exponentialRampToValueAtTime(0.5, inicio + 0.012);
      env.gain.setValueAtTime(0.5, fin - 0.03);
      env.gain.exponentialRampToValueAtTime(0.0001, fin);
      osc.connect(env);
      env.connect(filtro);
      osc.start(inicio);
      osc.stop(fin + 0.02);
    }
  } catch {
    // Sin audio (una PC sin placa de sonido): el cartel avisa igual.
  }
}

/** Solo para los tests: que cada uno arranque sin el "sonó hace un instante" ni el audio del anterior. */
export function _reiniciarParaTests() {
  ultimaVez = -Infinity;
  contexto = null;
  ultimaPorSocio.clear();
}
