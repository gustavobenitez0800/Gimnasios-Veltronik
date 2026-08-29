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

import { useState, useEffect } from 'react';
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

export default function CheckinPage() {
  const { token } = useParams();
  const [documento, setDocumento] = useState('');
  const [recordado, setRecordado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [ultima, setUltima] = useState(null);

  useEffect(() => {
    try {
      const guardado = localStorage.getItem(memoriaKey(token));
      if (guardado) { setDocumento(guardado); setRecordado(true); }
      setUltima(localStorage.getItem(ultimaKey(token)));
    } catch { /* navegación privada: pide el documento como la primera vez */ }
  }, [token]);

  // Si la última vez entró, lo próximo que va a hacer es salir.
  const vaASalir = ultima === 'ENTRADA';

  const marcar = async (e) => {
    e?.preventDefault();
    const doc = documento.trim();
    if (!doc || enviando) return;

    setEnviando(true);
    setResultado(null);
    try {
      const { data } = await apiClient.post('/public/checkin', {
        token, documento: doc, scannerId: idDeEsteTelefono(),
      });
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
    } catch {
      setResultado({
        ok: false,
        titulo: 'No pudimos conectarnos',
        detalle: 'Fijate que tengas señal y probá de nuevo. Si no, pedile al mostrador que te marque la entrada.',
      });
    } finally {
      setEnviando(false);
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
                {enviando ? 'Un segundo…'
                  : !recordado ? 'Entrar'
                  : vaASalir ? 'Marcar salida'
                  : 'Marcar entrada'}
              </button>
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
