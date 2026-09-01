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

  // Success popup
  const [popup, setPopup] = useState(null);

  // ── El teclado apunta al buscador, siempre ──
  //
  // El socio llega al mostrador y teclea su DNI. Antes había que hacer clic en el campo
  // primero, y si nadie lo hacía las teclas se perdían: el primer par de dígitos no
  // entraba y el DNI quedaba cortado, que es peor que no escribir nada.
  const buscadorRef = useRef(null);

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
  const avisos = useMemo(() => data?.avisos || [], [data]);
  const ingresosQr = useMemo(() => data?.ingresos || [], [data]);

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
  // lista mientras se tipea. Están separadas porque Enter NO puede depender del retraso:
  // quien atiende teclea el DNI y aprieta Enter en menos de 300 ms, y si Enter mirara lo
  // que la búsqueda retrasada dejó, encontraría la lista vacía y no haría nada. En un
  // mostrador eso se ve como que el sistema se colgó.
  const buscar = useCallback(async (query) => {
    const q = (query || '').trim();
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
  // ── El QR también se anuncia en el mostrador ──
  //
  // Cuando el socio escanea el cartel, la confirmación aparece en SU teléfono. Acá no
  // pasaba nada: el socio no tenía dónde ver cuántos días le quedan sin preguntarle a
  // alguien, y la recepcionista solo se enteraba si el socio tenía un problema (eso ya lo
  // hacían los avisos). Ahora entrar por QR levanta el MISMO cartel que registrar la
  // entrada a mano.
  //
  // Los ya anunciados se recuerdan para no repetir el cartel en cada refresco. En la
  // primera carga se marcan todos sin mostrarlos: abrir la pantalla no tiene por qué
  // disparar los ingresos de los últimos cinco minutos como si acabaran de pasar.
  const anunciados = useRef(null);
  useEffect(() => {
    if (!ingresosQr.length && anunciados.current === null) return;

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
    setPopup({
      name: ultimo.nombre,
      type: info.type === 'expired' ? 'error' : info.type === 'danger' ? 'warning' : 'success',
      accion: 'Entrada por QR',
      daysLabel: info.label,
      initials: getInitials(ultimo.nombre),
    });
    // Más que el manual: al que registra la recepcionista ya le habló una persona; el que
    // escaneó solo tiene esta pantalla para enterarse de cuánto le queda.
    setTimeout(() => setPopup(null), 6000);
  }, [ingresosQr]);

  // ══════════════════════════════════════════════════════════════════════════════
  //  EL TECLADO NUNCA SE APAGA
  // ══════════════════════════════════════════════════════════════════════════════
  //
  // Esta pantalla se usa como un molinete: el socio llega, teclea su DNI y entra. Que el
  // campo tenga el foco no es una comodidad, es LA función. Y el foco se perdía por
  // motivos que nadie en un mostrador puede adivinar: alguien tocó la pantalla en un lugar
  // vacío, apretó un botón, volvió de otra sección. A partir de ahí las teclas caían en la
  // nada y el sistema parecía colgado.
  //
  // Se ataca por los tres lados por los que se perdía:
  //
  //   1. TECLA SUELTA — si alguien escribe con el foco en cualquier otro lado, la primera
  //      tecla se lleva el foco al campo Y SE ESCRIBE. Sin esto el primer dígito del DNI
  //      se perdía, que es peor que no escribir nada: el número queda cortado y el socio
  //      "no existe".
  //   2. CLIC EN CUALQUIER LADO — después de tocar la pantalla el foco vuelve al campo.
  //   3. VOLVER A LA VENTANA — al minimizar y volver, o al cambiar de sección y regresar.
  //
  // Lo que NO se toca: si el foco está en otro campo de texto o en un diálogo, no se lo
  // roba. Alguien puede estar escribiendo en el buscador del cartel del QR, y arrancarle
  // el teclado de las manos sería el mismo bug al revés.
  const enfocarBuscador = useCallback(() => {
    const el = buscadorRef.current;
    if (!el || document.activeElement === el) return;
    // Ni diálogos ni otros campos: ahí el foco es de quien lo tiene.
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
      if (e.ctrlKey || e.altKey || e.metaKey) return;      // atajos del sistema
      if (esCampoAjeno(e.target)) return;                   // ya está escribiendo en otro lado
      if (e.target?.closest?.('[role="dialog"], .modal-overlay, .modal-container')) return;
      // Un solo carácter imprimible, o borrar. Las flechas, Tab y F5 siguen siendo suyas.
      const escribible = e.key.length === 1 || e.key === 'Backspace';
      if (!escribible) return;
      const el = buscadorRef.current;
      if (!el || document.activeElement === el) return;
      el.focus();
      // La tecla que disparó esto se procesa igual porque el navegador la entrega DESPUÉS
      // del focus(), así que no hay que reescribirla a mano. Si algún día deja de ser así,
      // acá va: setSearchQuery(q => q + e.key).
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

  // Enter BUSCA y registra, en un solo gesto.
  //
  // No espera a la búsqueda retrasada: consulta él mismo. Así el socio teclea su DNI,
  // aprieta Enter y entra, sin que nadie toque el mouse.
  //
  // Con un solo resultado no hay ambigüedad. Con varios NO se elige por él —registrarle la
  // entrada a la persona equivocada deja dos datos mal: uno que entró sin estar y otro que
  // estaba sin figurar— así que se muestra la lista y alguien decide.
  //
  // Y cuando no aparece nadie lo DICE. Antes no pasaba nada y quien atiende no tenía forma
  // de saber si el sistema no encontró al socio o si simplemente no la escuchó.
  const registrando = useRef(false);
  const alTeclear = async (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();

    // Dos Enter seguidos registrarían entrada y en seguida SALIDA, porque la dirección la
    // decide el servidor según si el socio ya está adentro. El socio se iría "afuera" sin
    // haberse ido.
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

  const handleCheckIn = async (member) => {
    try {
      const r = await accessService.checkIn(member.id, 'manual');
      const daysInfo = getDaysInfo(member);
      const salio = r?.direccion === 'SALIDA';
      const rebote = r?.direccion === 'REBOTE';

      setPopup({
        name: member.fullName,
        // La salida no se colorea por el estado de la cuota: al que se está yendo ya no se
        // le reclama nada, y pintarle la pantalla de rojo en la puerta no sirve para nada.
        type: salio || rebote ? 'success'
          : daysInfo.type === 'expired' ? 'error'
          : daysInfo.type === 'danger' ? 'warning' : 'success',
        accion: rebote ? 'Ya estaba registrado' : salio ? 'Salida registrada' : 'Entrada registrada',
        daysLabel: salio || rebote ? '' : daysInfo.label,
        initials: getInitials(member.fullName),
      });

      setTimeout(() => setPopup(null), 3000);

      setSearchQuery('');
      setSearchResults([]);
      loadData();
      // El foco vuelve al campo: la fila del mostrador no tiene por qué agarrar el mouse
      // entre un socio y el siguiente.
      buscadorRef.current?.focus();

      // El mensaje nombra la dirección REAL. Antes decía "registrado" a secas y la
      // recepcionista no tenía forma de saber qué había quedado grabado.
      showToast(
        rebote ? `${member.fullName}: ya estaba registrado`
          : salio ? `Salida de ${member.fullName}`
          : r?.recuperado
            ? `Entrada de ${member.fullName} — la vez anterior se fue sin marcar salida`
            : `Entrada de ${member.fullName}`,
        'success',
      );
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

  // Las estadísticas del día —cuántos entraron, cuánto se quedan— y el registro de hoy
  // se mudaron a Reportes. No es información de la PUERTA: nadie decide nada con ella
  // mientras hay un socio esperando del otro lado del mostrador, y ocupaba la mitad de la
  // pantalla que la recepcionista mira todo el día.

  return (
    <div className="access-page">
      <PageHeader title="Entrada" subtitle="El socio escribe su DNI y aprieta Enter, o escanea el cartel" icon="door" />

      {/* Check-in + Currently In */}
      {/* ── UNA SOLA COLUMNA, DE ARRIBA HACIA ABAJO ──
          Antes esto era una grilla de dos columnas y las cosas caían donde entraran: el
          cartel del QR —que se imprime una vez y no se toca más— quedaba arriba a la
          izquierda, en el lugar de más peso de la pantalla, y el campo donde se teclea el
          DNI cien veces por día quedaba abajo.
          Ahora el orden es el de la puerta: primero lo que hay que atender, después lo que
          se usa siempre, después quién está adentro, y el cartel al final. Una sola
          columna además se acomoda sola en cualquier pantalla, que es lo que necesita un
          cliente con una PC y otro con dos. */}
      <div className="access-stack">
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
              onChange={e => handleSearch(e.target.value)}
              onKeyDown={alTeclear}
              autoFocus
              autoComplete="off"
              // El teclado numérico en tablets: el mostrador tipea DNIs todo el día.
              inputMode="text"
            />
          </div>
          {/* ── Los que acaban de entrar por QR ──
              El cartel dura unos segundos y el mostrador se refresca cada quince, así que
              el socio que escaneó en la puerta puede llegar acá y encontrárselo ya cerrado.
              Esta lista NO se va: el socio camina hasta el mostrador, se busca y ve cuánto
              le queda sin tener que preguntarle a nadie. Se vacía sola —el servidor manda
              solo los últimos minutos— así que no hay que limpiarla ni ocultarla. */}
          {ingresosQr.length > 0 && (
            <div className="ingresos-qr">
              <div className="ingresos-qr-titulo">
                <Icon name="qrCode" size="0.95em" /> Recién entraron por QR
              </div>
              <div className="ingresos-qr-lista">
                {ingresosQr.map((i) => {
                  const info = getDaysInfo(i);
                  return (
                    <div key={i.accesoId} className="ingresos-qr-item">
                      <div className="member-avatar">{getInitials(i.nombre)}</div>
                      <div className="ingresos-qr-datos">
                        <div className="member-name">{i.nombre}</div>
                        <div className="member-dni">
                          {new Date(i.hora).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                      <div className={`days-countdown ${info.type === 'ok' ? 'days-ok' : info.type === 'warning' ? 'days-warning' : info.type === 'expired' || info.type === 'danger' ? 'days-danger' : 'days-none'}`}>
                        {info.label}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

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

      {/* El cartel del QR va último: se imprime una vez y se pega en la pared. Vive en esta
          pantalla —y no en Ajustes— porque es parte de operar la puerta, pero no compite
          por el lugar de arriba con lo que se usa todo el día. */}
      <CheckinQrPanel puedeAdministrar={['owner', 'admin'].includes(orgRole)} />

      {/* Success Popup */}
      {popup && (
        <>
          <div className="access-popup-overlay active" onClick={() => setPopup(null)} />
          <div className={`checkin-success active ${popup.type}`}>
            <div className="popup-member-photo"><span className="initials">{popup.initials}</span></div>
            <div className="popup-member-name">{popup.name}</div>
            {/* QUÉ se registró, no solo a quién. Este cartel decía únicamente el nombre, así
                que la recepcionista podía apretar "entrada", grabarse una salida, y no
                enterarse jamás. */}
            <div className="popup-accion">{popup.accion}</div>
            {popup.daysLabel && (
              <div className="popup-days-info"><span className="popup-days-label">{popup.daysLabel}</span></div>
            )}
            <div className="popup-progress-container"><div className="popup-progress-bar" /></div>
          </div>
        </>
      )}
    </div>
  );
}
