// ============================================
// VELTRONIK - CARD CHECKOUT (flujo de pago riguroso, UX por estados)
// ============================================
// El cliente carga la tarjeta y la ve dibujarse al lado mientras escribe (TarjetaEnVivo). El
// backend crea la suscripción pero NO activa: el acceso se otorga SOLO cuando el cobro entra.
// Este componente refleja el ESTADO REAL del backend, paso a paso (tipo Netflix):
//   validando tarjeta → procesando el cobro → confirmado / rechazado (con motivo).
//
// ⭐ CAMPOS SEGUROS, NO EL BRICK (2026-10-22). Hasta acá era el Card Payment Brick de Mercado
// Pago: una caja cerrada, con su diseño y su botón turquesa, que no deja saber nada de lo que
// se escribe. Para dibujar la tarjeta en vivo se arma el formulario con los "campos seguros"
// del mismo SDK: número, vencimiento y código siguen siendo iframes de Mercado Pago (la
// página no puede leerlos: Veltronik sigue sin tocar una tarjeta), y alrededor va nuestro
// diseño. Lo que viaja al backend es lo mismo que antes: el token, el email y el plan.

import { useContext, useEffect, useId, useRef, useState } from 'react';
import { loadMercadoPago } from '@mercadopago/sdk-js';
import CONFIG from '../lib/config';
import { subscriptionService } from '../services/SubscriptionService';
import { mpRejectionMessage } from '../lib/mpStatusDetail';
import { getMpPublicKey } from '../lib/paymentConfig';
import { formatCurrency } from '../lib/utils';
import { marcaDeLaTarjeta, mensajeDelCampo } from '../lib/tarjeta';
import { AuthContext } from '../contexts/AuthContext';
import TarjetaEnVivo from './cobro/TarjetaEnVivo';
import Icon from './Icon';

const POLL_INTERVAL_MS = 3000;
const POLL_MAX = 40; // ~2 min
const SDK_TIMEOUT_MS = 12000; // corte si el SDK de MP no carga (red/Electron) — evita el spinner eterno
const READY_TIMEOUT_MS = 25000; // corte si el formulario no queda listo: se ofrece reintentar o el link
// Cuánto queda a la vista la tarjeta "Pagado" antes de seguir: es el momento que cierra el
// cobro, y con menos no se alcanza a leer.
const PAUSA_EXITO_MS = 1800;

/** Promesa con timeout: si tarda más de `ms`, rechaza (en vez de colgarse para siempre). */
function withTimeout(promise, ms, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ]);
}

// Mensaje único cuando el formulario no puede cargar: siempre apunta al método alternativo
// (link de Mercado Pago), que está disponible en cada pantalla de pago.
const FALLBACK_HINT = 'No pudimos cargar el formulario de tarjeta. Usá el método de pago alternativo (link de Mercado Pago) que aparece debajo.';

// Estados (espejo del backend)
const S = {
  LOADING: 'loading', READY: 'ready', SUBMITTING: 'submitting',
  PROCESSING: 'processing', SUCCESS: 'success', REJECTED: 'rejected',
  TIMEOUT: 'timeout', ERROR: 'error',
};

// Los tres campos que son de Mercado Pago. El titular, el documento y el email son nuestros.
const CAMPOS = ['cardNumber', 'expirationDate', 'securityCode'];
const CAMPO = {
  cardNumber: { placeholder: '1234 1234 1234 1234', etiqueta: 'Número de tarjeta' },
  expirationDate: { placeholder: 'MM/AA', etiqueta: 'Vencimiento' },
  securityCode: { placeholder: '123', etiqueta: 'Código de seguridad' },
};
// Qué parte de la tarjeta dibujada se ilumina según dónde está escribiendo.
const ZONA = { cardNumber: 'numero', expirationDate: 'vencimiento', nombre: 'nombre' };

// Adentro de los campos seguros no llega nuestro CSS (son iframes de otro dominio): el estilo
// se les pasa así, y solo aceptan estas propiedades (docs/fields.md del SDK de Mercado Pago).
const ESTILO_CAMPO = {
  height: '100%',
  color: '#e8eaed',
  // Menos de 16 px y el iPhone agranda la pantalla entera al tocar el campo.
  fontSize: '16px',
  fontFamily: 'Inter, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  placeholderColor: '#8b93a1',
};

// Si Mercado Pago no contesta la lista de documentos, el de casi todos.
const TIPOS_DOC_BASE = [{ id: 'DNI', name: 'DNI' }];

/**
 * @param plan  código del plan que se está comprando (BASICO / PREMIUM). Viaja el CÓDIGO, no el
 *              precio: el monto lo pone el catálogo del backend. Si el importe viniera de acá,
 *              cualquiera contrataría el premium por mil pesos editando la request. El `amount`
 *              es solo para mostrar la cifra correcta en pantalla.
 * @param concepto  qué se paga, para el resumen debajo de la tarjeta ("Plan Premium").
 * @param onBusyChange  avisa true mientras NO conviene desmontar este componente, y false
 *              cuando ya se puede. La página de planes lo usa para no dejar cambiar de plan
 *              en el medio.
 *
 * ⚠️ UNO SOLO POR PANTALLA, Y NO SE LO SACA A MEDIO ARMAR. Mercado Pago admite un único juego
 * de campos seguros vivo por página (los iframes de número, vencimiento y código son únicos).
 * Probado contra el SDK real con el Brick, que usa estos mismos campos:
 *   · dos a la vez → el segundo no termina de cargar nunca, ni en su propio contenedor;
 *   · desmontar uno mientras se está armando y montar otro enseguida → el nuevo queda en
 *     "Cargando…" ("Field 'cardNumber' already unmounted").
 * Quien ofrezca dos cobros en la misma pantalla muestra un formulario por vez y espera a
 * `onBusyChange(false)` antes de cambiarlo.
 */
export default function CardCheckout({
  amount = CONFIG.SUBSCRIPTION_PRICE, plan, concepto = 'Suscripción a Veltronik', onSuccess, onError, onBusyChange,
}) {
  // El contexto directo y no useAuth(): sin sesión (un test, una pantalla suelta) el cobro
  // anda igual, solo que sin el email precargado.
  const auth = useContext(AuthContext);
  const [status, setStatus] = useState(S.LOADING);
  const [message, setMessage] = useState('');
  const [attempt, setAttempt] = useState(0); // re-monta los campos al reintentar

  // Lo que Mercado Pago deja saber de la tarjeta, para dibujarla (ver lib/tarjeta).
  const [marca, setMarca] = useState(null);
  const [bin, setBin] = useState(null);
  const [validos, setValidos] = useState({});
  const [errores, setErrores] = useState({});
  const [tocados, setTocados] = useState({});
  const [foco, setFoco] = useState(null);
  const [token, setToken] = useState(null); // { ultimos4, mes, anio } — llega al apretar Pagar

  // Lo que se escribe en campos nuestros.
  const [nombre, setNombre] = useState('');
  const [tiposDoc, setTiposDoc] = useState(TIPOS_DOC_BASE);
  const [tipoDoc, setTipoDoc] = useState('DNI');
  const [documento, setDocumento] = useState('');
  const [email, setEmail] = useState(() => auth?.user?.email || '');
  const [intentoPagar, setIntentoPagar] = useState(false); // desde acá se marcan todos los faltantes

  const propsRef = useRef({ amount, plan, onSuccess, onError, onBusyChange });
  const pollRef = useRef(null);
  const statusRef = useRef(status);
  const mpRef = useRef(null);

  // Un id por instancia, no uno fijo: con el id repetido los campos se dibujaban en el primer
  // contenedor que encontraban, o sea adentro de OTRO formulario. (useId trae caracteres que
  // no sirven en un selector; se dejan solo letras y números.)
  const base = useId().replace(/[^a-zA-Z0-9]/g, '');
  const idNumero = `cobroNumero${base}`;
  const idVence = `cobroVence${base}`;
  const idCodigo = `cobroCodigo${base}`;

  // Patrón "latest ref": los callbacks async (polling, eventos de los campos) leen siempre los
  // valores vigentes sin re-suscribirse. Se sincronizan en un effect (no durante el render) y
  // ANTES del effect de los campos, que los consume.
  useEffect(() => {
    propsRef.current = { amount, plan, onSuccess, onError, onBusyChange };
    statusRef.current = status;
  });

  // Ocupado = sacarlo ahora rompe algo. Dos casos: los campos se están armando (ver la nota de
  // arriba), o hay un cobro en curso —la tarjeta ya salió para el backend y todavía no hay un
  // rechazo que habilite reintentar—. Incluye TIMEOUT: MP sigue procesando aunque dejamos de
  // preguntar.
  const busy = status === S.LOADING || status === S.SUBMITTING || status === S.PROCESSING
    || status === S.SUCCESS || status === S.TIMEOUT;
  useEffect(() => {
    if (!busy) return undefined;
    propsRef.current.onBusyChange?.(true);
    return () => propsRef.current.onBusyChange?.(false);
  }, [busy]);

  // Polling del estado REAL del cobro en el backend.
  const startPolling = () => {
    setStatus(S.PROCESSING);
    let tries = 0;
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      tries++;
      try {
        const { state, detail } = await subscriptionService.getBillingStatus();
        if (state === 'active') {
          clearInterval(pollRef.current);
          setStatus(S.SUCCESS);
          setTimeout(() => propsRef.current.onSuccess?.(), PAUSA_EXITO_MS);
          return;
        }
        if (state === 'rejected') {
          clearInterval(pollRef.current);
          setStatus(S.REJECTED);
          setMessage(mpRejectionMessage(detail));
          propsRef.current.onError?.(new Error(detail || 'rejected'));
          return;
        }
        // processing / none → seguimos esperando el cobro
      } catch { /* reintenta el próximo tick */ }
      if (tries >= POLL_MAX) {
        clearInterval(pollRef.current);
        if (statusRef.current === S.PROCESSING) setStatus(S.TIMEOUT);
      }
    }, POLL_INTERVAL_MS);
  };

  // Montaje de los campos seguros (se re-montan cuando cambia `attempt`). El estado ya nace en
  // LOADING y `retry` lo resetea en el handler — acá no hay setState sincrónico que dispare
  // renders en cascada.
  useEffect(() => {
    let cancelled = false;
    const campos = {};
    const listos = new Set();
    // El bin de la última vez que avisó: la marca de un bin viejo (el dueño siguió escribiendo
    // mientras Mercado Pago contestaba) no pisa la del actual.
    let binVigente = null;
    const ids = { cardNumber: idNumero, expirationDate: idVence, securityCode: idCodigo };

    // Vigía: pase lo que pase más abajo, "Cargando…" tiene un final. Un campo puede montarse
    // bien y no avisar nunca que está listo (pasa si otro formulario le pisó los iframes), y
    // ahí no hay excepción que atrapar. Si termina llegando después, vuelve a mostrarse.
    const vigia = setTimeout(() => {
      if (cancelled || statusRef.current !== S.LOADING) return;
      console.error('[CardCheckout] el formulario no quedó listo a tiempo');
      setStatus(S.ERROR);
      setMessage(FALLBACK_HINT);
    }, READY_TIMEOUT_MS);

    (async () => {
      try {
        // Clave pública resuelta en RUNTIME (backend → fallback build). Así un build sin la
        // clave no rompe el pago: la toma del backend, que es la fuente de verdad.
        const mpKey = await getMpPublicKey();
        if (cancelled) return;
        if (!mpKey) {
          setStatus(S.ERROR);
          setMessage(FALLBACK_HINT);
          return;
        }

        // El SDK de MP se baja de su CDN; con timeout para no quedar en "Cargando..." eterno.
        await withTimeout(loadMercadoPago(), SDK_TIMEOUT_MS, 'sdk-timeout');
        if (cancelled) return;
        const mp = new window.MercadoPago(mpKey, { locale: 'es-AR' });
        mpRef.current = mp;

        for (const campo of CAMPOS) {
          const opciones = {
            placeholder: CAMPO[campo].placeholder,
            style: ESTILO_CAMPO,
            srLabel: CAMPO[campo].etiqueta,
            ariaRequired: true,
          };
          if (campo === 'expirationDate') opciones.mode = 'short';
          const f = mp.fields.create(campo, opciones).mount(ids[campo]);
          campos[campo] = f;

          f.on('ready', () => {
            listos.add(campo);
            if (!cancelled && listos.size === CAMPOS.length && statusRef.current !== S.READY) {
              setStatus(S.READY);
              setMessage('');
            }
          });
          f.on('focus', () => { if (!cancelled) setFoco(campo); });
          f.on('blur', () => {
            if (cancelled) return;
            setFoco((actual) => (actual === campo ? null : actual));
            setTocados((t) => ({ ...t, [campo]: true }));
          });
          f.on('validityChange', ({ errorMessages } = {}) => {
            if (cancelled) return;
            setValidos((v) => ({ ...v, [campo]: !errorMessages?.length }));
            setErrores((e) => ({ ...e, [campo]: mensajeDelCampo(campo, errorMessages) }));
          });
          f.on('error', (err) => console.error(`[CardCheckout] campo ${campo}:`, err));
        }

        // La marca, apenas los primeros dígitos alcanzan para saberla. Además de dibujarla,
        // ajusta los campos: Amex tiene 15 dígitos y código de 4.
        campos.cardNumber.on('binChange', async ({ bin: nuevo } = {}) => {
          binVigente = nuevo || null;
          if (cancelled) return;
          setBin(binVigente);
          if (!nuevo) { setMarca(null); return; }
          try {
            const { results } = await mp.getPaymentMethods({ bin: nuevo });
            if (cancelled || binVigente !== nuevo) return;
            const m = marcaDeLaTarjeta(results?.[0]);
            setMarca(m);
            if (m?.ajustesNumero) campos.cardNumber.update({ settings: m.ajustesNumero });
            if (m?.ajustesCodigo) campos.securityCode.update({ settings: m.ajustesCodigo });
          } catch { /* sin marca la tarjeta se dibuja igual, y Mercado Pago valida al pagar */ }
        });

        mp.getIdentificationTypes()
          .then((tipos) => { if (!cancelled && Array.isArray(tipos) && tipos.length) setTiposDoc(tipos); })
          .catch(() => { /* queda DNI */ });
      } catch (e) {
        console.error('[CardCheckout] init error:', e);
        if (!cancelled) { setStatus(S.ERROR); setMessage(FALLBACK_HINT); }
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(vigia);
      for (const f of Object.values(campos)) {
        try { f.unmount(); } catch { /* noop */ }
      }
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [attempt, idNumero, idVence, idCodigo]);

  // ─── Pagar ───
  // Primero el token (Mercado Pago lee los iframes y devuelve un código de un solo uso), después
  // el backend con ese token. Si algo falla antes del cobro, se vuelve al formulario tal cual.
  const emailValido = !email.trim() || /^\S+@\S+\.\S+$/.test(email.trim());
  const faltaTarjeta = !CAMPOS.every((c) => validos[c]);
  const faltaNombre = !nombre.trim();
  const faltaDocumento = !documento.trim();

  const pagar = async (e) => {
    e.preventDefault();
    if (status !== S.READY) return;
    setIntentoPagar(true);
    if (faltaTarjeta || faltaNombre || faltaDocumento || !emailValido) {
      setMessage('Revisá los datos marcados.');
      return;
    }
    const mp = mpRef.current;
    if (!mp) return;

    setStatus(S.SUBMITTING);
    setMessage('');
    let t;
    try {
      t = await mp.fields.createCardToken({
        cardholderName: nombre.trim(),
        identificationType: tipoDoc,
        identificationNumber: documento.replace(/[^0-9a-zA-Z]/g, ''),
      });
    } catch (err) {
      console.error('[CardCheckout] token:', err);
      setStatus(S.READY);
      setMessage('Mercado Pago no aceptó los datos de la tarjeta. Revisalos y probá de nuevo.');
      return;
    }
    if (!t?.id) {
      setStatus(S.READY);
      setMessage('No se pudo leer la tarjeta. Probá de nuevo.');
      return;
    }
    // Lo que se puede mostrar de la tarjeta recién ahora: los últimos 4 y el vencimiento.
    setToken({ ultimos4: t.last_four_digits, mes: t.expiration_month, anio: t.expiration_year });

    try {
      // Crea la suscripción (NO activa). Arranca el polling del cobro real. Sin email, el
      // backend usa el de la cuenta.
      await subscriptionService.subscribeWithCard({
        card_token: t.id,
        payer_email: email.trim() || undefined,
        plan: propsRef.current.plan,
      });
      startPolling();
    } catch (err) {
      console.error('[CardCheckout] subscribe error:', err);
      setToken(null);
      setStatus(S.READY);
      setMessage(err?.response?.data?.error || err?.message || 'No se pudo iniciar el pago. Probá de nuevo.');
      propsRef.current.onError?.(err);
    }
  };

  // El reset vive acá (handler), no en el effect: al reintentar, los campos se re-montan con
  // la UI ya en "Cargando" en el mismo commit. El titular y el documento quedan: lo común es
  // probar otra tarjeta de la misma persona.
  const retry = () => {
    setStatus(S.LOADING);
    setMessage('');
    setToken(null);
    setMarca(null);
    setBin(null);
    setValidos({});
    setErrores({});
    setTocados({});
    setFoco(null);
    setIntentoPagar(false);
    setAttempt((a) => a + 1);
  };

  const fase = status === S.LOADING || status === S.READY || status === S.SUBMITTING
    ? 'formulario'
    : status === S.ERROR ? 'error' : 'resultado';
  const estadoTarjeta = status === S.SUCCESS ? 'aprobada'
    : status === S.REJECTED ? 'rechazada'
      : status === S.SUBMITTING || status === S.PROCESSING || status === S.TIMEOUT ? 'pagando'
        : 'escribiendo';
  const errorDe = (campo) => ((tocados[campo] || intentoPagar) ? errores[campo] || (intentoPagar && !validos[campo] ? 'Completá este dato.' : null) : null);

  return (
    // Dos cajas: la de afuera es la que se mide (container query) y la de adentro la grilla.
    // Ancho alcanza para dos columnas en Ajustes; en Planes y en el bloqueo va todo apilado.
    <div className="cobro" data-fase={fase}>
      <div className="cobro-grilla">
        <div className="cobro-escena">
          <TarjetaEnVivo
            estado={estadoTarjeta}
            marca={marca}
            bin={bin}
            ultimos4={token?.ultimos4}
            nombre={nombre}
            vencimiento={{ valido: !!validos.expirationDate, mes: token?.mes, anio: token?.anio }}
            dadaVuelta={fase === 'formulario' && foco === 'securityCode'}
            foco={fase === 'formulario' ? ZONA[foco] : null}
          />

          {fase === 'formulario' && (
            <div className="cobro-resumen">
              <div className="cobro-resumen-fila">
                <span>{concepto}</span>
                <span className="tabular-nums">{formatCurrency(amount)}</span>
              </div>
              <div className="cobro-resumen-fila es-apagada">
                <span>Se cobra</span>
                <span>todos los meses</span>
              </div>
              <div className="cobro-resumen-total">
                <span>Total por mes</span>
                <strong className="tabular-nums">{formatCurrency(amount)}</strong>
              </div>
            </div>
          )}

          {fase === 'resultado' && (
            <Resultado
              status={status}
              message={message}
              amount={amount}
              marca={marca}
              ultimos4={token?.ultimos4}
              onReintentar={retry}
              onVerificar={startPolling}
            />
          )}

          {fase === 'error' && (
            <div className="cobro-resultado es-error" role="alert">
              <p>{message}</p>
              <button type="button" className="btn btn-secondary" onClick={retry}>Reintentar</button>
            </div>
          )}
        </div>

        {/* SIEMPRE en el DOM: los campos seguros viven adentro y no se los puede sacar mientras
            hay un cobro en curso. Se esconde cuando ya no hace falta. */}
        <form className="cobro-formulario" onSubmit={pagar} noValidate hidden={fase !== 'formulario'}>
          <div className="cobro-encabezado">
            <h3 className="cobro-titulo">Datos de la tarjeta</h3>
            <p className="cobro-bajada">Crédito o débito. El cobro se repite todos los meses.</p>
          </div>

          <div className="form-group">
            <span className="form-label">Número de tarjeta</span>
            <CampoSeguro id={idNumero} icono="creditCard" foco={foco === 'cardNumber'} error={errorDe('cardNumber')}>
              {marca && <span className="campo-seguro-marca">{marca.nombre}</span>}
            </CampoSeguro>
          </div>

          <div className="cobro-fila-2">
            <div className="form-group">
              <span className="form-label">Vencimiento</span>
              <CampoSeguro id={idVence} icono="calendarEvent" foco={foco === 'expirationDate'} error={errorDe('expirationDate')} />
            </div>
            <div className="form-group">
              <span className="form-label">
                Código de seguridad <small className="cobro-ayuda">al dorso</small>
              </span>
              <CampoSeguro id={idCodigo} icono="lock" foco={foco === 'securityCode'} error={errorDe('securityCode')} />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor={`${base}Titular`}>Nombre del titular</label>
            <input
              id={`${base}Titular`}
              className={`form-input${intentoPagar && faltaNombre ? ' con-error' : ''}`}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              onFocus={() => setFoco('nombre')}
              onBlur={() => setFoco((f) => (f === 'nombre' ? null : f))}
              placeholder="Como figura en la tarjeta"
              autoComplete="cc-name"
              maxLength={60}
            />
            {intentoPagar && faltaNombre && <p className="form-error">Escribí el nombre como figura en la tarjeta.</p>}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor={`${base}Documento`}>Documento del titular</label>
            <div className="cobro-documento">
              <select
                className="form-select"
                aria-label="Tipo de documento"
                value={tipoDoc}
                onChange={(e) => setTipoDoc(e.target.value)}
              >
                {tiposDoc.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <input
                id={`${base}Documento`}
                className={`form-input${intentoPagar && faltaDocumento ? ' con-error' : ''}`}
                value={documento}
                onChange={(e) => setDocumento(e.target.value)}
                inputMode={tipoDoc === 'DNI' ? 'numeric' : 'text'}
                placeholder="Sin puntos"
                maxLength={20}
              />
            </div>
            {intentoPagar && faltaDocumento && <p className="form-error">Falta el documento del titular.</p>}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor={`${base}Email`}>Email para el comprobante</label>
            <input
              id={`${base}Email`}
              type="email"
              className={`form-input${intentoPagar && !emailValido ? ' con-error' : ''}`}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@email.com"
              autoComplete="email"
            />
            {intentoPagar && !emailValido && <p className="form-error">Ese email no parece completo.</p>}
          </div>

          <button type="submit" className="btn btn-primary btn-lg cobro-pagar" disabled={status !== S.READY}>
            {status === S.LOADING && <><span className="spinner" /> Cargando pago seguro…</>}
            {status === S.SUBMITTING && <><span className="spinner" /> Validando la tarjeta…</>}
            {status === S.READY && (
              <><Icon name="lock" size="1em" /> Pagar {formatCurrency(amount)} <Icon name="arrowRight" size="1em" /></>
            )}
          </button>

          {message && fase === 'formulario' && <p className="cobro-aviso" role="alert">{message}</p>}

          <p className="cobro-seguridad">
            <Icon name="lock" size="0.95em" />
            Los datos de la tarjeta van directo a Mercado Pago. Veltronik no los ve ni los guarda.
          </p>
        </form>
      </div>
    </div>
  );
}

/**
 * La caja de un campo seguro: el iframe de Mercado Pago va adentro del div con `id`, y alrededor
 * nuestro marco (ícono, foco, error) para que se vea igual que un campo propio.
 */
function CampoSeguro({ id, icono, foco, error, children }) {
  return (
    <>
      <div className={`campo-seguro${foco ? ' con-foco' : ''}${error ? ' con-error' : ''}`}>
        <Icon name={icono} size="1.05em" className="campo-seguro-icono" />
        <div id={id} className="campo-seguro-iframe" />
        {children}
      </div>
      {error && <p className="form-error">{error}</p>}
    </>
  );
}

/** Lo que se ve debajo de la tarjeta una vez que salió el pago. */
function Resultado({ status, message, amount, marca, ultimos4, onReintentar, onVerificar }) {
  if (status === S.SUCCESS) {
    return (
      <div className="cobro-resultado es-ok" role="status">
        <span className="cobro-sello"><Icon name="check" size="1.2em" /></span>
        <strong>Pagado {formatCurrency(amount)}</strong>
        <p>
          {marca?.nombre || 'Tarjeta'}{ultimos4 ? ` terminada en ${ultimos4}` : ''}. Activando tu cuenta…
        </p>
      </div>
    );
  }
  if (status === S.REJECTED) {
    return (
      <div className="cobro-resultado es-error" role="alert">
        <strong>El cobro fue rechazado</strong>
        <p>{message}</p>
        <button type="button" className="btn btn-primary" onClick={onReintentar}>Probar con otra tarjeta</button>
      </div>
    );
  }
  if (status === S.TIMEOUT) {
    return (
      <div className="cobro-resultado es-espera" role="status">
        <strong>Tu pago se está confirmando…</strong>
        <p>
          Mercado Pago está procesando el cobro (puede tardar unos minutos). Cuando se confirme,
          tu cuenta se activa sola. Podés cerrar y volver en un rato.
        </p>
        <button type="button" className="btn btn-secondary" onClick={onVerificar}>Volver a verificar</button>
      </div>
    );
  }
  // SUBMITTING / PROCESSING
  return (
    <div className="cobro-resultado" role="status">
      <PasosDelCobro status={status} />
    </div>
  );
}

// ─── Las 3 etapas del cobro, según el estado real ───
function PasosDelCobro({ status }) {
  const pasos = ['Tarjeta validada', 'Procesando el cobro', 'Cuenta activada'];
  // Estado de cada paso: hecho | activo | pendiente
  const estadoDe = (i) => {
    if (status === S.SUBMITTING) return i === 0 ? 'activo' : 'pendiente';
    if (status === S.PROCESSING) return i === 0 ? 'hecho' : i === 1 ? 'activo' : 'pendiente';
    return 'pendiente';
  };
  return (
    <ol className="cobro-pasos">
      {pasos.map((paso, i) => {
        const estado = estadoDe(i);
        return (
          <li key={paso} className={`cobro-paso es-${estado}`}>
            <span className="cobro-paso-marca">
              {estado === 'hecho' ? <Icon name="check" size="0.9em" /> : estado === 'activo' ? <span className="spinner" /> : i + 1}
            </span>
            <span>{paso}</span>
          </li>
        );
      })}
    </ol>
  );
}
