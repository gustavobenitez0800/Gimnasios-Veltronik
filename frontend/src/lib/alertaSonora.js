// ============================================
// VELTRONIK - LA "X" DEL SOCIO VENCIDO
// ============================================
// Cuando entra un socio con la cuota vencida —a mano, por QR o frenado por el molinete— el
// escritorio suena una "X" corta. Pedido del dueño: muchos gimnasios tienen el mostrador en la
// misma PC que pasa la música, así que primero se baja un poco la música (lo hace el proceso
// principal, ver electron/atenuador.cjs), suena la X y la música vuelve sola.
//
// SOLO EN EL ESCRITORIO. El portal web es del dueño, que lo mira desde su casa o su celular:
// que le suene una alarma ahí no avisa a nadie en el mostrador.
//
// La X se sintetiza (dos zumbidos graves, como el "error" de un concurso) en vez de ser un
// archivo: suena en el acto, no pesa nada y no depende de que un .mp3 se haya descargado.
// ============================================

import CONFIG from './config';

/** Dos avisos seguidos en menos de esto suenan una sola vez: en la puerta entra uno atrás del otro. */
const PAUSA_MINIMA_MS = 1500;
/** Cuánto queda baja la música: lo que dura la X, con margen para que no se pise. */
const MUSICA_BAJA_MS = 900;
/** Cuánto se espera a que la música baje antes de sonar (el ayudante baja en ~100 ms). */
const ESPERA_A_LA_MUSICA_MS = 120;

let ultimaVez = -Infinity;
let contexto = null;

/**
 * Suena la X del socio vencido (y baja la música un momento).
 *
 * @returns {boolean} true si sonó; false si no correspondía (web, o sonó hace un instante)
 */
export function sonarVencido(ahora = Date.now()) {
  if (!CONFIG.IS_DESKTOP) return false;
  if (ahora - ultimaVez < PAUSA_MINIMA_MS) return false;
  ultimaVez = ahora;

  // Si el ayudante no está (no es Windows, lo frenó un antivirus, todavía está arrancando) la
  // X suena igual: el aviso importa más que la música.
  try {
    window.electronAPI?.audio?.bajarMusica?.(MUSICA_BAJA_MS)?.catch?.(() => {});
  } catch { /* sin puente: suena igual */ }

  setTimeout(tocarX, ESPERA_A_LA_MUSICA_MS);
  return true;
}

/** La X: dos zumbidos cortos y graves que bajan un poco, con el volumen redondeado para que no "clickee". */
function tocarX() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    contexto = contexto || new Ctx();
    if (contexto.state === 'suspended') contexto.resume().catch(() => {});

    const t = contexto.currentTime + 0.01;
    const salida = contexto.createGain();
    salida.gain.value = 0.35;
    // Un filtro para que el zumbido cuadrado no raspe: se oye fuerte sin ser desagradable.
    const filtro = contexto.createBiquadFilter();
    filtro.type = 'lowpass';
    filtro.frequency.value = 1400;
    filtro.connect(salida);
    salida.connect(contexto.destination);

    [0, 0.2].forEach((desde) => {
      const osc = contexto.createOscillator();
      const env = contexto.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(200, t + desde);
      osc.frequency.linearRampToValueAtTime(150, t + desde + 0.16);
      env.gain.setValueAtTime(0.0001, t + desde);
      env.gain.exponentialRampToValueAtTime(1, t + desde + 0.012);
      env.gain.setValueAtTime(1, t + desde + 0.13);
      env.gain.exponentialRampToValueAtTime(0.0001, t + desde + 0.17);
      osc.connect(env);
      env.connect(filtro);
      osc.start(t + desde);
      osc.stop(t + desde + 0.18);
    });
  } catch {
    // Sin audio (una PC sin placa de sonido): el cartel rojo avisa igual.
  }
}

/** Solo para los tests: que cada uno arranque sin el "sonó hace un instante" ni el audio del anterior. */
export function _reiniciarParaTests() {
  ultimaVez = -Infinity;
  contexto = null;
}
