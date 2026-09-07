// ============================================
// VELTRONIK V2 - CONTROL DE ACCESO (gym)
// ============================================
// Mostrador de recepción: buscar al socio, registrar su entrada/salida y ver
// quién está adentro ahora mismo.
//
// ⭐ ESTA PANTALLA SE USA COMO UN MOLINETE, y todo lo de abajo sale de ahí: el socio
// teclea su DNI o su nombre, aprieta Enter, entra, y el campo queda vacío esperando al
// que sigue. Nadie toca el mouse entre una persona y la otra.
//
// EL TECLADO NO SE APAGA NUNCA. Que el campo tenga el foco no es una comodidad, es LA
// función: el foco se perdía por motivos que nadie en un mostrador puede adivinar —alguien
// tocó la pantalla en un lugar vacío, volvió de otra sección— y a partir de ahí las teclas
// caían en la nada y el sistema parecía colgado.
//
// ⚠️ Y EL AVISO NO PUEDE TAPAR LA PANTALLA. Acá había un overlay de pantalla completa con
// un cartelón centrado, tres segundos por persona. Mientras estaba puesto, el que seguía en
// la fila no podía tipear: el molinete se trababa solo, justo cuando había cola. Ahora el
// aviso entra por el costado izquierdo, dice lo mismo, y no bloquea nada.
// ============================================

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { memberService, accessService, errorService } from '../services';
import { getInitials, getRelativeTime, debounce } from '../lib/utils';
import EstadoCopiaLocal from '../components/EstadoCopiaLocal';
import AvisosMostrador from '../components/AvisosMostrador';
import CheckinQrPanel from '../components/CheckinQrPanel';
import { prepararSocios, refrescarSocios, REFRESCO_MS } from '../lib/localMembers';
import { resumenDeCola } from '../lib/colaAccesos';
import { recordarGraceDays, compararConElServidor } from '../lib/situacionSocio';
import { EVENTO_COLA_CAMBIO } from '../components/VaciadorDeCola';
import { useQueryCache, useRefrescoAutomatico, useEstaEnLinea } from '../hooks';
import { PageHeader } from '../components/Layout';
import Modal from '../components/ui/Modal';
import { GYM } from '../lib/gym';
import Icon from '../components/Icon';

export default function AccessPage() {
  const orgLabel = GYM.placeLabel;
  const orgLabelCap = GYM.placeLabelCap;

  const { showToast } = useToast();
  const { orgRole } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  // El campo del DNI. Es el centro de la pantalla y el foco vuelve siempre acá.
  const buscadorRef = useRef(null);

  // El cartel del QR se imprime UNA vez y se pega en la puerta: no es de uso diario. Vive
  // detrás de un botón para no comerse media pantalla del mostrador.
  const [qrAbierto, setQrAbierto] = useState(false);
  const puedeAdministrarQr = ['owner', 'admin'].includes(orgRole);

  // ─── Los avisos de entrada, apilados al costado ───
  //
  // Una PILA y no uno solo: en la puerta la gente entra una atrás de la otra, y con un
  // aviso único el segundo socio borraba el del primero antes de que nadie llegara a
  // leerlo. Se muestran los últimos tres, el más nuevo arriba, y cada uno se va por su
  // cuenta. Si entran diez seguidos, se ven los tres últimos y el resto pasa de largo —
  // que es exactamente lo que hace alguien mirando una fila.
  const [avisosDeEntrada, setAvisosDeEntrada] = useState([]);
  const proximoAvisoId = useRef(0);

  const mostrarAviso = useCallback((aviso, duracionMs = 4000) => {
    const id = proximoAvisoId.current++;
    setAvisosDeEntrada((previos) => [{ ...aviso, id }, ...previos].slice(0, 3));
    setTimeout(() => {
      setAvisosDeEntrada((previos) => previos.filter((a) => a.id !== id));
    }, duracionMs);
  }, []);

  // ─── Un pedido, y la vuelta a la pantalla es instantánea ───
  //
  // Antes esta pantalla pedía TRES cosas por separado (adentro, hoy, avisos) y las volvía a
  // pedir de cero en cada visita al módulo — spinner en blanco cada vez que la recepcionista
  // iba a Socios y volvía. Eso es exactamente lo que los dueños describen como "va lento".
  //
  // Ahora es un solo viaje, y con caché: al volver, la pantalla se pinta AL INSTANTE con lo
  // último que se sabía y se refresca por detrás. El dato puede tener unos segundos, y para
  // "quién está adentro" eso no cambia nada; lo que cambia es que ya no hay pantalla en
  // blanco entre un clic y el siguiente.
  //
  // 10 segundos de frescura, contra un refresco cada 15: cada ciclo lo encuentra vencido y
  // vuelve a pedir, pero ir y volver entre módulos no dispara nada.
  const { data, loading, invalidate, isFetching } = useQueryCache(
    'mostrador',
    () => accessService.getMostrador(),
    { staleTime: 10000 },
  );

  const checkedIn = useMemo(() => data?.adentro || [], [data]);
  const avisos = useMemo(() => data?.avisos || [], [data]);
  const ingresosQr = useMemo(() => data?.ingresos || [], [data]);

  const loadData = invalidate;

  // ─── Los días de gracia, guardados para cuando NO haya servidor ───
  //
  // Es el único dato de la regla que el terminal no puede deducir de la ficha del socio. Se
  // guarda cada vez que el servidor lo dice, así el conteo local usa el número de verdad y no
  // uno escrito a mano de este lado — que es justo la clase de valor que alguien cambia en un
  // lugar y olvida en el otro.
  useEffect(() => {
    if (typeof data?.graceDays === 'number') recordarGraceDays(data.graceDays);
  }, [data]);

  // ─── La red de seguridad contra la deriva ───
  //
  // Con internet llegan las DOS respuestas: la del servidor y la que calculamos acá. Tienen
  // que coincidir. Si algún día no coinciden es que una de las dos copias de la regla cambió
  // sin la otra, y sin este chequeo eso vive meses escondido: son dos números que nunca se
  // muestran juntos. No corrige nada — solo hace ruido en la consola.
  useEffect(() => {
    (data?.adentro || []).forEach((a) => a?.member && compararConElServidor(a.member));
  }, [data]);

  // ── El mostrador se entera solo de lo que pasa en la puerta ──
  //
  // Antes esta pantalla cargaba UNA vez, al abrirla, y nunca más. Con el mostrador manual
  // no se notaba: la recepcionista marcaba y la lista se refrescaba después de su propio
  // clic. Con el QR el que marca es el socio desde su celular, así que acá no llegaba nada.
  //
  // El latido vive en `useRefrescoAutomatico` y no acá: lo comparte con "En el gimnasio", y
  // la forma de escribirlo mal —depender de la identidad de `invalidate`— es el bug que
  // hacía que el cartel del QR tardara. Está explicado en el hook, en un solo lugar.
  // ⚠️ Y SIN RED NO SE LATE. Apagar el wifi con la app abierta dejaba "En el gimnasio" en
  // "Cargando…" hasta que volvía la conexión, y no por un cartel mal puesto: el latido seguía
  // disparando un pedido cada quince segundos, cada uno con su plazo de espera y sus
  // reintentos con espera creciente. Pedidos condenados a fallar, apilados, que además tapan
  // el problema — cuanto más se insiste, más tarda en aparecer la respuesta honesta.
  //
  // Pasarlo como "en vuelo" es lo que frena el latido sin tocar el hook: mientras no hay red
  // no hay nada que preguntar. Al volver, el `online` actualiza esto y el latido sigue solo.
  const enLinea = useEstaEnLinea();
  useRefrescoAutomatico(loadData, isFetching || !enLinea);

  // ⭐ Y AL VOLVER LA RED SE REFRESCA EN EL ACTO, sin esperar el próximo latido.
  //
  // Reportado por el dueño: marcó una salida sin conexión, prendió el wifi, y el socio siguió
  // figurando adentro hasta que se fue a otro módulo y volvió. Mientras estuvo sin red esta
  // lista quedó congelada en el último dato bueno, y ese dato ya es falso en el momento en que
  // la cola sube lo que estaba esperando.
  //
  // El vaciado avisa por su evento cuando sube algo, y eso ya refresca. Esto es la otra mitad,
  // y cubre lo que aquel no puede: que la red haya vuelto sin que hubiera nada encolado, o que
  // el servidor haya cambiado por otro lado mientras este terminal estaba a ciegas. Volver a
  // tener red es, por definición, el momento en que lo que se está mostrando dejó de ser lo
  // mejor que se sabe.
  const habiaRed = useRef(enLinea);
  useEffect(() => {
    if (enLinea && !habiaRed.current) loadData();
    habiaRed.current = enLinea;
  }, [enLinea, loadData]);

  // La copia local de socios: se prepara al abrir la pantalla —no en la primera búsqueda—
  // así el buscador ya está instantáneo cuando llega el primer socio del día. Después se
  // refresca sola cada tanto, en el fondo y sin que nadie la espere.
  useEffect(() => {
    const tenantId = localStorage.getItem('current_org_id');
    if (!tenantId) return undefined;
    prepararSocios(tenantId);
    const t = setInterval(() => { refrescarSocios(tenantId).catch(() => {}); }, REFRESCO_MS);
    return () => clearInterval(t);
  }, []);

  // ─── LA COLA: lo que se registró sin internet y todavía no subió ───
  //
  // Cuántos esperan. Es lo único de la cola que la pantalla muestra, y tiene que estar: una
  // cola invisible es una cola que nadie vacía, y lo que hay adentro son visitas que el
  // gimnasio todavía no tiene en ningún otro lado.
  //
  // ⚠️ Y DESDE CUÁNDO ESPERAN, que importa tanto como cuántos son. "3 pendientes" pueden ser
  // de hace dos minutos —el vaciado está por correr— o de hace tres semanas, y eso segundo
  // significa que el gimnasio viene guardando visitas en UN SOLO DISCO desde hace tres
  // semanas. El diseño permite acumular 30 días; sin la antigüedad, esos 30 días pasan en
  // silencio hasta el día que la máquina no arranca.
  const [cola, setCola] = useState({ cuantos: 0, dias: 0 });
  const pendientesCola = cola.cuantos;

  const contarPendientes = useCallback(async () => {
    const nuevo = await resumenDeCola();
    // ⚠️ SE COMPARA POR VALOR, y no es prolijidad. Antes esto era un número, y React descarta
    // solo un `setState` con el mismo número. Un objeto nuevo en cada refresco nunca es igual
    // al anterior, así que redibujaba siempre — con un temporizador atrás, la pantalla del
    // mostrador no paraba nunca. Lo atrapó la suite entera de Acceso, en timeout.
    setCola((previo) => (
      previo.cuantos === nuevo.cuantos && previo.dias === nuevo.dias ? previo : nuevo
    ));
  }, []);

  // El VACIADO no vive acá: vive en `<VaciadorDeCola />`, montado a nivel de la app, porque
  // las visitas tienen que subir esté abierta la pantalla que esté. Esta pantalla solo
  // MUESTRA cuántas esperan, y se entera de los cambios por su evento.
  useEffect(() => {
    contarPendientes();
    const alCambiarLaCola = () => {
      contarPendientes();
      // Si algo subió, "En el Gimnasio" quedó viejo: recién ahora el servidor sabe quién entró.
      loadData();
    };
    window.addEventListener(EVENTO_COLA_CAMBIO, alCambiarLaCola);
    return () => window.removeEventListener(EVENTO_COLA_CAMBIO, alCambiarLaCola);
  }, [contarPendientes, loadData]);

  // ─── EL TECLADO NO SE APAGA NUNCA ───
  //
  // Se ataca por los tres lados por los que el foco se perdía:
  //
  //   1. TECLA SUELTA — si alguien escribe con el foco en cualquier otro lado, la primera
  //      tecla se lleva el foco al campo Y SE ESCRIBE. Sin esto el primer dígito del DNI se
  //      perdía, que es PEOR que no escribir nada: el número queda cortado y el socio "no
  //      existe".
  //   2. CLIC EN CUALQUIER LADO — después de tocar la pantalla, el foco vuelve al campo.
  //   3. VOLVER A LA VENTANA — al minimizar y volver, o al cambiar de sección y regresar.
  //
  // ⚠️ Lo que NO se toca: si el foco está en otro campo de texto o en un diálogo, no se lo
  // roba. Alguien puede estar escribiendo en el buscador del cartel del QR, y arrancarle el
  // teclado de las manos sería el mismo bug al revés.
  const enfocarBuscador = useCallback(() => {
    const el = buscadorRef.current;
    if (!el || document.activeElement === el) return;
    const activo = document.activeElement;
    if (activo && activo !== document.body) {
      const tag = activo.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || activo.isContentEditable) return;
      if (activo.closest?.('[role="dialog"], .modal-overlay, .modal-container')) return;
    }
    el.focus();
  }, []);

  useEffect(() => {
    const esCampoAjeno = (t) =>
      !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);

    const alTeclearSuelto = (e) => {
      if (e.ctrlKey || e.altKey || e.metaKey) return;   // atajos del sistema
      if (esCampoAjeno(e.target)) return;                // ya está escribiendo en otro lado
      if (e.target?.closest?.('[role="dialog"], .modal-overlay, .modal-container')) return;
      // Un solo carácter imprimible, o borrar. Las flechas, Tab y F5 siguen siendo suyas.
      const escribible = e.key.length === 1 || e.key === 'Backspace';
      if (!escribible) return;
      const el = buscadorRef.current;
      if (!el || document.activeElement === el) return;
      el.focus();
      // La tecla que disparó esto se procesa igual, porque el navegador la entrega DESPUÉS
      // del focus(): no hay que reescribirla a mano.
    };

    const alTocar = () => setTimeout(enfocarBuscador, 0); // después del clic, no durante

    document.addEventListener('keydown', alTeclearSuelto);
    document.addEventListener('pointerup', alTocar);
    window.addEventListener('focus', enfocarBuscador);
    return () => {
      document.removeEventListener('keydown', alTeclearSuelto);
      document.removeEventListener('pointerup', alTocar);
      window.removeEventListener('focus', enfocarBuscador);
    };
  }, [enfocarBuscador]);

  /**
   * La búsqueda SIN el retraso, para el camino del Enter.
   *
   * `doSearch` espera 300 ms a propósito, para no consultar en cada tecla mientras alguien
   * escribe. Pero el Enter no puede esperar a nadie: quien lo apretó ya terminó de escribir.
   */
  const buscar = useCallback(async (query) => {
    try {
      return (await memberService.searchForAccess(query)) || [];
    } catch {
      return [];
    }
  }, []);

  // Search
  const doSearch = useMemo(() => debounce(async (query) => {
    if (!query || query.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const results = await memberService.searchForAccess(query);
      setSearchResults(results || []);
    } catch { setSearchResults([]); }
    finally { setSearching(false); }
  }, 300), []);

  const handleSearch = (val) => {
    setSearchQuery(val);
    doSearch(val);
  };

  // ─── La situación del socio la dice el BACKEND ───
  //
  // Acá también se calculaba a mano, con su propio redondeo. Sumado al de la lista de socios
  // y al del check-in, el mismo socio podía deber una cantidad de días distinta en cada
  // pantalla — y eso efectivamente pasó: "hace 2 días" en el aviso, "4d vencido" en la lista.
  // Además del `label` corto —el que va en la lista de resultados, donde hay poco lugar—
  // devuelve el dato PARTIDO en dos: `valor` es el número solo, para poder mostrarlo
  // enorme en el cartel de la puerta, y `unidad` es la aclaración chiquita de abajo.
  // Partirlo acá y no en el cartel es lo que evita que alguien lo recomponga con una
  // expresión regular sobre el texto ya armado.
  // ⭐ ACÁ NO SE RECALCULA NADA, Y ES A PROPÓSITO.
  //
  // La puesta al día del conteo vive en el ESPEJO (`lib/localMembers.js`), que es el único
  // dato que se pone viejo. Lo que llega del servidor —los avisos del QR, los que están
  // adentro— ya es fresco por definición: existe porque el servidor lo acaba de procesar. Y
  // además esos avisos NO traen el vencimiento, así que recalcularlos los convertiría en
  // "sin fecha cargada" — un socio al día pasaría a mostrar un guion.
  const getDaysInfo = useCallback((member) => {
    const { situacion, diasVencido, diasRestantes } = member || {};
    if (!situacion || situacion === 'SIN_DATOS') {
      return { label: 'Sin fecha', type: 'unknown', valor: '—', unidad: 'sin fecha cargada' };
    }
    if (situacion === 'INACTIVO') {
      return { label: 'Dado de baja', type: 'expired', valor: '—', unidad: 'dado de baja' };
    }

    if (situacion === 'VENCIDO' || situacion === 'EN_GRACIA') {
      return {
        label: `${diasVencido}d vencido`, type: 'expired',
        valor: String(diasVencido ?? 0),
        unidad: diasVencido === 1 ? 'día vencido' : 'días vencido',
      };
    }

    // ⭐ DÍAS, Y NADA MÁS. El cupo de clases se dio de baja (2026-09-02): se paga el mes y
    // se entra, se vence y hay que renovar. El arancel dice QUÉ pagó el socio, no cuántas
    // visitas le quedan — así que en la puerta hay un solo número y no dos compitiendo.
    const d = diasRestantes ?? 0;
    const label = `${d}d restantes`;
    const detalle = { valor: String(d), unidad: d === 1 ? 'día restante' : 'días restantes' };

    if (d <= 3) return { label, type: 'danger', ...detalle };
    if (d <= 7) return { label, type: 'warning', ...detalle };
    return { label, type: 'ok', ...detalle };
  }, []);

  // ─── ENTRAR POR QR LEVANTA EL MISMO CARTEL QUE ENTRAR A MANO ───
  //
  // Cuando el socio escanea, la confirmación aparece en SU teléfono y ahí moría: en la
  // pantalla del gimnasio no pasaba nada. El socio no tenía dónde ver cuántos días le
  // quedan sin preguntarle a alguien, y la recepcionista solo se enteraba si el socio tenía
  // un PROBLEMA (para eso están los avisos de arriba). El que estaba al día, invisible.
  //
  // Los ya anunciados se recuerdan para no repetir el cartel en cada refresco. ⚠️ Y en la
  // PRIMERA carga se marcan todos sin mostrarlos: abrir la pantalla no tiene por qué
  // disparar los ingresos de los últimos cinco minutos como si acabaran de pasar.
  const anunciados = useRef(null);
  useEffect(() => {
    // Todavía no llegó el primer pedido: no hay nada que sembrar ni que anunciar.
    if (!data) return;

    // ⚠️ LA SIEMBRA VA CON EL PRIMER PEDIDO, NO CON EL PRIMER INGRESO.
    //
    // Acá decía `if (!ingresosQr.length && anunciados.current === null) return;`, que parece
    // razonable y SE COMÍA AL PRIMER SOCIO QUE ESCANEABA. Lo normal es abrir la pantalla sin
    // ingresos de los últimos cinco minutos: con la lista vacía no se sembraba nada, y
    // cuando llegaba el primero se lo tomaba por "el estado inicial" y se lo guardaba sin
    // mostrarlo. Recién aparecía el segundo.
    //
    // Sembrando con el primer pedido —venga vacío o no— la marca de "esto ya estaba" queda
    // puesta desde el arranque, y todo lo que llega después es nuevo de verdad.
    if (anunciados.current === null) {
      anunciados.current = new Set(ingresosQr.map((i) => i.accesoId));
      return;
    }

    const nuevos = ingresosQr.filter((i) => !anunciados.current.has(i.accesoId));
    if (!nuevos.length) return;
    nuevos.forEach((i) => anunciados.current.add(i.accesoId));

    // El más reciente es el que está parado frente a la pantalla.
    const ultimo = nuevos.reduce((a, b) => (a.hora > b.hora ? a : b));
    const info = getDaysInfo(ultimo);
    mostrarAviso({
      name: ultimo.nombre,
      type: info.type === 'expired' ? 'error' : info.type === 'danger' ? 'warning' : 'success',
      accion: 'Entrada por QR',
      valor: info.valor,
      unidad: info.unidad,
      daysLabel: info.label,
      initials: getInitials(ultimo.nombre),
      // Más tiempo que el manual: al que registra la recepcionista ya le habló una persona;
      // el que escaneó solo tiene esta pantalla para enterarse de cuánto le queda.
    }, 6000);
  }, [data, ingresosQr, getDaysInfo, mostrarAviso]);

  // ─── ¿Este socio está adentro AHORA? ───
  //
  // Se cruza contra la lista de "quién está adentro", que esta pantalla ya trae y ahora se
  // refresca sola. Sirve para dos cosas, y la segunda es la que importa:
  //   · mostrarlo en el resultado de la búsqueda ("adentro desde 09:14"), y
  //   · que el botón diga lo que REALMENTE va a pasar.
  //
  // Porque el botón decía siempre "Registrar entrada", pero el servidor decide solo mirando
  // el estado: si el socio ya estaba adentro, ese clic graba una SALIDA. La recepcionista
  // apretaba "entrada", se grababa "salida", y el cartel solo decía "Fulano registrado".
  const visitaAbierta = useCallback(
    (memberId) => checkedIn.find((l) => (l.member?.id || l.memberId) === memberId) || null,
    [checkedIn],
  );

  // Sacar a alguien desde la lista de "quién está adentro".
  //
  // Está acá y no solo en "En el gimnasio" porque el pedido vino del mostrador: cuando el
  // socio se va y avisa, la recepcionista tiene que poder marcarlo SIN cambiar de pantalla.
  // Es el mismo endpoint y el mismo dato: las dos pantallas comparten la clave de caché, así
  // que marcar la salida acá también actualiza la otra.
  const handleCheckOut = async (logId, memberName, memberId) => {
    try {
      const r = await accessService.checkOut(logId, memberId, memberName);
      // Sin conexión no se anuncia "salió": eso lo confirma el servidor. Lo único cierto
      // acá es que quedó guardado, igual que con las entradas.
      showToast(
        r?.encolado ? `Salida de ${memberName} guardada sin conexión` : `${memberName} salió`,
        r?.encolado ? 'warning' : 'success',
      );
      contarPendientes();
      loadData();
    } catch (error) {
      // ⚠️ "Network Error" en inglés era lo que veía la recepcionista, y no dice ni qué pasó
      // ni qué hacer. Sin respuesta del servidor es un problema de conexión; con respuesta,
      // es un rechazo real y se muestra tal cual.
      showToast(
        error?.response
          ? errorService.getMessage(error)
          : 'Sin conexión: la salida NO se registró. Anotala a mano.',
        'error',
      );
    }
  };

  // Marcar el paso de un socio. La DIRECCIÓN la decide el backend; acá solo se muestra.
  const handleCheckIn = async (member) => {
    try {
      const r = await accessService.checkIn(member.id, 'manual', member.fullName);

      // ⚠️ SIN CONEXIÓN EL CARTEL NO DICE "ENTRADA REGISTRADA", Y NO ES UN DETALLE.
      //
      // La dirección —entrada o salida— la decide el SERVIDOR mirando el estado del socio.
      // Acá todavía no se sabe cuál de las dos es, así que anunciar "Entrada registrada"
      // sería inventar la mitad del dato. Se dice lo único que es cierto: quedó guardado.
      if (r?.encolado) {
        // ⭐ Y LOS DÍAS VAN IGUAL. Este cartel salía sin el número, que era exactamente al
        // revés de lo que hace falta: sin internet el servidor no puede avisar nada, así que
        // el único que puede decirle a quien atiende "este socio está vencido" es el conteo
        // local. Justo el caso para el que se construyó, y el único donde no se usaba.
        //
        // El número sale de la copia local, que se recalcula contra el reloj — no es el
        // veredicto congelado del último refresco.
        const info = getDaysInfo(member);
        mostrarAviso({
          name: member.fullName,
          // ⚠️ EL COLOR ES EL DE SIEMPRE, el mismo que con internet. Lo pidió el dueño y
          // tiene razón: EL NÚMERO LO MIRA EL SOCIO, no la recepcionista. Si a alguien al día
          // se le pinta el cartel de amarillo porque el terminal no tiene wifi, lee que hay
          // un problema CON ÉL —y pregunta, o se va preocupado— cuando el problema es del
          // internet del gimnasio y no le incumbe.
          //
          // Que quedó guardado sin conexión es un dato de la CASA, no del socio: se dice en
          // el renglón de abajo, en amarillo, donde lo lee quien atiende.
          type: info.type === 'expired' ? 'error'
            : info.type === 'danger' ? 'warning' : 'success',
          sinConexion: true,
          accion: 'Guardado sin conexión',
          valor: info.valor,
          unidad: info.unidad,
          daysLabel: info.label,
          detalle: 'Se manda solo cuando vuelva internet',
          initials: getInitials(member.fullName),
        });
        setSearchQuery('');
        setSearchResults([]);
        contarPendientes();
        buscadorRef.current?.focus();
        return;
      }

      const daysInfo = getDaysInfo(member);
      const salio = r?.direccion === 'SALIDA';
      const rebote = r?.direccion === 'REBOTE';

      mostrarAviso({
        name: member.fullName,
        // La salida no se colorea por el estado de la cuota: al que se está yendo ya no se
        // le reclama nada, y pintarle la pantalla de rojo en la puerta no sirve para nada.
        type: salio || rebote ? 'success'
          : daysInfo.type === 'expired' ? 'error'
          : daysInfo.type === 'danger' ? 'warning' : 'success',
        accion: rebote ? 'Ya estaba registrado' : salio ? 'Salida registrada' : 'Entrada registrada',
        // Al que se va no se le muestra el vencimiento: ya entrenó, y el número grande sería
        // un reclamo a destiempo. El cartel de salida es una confirmación, nada más.
        valor: salio || rebote ? null : daysInfo.valor,
        unidad: salio || rebote ? '' : daysInfo.unidad,
        daysLabel: salio || rebote ? '' : daysInfo.label,
        // La dirección REAL, en el mismo aviso. Antes esto vivía en un toast aparte que
        // salía AL MISMO TIEMPO que el cartelón: dos mensajes distintos, del mismo hecho,
        // en dos lugares de la pantalla. El que avisa que alguien se fue sin marcar salida
        // es el único que aporta algo que el resto del aviso no dice.
        detalle: r?.recuperado && !salio && !rebote
          ? 'La vez anterior se fue sin marcar salida' : '',
        initials: getInitials(member.fullName),
      });

      setSearchQuery('');
      setSearchResults([]);
      loadData();

      // El campo queda vacío Y con el foco: la fila del mostrador no tiene por qué agarrar
      // el mouse entre un socio y el siguiente.
      buscadorRef.current?.focus();
    } catch (error) {
      // ⚠️ SIN CONEXIÓN, LA ENTRADA NO QUEDA REGISTRADA — Y HAY QUE DECIRLO ASÍ.
      //
      // Buscar al socio sí funciona sin internet (sale de la copia local), pero registrar
      // el paso todavía no: la cola de accesos es la fase que viene. Mientras tanto esto
      // mostraba el "Network Error" crudo de axios, en inglés, que a una recepcionista no
      // le dice nada — y sobre todo no le dice lo único que importa: que esa entrada se
      // perdió y hay que anotarla a mano.
      //
      // Un error de transporte no trae `response`; un rechazo del servidor sí, y ese se
      // muestra tal cual porque dice algo real sobre este socio.
      const sinRed = !error?.response;
      showToast(
        sinRed
          ? 'Sin conexión: la entrada NO se registró. Anotala a mano.'
          : errorService.getMessage(error), // sin el ternario este test no distingue nada
        'error',
      );
    }
  };

  // ─── Enter BUSCA y registra, en un solo gesto ───
  //
  // No espera a la búsqueda retrasada: consulta él mismo. El socio teclea su DNI o su
  // nombre, aprieta Enter y entra, sin que nadie toque el mouse.
  //
  // Con un solo resultado no hay ambigüedad. Con varios NO se elige por él: registrarle la
  // entrada a la persona equivocada deja DOS datos mal —uno que entró sin estar y otro que
  // estaba sin figurar— así que se muestra la lista y alguien decide.
  //
  // Y cuando no aparece nadie, lo DICE. Sin eso, quien atiende no tiene forma de saber si
  // el sistema no encontró al socio o si simplemente no la escuchó.
  const registrando = useRef(false);
  const alTeclear = async (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();

    // ⚠️ Dos Enter seguidos registrarían entrada y en seguida SALIDA, porque la dirección la
    // decide el servidor según si el socio ya está adentro. El socio se iría "afuera" sin
    // haberse movido del gimnasio.
    if (registrando.current) return;

    const q = searchQuery.trim();
    if (q.length < 2) return;

    registrando.current = true;
    try {
      const encontrados = await buscar(q);
      setSearchResults(encontrados);
      if (encontrados.length === 1) {
        await handleCheckIn(encontrados[0]);
      } else if (!encontrados.length) {
        showToast(`No encontré a nadie con "${q}"`, 'error');
      } else {
        showToast('Hay varios socios con esos datos. Elegí cuál.', 'info');
      }
    } finally {
      registrando.current = false;
    }
  };

  return (
    <div className="access-page">
      {/* ─── LA BARRA DE ARRIBA ───
          El título y, para el dueño, el acceso al cartel del QR. Ese cartel se imprime una
          vez y se pega en la puerta: tenerlo desplegado todo el día costaba media pantalla
          del mostrador, que es donde se trabaja. */}
      <div className="access-barra">
        <PageHeader title="Control de Acceso" subtitle="Registro de entradas y salidas" icon="door" />
        {puedeAdministrarQr && (
          <button className="btn btn-secondary" onClick={() => setQrAbierto(true)}>
            <Icon name="qrCode" size="1em" /> Cartel de entrada
          </button>
        )}
      </div>

      {/* Los avisos van ARRIBA del buscador y no cambió: si un socio entró vencido, eso
          tiene que verse antes que lo que la recepcionista esté por hacer ahora. */}
      <AvisosMostrador avisos={avisos} onAtendido={loadData} />

      {/* ─── EL CUERPO: DOS COLUMNAS QUE ENTRAN EN UNA PANTALLA ───
          Izquierda el molinete (teclear, Enter, el que sigue). Derecha quién está adentro,
          para marcar salidas sin moverse de acá. Cada una scrollea por dentro si hace falta:
          la PÁGINA no se mueve, que es lo que se pidió. */}
      <div className="access-cuerpo">
        <section className="checkin-section">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Icon name="checkCircle" size="1em" /> Registrar Entrada</h3>
          <div className="search-box">
            {/* `autoFocus` es el arranque; lo que lo mantiene es el efecto de más arriba.
                `enterKeyHint` le pide al teclado del celular que la tecla diga "Enter" y no
                "Buscar": lo que hace es registrar la entrada. */}
            <input type="text" className="search-input" placeholder="DNI o nombre, y Enter"
              ref={buscadorRef} autoFocus enterKeyHint="enter"
              value={searchQuery} onChange={e => handleSearch(e.target.value)}
              onKeyDown={alTeclear} />
          </div>
          <EstadoCopiaLocal />
          {/* Lo que se registró sin internet y todavía no subió. Se muestra SOLO cuando hay
              algo: un cartel que está siempre prendido deja de avisar. Y se muestra siempre
              que haya algo, con o sin conexión — mientras quede una visita sin subir, el
              gimnasio no la tiene. */}
          {pendientesCola > 0 && (
            <p className={`copia-local ${cola.dias >= 3 ? 'is-muy-vieja' : 'is-vieja'}`}>
              <Icon name={cola.dias >= 3 ? 'alertTriangle' : 'wifiOff'} size="0.9em" />
              <span>
                {/* "Acceso" y no "entrada", por lo mismo que el aviso del vaciado: acá adentro
                    puede haber salidas, y la dirección no la sabe nadie hasta que el servidor
                    la decide contra el momento en que ocurrió. */}
                {pendientesCola} {pendientesCola === 1 ? 'acceso guardado' : 'accesos guardados'} sin
                conexión
                {/* ⚠️ A partir del tercer día el cartel cambia de tono y DEJA DE PROMETER que
                    se arregla solo. Hasta ahí decir "se manda al volver internet" es cierto y
                    tranquiliza bien; después de tres días ya no volvió, y seguir diciendo lo
                    mismo es lo que hace que nadie llame al proveedor. Acá lo único honesto es
                    decir cuánto hace y que eso está en una sola máquina. */}
                {cola.dias >= 3 ? (
                  <> · hace <strong>{cola.dias} días</strong> que no suben. Están solo en esta
                  computadora: avisá que revisen el internet</>
                ) : cola.dias >= 1 ? (
                  <> {cola.dias === 1 ? 'desde ayer' : `hace ${cola.dias} días`} · se{' '}
                  {pendientesCola === 1 ? 'manda' : 'mandan'} al volver internet</>
                ) : (
                  <> · se {pendientesCola === 1 ? 'manda' : 'mandan'} al volver internet</>
                )}
              </span>
            </p>
          )}
          {searching && <div className="text-center text-muted mb-1"><span className="spinner" /> Buscando...</div>}
          {searchResults.length > 0 && (
            <div className="search-results">
              {searchResults.map(member => {
                const daysInfo = getDaysInfo(member);
                const isExpired = daysInfo.type === 'expired';
                const visita = visitaAbierta(member.id);
                const adentro = !!visita;
                return (
                  <div key={member.id} className="search-result-item">
                    <div className="member-avatar">{getInitials(member.fullName)}</div>
                    <div className="member-info">
                      <div className="member-name">{member.fullName}</div>
                      <div className="member-dni">DNI: {member.dni || '-'}</div>
                      {/* El estado, al instante y sin abrir nada: es lo que decide si hay que
                          hablarle al socio antes de dejarlo pasar. */}
                      <span className={`member-access-status ${isExpired ? 'is-expired' : 'is-active'}`}>
                        {daysInfo.label}
                      </span>
                      {adentro && (
                        <span className="member-access-status is-inside">
                          Adentro desde {new Date(visita.checkInAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>
                    <div className="search-result-right">
                      <div className={`days-countdown ${daysInfo.type === 'ok' ? 'days-ok' : daysInfo.type === 'warning' ? 'days-warning' : daysInfo.type === 'expired' || daysInfo.type === 'danger' ? 'days-danger' : 'days-none'}`}>
                        {daysInfo.label}
                      </div>
                      {/* El botón dice lo que REALMENTE va a pasar: el servidor decide la
                          dirección mirando si el socio ya está adentro. */}
                      {adentro ? (
                        <button className="btn btn-sm btn-secondary" onClick={() => handleCheckIn(member)}>
                          <Icon name="door" size="0.9em" /> Registrar salida
                        </button>
                      ) : (
                        <button className="btn btn-sm btn-primary" onClick={() => handleCheckIn(member)}>
                          <Icon name="checkCircle" size="0.9em" /> Registrar entrada
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ─── QUIÉN ESTÁ ADENTRO, AL LADO DEL BUSCADOR ───
            Pedido del mostrador: cuando el socio se va y avisa, hay que poder marcarle la
            salida SIN cambiar de módulo. La misma lista vive también en "En el gimnasio",
            que es la pantalla para mirar; esta es la de trabajar. Comparten el pedido y la
            caché, así que marcar acá deja la otra al día sola. */}
        <aside className="card access-adentro">
          <div className="table-header">
            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Icon name="building" size="1.2em" />
              En el {orgLabelCap} ahora
            </h3>
            <span className="people-count"><Icon name="users" size="1em" /> {checkedIn.length}</span>
          </div>
          <div className="checked-in-list">
            {/* ⚠️ SIN RED NO SE GIRA EL SPINNER, SE DICE LA VERDAD.
                Quién está adentro es lo ÚNICO de esta pantalla que el terminal no puede
                saber por su cuenta: la dirección la decide el servidor, y sin él no hay
                respuesta posible. Un spinner ahí promete algo que no va a llegar, y quien
                atiende se queda esperando en vez de resolver por otro lado. */}
            {!enLinea && checkedIn.length === 0 ? (
              <div className="text-center text-muted" style={{ padding: '2rem' }}>
                Sin conexión · no se puede saber quién está adentro
              </div>
            ) : loading ? (
              <div className="text-center text-muted" style={{ padding: '2rem' }}><span className="spinner" /> Cargando...</div>
            ) : checkedIn.length === 0 ? (
              <div className="text-center text-muted" style={{ padding: '2rem' }}>Nadie en el {orgLabel}</div>
            ) : checkedIn.map(log => {
              const member = log.member;
              const memberName = member?.fullName || 'Socio';
              return (
                <div key={log.id} className="checked-in-item">
                  <div className="member-avatar">{getInitials(memberName)}</div>
                  <div className="member-info">
                    <div className="member-name">{memberName}</div>
                    <div className="checkin-time">Entrada: {getRelativeTime(log.checkInAt)}</div>
                  </div>
                  {/* El id del socio va sí o sí: sin él, sin conexión no hay a quién encolarle
                      la salida y el botón vuelve a no hacer nada. */}
                  <button className="checkout-btn" onClick={() => handleCheckOut(log.id, memberName, member?.id)}>
                    <Icon name="handWave" size="1em" /> Salida
                  </button>
                </div>
              );
            })}
          </div>
        </aside>
      </div>

      {/* El cartel del QR, sin ocupar la pantalla mientras no se lo pide. */}
      <Modal isOpen={qrAbierto} onClose={() => setQrAbierto(false)} title="Cartel de entrada">
        <CheckinQrPanel puedeAdministrar={puedeAdministrarQr} />
      </Modal>

      {/* ─── El aviso de entrada, al costado izquierdo ───

          ⚠️ Acá había un overlay de pantalla completa (negro al 70%, con blur) y un cartelón
          centrado, tres segundos por persona. Decía lo correcto, pero mientras estaba puesto
          NADIE PODÍA TIPEAR: el molinete se trababa solo, y justo cuando había cola.

          Ahora entra por la izquierda, no tapa nada y no se puede clickear (`pointer-events`
          en el CSS): el foco se queda en el campo del DNI aunque el aviso caiga justo debajo
          del mouse. Se apila para que un socio no le borre el aviso al anterior. */}
      {avisosDeEntrada.length > 0 && (
        <div className="acceso-avisos" aria-live="polite">
          {avisosDeEntrada.map((aviso) => (
            <div key={aviso.id} className={`acceso-aviso ${aviso.type}`}>
              <div className="acceso-aviso-cabecera">
                <div className="acceso-aviso-inicial">{aviso.initials}</div>
                <div className="acceso-aviso-nombre">{aviso.name}</div>
              </div>

              {/* ⭐ EL NÚMERO ES EL CARTEL. Esta pantalla está a la vista de todo el
                  mostrador, y lo que el socio quiere saber al pasar es una sola cosa:
                  cuánto le queda. Tiene que leerse de lejos, sin acercarse ni preguntar. */}
              {aviso.valor != null && (
                <div className="acceso-aviso-cifra">
                  <strong>{aviso.valor}</strong>
                  <span>{aviso.unidad}</span>
                </div>
              )}

              <div className="acceso-aviso-pie">
                {/* QUÉ se registró, no solo a quién: el servidor decide la dirección, así que
                    sin esto se puede apretar "entrada", grabarse una SALIDA y no enterarse. */}
                <div className={`acceso-aviso-accion${aviso.sinConexion ? ' sin-conexion' : ''}`}>
                  {aviso.accion}
                </div>
                {aviso.detalle && <div className="acceso-aviso-detalle">{aviso.detalle}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
