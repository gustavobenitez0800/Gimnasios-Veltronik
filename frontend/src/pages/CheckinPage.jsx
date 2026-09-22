// ============================================
// VELTRONIK - CHECK-IN DEL SOCIO (público, celular)
// ============================================
// Lo que se abre cuando el socio escanea el QR pegado en la puerta del gimnasio.
//
// NO REQUIERE CUENTA NI LOGIN. Los socios no son usuarios de Veltronik: son clientes del
// gimnasio. Pedirles que se registren para marcar la entrada sería pedirles más trabajo que
// el que ahorra la función.
//
// La identidad se resuelve UNA sola vez: la primera vez el socio escribe su documento y el
// teléfono se lo acuerda. De ahí en adelante es abrir y tocar un botón.

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import apiClient from '../lib/apiClient';

// Dónde el teléfono se acuerda del documento. Por token de gimnasio, no global: alguien que
// entrena en dos sucursales tiene una ficha en cada una y podría tener documentos cargados
// distinto (con puntos, sin puntos). Una clave por lugar evita que un lugar rompa el otro.
const memoriaKey = (token) => `veltronik_checkin_doc_${token}`;


// Identificador anónimo de ESTE teléfono. Un número al azar que el propio aparato se genera:
// no sale de ningún dato del dispositivo ni de la persona, y si se borran los datos del
// navegador, cambia y no pasa nada.
//
// Existe para una sola pregunta del lado del gimnasio: "¿este mismo teléfono viene marcando a
// nombre de personas distintas?". Como el DNI alcanza para marcar y un DNI no es secreto, es
// el único rastro que permite ver un patrón raro sin pedirle nada más al socio.
const SCANNER_KEY = 'veltronik_checkin_scanner';

function idDeEsteTelefono() {
  try {
    let id = localStorage.getItem(SCANNER_KEY);
    if (!id) {
      id = (crypto.randomUUID ? crypto.randomUUID() : null);
      if (id) localStorage.setItem(SCANNER_KEY, id);
    }
    return id;
  } catch {
    // Navegación privada o almacenamiento bloqueado: se marca igual, sin rastro. La función
    // principal nunca depende de esto.
    return null;
  }
}

/**
 * Un bip corto, generado por el navegador.
 *
 * Sin archivo de audio a propósito: un .mp3 hay que servirlo, cachearlo y esperarlo, y este
 * sonido tiene que salir en el momento o no sirve. Con el oscilador suena al instante y pesa
 * cero.
 *
 * Suena en el teléfono DEL SOCIO, que es la gran ventaja de que el QR esté en la pared: el
 * aviso de que debe la cuota es privado. Un parlante en el gimnasio le contaría a toda la sala
 * que esa persona está atrasada, y un socio humillado en la puerta no vuelve.
 */
function bip(grave = false) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.value = grave ? 320 : 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.28, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + (grave ? 0.55 : 0.22));
    osc.start();
    osc.stop(ctx.currentTime + (grave ? 0.6 : 0.25));
    setTimeout(() => ctx.close?.(), 900);
  } catch { /* si el navegador no deja, la pantalla ya dice todo */ }
}

/** Vibración, para el que tiene el teléfono en silencio (que en un gimnasio son casi todos). */
function vibrar(patron) {
  try { navigator.vibrate?.(patron); } catch { /* no todos los navegadores */ }
}

/** "2026-09-22T18:05:00" → "18:05". Del texto del servidor: sin pasar por el huso del teléfono. */
function horaDe(iso) {
  const m = /T(\d{2}):(\d{2})/.exec(String(iso || ''));
  return m ? `${m[1]}:${m[2]}` : null;
}

/**
 * Lo que el socio quiere hacer según lo que el teléfono sabe. Viaja con la marca: el servidor
 * ya no decide solo por el estado (era un interruptor, y con el estado viejo el teléfono
 * terminaba abriendo una entrada al que ya se había ido). Sin saber, no se manda nada y
 * decide el servidor.
 */
function queQuiere(adentro) {
  if (adentro === true) return 'SALIDA';
  if (adentro === false) return 'ENTRADA';
  return undefined;
}

/** Los resultados que NO cambiaron nada: el estado ya era el que el socio quería. */
const SIN_CAMBIOS = new Set(['YA_ADENTRO', 'YA_AFUERA', 'MUY_PRONTO', 'REBOTE']);

// Cuánto insiste la pantalla antes de mandar al socio al mostrador.
//
// La mayoría de los cortes en la puerta de un gimnasio duran segundos: el socio viene de la
// calle y el wifi todavía no enganchó. Si la pantalla espera sola un rato con él ahí parado,
// buena parte se resuelve sin que nadie haga nada. Pasado ese rato ya no es un parpadeo:
// es un corte de verdad, y hacerlo esperar más sería perder su tiempo.
// Bajado de 90 a 30 segundos. Noventa era el número para "el socio viene de la calle y el
// wifi todavía no enganchó", pero mirado desde la puerta del gimnasio es una eternidad: la
// persona está parada con el teléfono en la mano y a los veinte segundos ya asume que se
// trabó. Treinta alcanza para un enganche de wifi y falla a la vista en vez de colgarse.
const INSISTIR_MS = 30_000;

/**
 * Espera {@code ms}, o menos si vuelve la conexión antes.
 *
 * El evento `online` es lo que hace que esto se sienta instantáneo: el socio cruza la puerta,
 * el teléfono engancha el wifi del gimnasio, y la marca sale en ese mismo momento en vez de
 * esperar a que termine el próximo intervalo.
 */
function esperarOConexion(ms) {
  return new Promise((resolve) => {
    let listo = false;
    const terminar = () => {
      if (listo) return;
      listo = true;
      clearTimeout(t);
      window.removeEventListener('online', terminar);
      resolve();
    };
    const t = setTimeout(terminar, ms);
    window.addEventListener('online', terminar);
  });
}

export default function CheckinPage() {
  const { token } = useParams();
  const [documento, setDocumento] = useState('');
  const [recordado, setRecordado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState(null);
  // El estado NO se guarda en el teléfono: se le pregunta al servidor.
  //
  // Antes se guardaba acá la última dirección, y eso era una copia de un dato ajeno. Si el
  // mostrador marcaba la salida, o el cierre nocturno cerraba la visita, el teléfono seguía
  // creyendo lo suyo: ofrecía "Marcar salida", el servidor no encontraba visita abierta y
  // abría una ENTRADA — el socio quedaba adentro del gimnasio después de haberse ido.
  //
  // null = todavía no sabemos. Y no saber se muestra como "Marcar", nunca como una adivinanza.
  const [adentro, setAdentro] = useState(null);
  // Desde qué hora está adentro, como la dice el servidor.
  const [desde, setDesde] = useState(null);
  // ⭐ LA SALIDA SE HABILITA A LOS 20 MINUTOS. Pedido del dueño: socios que por curiosos tocaban
  // "Marcá tu salida" al rato de entrar y quedaban afuera estando adentro. Antes de eso el botón
  // no está; el servidor igual lo frena si llegara (MUY_PRONTO). Se cuenta con el reloj de este
  // teléfono a partir de los SEGUNDOS que dice el servidor: la hora del celular puede estar mal.
  const [puedeSalir, setPuedeSalir] = useState(false);
  const [minutosParaSalir, setMinutosParaSalir] = useState(0);
  const [confirmandoSalida, setConfirmandoSalida] = useState(false);
  const temporizadorSalida = useRef(null);
  const [reintentando, setReintentando] = useState(false);
  // Si el socio se va de la pantalla, dejamos de insistir: no tiene sentido seguir mandando
  // la marca de alguien que ya no está mirando.
  //
  // OJO con el `false` de la entrada: sin eso, la bandera queda en `true` del desmontaje
  // anterior y la pantalla nace CANCELADA — deja de reintentar al instante y le dice al socio
  // que no hay conexión a los cuatro segundos. Pasa siempre en desarrollo (React monta,
  // desmonta y vuelve a montar) y en producción cada vez que el componente se remonta.
  const cancelado = useRef(false);
  useEffect(() => {
    cancelado.current = false;
    return () => { cancelado.current = true; };
  }, []);

  useEffect(() => {
    try {
      const guardado = localStorage.getItem(memoriaKey(token));
      if (guardado) { setDocumento(guardado); setRecordado(true); }
    } catch { /* navegación privada: pide el documento como la primera vez */ }
  }, [token]);

  // Se le pregunta al servidor si el socio está adentro, para escribir bien el botón.
  //
  // Mientras no llegue la respuesta —o si no llega nunca— el botón dice "Marcar" a secas.
  // Una etiqueta neutra siempre es cierta; una adivinada puede no serlo, y una etiqueta que
  // miente es la que hace que la persona escanee de nuevo creyendo que se trabó.
  //
  // No revela nada: el servidor contesta lo mismo para un documento que no existe que para
  // un socio que está afuera.
  const aplicarEstado = useCallback((data) => {
    const esta = !!data?.adentro;
    setAdentro(esta);
    setDesde(esta ? horaDe(data?.desde) : null);
    if (!esta) setConfirmandoSalida(false);

    clearTimeout(temporizadorSalida.current);
    const falta = esta ? Math.max(0, Number(data?.faltaParaSalir) || 0) : 0;
    setPuedeSalir(esta && falta === 0);
    setMinutosParaSalir(Math.ceil(falta / 60));
    if (esta && falta > 0) {
      temporizadorSalida.current = setTimeout(() => setPuedeSalir(true), falta * 1000 + 500);
    }
  }, []);

  useEffect(() => () => clearTimeout(temporizadorSalida.current), []);

  const preguntarEstado = useCallback(async () => {
    if (!recordado || !documento) return;
    try {
      const { data } = await apiClient.post('/public/checkin/estado', { token, documento }, { timeout: 8000 });
      if (!cancelado.current) aplicarEstado(data);
    } catch { /* sin respuesta = queda lo último que se supo, y el servidor igual no se equivoca */ }
  }, [token, documento, recordado, aplicarEstado]);

  useEffect(() => { preguntarEstado(); }, [preguntarEstado]);

  // ⭐ Y SE VUELVE A PREGUNTAR CUANDO EL SOCIO VUELVE A MIRAR EL TELÉFONO.
  //
  // El caso del dueño: entró por QR, el mostrador le marcó la salida, y horas después abre el
  // teléfono. La pantalla quedó como estaba ("Marcá tu salida"). Al desbloquear, o al volver a
  // esta pestaña, se pregunta de nuevo y el botón dice la verdad.
  //
  // ⚠️ SIN PREGUNTAR CADA TANTO, Y ES A PROPÓSITO. El freno anti-tanteo del servidor cuenta
  // todos los pedidos de un cartel —el del gimnasio entero— y corta a los 40 por minuto: diez
  // teléfonos preguntando cada quince segundos dejarían la puerta frenada para todos.
  useEffect(() => {
    const alVolver = () => { if (document.visibilityState === 'visible') preguntarEstado(); };
    document.addEventListener('visibilitychange', alVolver);
    window.addEventListener('focus', alVolver);
    return () => {
      document.removeEventListener('visibilitychange', alVolver);
      window.removeEventListener('focus', alVolver);
    };
  }, [preguntarEstado]);

  // Si está adentro, lo próximo que va a hacer es salir.
  const vaASalir = adentro === true;

  // Guarda la pantalla para que abra sin señal. Se registra SOLO acá, así que el service
  // worker se instala únicamente en los teléfonos de los socios que escanean el cartel —
  // nunca en el navegador del dueño usando el portal, salvo que él mismo entre a probar.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    // Falla en silencio a propósito: sin service worker el check-in funciona igual mientras
    // haya señal, que es el caso normal. Es una red de seguridad, no un requisito.
    navigator.serviceWorker.register('./checkin-sw.js').catch(() => {});
  }, []);

  /**
   * Manda la marca, insistiendo mientras el problema sea de conexión.
   *
   * <p>Distingue dos fracasos que parecen el mismo: si el SERVIDOR contestó —aunque sea un
   * error— no se reintenta, porque la respuesta ya es definitiva (documento que no existe,
   * demasiados intentos). Reintentar ahí sería martillar al backend para recibir el mismo
   * "no" veinte veces. Solo se insiste cuando la petición ni siquiera llegó.</p>
   */
  const enviarInsistiendo = async (doc, quiere) => {
    const hasta = Date.now() + INSISTIR_MS;
    let espera = 2000;

    for (;;) {
      try {
        const { data } = await apiClient.post('/public/checkin', {
          token, documento: doc, scannerId: idDeEsteTelefono(), quiere,
        });
        return data;
      } catch (err) {
        // El servidor contestó: es una respuesta, no un corte. No se reintenta.
        if (err?.response) throw err;
        if (Date.now() >= hasta || cancelado.current) throw err;

        setReintentando(true);
        await esperarOConexion(espera);
        // Cada vez un poco más de aire, con techo: sirve para el corte que dura un rato, sin
        // quedarse dormido si la conexión vuelve justo después.
        espera = Math.min(Math.round(espera * 1.6), 15000);
      }
    }
  };

  const marcar = async (e) => {
    e?.preventDefault();
    const doc = documento.trim();
    if (!doc || enviando) return;

    setEnviando(true);
    setReintentando(false);
    setResultado(null);
    setConfirmandoSalida(false);
    try {
      // Sin documento recordado todavía no sabemos nada: decide el servidor.
      const data = await enviarInsistiendo(doc, recordado ? queQuiere(adentro) : undefined);
      setResultado(data);

      if (data.ok) {
        // Solo recordamos el documento cuando SIRVIÓ. Guardar uno que no existe dejaría al
        // socio pegado a un número equivocado, fallando todos los días sin entender por qué.
        try {
          localStorage.setItem(memoriaKey(token), doc);
          // La dirección la dice el SERVIDOR, no lo que el teléfono suponía. Así, si el celular
          // estaba desactualizado, la próxima etiqueta ya sale bien sin que nadie haga nada.
          // El estado nuevo lo dice la respuesta, así que no hace falta volver a
          // preguntar: si registró una ENTRADA, ahora está adentro.
          if (data.direccion === 'ENTRADA' || data.direccion === 'YA_ADENTRO' || data.direccion === 'MUY_PRONTO') {
            setAdentro(true);
            setPuedeSalir(false);
          } else if (data.direccion === 'SALIDA' || data.direccion === 'YA_AFUERA') {
            setAdentro(false);
          }
          setRecordado(true);
        } catch { /* sin memoria */ }
        if (data.sonar) { bip(true); vibrar([120, 80, 120]); } else if (!SIN_CAMBIOS.has(data.direccion)) { bip(false); vibrar(60); }
      }
    } catch (err) {
      // Si el servidor llegó a contestar, mostramos SU mensaje: sabe más que nosotros.
      // (Es el caso del freno por demasiados intentos, que devuelve 429 con su explicación.)
      const delServidor = err?.response?.data;
      setResultado(delServidor?.titulo ? delServidor : {
        ok: false,
        titulo: 'Seguimos sin conexión',
        detalle: 'Estuvimos intentando un rato y no hubo caso. Pedile al mostrador que te '
               + 'marque la entrada. La va a poder cargar a mano.',
      });
    } finally {
      setEnviando(false);
      setReintentando(false);
    }
  };

  // Desvincula el teléfono de este documento.
  //
  // Hace falta de verdad: una pareja que comparte celular, o alguien que se equivocó de número
  // la primera vez y quedó pegado a él. Sacar el botón no cerraría ninguna puerta —basta abrir
  // el navegador en incógnito— y sí dejaría trabado al que lo necesita.
  //
  // Lo que SÍ cambia es que ahora queda rastro: el identificador del teléfono viaja en cada
  // marca, así que un aparato que anda cambiando de socio se ve del lado del gimnasio.
  const olvidar = () => {
    try {
      localStorage.removeItem(memoriaKey(token));
    } catch { /* nada */ }
    // El estado del socio anterior no dice nada del nuevo: se vuelve a 'no sabemos'.
    setDocumento(''); setRecordado(false); setResultado(null); setAdentro(null);
  };

  const entrada = resultado?.direccion === 'ENTRADA' || resultado?.direccion === 'YA_ADENTRO';
  // "Recién entraste": no es un error, pero tampoco pasó lo que el socio pidió.
  const alerta = resultado?.ok && (resultado?.sonar || resultado?.direccion === 'MUY_PRONTO');

  // Al cerrar el resultado se vuelve a preguntar: la hora de entrada y cuánto falta para poder
  // salir salen de ahí.
  const cerrarResultado = () => {
    setResultado(null);
    preguntarEstado();
  };

  return (
    <div className="checkin-page">
      <div className="checkin-card">

        {!resultado && (
          <>
            <div className="checkin-brand">Veltronik</div>
            <h1 className="checkin-title">
              {!recordado ? 'Bienvenido'
                : adentro === null ? 'Hola de nuevo'
                : vaASalir ? (confirmandoSalida ? '¿Ya te vas?' : 'Estás adentro')
                : 'Marcá tu entrada'}
            </h1>
            <p className="checkin-sub">
              {!recordado ? 'Escribí tu documento una sola vez. Después este teléfono ya te va a reconocer.'
                : vaASalir && confirmandoSalida ? 'Confirmá y queda marcada tu salida.'
                : vaASalir ? `${desde ? `Entraste a las ${desde}. ` : ''}¡Buen entrenamiento!`
                : 'Tocá el botón y listo.'}
            </p>
            {/* Antes de los 20 minutos no hay botón de salida: el que lo tocaba por curioso quedaba
                afuera estando adentro. Se dice cuándo va a estar. */}
            {vaASalir && !puedeSalir && (
              <p className="checkin-espera" role="status">
                Cuando te vayas, marcá tu salida acá.
                {minutosParaSalir > 0 && <> Se habilita en {minutosParaSalir} {minutosParaSalir === 1 ? 'minuto' : 'minutos'}.</>}
              </p>
            )}

            <form onSubmit={marcar} className="checkin-form">
              {!recordado && (
                <input
                  className="checkin-input"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="Tu DNI, sin puntos"
                  value={documento}
                  onChange={(e) => setDocumento(e.target.value)}
                  aria-label="Documento"
                  autoFocus
                />
              )}

              {/* ⭐ SALIR SON DOS TOQUES: "Marcar salida" y después "Sí, marcar salida". Uno solo lo
                  apretaba el curioso; dos, solo el que se va. Entrar sigue siendo uno. */}
              {vaASalir && !puedeSalir ? null : vaASalir && !confirmandoSalida ? (
                <button className="checkin-btn" type="button" disabled={enviando}
                  onClick={() => setConfirmandoSalida(true)}>
                  Marcar salida
                </button>
              ) : (
                <button className="checkin-btn" type="submit" disabled={enviando || !documento.trim()}>
                  {reintentando ? 'Buscando señal…'
                    : enviando ? 'Un segundo…'
                    : !recordado ? 'Entrar'
                    : adentro === null ? 'Marcar'
                    : vaASalir ? 'Sí, marcar salida'
                    : 'Marcar entrada'}
                </button>
              )}
              {vaASalir && confirmandoSalida && !enviando && (
                <button className="checkin-btn checkin-btn-ghost" type="button" onClick={() => setConfirmandoSalida(false)}>
                  No, sigo entrenando
                </button>
              )}

              {/* Mientras insiste, el socio tiene que saber DOS cosas: que el sistema no se
                  colgó, y que puede irse al mostrador sin esperar a que esto termine. */}
              {reintentando && (
                <p className="checkin-espera" role="status">
                  Sin señal. Seguimos intentando. Si tenés apuro, pedile al mostrador que te
                  marque la entrada.
                </p>
              )}
            </form>

            {recordado && (
              <button className="checkin-link" type="button" onClick={olvidar}>
                No soy yo, usar otro documento
              </button>
            )}
          </>
        )}

        {resultado && (
          <div className={`checkin-result ${resultado.ok ? (alerta ? 'is-warn' : 'is-ok') : 'is-bad'}`}>
            <div className="checkin-mark" aria-hidden="true">
              {resultado.ok ? (alerta ? '!' : (entrada ? '✓' : '←')) : '?'}
            </div>
            <h1 className="checkin-title">{resultado.titulo}</h1>
            <p className="checkin-sub">{resultado.detalle}</p>
            {resultado.gimnasio && <p className="checkin-gym">{resultado.gimnasio}</p>}

            <button className="checkin-btn checkin-btn-ghost" type="button" onClick={cerrarResultado}>
              Listo
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
