// ============================================
// VELTRONIK V2 - CONTROL DE ACCESO (gym)
// ============================================
// Mostrador de recepción: buscar al socio, registrar su entrada/salida y ver
// quién está adentro ahora mismo.
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

  // ── LA FILA DEL MOSTRADOR ──
  //
  // Acá había un cartel con una capa que TAPABA la pantalla y se cerraba a los 3 segundos.
  // Con cinco personas esperando, eso hace imposible encadenar: cada registro le corta el
  // paso al siguiente.
  //
  // Un mostrador es una FILA, no un diálogo. Ahora cada registro se apila a un costado, no
  // bloquea nada, y el campo ya está esperando el DNI que sigue. Cinco personas son cinco
  // tarjetas, no cinco interrupciones.
  const [pila, setPila] = useState([]);

  const anunciar = useCallback((item) => {
    const id = `${Date.now()}-${Math.random()}`;
    setPila((p) => [{ ...item, id }, ...p].slice(0, 4));
    // Se van solas. 8 segundos alcanzan para que el socio las lea caminando al vestuario,
    // sin que la pantalla quede llena de gente que ya entró hace rato.
    setTimeout(() => setPila((p) => p.filter((x) => x.id !== id)), 8000);
  }, []);

  // El campo donde se teclea. Que tenga el foco no es una comodidad: es LA función.
  const buscadorRef = useRef(null);

  // Candado: dos Enter seguidos grabarían entrada y en seguida SALIDA, porque la dirección
  // la decide el servidor según si el socio ya está adentro. El socio quedaría "afuera" sin
  // haberse ido.
  const registrando = useRef(false);

  // Espejos de lo que el listener global necesita leer. Un listener registrado una sola vez
  // se queda con el `searchQuery` del primer render: sin estos, escribir con el foco
  // perdido siempre partiría del campo vacío y se comería lo ya tecleado.
  const queryRef = useRef('');
  const handleSearchRef = useRef(() => {});

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

  // ── Buscar, en dos capas ──
  //
  // `buscar` consulta y devuelve. `doSearch` es la versión retrasada que además pinta la
  // lista mientras se tipea. Están separadas porque ENTER NO PUEDE DEPENDER DEL RETRASO:
  // quien atiende teclea el DNI y aprieta Enter en menos de 300 ms, y si Enter mirara lo que
  // dejó la búsqueda retrasada encontraría la lista vacía y no haría nada. En un mostrador
  // eso se ve como que el sistema se colgó.
  const buscar = useCallback(async (query) => {
    // Un DNI se lee "45.374.169" y se tipea así. Los puntos no son parte del número.
    const q = (query || '').trim().replace(/^(d[d.]*)$/, (t) => t.replace(/./g, ''));
    if (q.length < 2) return [];
    setSearching(true);
    try {
      return (await memberService.searchForAccess(q)) || [];
    } catch {
      return [];
    } finally {
      setSearching(false);
    }
  }, []);

  const doSearch = useMemo(() => debounce(async (query) => {
    if (!query || query.trim().length < 2) { setSearchResults([]); return; }
    setSearchResults(await buscar(query));
  }, 300), [buscar]);

  const handleSearch = useCallback((val) => {
    queryRef.current = val;
    setSearchQuery(val);
    doSearch(val);
  }, [doSearch]);

  // El listener global lee de acá, así no se queda con la versión del primer render.
  // Se actualiza en un efecto y no durante el render: React se reserva el derecho de
  // descartar un render a medias, y escribir un ref ahí puede dejar una función que
  // corresponde a un estado que nunca existió.
  useEffect(() => { handleSearchRef.current = handleSearch; }, [handleSearch]);

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
  // ══════════════════════════════════════════════════════════════════════════════
  //  EL TECLADO NUNCA SE APAGA
  // ══════════════════════════════════════════════════════════════════════════════
  //
  // Esta pantalla se usa como un molinete: llega el socio, teclea su DNI, entra. Que el
  // campo tenga el foco no es una comodidad, es LA función. Y el foco se perdía por motivos
  // que nadie en un mostrador puede adivinar: alguien tocó la pantalla en un lugar vacío,
  // apretó un botón, volvió de otra sección. A partir de ahí las teclas caen en la nada y
  // el sistema parece colgado.
  //
  // Se ataca por los tres lados por los que se pierde:
  //   1. TECLA SUELTA — la primera tecla se lleva el foco al campo Y SE ESCRIBE. Verificado
  //      en un navegador de verdad: con el foco en el body, tecleando 24732531 el campo
  //      queda con los OCHO dígitos, incluido el primero. Si se perdiera, el DNI llegaría
  //      cortado y el socio "no existiría" — peor que no escribir nada.
  //   2. CLIC EN CUALQUIER LADO — después de tocar la pantalla el foco vuelve.
  //   3. VOLVER A LA VENTANA — al minimizar y volver.
  //
  // Lo que NO se toca: si el foco está en otro campo o en un diálogo, no se lo roba.
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
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      if (esCampoAjeno(e.target)) return;
      if (e.target?.closest?.('[role="dialog"], .modal-overlay, .modal-container')) return;
      // Un carácter imprimible o borrar. Las flechas, Tab y F5 siguen siendo suyas.
      if (!(e.key.length === 1 || e.key === 'Backspace')) return;
      const el = buscadorRef.current;
      if (!el || document.activeElement === el) return;

      // ⚠️ NO ALCANZA CON MOVER EL FOCO.
      //
      // La tentación es hacer solo `el.focus()` y confiar en que el navegador entregue la
      // tecla al campo recién enfocado, porque el texto se inserta DESPUÉS del keydown. En
      // la práctica suele funcionar, pero depende del navegador y del origen del evento —
      // no es una garantía. Y si falla, falla en el peor lugar posible: se pierde el PRIMER
      // dígito del DNI, el número llega cortado y el socio "no existe". Un fallo que se ve
      // como "el sistema no lo encuentra", no como "se perdió una tecla".
      //
      // Así que se escribe a mano y se cancela la acción por defecto. Determinista, sin
      // depender de en qué orden decide entregar las cosas el navegador.
      el.focus();
      e.preventDefault();
      const actual = queryRef.current || '';
      const siguiente = e.key === 'Backspace' ? actual.slice(0, -1) : actual + e.key;
      handleSearchRef.current(siguiente);
    };
    const alTocar = () => setTimeout(enfocarBuscador, 0);

    document.addEventListener('keydown', alTeclearSuelto);
    document.addEventListener('pointerup', alTocar);
    window.addEventListener('focus', enfocarBuscador);
    return () => {
      document.removeEventListener('keydown', alTeclearSuelto);
      document.removeEventListener('pointerup', alTocar);
      window.removeEventListener('focus', enfocarBuscador);
    };
  }, [enfocarBuscador]);

  // ── Enter BUSCA y registra, en un solo gesto ──
  //
  // No espera a la búsqueda retrasada: consulta él mismo. Así el socio teclea su DNI,
  // aprieta Enter y entra, sin que nadie toque el mouse.
  const alTeclear = async (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
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
        // El texto NO se borra: casi siempre es un dígito mal tecleado, y borrarlo obliga
        // a escribir los ocho de nuevo. Se selecciona, así la corrección es escribir encima.
        anunciar({ tipo: 'error', nombre: `No encontré a nadie con "${q}"`, accion: 'Revisá el DNI o el nombre' });
        buscadorRef.current?.select();
      } else {
        // Con varios NO se elige por el socio: registrarle la entrada a la persona
        // equivocada deja DOS datos mal, uno que entró sin estar y otro que estaba sin
        // figurar. Se muestra la lista y alguien decide.
        anunciar({ tipo: 'aviso', nombre: `Hay ${encontrados.length} socios con esos datos`, accion: 'Elegí cuál abajo' });
      }
    } finally {
      registrando.current = false;
    }
  };

  const handleCheckIn = async (member) => {
    try {
      const r = await accessService.checkIn(member.id, 'manual');
      const daysInfo = getDaysInfo(member);
      const salio = r?.direccion === 'SALIDA';
      const rebote = r?.direccion === 'REBOTE';

      anunciar({
        nombre: member.fullName,
        iniciales: getInitials(member.fullName),
        // La salida no se colorea por el estado de la cuota: al que se está yendo ya no se
        // le reclama nada, y pintarle la pantalla de rojo en la puerta no sirve para nada.
        tipo: salio || rebote ? 'ok'
          : daysInfo.type === 'expired' ? 'error'
          : daysInfo.type === 'danger' ? 'aviso' : 'ok',
        accion: rebote ? 'Ya estaba registrado' : salio ? 'Salida registrada' : 'Entrada registrada',
        dias: salio || rebote ? '' : daysInfo.label,
      });

      handleSearch('');
      setSearchResults([]);
      loadData();

      // Listo para el que sigue. Es la mitad del flujo: sin esto, la fila se corta acá.
      buscadorRef.current?.focus();

    } catch (error) {
      showToast(errorService.getMessage(error), 'error');
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
  const stats = useMemo(() => ({
    inGym: checkedIn.length,
    totalToday: todayLogs.length,
    avgTime: todayLogs.length > 0 ? (() => {
      const completed = todayLogs.filter(l => l.checkOutAt);
      if (completed.length === 0) return '-';
      const avg = completed.reduce((sum, l) => {
        return sum + (new Date(l.checkOutAt) - new Date(l.checkInAt));
      }, 0) / completed.length;
      return `${Math.round(avg / 60000)} min`;
    })() : '-',
  }), [checkedIn, todayLogs]);

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
            <input
              ref={buscadorRef}
              type="text"
              className="search-input"
              placeholder="Escribí el DNI o el nombre y apretá Enter"
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              onKeyDown={alTeclear}
              autoFocus
              autoComplete="off"
              spellCheck="false"
            />
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
          <span className="text-muted">{todayLogs.length} accesos</span>
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

      {/* ─── LA FILA ───
          Acá había un cartel con una capa que TAPABA la pantalla y se cerraba a los 3
          segundos. Con cinco personas esperando eso hace imposible encadenar: cada
          registro le corta el paso al siguiente.
          Ahora se apila a un costado y NO bloquea nada. El socio lee sus días caminando al
          vestuario, y el campo ya está esperando el DNI que sigue. */}
      {pila.length > 0 && (
        <div className="fila-avisos" aria-live="polite">
          {pila.map((a) => (
            <div key={a.id} className={`fila-aviso fila-${a.tipo}`}>
              {a.iniciales && <div className="fila-iniciales">{a.iniciales}</div>}
              <div className="fila-datos">
                <div className="fila-nombre">{a.nombre}</div>
                <div className="fila-accion">{a.accion}</div>
              </div>
              {a.dias && <div className="fila-dias">{a.dias}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
