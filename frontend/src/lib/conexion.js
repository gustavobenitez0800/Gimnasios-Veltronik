// ============================================
// VELTRONIK - ¿HAY SERVIDOR DEL OTRO LADO?
// ============================================
// La única pieza que responde si vale la pena salir a la red. Los servicios que caen a la
// copia local, la puerta del terminal, el vaciado de la cola y las pantallas que se ponen al
// día le preguntan a esta, y a ninguna otra.
//
// POR QUÉ EXISTE (reportado por el dueño el 2026-09-30)
// "El modo offline es demasiado lento, tiene que funcionar a la velocidad del click." Todo el
// offline estaba montado sobre `navigator.onLine === false`, y eso solo se cumple cuando
// Windows no tiene NINGUNA placa de red levantada. En la práctica, casi nunca:
//
//   · el corte más común de un gimnasio es el router prendido con el proveedor caído: hay red
//     local, no hay internet, y `navigator.onLine` dice que sí;
//   · y en la PC del dueño apagar el Wi-Fi tampoco alcanza — queda alguna placa virtual
//     levantada. Se vio el 15/09: con el Wi-Fi apagado el pedido SALIÓ igual.
//
// Con `onLine` en true, cada pantalla salía a la red, esperaba que el pedido muriera (y su
// reintento), y recién ahí caía a la copia local. Varios segundos por clic, en CADA clic. Y al
// volver internet nadie se enteraba: el evento `online` tampoco llega si nunca hubo `offline`,
// así que las pantallas se quedaban con lo que habían sacado de la copia hasta salir y entrar.
//
// CÓMO DECIDE: por lo que pasó, no por lo que dice el sistema operativo
//   · un pedido muere en el transporte → se sondea el servidor, una vez y con plazo corto;
//   · el sondeo no contesta → SIN CONEXIÓN. Desde ese momento nada sale a la red: los pedidos
//     fallan en el acto y cada servicio va derecho a su copia local, sin esperar a nadie;
//   · mientras tanto se sondea cada pocos segundos. La primera respuesta —cualquiera: un 404
//     también es alguien del otro lado— lo da por vuelto y se avisa a quien escuche, que es lo
//     que pone al día a las pantallas y sube la cola;
//   · el `offline` del sistema operativo sí se cree: si Windows dice que no hay placa, no hay.
//
// ⚠️ SOLO VIGILA EL ESCRITORIO (lo arranca main.desktop.jsx). El portal web no promete andar sin
// internet, y en el celular del socio cortar los pedidos en el acto sería peor que esperarlos.
// Sin vigilancia, `sinConexion()` responde lo mismo que respondía antes: `navigator.onLine`.
// ============================================

import CONFIG from './config';

/**
 * Cuánto se espera al servidor en un sondeo. Un viaje sano tarda unos cientos de milisegundos;
 * tres segundos le dan margen a una conexión mala sin confundirla con una ausente.
 *
 * <p>⚠️ Es también lo MÁS que tarda el arranque sin internet en darse cuenta (y solo cuando el
 * router no contesta ni el nombre del servidor: con el Wi-Fi apagado el sondeo falla en el
 * acto). Achicarlo acelera eso, pero declara "sin conexión" a quien tiene internet lento.</p>
 */
export const PLAZO_SONDEO_MS = 3000;

/** Cada cuánto se vuelve a sondear mientras no hay conexión: lo que tarda en notar la vuelta. */
export const CADA_MS_SIN_CONEXION = 3000;

let vigilando = false;
let servidorCaido = false;
let sondeoEnVuelo = null;
let reloj = null;
/** Se aborta al declarar el corte: es lo que corta los pedidos que ya estaban en el aire. */
let corte = new AbortController();
const oyentes = new Set();

function sistemaSinRed() {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/**
 * ¿Hay que dar por hecho que no hay servidor? Es la pregunta que hacen los servicios antes de
 * salir a la red: si da true, ni se intenta y se va derecho a la copia local.
 */
export function sinConexion() {
  return sistemaSinRed() || servidorCaido;
}

/**
 * ¿Está declarado el corte? A diferencia de `sinConexion`, en la WEB da siempre false: es lo
 * que mira apiClient para frenar los pedidos, y ahí no se frena nada que antes saliera.
 */
export function cortado() {
  return vigilando && servidorCaido;
}

/** ¿Esta app vigila la conexión? (el escritorio sí, el portal web no). */
export function vigila() {
  return vigilando;
}

/**
 * Avisa cada vez que se pierde o vuelve el servidor. Devuelve la función para dejar de escuchar.
 * @param {(hayConexion: boolean) => void} fn
 */
export function alCambiarLaConexion(fn) {
  oyentes.add(fn);
  return () => oyentes.delete(fn);
}

/**
 * La señal que se aborta al declarar el corte. apiClient la cuelga de las lecturas, así una
 * que ya estaba en el aire no se queda esperando su plazo entero: se suelta en el acto y quien
 * la pidió cae a su copia.
 */
export function senalDelCorte() {
  return corte.signal;
}

/**
 * Se resuelve cuando se declara el corte (en el acto, si ya está declarado). En la web no se
 * resuelve nunca: sirve para hacerle carrera a algo que podría colgarse sin red.
 */
export function cuandoSeCorte() {
  const senal = corte.signal;
  if (cortado() || senal.aborted) return Promise.resolve();
  return new Promise((resolve) => senal.addEventListener('abort', () => resolve(), { once: true }));
}

/**
 * El error de un pedido que ni se intentó porque no hay conexión. Sin `response`, igual que
 * un corte de red: todo el código que ya sabe caer a la copia ante un corte lo trata igual.
 */
export function errorSinConexion(config) {
  const error = new Error('Sin conexión a internet. Esto se puede hacer cuando vuelva la conexión.');
  error.code = 'SIN_CONEXION';
  error.sinConexion = true;
  if (config) error.config = config;
  return error;
}

function fijar(caido) {
  if (!vigilando || caido === servidorCaido) return;
  servidorCaido = caido;

  if (caido) {
    console.warn('[conexion] el servidor no contesta: se trabaja con lo guardado en este equipo');
    corte.abort();
    if (!reloj) reloj = setInterval(() => { sondear(); }, CADA_MS_SIN_CONEXION);
  } else {
    console.warn('[conexion] volvió el servidor');
    corte = new AbortController();
    if (reloj) { clearInterval(reloj); reloj = null; }
  }

  for (const fn of [...oyentes]) {
    try { fn(!caido); } catch (e) { console.error('[conexion] un oyente falló:', e); }
  }
}

/**
 * A dónde se pregunta: la raíz de la API, la misma que sondea `diagnoseConnectivity`.
 *
 * <p>⚠️ NO `/actuator/health`, aunque suene al lugar obvio. Ese consulta la BASE (medido el
 * 30/09: 1,9 s la primera vez, contra 0,2 s de la raíz), y lo que se pregunta acá no es si el
 * servidor está sano sino si hay alguien del otro lado. Con la base lenta, el sondeo se pasaría
 * del plazo y declararía un corte que no existe: el mostrador dejaría de ver al servidor justo
 * cuando el servidor contesta. La raíz responde un 400 al instante, sin tocar la base.</p>
 */
function direccionDelSondeo() {
  return CONFIG.API_URL || null;
}

/**
 * Le pregunta al servidor si está. UNO a la vez: quien llegue con otro en vuelo espera ese.
 * @returns {Promise<boolean>} true si contestó
 */
export function sondear() {
  if (sondeoEnVuelo) return sondeoEnVuelo;

  sondeoEnVuelo = (async () => {
    let contesto;
    const url = direccionDelSondeo();
    if (sistemaSinRed()) {
      contesto = false;
    } else if (!url) {
      // Sin dirección no hay a quién preguntar, y declarar un corte por eso dejaría a la app
      // sin red para siempre. Mejor que cada pedido falle por su cuenta.
      contesto = true;
    } else {
      const ctl = new AbortController();
      const plazo = setTimeout(() => ctl.abort(), PLAZO_SONDEO_MS);
      try {
        // `no-cors`: no importa QUÉ contesta, solo QUE contesta. Un 401 o un 503 también
        // prueban que hay alguien del otro lado.
        await fetch(url, { method: 'GET', mode: 'no-cors', cache: 'no-store', signal: ctl.signal });
        contesto = true;
      } catch {
        contesto = false;
      } finally {
        clearTimeout(plazo);
      }
    }
    fijar(!contesto);
    return contesto;
  })().finally(() => { sondeoEnVuelo = null; });

  return sondeoEnVuelo;
}

/** Llegó una respuesta del servidor —cualquiera—: está. */
export function avisarQueContesto() {
  if (servidorCaido) fijar(false);
}

/**
 * Arranca la vigilancia. Una sola vez y solo en el escritorio (main.desktop.jsx).
 *
 * <p>Sondea en el acto, sin esperar al primer pedido: el arranque tiene que saber cuanto antes
 * si hay servidor, porque de eso depende si se abre con la copia local o se le pregunta a la
 * nube. Ver `AuthContext` y `DeviceGate`.</p>
 *
 * @returns con qué dejar de vigilar (los tests, y la recarga en caliente del desarrollo).
 */
export function vigilarLaConexion() {
  if (vigilando || typeof window === 'undefined') return () => {};
  vigilando = true;

  const alApagarse = () => fijar(true);
  // `online` solo dice que apareció una placa, no que haya internet: se pregunta, no se asume.
  const alPrenderse = () => { sondear(); };
  window.addEventListener('offline', alApagarse);
  window.addEventListener('online', alPrenderse);

  if (sistemaSinRed()) fijar(true);
  else sondear();

  return () => {
    window.removeEventListener('offline', alApagarse);
    window.removeEventListener('online', alPrenderse);
    if (reloj) { clearInterval(reloj); reloj = null; }
    vigilando = false;
    servidorCaido = false;
  };
}
