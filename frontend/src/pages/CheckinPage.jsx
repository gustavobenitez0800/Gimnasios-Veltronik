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

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import apiClient from '../lib/apiClient';

// Dónde el teléfono se acuerda del documento. Por token de gimnasio, no global: alguien que
// entrena en dos sucursales tiene una ficha en cada una y podría tener documentos cargados
// distinto (con puntos, sin puntos). Una clave por lugar evita que un lugar rompa el otro.
const memoriaKey = (token) => `veltronik_checkin_doc_${token}`;

// Lo último que hizo este socio en este lugar: 'ENTRADA' o 'SALIDA'. Sirve SOLO para escribir
// bien el botón antes de tocarlo — "Marcar salida" cuando se está yendo, en vez de invitarlo
// siempre a entrar.
//
// NO es el estado real: la verdad de si está adentro la tiene el servidor, que puede haber
// cerrado su visita de anoche o registrado una marca desde otro teléfono. Si el celular está
// desactualizado, la pantalla del resultado lo corrige. El teléfono elige la etiqueta; el
// backend decide el hecho.
const ultimaKey = (token) => `veltronik_checkin_ultima_${token}`;

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
  const [ultima, setUltima] = useState(null);
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
      setUltima(localStorage.getItem(ultimaKey(token)));
    } catch { /* navegación privada: pide el documento como la primera vez */ }
  }, [token]);

  // Si la última vez entró, lo próximo que va a hacer es salir.
  const vaASalir = ultima === 'ENTRADA';

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
  const enviarInsistiendo = async (doc) => {
    const hasta = Date.now() + INSISTIR_MS;
    let espera = 2000;

    for (;;) {
      try {
        const { data } = await apiClient.post('/public/checkin', {
          token, documento: doc, scannerId: idDeEsteTelefono(),
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
    try {
      const data = await enviarInsistiendo(doc);
      setResultado(data);

      if (data.ok) {
        // Solo recordamos el documento cuando SIRVIÓ. Guardar uno que no existe dejaría al
        // socio pegado a un número equivocado, fallando todos los días sin entender por qué.
        try {
          localStorage.setItem(memoriaKey(token), doc);
          // La dirección la dice el SERVIDOR, no lo que el teléfono suponía. Así, si el celular
          // estaba desactualizado, la próxima etiqueta ya sale bien sin que nadie haga nada.
          if (data.direccion === 'ENTRADA' || data.direccion === 'SALIDA') {
            localStorage.setItem(ultimaKey(token), data.direccion);
            setUltima(data.direccion);
          }
          setRecordado(true);
        } catch { /* sin memoria */ }
        if (data.sonar) { bip(true); vibrar([120, 80, 120]); } else { bip(false); vibrar(60); }
      }
    } catch (err) {
      // Si el servidor llegó a contestar, mostramos SU mensaje: sabe más que nosotros.
      // (Es el caso del freno por demasiados intentos, que devuelve 429 con su explicación.)
      const delServidor = err?.response?.data;
      setResultado(delServidor?.titulo ? delServidor : {
        ok: false,
        titulo: 'Seguimos sin conexión',
        detalle: 'Estuvimos intentando un rato y no hubo caso. Pedile al mostrador que te '
               + 'marque la entrada — la va a poder cargar a mano.',
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
      // También la dirección: la del socio anterior no dice nada del nuevo.
      localStorage.removeItem(ultimaKey(token));
    } catch { /* nada */ }
    setDocumento(''); setRecordado(false); setResultado(null); setUltima(null);
  };

  const entrada = resultado?.direccion === 'ENTRADA';
  const alerta = resultado?.ok && resultado?.sonar;

  return (
    <div className="checkin-page">
      <div className="checkin-card">

        {!resultado && (
          <>
            <div className="checkin-brand">Veltronik</div>
            <h1 className="checkin-title">
              {!recordado ? 'Bienvenido' : vaASalir ? 'Marcá tu salida' : 'Marcá tu entrada'}
            </h1>
            <p className="checkin-sub">
              {recordado
                ? 'Tocá el botón y listo.'
                : 'Escribí tu documento una sola vez. Después este teléfono ya te va a reconocer.'}
            </p>

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

              <button className="checkin-btn" type="submit" disabled={enviando || !documento.trim()}>
                {reintentando ? 'Buscando señal…'
                  : enviando ? 'Un segundo…'
                  : !recordado ? 'Entrar'
                  : vaASalir ? 'Marcar salida'
                  : 'Marcar entrada'}
              </button>

              {/* Mientras insiste, el socio tiene que saber DOS cosas: que el sistema no se
                  colgó, y que puede irse al mostrador sin esperar a que esto termine. */}
              {reintentando && (
                <p className="checkin-espera" role="status">
                  Sin señal. Seguimos intentando — si tenés apuro, pedile al mostrador que te
                  marque la entrada.
                </p>
              )}
            </form>

            {recordado && (
              <button className="checkin-link" type="button" onClick={olvidar}>
                No soy yo — usar otro documento
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

            <button className="checkin-btn checkin-btn-ghost" type="button" onClick={() => setResultado(null)}>
              Listo
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
