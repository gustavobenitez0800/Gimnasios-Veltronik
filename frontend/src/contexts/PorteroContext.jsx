// ============================================
// VELTRONIK - EL PORTERO DEL MOSTRADOR
// ============================================
// La puerta del gimnasio, atendida en cualquier pantalla (03/11/2026).
//
// Antes TODO lo de la puerta vivía adentro de la pantalla Accesos: el lector de llaveros, la
// cajita del molinete, el aviso de las entradas por QR y de los frenados, y los sonidos. El profe
// que se iba a Pagos a cobrar —o a Clases, o a Socios— dejaba la puerta sorda: el molinete no
// abría para nadie, la X no sonaba, y el lector escribía el número del llavero en el monto del
// cobro. Y al volver a Accesos, lo que había pasado mientras tanto se daba por visto: no sonaba
// nunca.
//
// Ahora la puerta la atiende este portero, montado UNA vez para toda la app (en AppLayout), como
// ya se hizo con el molinete facial (MolineteAlDia) y con la cola (VaciadorDeCola). Accesos pasa a
// ser una VISTA de lo que él sabe: el buscador, el cartel y quién necesita atención. En las demás
// pantallas lo que pasa en la puerta aparece en una tarjeta que flota abajo a la derecha.
//
// ⭐ EN EL ESCRITORIO ATIENDE SIEMPRE; EN LA WEB, SOLO CON ACCESOS ABIERTO. El portal web es del
// dueño, que lo mira desde la casa o el celular: que le aparezcan carteles de la puerta mientras
// mira los reportes no le sirve a nadie, y preguntarle al servidor cada dos segundos desde ahí es
// gastar. En la web todo sigue como era: la puerta se escucha mientras Accesos está abierta.
// ============================================

import { Component, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import CONFIG from '../lib/config';
import { useToast } from './ToastContext';
import { useAuth } from './AuthContext';
import { accessService, memberService, errorService, planService } from '../services';
import { useQueryCache, useRefrescoAutomatico, useEstaEnLinea, useNovedadesDeLaPuerta } from '../hooks';
import { invalidateQueries } from '../hooks/queryCacheStore';
import { prepararSocios, refrescarSocios, REFRESCO_MS, socioLocalPorId } from '../lib/localMembers';
import { resumenDeCola, sociosConCobroPendiente } from '../lib/colaAccesos';
import { recordarGraceDays, compararConElServidor, puedePasarElMolinete } from '../lib/situacionSocio';
import { EVENTO_COLA_CAMBIO } from '../components/VaciadorDeCola';
import { getInitials } from '../lib/utils';
import { cuantoLeQueda, colorDelCartel } from '../lib/cuantoLeQueda';
import {
  sonarVencido, sonarVencidoDirecto, sonarEntrada, sonarLlaveroDesconocido, prepararSonido,
} from '../lib/alertaSonora';
import { useCajitaMolinete } from '../hooks/useCajitaMolinete';
import { abrirSiPasa, laCajitaManda } from '../lib/cajitaMolinete';
import { useLectorDeLlaveros } from '../hooks/useLectorDeLlaveros';
import { METODO_LLAVERO } from '../lib/llaveros';
import { cobrarCuota } from '../lib/cobrarCuota';
import LlaveroSinAsignar from '../components/llaveros/LlaveroSinAsignar';
import CobroRapido from '../components/CobroRapido';
import PuertaFlotante from '../components/portero/PuertaFlotante';

/** Cuánto dura el desvanecimiento del cartel al irse. El mismo número que en access.css. */
const SALIDA_DEL_AVISO_MS = 200;

/** Las situaciones del socio que hacen sonar la X cuando el molinete lo frena. */
const SITUACIONES_QUE_SUENAN = new Set(['VENCIDO', 'EN_GRACIA', 'INACTIVO']);

/**
 * Después de cobrarle a alguien que la puerta no dejó pasar, ¿sigue ahí parado? Pasado este rato
 * se fue: abrirle el molinete dejaría pasar al que venga atrás.
 */
const SIGUE_EN_LA_PUERTA_MS = 10 * 60 * 1000;

const PorteroContext = createContext(null);

/**
 * Lo que dibuja el portero (la tarjeta flotante y sus diálogos) va envuelto en esto: si algo de
 * eso fallara, desaparece y queda en la consola, pero NO se lleva puesto el mostrador entero. La
 * puerta (lector, cajita, sonido) sigue andando: no depende de que se dibuje nada.
 */
class SinRomperElMostrador extends Component {
  constructor(props) {
    super(props);
    this.state = { fallo: false };
  }

  static getDerivedStateFromError() {
    return { fallo: true };
  }

  componentDidCatch(error) {
    console.error('[Portero] Falló lo que se dibuja de la puerta:', error);
  }

  render() {
    return this.state.fallo ? null : this.props.children;
  }
}

/** El portero de la puerta. Va adentro de `<PorteroProvider>` (AppLayout lo monta). */
export function usePortero() {
  const portero = useContext(PorteroContext);
  if (!portero) throw new Error('usePortero va adentro de <PorteroProvider> (lo monta AppLayout)');
  return portero;
}

/** ¿Pasó hace poco? `hora` viene del servidor sin zona: es la hora del gimnasio, como la de la PC. */
function esReciente(hora, ahora = Date.now()) {
  const t = hora ? new Date(hora).getTime() : NaN;
  return Number.isFinite(t) && ahora - t <= SIGUE_EN_LA_PUERTA_MS;
}

/** Un socio del servidor, en el formato del buscador del mostrador. */
function comoSocioDelMostrador(dto) {
  return {
    ...dto,
    fullName: dto.fullName || `${dto.firstName || ''} ${dto.lastName || ''}`.trim(),
    dni: dto.dni || dto.document || '',
  };
}

export function PorteroProvider({ children }) {
  const { showToast } = useToast();
  const { orgId } = useAuth();
  const { pathname } = useLocation();
  const enAccesos = pathname === CONFIG.ROUTES.ACCESS;
  const siempre = !!CONFIG.IS_DESKTOP;
  const activo = siempre || enAccesos;
  const enLinea = useEstaEnLinea();

  // ─── La cajita y el audio, listos desde que arranca el programa ───
  //
  // Antes la cajita se buscaba al abrir Accesos: un mostrador que arrancaba en otra pantalla no
  // abría el molinete hasta que alguien pasaba por ahí.
  useCajitaMolinete({ conectarAlMontar: siempre });
  useEffect(() => { if (siempre) prepararSonido(); }, [siempre]);

  // ─── Lo que pasa en la puerta: UN dueño del dato ───
  //
  // Lo pide el portero y Accesos lo lee de él. Si cada uno lo pidiera por su lado, la novedad que
  // le llega a uno no la vería el otro: dos copias del mismo caché no se avisan entre sí.
  // 10 segundos de frescura: ir y volver entre pantallas no dispara nada.
  const { data, invalidate: recargar, isFetching } = useQueryCache(
    'mostrador',
    () => accessService.getMostrador(),
    { staleTime: 10000, enabled: activo },
  );

  const adentro = useMemo(() => data?.adentro || [], [data]);
  const avisos = useMemo(() => data?.avisos || [], [data]);
  const rechazos = useMemo(() => data?.rechazos || [], [data]);
  const ingresosQr = useMemo(() => data?.ingresos || [], [data]);

  // Los días de gracia, guardados para cuando NO haya servidor: es el único dato de la regla que
  // el terminal no puede deducir de la ficha del socio.
  useEffect(() => {
    if (typeof data?.graceDays === 'number') recordarGraceDays(data.graceDays);
  }, [data]);

  // La red de seguridad contra la deriva: con internet llegan las dos respuestas —la del
  // servidor y la calculada acá— y tienen que coincidir. No corrige nada: hace ruido en la consola.
  useEffect(() => {
    (data?.adentro || []).forEach((a) => a?.member && compararConElServidor(a.member));
  }, [data]);

  // ── Se entera solo, al instante ──
  //
  // La marca liviana cada 2 segundos (useNovedadesDeLaPuerta) es lo que trae el QR y los frenados
  // al instante. El latido es la red de seguridad: con Accesos a la vista, el ritmo de siempre; en
  // otra pantalla, uno por minuto alcanza (las novedades ya llegan por la marca).
  // ⚠️ Y SIN RED NO SE LATE: pedidos condenados a fallar, apilados, tapan la respuesta honesta.
  useRefrescoAutomatico(
    recargar,
    isFetching || !enLinea || !activo,
    enAccesos ? undefined : { enFoco: 60000, deFondo: 60000 },
  );
  useNovedadesDeLaPuerta(recargar, enLinea && activo);

  // Al volver la red se refresca en el acto: lo que se estaba mostrando dejó de ser lo mejor que
  // se sabe en el momento en que la cola sube lo que estaba esperando.
  const habiaRed = useRef(enLinea);
  useEffect(() => {
    if (activo && enLinea && !habiaRed.current) recargar();
    habiaRed.current = enLinea;
  }, [activo, enLinea, recargar]);

  // La copia local de socios: lista antes del primer socio del día (el lector la usa para
  // encontrar al dueño del llavero aunque no haya internet), y al día sola cada tanto.
  useEffect(() => {
    const tenantId = localStorage.getItem('current_org_id') || orgId;
    if (!activo || !tenantId) return undefined;
    prepararSocios(tenantId);
    const t = setInterval(() => { refrescarSocios(tenantId).catch(() => {}); }, REFRESCO_MS);
    return () => clearInterval(t);
  }, [activo, orgId]);

  // ─── LA COLA: lo que se registró sin internet y todavía no subió ───
  //
  // Cuántos esperan y desde cuándo (Accesos lo muestra), y QUIÉNES PAGARON sin que el servidor se
  // haya enterado: el veredicto sigue siendo el del servidor —viejo, pero de una sola fuente— y al
  // lado se aclara por qué está viejo. Va también en un ref: el cobro que la puerta acaba de hacer
  // tiene que verse en el mismo gesto, sin esperar a que la pantalla se vuelva a dibujar.
  const [cola, setCola] = useState({ cuantos: 0, dias: 0, trabada: null });
  const [conCobroSinSubir, setConCobroSinSubir] = useState([]);
  const cobroSinSubir = useRef([]);
  const tieneCobroSinSubir = useCallback(
    (id) => !!id && cobroSinSubir.current.includes(String(id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [conCobroSinSubir],
  );

  const contarPendientes = useCallback(async () => {
    const socios = await sociosConCobroPendiente();
    cobroSinSubir.current = socios;
    // Se compara por valor: un array nuevo en cada refresco redibuja siempre, y con un
    // temporizador atrás la pantalla del mostrador no para nunca. Ya pasó una vez.
    setConCobroSinSubir((previo) => (
      previo.length === socios.length && previo.every((v, i) => v === socios[i]) ? previo : socios
    ));
    const nuevo = await resumenDeCola();
    setCola((previo) => (
      previo.cuantos === nuevo.cuantos && previo.dias === nuevo.dias
        && Boolean(previo.trabada) === Boolean(nuevo.trabada) ? previo : nuevo
    ));
  }, []);

  // El VACIADO vive en `<VaciadorDeCola />`; acá solo se cuenta, y se entera por su evento.
  useEffect(() => {
    if (!activo) return undefined;
    contarPendientes();
    const alCambiarLaCola = () => {
      contarPendientes();
      // Si algo subió, "quién está adentro" quedó viejo: recién ahora el servidor sabe quién entró.
      recargar();
    };
    window.addEventListener(EVENTO_COLA_CAMBIO, alCambiarLaCola);
    return () => window.removeEventListener(EVENTO_COLA_CAMBIO, alCambiarLaCola);
  }, [activo, contarPendientes, recargar]);

  // ─── EL CARTEL: los avisos de entrada, apilados ───
  //
  // Una PILA y no uno solo: en la puerta la gente entra una atrás de la otra, y con un aviso
  // único el segundo socio borraba el del primero antes de que nadie llegara a leerlo. Se muestran
  // los últimos tres; cada uno se va solo. En Accesos los dibuja la pantalla; en las demás, la
  // tarjeta flotante.
  const [avisosDeEntrada, setAvisosDeEntrada] = useState([]);
  const proximoAvisoId = useRef(0);
  const temporizadores = useRef(new Set());
  useEffect(() => () => { temporizadores.current.forEach(clearTimeout); }, []);

  const mostrarAviso = useCallback((aviso, duracionMs = 4000) => {
    const id = proximoAvisoId.current++;
    setAvisosDeEntrada((previos) => [{ ...aviso, id, saliendo: false }, ...previos].slice(0, 3));
    const despues = (fn, ms) => {
      const t = setTimeout(() => { temporizadores.current.delete(t); fn(); }, ms);
      temporizadores.current.add(t);
    };
    // Se va desvaneciéndose, no de golpe: primero se marca y un momento después se saca.
    despues(() => {
      setAvisosDeEntrada((previos) => previos.map((a) => (a.id === id ? { ...a, saliendo: true } : a)));
    }, duracionMs - SALIDA_DEL_AVISO_MS);
    despues(() => {
      setAvisosDeEntrada((previos) => previos.filter((a) => a.id !== id));
    }, duracionMs);
  }, []);

  // ─── ¿Este socio está adentro AHORA? ───
  const visitaAbierta = useCallback(
    (memberId) => adentro.find((l) => (l.member?.id || l.memberId) === memberId) || null,
    [adentro],
  );

  // ¿El molinete lo deja pasar? La MISMA regla que el molinete facial (puedePasarElMolinete): al
  // día, en gracia o sin fecha cargada. Y el que acaba de pagar aunque el cobro todavía no haya
  // subido: el servidor todavía no lo sabe, pero la plata ya está en el cajón.
  const dejaPasar = useCallback(
    (member) => puedePasarElMolinete(member) || tieneCobroSinSubir(member?.id),
    [tieneCobroSinSubir],
  );

  // ─── Quien atiende vuelve a su buscador ───
  // Accesos se anota acá; después de un diálogo de la puerta, el foco vuelve al campo del DNI.
  const enfoque = useRef(null);
  const enfocarElBuscador = useCallback((fn) => {
    enfoque.current = fn;
    return () => { if (enfoque.current === fn) enfoque.current = null; };
  }, []);
  const devolverElFoco = useCallback(() => { enfoque.current?.(); }, []);

  /**
   * ⭐ MARCAR EL PASO DE UN SOCIO. La DIRECCIÓN la decide el backend; acá se muestra, suena y se
   * abre la puerta. Con el llavero es lo mismo: cambia el método que queda anotado (y su freno de
   * rebote), nada más.
   *
   * @returns {Promise<{ok: boolean, direccion?: string, encolado?: boolean}>}
   */
  const registrarAcceso = useCallback(async (member, metodo = 'manual') => {
    try {
      const r = await accessService.checkIn(member.id, metodo, member.fullName);
      const info = cuantoLeQueda(member);

      // ⚠️ SIN CONEXIÓN EL CARTEL NO DICE "ENTRADA REGISTRADA": la dirección la decide el
      // SERVIDOR, y acá todavía no se sabe. Se dice lo único que es cierto: quedó guardado. Y LOS
      // DÍAS VAN IGUAL: sin internet el único que puede decir "este socio está vencido" es el
      // conteo local, que se recalcula contra el reloj.
      if (r?.encolado) {
        mostrarAviso({
          name: member.fullName,
          // EL COLOR ES EL DE SIEMPRE: el número lo mira el socio, y que el terminal no tenga wifi
          // no es un problema suyo. Que quedó guardado se dice abajo, para quien atiende.
          type: colorDelCartel(info),
          sinConexion: true,
          accion: 'Guardado sin conexión',
          valor: info.valor,
          unidad: info.unidad,
          daysLabel: info.label,
          detalle: 'Se manda solo cuando vuelva internet',
          initials: getInitials(member.fullName),
        });
        // Sin internet también suena: justo ahí el servidor no puede avisar nada. Salvo que acabe
        // de pagar: el cobro está en la cola y el número todavía no lo sabe.
        if (info.type === 'expired' && !tieneCobroSinSubir(member.id)) sonarVencidoDirecto(member.id);
        else if (metodo === METODO_LLAVERO) sonarEntrada();
        // Sin internet la cajita abre igual: decide la copia local, que es la que pinta el cartel.
        abrirSiPasa({ pasa: dejaPasar(member) });
        contarPendientes();
        return { ok: true, encolado: true };
      }

      const salio = r?.direccion === 'SALIDA';
      const rebote = r?.direccion === 'REBOTE';
      mostrarAviso({
        name: member.fullName,
        // La salida no se colorea por la cuota: al que se va ya no se le reclama nada.
        type: salio || rebote ? 'success' : colorDelCartel(info),
        accion: rebote ? 'Ya estaba registrado' : salio ? 'Salida registrada' : 'Entrada registrada',
        valor: salio || rebote ? null : info.valor,
        unidad: salio || rebote ? '' : info.unidad,
        daysLabel: salio || rebote ? '' : info.label,
        // Si pagó y el cobro todavía no subió, eso gana: explica por qué el número dice lo que dice.
        detalle: tieneCobroSinSubir(member.id)
          ? 'Pagó recién · se actualiza al volver internet'
          : (r?.recuperado && !salio && !rebote ? 'La vez anterior se fue sin marcar salida' : ''),
        initials: getInitials(member.fullName),
      });
      // La X, solo al que ENTRA vencido (al que sale no se le reclama nada; al que acaba de pagar,
      // sería una falsa alarma). Lo hizo una persona en el mostrador: suena siempre. Con el
      // llavero y todo bien, el «din-din»: la confirmación que el socio espera del lector.
      if (!salio && !rebote && info.type === 'expired' && !tieneCobroSinSubir(member.id)) {
        sonarVencidoDirecto(member.id);
      } else if (metodo === METODO_LLAVERO && !rebote) {
        sonarEntrada();
      }
      // Un rebote no abre de nuevo (pasarían dos con el mismo DNI). La salida abre solo si en esta
      // PC el molinete también es de salida (Ajustes → Cajita del molinete).
      if (salio) abrirSiPasa({ salida: true });
      else if (!rebote) abrirSiPasa({ pasa: dejaPasar(member) });

      recargar();
      return { ok: true, direccion: r?.direccion };
    } catch (error) {
      // Un error de transporte no trae `response`: la entrada NO quedó, y hay que decirlo así.
      showToast(
        !error?.response
          ? 'Sin conexión: la entrada NO se registró. Anotala a mano.'
          : errorService.getMessage(error),
        'error',
      );
      return { ok: false };
    }
  }, [mostrarAviso, tieneCobroSinSubir, dejaPasar, contarPendientes, recargar, showToast]);

  /**
   * ⭐ LA CAJITA NO LE ABRE: es un FRENADO, no una entrada (03/11/2026).
   *
   * <p>Antes se registraba la entrada y la cajita no abría: el socio figuraba adentro estando en
   * la vereda, y si volvía a pasar el llavero el sistema lo tomaba por una SALIDA —y un molinete
   * que abre también para salir le abría—. Ahora queda como lo deja el molinete facial: en la
   * lista de «la puerta frenó a un socio», con el botón para cobrarle.</p>
   */
  const frenarEnLaPuerta = useCallback((socio, metodo) => {
    const info = cuantoLeQueda(socio);
    mostrarAviso({
      name: socio.fullName,
      type: 'error',
      accion: 'El molinete no abrió',
      valor: info.valor,
      unidad: info.unidad,
      daysLabel: info.label,
      detalle: 'Cobrale y se le abre',
      initials: getInitials(socio.fullName),
    }, 6000);
    sonarVencidoDirecto(socio.id);
    accessService.anotarRechazo(socio.id, metodo)
      .catch(() => { /* sin red: la puerta igual quedó cerrada y la X sonó */ })
      .finally(() => recargar());
  }, [mostrarAviso, recargar]);

  /** El socio pasó SU llavero: entra, sale, o la cajita lo frena. */
  const entrarConLlavero = useCallback(async (socio) => {
    // Lo frena la cajita solo si la puerta es de ella, hay internet para anotarlo, no le alcanza
    // la cuota y no está adentro (al que SALE se le abre siempre: no se lo deja encerrado).
    if (laCajitaManda() && enLinea && !dejaPasar(socio) && !visitaAbierta(socio.id)) {
      frenarEnLaPuerta(socio, METODO_LLAVERO);
      return { ok: true, frenado: true };
    }
    return registrarAcceso(socio, METODO_LLAVERO);
  }, [enLinea, dejaPasar, visitaAbierta, frenarEnLaPuerta, registrarAcceso]);

  // ─── EL LLAVERO (ADR-016), en cualquier pantalla ───
  //
  // Se busca EXACTO —nunca "contiene": un llavero parecido es otra persona— y se registra como con
  // el DNI. El de nadie abre el aviso para asignárselo a alguien; el de varios, para elegir quién.
  const [llavero, setLlavero] = useState(null);
  const leyendo = useRef(false);
  const alLeerLlavero = useCallback(async (codigo) => {
    if (leyendo.current) return;
    leyendo.current = true;
    try {
      const { socios, ultimaBaja } = await memberService.buscarPorLlavero(codigo);
      if (socios.length === 1) {
        await entrarConLlavero(socios[0]);
      } else {
        // Que se oiga aunque nadie esté mirando: hay alguien en la puerta que no puede entrar.
        sonarLlaveroDesconocido();
        setLlavero(socios.length > 1 ? { codigo, candidatos: socios } : { codigo, ultimaBaja });
      }
    } finally {
      leyendo.current = false;
    }
  }, [entrarConLlavero]);

  // El lector escucha en toda la app. Con el aviso del llavero abierto, no: lo que escriba va al
  // buscador del aviso, que es donde quien atiende está buscando al dueño.
  useLectorDeLlaveros(alLeerLlavero, { activo: activo && !llavero });

  /** Abrir el aviso del llavero a mano (el lector que escribe lento y no se reconoce como lector). */
  const asignarLlavero = useCallback((codigo, ultimaBaja = null) => {
    setLlavero({ codigo, ultimaBaja });
  }, []);

  const cerrarLlavero = useCallback(() => {
    setLlavero(null);
    devolverElFoco();
  }, [devolverElFoco]);

  // ─── ENTRAR POR QR LEVANTA EL MISMO CARTEL QUE ENTRAR A MANO ───
  //
  // Los ya anunciados se recuerdan para no repetir el cartel en cada refresco. ⚠️ Y en la PRIMERA
  // carga se marcan todos sin mostrarlos: abrir el programa no tiene por qué disparar los
  // ingresos de los últimos cinco minutos como si acabaran de pasar. La siembra va con el PRIMER
  // PEDIDO, no con el primer ingreso: sembrar recién con el primero se comía al primer socio que
  // escaneaba.
  //
  // ⭐ Y COMO EL PORTERO NO SE VA DE LA PANTALLA, LA SIEMBRA ES UNA SOLA. Antes vivía en Accesos y
  // se volvía a sembrar cada vez que el profe volvía: lo que había pasado mientras estaba en Pagos
  // quedaba "ya visto" sin haber sonado nunca. En la web, que solo escucha con Accesos abierto, se
  // vuelve a sembrar al volver (como siempre).
  const anunciados = useRef(null);
  const rechazosVistos = useRef(null);
  useEffect(() => {
    anunciados.current = null;
    rechazosVistos.current = null;
  }, [activo, orgId]);

  useEffect(() => {
    if (!activo || !data) return;
    if (anunciados.current === null) {
      anunciados.current = new Set(ingresosQr.map((i) => i.accesoId));
      return;
    }
    const nuevos = ingresosQr.filter((i) => !anunciados.current.has(i.accesoId));
    if (!nuevos.length) return;
    nuevos.forEach((i) => anunciados.current.add(i.accesoId));

    // El más reciente es el que está parado frente a la pantalla.
    const ultimo = nuevos.reduce((a, b) => (a.hora > b.hora ? a : b));
    const info = cuantoLeQueda(ultimo);
    mostrarAviso({
      name: ultimo.nombre,
      type: colorDelCartel(info),
      accion: 'Entrada por QR',
      valor: info.valor,
      unidad: info.unidad,
      daysLabel: info.label,
      initials: getInitials(ultimo.nombre),
      // Más tiempo que el manual: al que registra la recepcionista ya le habló una persona; el que
      // escaneó solo tiene esta pantalla para enterarse de cuánto le queda.
    }, 6000);
    // La X suena igual que si lo hubieran marcado a mano. Con quién es: la misma entrada no puede
    // sonar dos veces, venga por el camino que venga.
    if (info.type === 'expired') sonarVencido(ultimo.socioId || ultimo.accesoId);
    // Escaneó el QR en la puerta: que el molinete lo deje pasar, como si lo hubieran marcado.
    abrirSiPasa({ pasa: puedePasarElMolinete(ultimo) });
  }, [activo, data, ingresosQr, mostrarAviso]);

  // ─── La puerta frenó a un vencido: que suene también ───
  // La misma siembra: lo que ya estaba al arrancar no suena. El que frenó la cajita de esta PC ya
  // sonó al frenarlo; la ventana por socio de `sonarVencido` evita la segunda X.
  useEffect(() => {
    if (!activo || !data) return;
    if (rechazosVistos.current === null) {
      rechazosVistos.current = new Set(rechazos.map((r) => r.accesoId));
      return;
    }
    const nuevos = rechazos.filter((r) => !rechazosVistos.current.has(r.accesoId));
    nuevos.forEach((r) => rechazosVistos.current.add(r.accesoId));
    const frenado = nuevos.find((r) => SITUACIONES_QUE_SUENAN.has(r.estado));
    if (frenado) sonarVencido(frenado.socioId || frenado.accesoId);
  }, [activo, data, rechazos]);

  // ─── ⭐ COBRAR DESDE LA PUERTA (03/11/2026) ───
  //
  // El socio vencido entró solo, o la puerta lo frenó: el aviso trae «Cobrar», y se le cobra ahí
  // mismo con el cobro rápido de siempre. Al que la puerta no dejó pasar y sigue ahí parado, al
  // cobrarle se le abre.
  const [cobro, setCobro] = useState(null);
  const [aranceles, setAranceles] = useState(null);

  const cobrar = useCallback((aviso, variante = 'entrada') => {
    const local = socioLocalPorId(aviso.socioId);
    setCobro({ socio: local || { id: aviso.socioId, fullName: aviso.nombre }, aviso, variante });
    // Sin la copia local (o sin el socio en ella) se trae la ficha: el arancel pre-elige el cobro.
    if (!local) {
      memberService.getMemberById(aviso.socioId)
        .then((dto) => {
          if (dto) setCobro((c) => (c?.aviso === aviso ? { ...c, socio: comoSocioDelMostrador(dto) } : c));
        })
        .catch(() => {});
    }
    if (!aranceles) {
      planService.getVigentes()
        .then((lista) => setAranceles(lista || []))
        // Sin aranceles se cobra escribiendo el monto, como en Socios.
        .catch(() => setAranceles([]));
    }
  }, [aranceles]);

  const alCobrar = useCallback(async (datos) => {
    const { socio, aviso, variante } = cobro;
    let r;
    try {
      r = await cobrarCuota(socio, datos);
    } catch (error) {
      // El servidor lo rechazó: se dice, y el cobro rápido sigue abierto para corregirlo.
      showToast(errorService.getMessage(error), 'error');
      throw error;
    }

    // Cambió la plata y el vencimiento: lo que se veía en las otras pantallas ya no es cierto.
    invalidateQueries('members');
    invalidateQueries('gym_dashboard');
    invalidateQueries('retention_analytics');

    // Cobrado: el aviso está atendido, en todas las terminales.
    const marcar = variante === 'rechazo' ? accessService.marcarRechazoVisto : accessService.marcarAvisoVisto;
    marcar.call(accessService, aviso.accesoId).catch(() => { /* vuelve en el próximo refresco */ });
    await contarPendientes();

    // ¿Hay una puerta que abrirle? Solo si NO lo había dejado pasar y sigue ahí parado.
    const noPaso = !puedePasarElMolinete({ situacion: aviso.estado });
    if (noPaso && esReciente(aviso.hora)) {
      if (variante === 'rechazo' && aviso.delMostrador) {
        // Lo frenó la cajita de esta PC: ahora entra de verdad (se registra y se abre). Con el
        // socio como quedó en el servidor, o —sin conexión— con el cobro en la cola, que lo deja pasar.
        const alDia = r?.socio ? comoSocioDelMostrador(r.socio) : socio;
        await registrarAcceso(alDia, METODO_LLAVERO);
      } else if (variante === 'entrada') {
        // Entró por QR y la cajita no le abrió: la entrada ya está; falta la puerta.
        abrirSiPasa({ pasa: true });
      }
      // Al frenado del molinete facial lo vuelve a dejar pasar el equipo: se le avisa y pasa.
    }

    recargar();
    return r;
  }, [cobro, contarPendientes, registrarAcceso, recargar, showToast]);

  const cerrarCobro = useCallback(() => {
    setCobro(null);
    devolverElFoco();
  }, [devolverElFoco]);

  const valor = useMemo(() => ({
    // Lo que pasa en la puerta
    datos: data,
    adentro,
    avisos,
    rechazos,
    isFetching,
    recargar,
    visitaAbierta,
    // La cola
    cola,
    tieneCobroSinSubir,
    contarPendientes,
    // El cartel
    avisosDeEntrada,
    // Lo que se hace
    registrarAcceso,
    entrarConLlavero,
    asignarLlavero,
    cobrar,
    enfocarElBuscador,
  }), [
    data, adentro, avisos, rechazos, isFetching, recargar, visitaAbierta,
    cola, tieneCobroSinSubir, contarPendientes, avisosDeEntrada,
    registrarAcceso, entrarConLlavero, asignarLlavero, cobrar, enfocarElBuscador,
  ]);

  return (
    <PorteroContext.Provider value={valor}>
      {children}

      <SinRomperElMostrador>
        {/* Pasaron un llavero que no es de nadie (o de varios): se resuelve acá, en cualquier pantalla. */}
        {activo && (
          <LlaveroSinAsignar
            lectura={llavero}
            onCerrar={cerrarLlavero}
            onAsignado={(socio) => { setLlavero(null); entrarConLlavero(socio).finally(devolverElFoco); }}
            onElegido={(socio) => { setLlavero(null); registrarAcceso(socio, METODO_LLAVERO).finally(devolverElFoco); }}
          />
        )}

        <CobroRapido
          socio={cobro?.socio || null}
          aranceles={aranceles || []}
          abierto={!!cobro}
          onCerrar={cerrarCobro}
          onCobrar={alCobrar}
        />

        {/* En las otras pantallas del escritorio, la puerta flota abajo a la derecha. */}
        {siempre && !enAccesos && (
          <PuertaFlotante
            avisos={avisos}
            rechazos={rechazos}
            carteles={avisosDeEntrada}
            onCobrar={cobrar}
            onAtendido={recargar}
          />
        )}
      </SinRomperElMostrador>
    </PorteroContext.Provider>
  );
}
