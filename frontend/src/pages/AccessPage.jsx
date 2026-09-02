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
import { useQueryCache } from '../hooks';
import { GYM } from '../lib/gym';
import { PageHeader } from '../components/Layout';
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
  const { data, loading, invalidate } = useQueryCache(
    'mostrador',
    () => accessService.getMostrador(),
    { staleTime: 10000 },
  );

  const checkedIn = useMemo(() => data?.adentro || [], [data]);
  const todayLogs = useMemo(() => data?.hoy || [], [data]);
  const avisos = useMemo(() => data?.avisos || [], [data]);

  const loadData = invalidate;

  // ── El mostrador se entera solo de lo que pasa en la puerta ──
  //
  // Antes esta pantalla cargaba UNA vez, al abrirla, y nunca más. Con el mostrador manual no
  // se notaba: la recepcionista marcaba y la lista se refrescaba después de su propio clic.
  // Con el QR el que marca es el socio desde su celular, así que acá no llegaba nada — había
  // que salir del módulo y volver a entrar para que apareciera, y lo mismo al salir.
  //
  // Solo con la pestaña a la vista: un terminal olvidado abierto toda la noche no tiene por
  // qué seguir preguntando. Y al volver a la pestaña refresca en el acto, sin esperar el
  // próximo ciclo — que es justo cuando la recepcionista vuelve a mirar la pantalla.
  useEffect(() => {
    const refrescarSiVisible = () => {
      if (document.visibilityState === 'visible') loadData();
    };
    const t = setInterval(refrescarSiVisible, 15000);
    document.addEventListener('visibilitychange', refrescarSiVisible);
    window.addEventListener('focus', refrescarSiVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', refrescarSiVisible);
      window.removeEventListener('focus', refrescarSiVisible);
    };
  }, [loadData]);

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
  const getDaysInfo = (member) => {
    const { situacion, diasVencido, diasRestantes, clasesRestantes } = member || {};
    if (!situacion || situacion === 'SIN_DATOS') return { label: 'Sin fecha', type: 'unknown' };
    if (situacion === 'INACTIVO') return { label: 'Dado de baja', type: 'expired' };

    // Se le acabó el cupo de visitas del abono, con la cuota al día. En la puerta la
    // diferencia con "vencido" es toda: a este socio no hay que cobrarle una deuda, hay que
    // venderle más clases.
    if (situacion === 'SIN_CLASES') return { label: 'Sin clases', type: 'expired' };

    if (situacion === 'VENCIDO' || situacion === 'EN_GRACIA') {
      return { label: `${diasVencido}d vencido`, type: 'expired' };
    }
    const d = diasRestantes ?? 0;
    // Con cupo, se muestran las clases: es el número que le importa a quien viene seguido,
    // y el que se va a acabar antes que la fecha.
    const label = clasesRestantes != null
      ? `${clasesRestantes} clases · ${d}d`
      : `${d}d restantes`;
    if (d <= 3 || (clasesRestantes != null && clasesRestantes <= 2)) return { label, type: 'danger' };
    if (d <= 7 || (clasesRestantes != null && clasesRestantes <= 5)) return { label, type: 'warning' };
    return { label, type: 'ok' };
  };

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

  // Marcar el paso de un socio. La DIRECCIÓN la decide el backend; acá solo se muestra.
  const handleCheckIn = async (member) => {
    try {
      const r = await accessService.checkIn(member.id, 'manual');
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
      showToast(errorService.getMessage(error), 'error');
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

  // Check-out
  const handleCheckOut = async (logId, memberName) => {
    try {
      await accessService.checkOut(logId);
      showToast(`${memberName} salió`, 'success');
      loadData();
    } catch (error) {
      showToast(errorService.getMessage(error), 'error');
    }
  };

  // Stats
  //
  // ⚠️ EL TOTAL Y EL PROMEDIO LOS MANDA EL BACKEND, no salen de `todayLogs`.
  //
  // `hoy` llega RECORTADO: la pantalla muestra 30 filas, y mandar los 250 accesos de un día
  // entero —cada uno con la ficha completa del socio— es cientos de fichas viajando por la
  // conexión del gimnasio cada quince segundos para pintar 30 renglones. Contar esa lista
  // diría "60 accesos" en un gimnasio que tuvo 250, y el promedio saldría de una muestra
  // cortada. El backend los calcula sobre el día COMPLETO y los manda aparte.
  //
  // Se conserva la cuenta local como respaldo: contra un backend que todavía no los mande,
  // un número aproximado es mejor que un hueco en la pantalla.
  const stats = useMemo(() => {
    // `null` en el promedio es una respuesta válida —"ninguna visita cerró todavía"— y es
    // distinto de que este backend no mande el dato. Por eso se pregunta por la CLAVE.
    const resumenDelBackend = !!data && 'hoyTotal' in data;
    const promedioLocal = () => {
      const completed = todayLogs.filter(l => l.checkOutAt);
      if (completed.length === 0) return '-';
      const avg = completed.reduce((sum, l) => {
        return sum + (new Date(l.checkOutAt) - new Date(l.checkInAt));
      }, 0) / completed.length;
      return `${Math.round(avg / 60000)} min`;
    };
    return {
      inGym: checkedIn.length,
      totalToday: resumenDelBackend ? data.hoyTotal : todayLogs.length,
      avgTime: resumenDelBackend
        ? (data.hoyPromedioMin == null ? '-' : `${data.hoyPromedioMin} min`)
        : promedioLocal(),
    };
  }, [checkedIn, todayLogs, data]);

  return (
    <div className="access-page">
      <PageHeader title="Control de Acceso" subtitle="Registro de entradas y salidas" icon="door" />

      {/* Stats */}
      <div className="stats-grid mb-3" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className="stat-card">
          <div className="stat-icon stat-icon-success"><Icon name="users" /></div>
          <div className="stat-content">
            <div className="stat-value">{stats.inGym}</div>
            <div className="stat-label">En el {orgLabel}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon stat-icon-primary"><Icon name="door" /></div>
          <div className="stat-content">
            <div className="stat-value">{stats.totalToday}</div>
            <div className="stat-label">Accesos hoy</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon stat-icon-accent"><Icon name="clock" /></div>
          <div className="stat-content">
            <div className="stat-value">{stats.avgTime}</div>
            <div className="stat-label">Tiempo promedio</div>
          </div>
        </div>
      </div>

      {/* Check-in + Currently In */}
      <div className="access-grid">
        {/* El cartel del QR vive acá y no en Ajustes: es parte de operar la puerta, no de
            configurar el negocio. Quien maneja los accesos es quien lo necesita a mano. */}
        <CheckinQrPanel puedeAdministrar={['owner', 'admin'].includes(orgRole)} />

        {/* Los avisos van DEBAJO del cartel y ARRIBA del buscador. Lo segundo es lo que
            importa y no cambió: si un socio entró vencido, eso tiene que verse antes que
            lo que la recepcionista esté por hacer ahora. El cartel del QR no compite por
            esa atención — no es una acción, es un papel que se imprime una vez. */}
        <AvisosMostrador avisos={avisos} onAtendido={loadData} />

        {/* Check-in Search */}
        <div className="checkin-section">
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
                      {/* Estado visible al instante (sin tener que registrar entrada) */}
                      <span className={`member-access-status ${isExpired ? 'is-expired' : 'is-active'}`}>
                        <Icon name={isExpired ? 'xCircle' : 'checkCircle'} size="0.85em" />
                        {isExpired ? 'Vencido' : 'Activo'}
                      </span>
                      {/* Que ya esté adentro es lo primero que la recepcionista necesita
                          saber: cambia qué hace ese botón. Si marcó entrada por el QR y
                          nadie lo dice acá, el mostrador lo vuelve a "ingresar" y en
                          realidad lo está sacando. */}
                      {adentro && (
                        <span className="member-access-status is-inside">
                          <Icon name="door" size="0.85em" />
                          Adentro desde {new Date(visita.checkInAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>
                    <div className="search-result-right">
                      <div className={`days-countdown ${daysInfo.type === 'ok' ? 'days-ok' : daysInfo.type === 'warning' ? 'days-warning' : daysInfo.type === 'expired' || daysInfo.type === 'danger' ? 'days-danger' : 'days-none'}`}>
                        {daysInfo.label}
                      </div>
                      {/* El botón dice lo que va a pasar de verdad. Antes decía siempre
                          "Registrar entrada" y grababa una SALIDA si el socio ya estaba
                          adentro — la recepcionista no tenía forma de saberlo. */}
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
        </div>

        {/* Currently In Gym */}
        <div className="card currently-in">
          <div className="table-header">
            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Icon name="building" size="1.2em" />
              En el {orgLabelCap}
            </h3>
            <span className="people-count"><Icon name="users" size="1em" /> {checkedIn.length}</span>
          </div>
          <div className="checked-in-list" style={{ padding: '0 1rem 1rem' }}>
            {loading ? (
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
                <button className="checkout-btn" onClick={() => handleCheckOut(log.id, memberName)}>
                  <Icon name="handWave" size="1em" /> Salida
                </button>
              </div>
            )})}
          </div>
        </div>
      </div>

      {/* Today's Log */}
      <div className="card mt-3">
        <div className="table-header">
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}><Icon name="fileText" size="1em" /> Registro de hoy</h3>
          {/* El total real del día, no el largo de la lista recortada. */}
          <span className="text-muted">{stats.totalToday} accesos</span>
        </div>
        <div className="table-container">
          <table className="table">
            <thead><tr><th>Socio</th><th>DNI</th><th>Entrada</th><th>Salida</th><th>Método</th></tr></thead>
            <tbody>
              {todayLogs.length === 0 ? (
                <tr><td colSpan="5" className="text-center text-muted" style={{ padding: '2rem' }}>Sin accesos hoy</td></tr>
              ) : todayLogs.slice(0, 30).map(log => {
                const member = log.member;
                return (
                <tr key={log.id}>
                  <td data-label="Socio"><strong>{member?.fullName || 'Socio'}</strong></td>
                  <td data-label="DNI">{member?.dni || '-'}</td>
                  <td data-label="Entrada">{log.checkInAt ? new Date(log.checkInAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '-'}</td>
                  <td data-label="Salida">{log.checkOutAt ? new Date(log.checkOutAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : <span className="badge badge-success">Adentro</span>}</td>
                  <td data-label="Método">
                    {(log.accessMethod || '').toLowerCase() === 'manual' ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}><Icon name="hand" size="0.9em" /> Manual</span>
                    ) : (log.accessMethod || '').toLowerCase() === 'qr' ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}><Icon name="qrCode" size="0.9em" /> QR</span>
                    ) : (log.accessMethod || '-')}
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
      </div>

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
              <div className="acceso-aviso-inicial">{aviso.initials}</div>
              <div className="acceso-aviso-texto">
                <div className="acceso-aviso-nombre">{aviso.name}</div>
                {/* QUÉ se registró, no solo a quién: el servidor decide la dirección, así que
                    sin esto se puede apretar "entrada", grabarse una SALIDA y no enterarse. */}
                <div className="acceso-aviso-accion">{aviso.accion}</div>
                {aviso.detalle && <div className="acceso-aviso-detalle">{aviso.detalle}</div>}
              </div>
              {aviso.daysLabel && (
                <div className="acceso-aviso-dias">{aviso.daysLabel}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
