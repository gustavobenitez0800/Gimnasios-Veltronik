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
//
// ⭐ LA PUERTA NO VIVE ACÁ (03/11/2026). El lector de llaveros, la cajita del molinete, lo que
// llega solo (el QR, los frenados) y los sonidos los atiende el PORTERO (contexts/PorteroContext),
// en cualquier pantalla. Esta es la VISTA del mostrador: el buscador, el cartel y quién necesita
// atención, con lo que el portero sabe.
// ============================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { usePortero } from '../contexts/PorteroContext';
import { memberService } from '../services';
import { getInitials, debounce, horaDe } from '../lib/utils';
import EstadoCopiaLocal from '../components/EstadoCopiaLocal';
import AvisosMostrador from '../components/AvisosMostrador';
import CheckinQrPanel from '../components/CheckinQrPanel';
import QrParaEscanear from '../components/QrParaEscanear';
import { PageHeader } from '../components/Layout';
import Modal from '../components/ui/Modal';
import Icon from '../components/Icon';
import { useCajitaMolinete } from '../hooks/useCajitaMolinete';
import { ordenarALaCajita } from '../lib/cajitaMolinete';
import { cuantoLeQueda } from '../lib/cuantoLeQueda';
import { normalizarLlavero, esLlaveroValido } from '../lib/llaveros';

/**
 * ¿Lo que se tecleó puede ser el número de un llavero? Algo de seis caracteres o más, con algún
 * número y sin espacios en el medio: un DNI, un código de lector. Un nombre nunca.
 */
function pareceUnLlavero(texto) {
  const crudo = String(texto ?? '').trim();
  if (/\s/.test(crudo)) return false;
  const codigo = normalizarLlavero(crudo);
  return esLlaveroValido(codigo) && codigo.length >= 6 && /\d/.test(codigo);
}

export default function AccessPage() {
  const { showToast } = useToast();
  const { orgRole } = useAuth();
  const portero = usePortero();
  const {
    avisos, rechazos, cola, tieneCobroSinSubir, recargar: loadData, visitaAbierta, avisosDeEntrada,
    enfocarElBuscador,
  } = portero;
  const pendientesCola = cola.cuantos;

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  // Se tecleó algo que no encontró a nadie y puede ser un llavero: se ofrece asignarlo.
  const [noEncontrado, setNoEncontrado] = useState(null);

  // El campo del DNI. Es el centro de la pantalla y el foco vuelve siempre acá.
  const buscadorRef = useRef(null);

  // El cartel para IMPRIMIR (descargarlo, generar uno nuevo) vive detrás de un botón: se usa
  // una vez. El QR para ESCANEAR está a la vista, al lado del buscador (QrParaEscanear).
  const [qrAbierto, setQrAbierto] = useState(false);
  // Sube al cerrar el cartel: si el dueño generó uno nuevo, el QR de la pantalla se vuelve a
  // pedir. Si no, seguiría mostrando el viejo, que ya no funciona.
  const [versionQr, setVersionQr] = useState(0);
  const puedeAdministrarQr = ['owner', 'admin'].includes(orgRole);

  // La cajita del molinete, solo para el botón «Abrir molinete». La busca y la maneja el portero.
  const cajita = useCajitaMolinete();

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

  // Cuando se cierra un diálogo de la puerta (el llavero sin asignar, el cobro), el portero
  // devuelve el foco acá: la fila del mostrador sigue sin tocar el mouse.
  useEffect(() => enfocarElBuscador(() => buscadorRef.current?.focus()), [enfocarElBuscador]);

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

  // ⚠️ LO QUE SE ESTÁ BUSCANDO AHORA, para que una búsqueda vieja no pinte encima.
  //
  // La búsqueda espera 300 ms; el Enter y el lector de llaveros, no. Si el socio entra antes de
  // que venza la espera, el campo ya quedó vacío pero la búsqueda pendiente seguía viva: a los
  // 300 ms volvía a mostrar la lista con la persona que acababa de entrar. Con el lector pasa
  // siempre, porque escribe el número y el Enter en 30 ms.
  const consultaVigente = useRef('');

  // Search. La búsqueda con espera se arma UNA vez, en un efecto y no mientras se dibuja: así
  // lee `consultaVigente` cuando corre, que es lo que importa, y no en el dibujo.
  const doSearch = useRef(null);
  useEffect(() => {
    doSearch.current = debounce(async (query) => {
      if (consultaVigente.current !== query) return;
      if (!query || query.length < 2) { setSearchResults([]); return; }
      setSearching(true);
      try {
        const results = await memberService.searchForAccess(query);
        if (consultaVigente.current === query) setSearchResults(results || []);
      } catch { setSearchResults([]); }
      finally { setSearching(false); }
    }, 300);
  }, []);

  const handleSearch = (val) => {
    consultaVigente.current = val;
    setSearchQuery(val);
    setNoEncontrado(null);
    doSearch.current?.(val);
  };

  /** El campo vacío y sin resultados, listo para el que sigue. */
  const limpiarBuscador = () => {
    consultaVigente.current = '';
    setSearchQuery('');
    setSearchResults([]);
    setNoEncontrado(null);
  };

  // Marcar el paso de un socio. Lo hace el portero —el mismo cartel, la misma X y la misma
  // cajita que con el llavero o el QR—; acá queda el campo vacío y con el foco, para el que sigue.
  const handleCheckIn = async (member) => {
    const r = await portero.registrarAcceso(member);
    if (!r.ok) return;
    limpiarBuscador();
    buscadorRef.current?.focus();
  };

  /**
   * ⭐ NADIE CON ESE DNI. ¿Y SI ERA UN LLAVERO? (03/11/2026)
   *
   * <p>El lector que escribe más despacio que una ráfaga —o el llavero que alguien teclea a mano—
   * llega como si lo hubiera escrito una persona, y se buscaba como un DNI: «No encontré a nadie».
   * Ahora, si lo tecleado puede ser un llavero, se busca también como llavero: si es de alguien,
   * entra con el llavero; si no es de nadie, se ofrece asignárselo a un socio ahí mismo.</p>
   *
   * <p>No se abre solo el aviso del llavero: un DNI mal tecleado también "puede ser un llavero", y
   * ofrecerle asignarlo a alguien que se equivocó un número sería confundirlo. Lo decide un clic.</p>
   */
  const noEncontreANadie = async (q) => {
    if (!pareceUnLlavero(q)) {
      showToast(`No encontré a nadie con "${q}"`, 'error');
      return;
    }
    let delLlavero = { socios: [], ultimaBaja: null };
    try {
      delLlavero = await memberService.buscarPorLlavero(q);
    } catch { /* sin respuesta: se ofrece igual, que es lo único que se puede hacer */ }

    if (delLlavero.socios.length === 1) {
      const r = await portero.entrarConLlavero(delLlavero.socios[0]);
      if (r?.ok) limpiarBuscador();
      buscadorRef.current?.focus();
      return;
    }
    if (delLlavero.socios.length > 1) {
      setSearchResults(delLlavero.socios);
      showToast('Ese llavero coincide con más de un socio. Elegí cuál.', 'info');
      return;
    }
    setNoEncontrado({ texto: q, codigo: normalizarLlavero(q), ultimaBaja: delLlavero.ultimaBaja });
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
  //
  // (El Enter del LECTOR no llega acá: el portero lo reconoce y se queda con él.)
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
        await noEncontreANadie(q);
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
        <PageHeader title="Control de acceso" subtitle="Registro de entradas y salidas" icon="doorEnter" />
        {puedeAdministrarQr && (
          <button className="btn btn-secondary" onClick={() => setQrAbierto(true)}>
            <Icon name="qrCode" size="1em" /> Cartel de entrada
          </button>
        )}
        {cajita.fase === 'conectada' && (
          <button className="btn btn-secondary" onClick={() => ordenarALaCajita('ABRIR')}
            title="Abre el molinete unos segundos, sin registrar a nadie">
            <Icon name="doorEnter" size="1em" /> Abrir molinete
          </button>
        )}
      </div>

      {/* Los avisos van ARRIBA del buscador y no cambió: si un socio entró vencido, eso
          tiene que verse antes que lo que la recepcionista esté por hacer ahora. */}
      {/* Los frenados por el molinete van primero: a ese socio la puerta ya le dijo que no
          en la cara, así que es el más urgente de atender. Los dos traen «Cobrar»: se le
          cobra acá mismo, sin irse a Socios a buscarlo. */}
      <AvisosMostrador avisos={rechazos} onAtendido={loadData} onCobrar={portero.cobrar} variante="rechazo" />
      <AvisosMostrador avisos={avisos} onAtendido={loadData} onCobrar={portero.cobrar} />

      {/* ─── EL CUERPO: DOS COLUMNAS QUE ENTRAN EN UNA PANTALLA ───
          Izquierda el molinete (teclear, Enter, el que sigue). Derecha el QR, para que el
          socio marque desde el celular. El buscador scrollea por dentro si hace falta: la
          PÁGINA no se mueve, que es lo que se pidió. */}
      <div className="access-cuerpo">
        <section className="checkin-section">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Icon name="checkCircle" size="1em" /> Registrar entrada</h3>
          <div className="search-box">
            {/* `autoFocus` es el arranque; lo que lo mantiene es el efecto de más arriba.
                `enterKeyHint` le pide al teclado del celular que la tecla diga "Enter" y no
                "Buscar": lo que hace es registrar la entrada. `data-lector="vaciar"`: cuando
                pasan un llavero, lo que escribió el lector (y lo de antes) no se queda acá. */}
            <input type="text" className="search-input" placeholder="DNI o nombre y Enter, o pasá el llavero"
              ref={buscadorRef} autoFocus enterKeyHint="enter" data-lector="vaciar"
              value={searchQuery} onChange={e => handleSearch(e.target.value)}
              onKeyDown={alTeclear} />
          </div>
          <EstadoCopiaLocal />
          {/* ⭐ NADIE CON ESE NÚMERO, Y PUEDE SER UN LLAVERO: el botón para asignárselo a alguien. */}
          {noEncontrado && (
            <div className="acceso-no-encontrado" role="status">
              <span>No encontré a nadie con «{noEncontrado.texto}».</span>
              <button type="button" className="btn btn-sm btn-secondary"
                onClick={() => {
                  portero.asignarLlavero(noEncontrado.codigo, noEncontrado.ultimaBaja);
                  setNoEncontrado(null);
                }}>
                <Icon name="key" size="0.9em" /> Es un llavero: asignárselo a un socio
              </button>
            </div>
          )}
          {/* Lo que se registró sin internet y todavía no subió. Se muestra SOLO cuando hay
              algo: un cartel que está siempre prendido deja de avisar. Y se muestra siempre
              que haya algo, con o sin conexión — mientras quede una visita sin subir, el
              gimnasio no la tiene. */}
          {/* ⭐ CUANDO NO ES EL INTERNET, NO SE DICE "AL VOLVER INTERNET". Si el servidor viene
              rechazando lo de adelante, la cola no sube aunque la conexión esté perfecta, y
              prometer que se arregla sola manda a quien atiende a revisar el router. Pasó: un
              gimnasio llamó al técnico por una falla que era nuestra (Santo Sport, 05/10/2026).
              Acá se dice "movimientos" porque en la cola también hay cobros y altas. */}
          {pendientesCola > 0 && cola.trabada && (
            <p className="copia-local is-muy-vieja" role="status">
              <Icon name="alertTriangle" size="0.9em" />
              <span>
                <strong>
                  {pendientesCola} {pendientesCola === 1 ? 'movimiento no pudo' : 'movimientos no pudieron'} subir
                </strong>
                {' '}· no es el internet: el servidor no {pendientesCola === 1 ? 'lo' : 'los'} está
                aceptando. {pendientesCola === 1 ? 'Está guardado' : 'Están guardados'} en esta
                computadora — avisale a Veltronik
              </span>
            </p>
          )}
          {pendientesCola > 0 && !cola.trabada && (
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
                const daysInfo = cuantoLeQueda(member);
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
                          Adentro desde {horaDe(visita.checkInAt)}
                        </span>
                      )}
                      {/* ⭐ PAGÓ, PERO EL SERVIDOR NO SE ENTERÓ TODAVÍA.
                          El vencimiento de arriba lo corre el servidor cuando el cobro sube, así
                          que sin internet sigue diciendo lo que decía antes. Sin este renglón, el
                          socio paga en efectivo, camina hasta la puerta y la pantalla lo trata de
                          vencido delante de todos. No se corrige el número: se explica. */}
                      {tieneCobroSinSubir(member.id) && (
                        <span className="member-access-status is-pagado-sin-subir">
                          Pagó recién · el vencimiento se actualiza al volver internet
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
                          <Icon name="doorExit" size="0.9em" /> Registrar salida
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

        {/* ─── EL QR, AL LADO DEL BUSCADOR ───
            Pedido del dueño (2026-09-22): que el socio escanee desde la pantalla, sin que nadie
            abra el botón del cartel. Ocupa el lugar de "En el gimnasio ahora": esa lista sigue
            en su propia pantalla ("En el gimnasio"), y para marcar la salida de alguien alcanza
            con buscarlo acá — la búsqueda dice "Adentro desde" y ofrece "Registrar salida". */}
        <QrParaEscanear key={versionQr} puedeCrear={puedeAdministrarQr} />
      </div>

      {/* El cartel del QR, sin ocupar la pantalla mientras no se lo pide. */}
      <Modal isOpen={qrAbierto} onClose={() => { setQrAbierto(false); setVersionQr((v) => v + 1); }} title="Cartel de entrada">
        <CheckinQrPanel puedeAdministrar={puedeAdministrarQr} />
      </Modal>

      {/* ─── El aviso de entrada, al costado izquierdo ───

          ⚠️ Acá había un overlay de pantalla completa (negro al 70%, con blur) y un cartelón
          centrado, tres segundos por persona. Decía lo correcto, pero mientras estaba puesto
          NADIE PODÍA TIPEAR: el molinete se trababa solo, y justo cuando había cola.

          Ahora entra por la izquierda, no tapa nada y no se puede clickear (`pointer-events`
          en el CSS): el foco se queda en el campo del DNI aunque el aviso caiga justo debajo
          del mouse. Se apila para que un socio no le borre el aviso al anterior. La pila la
          lleva el portero: la entrada del llavero o del QR que llegó recién también está acá. */}
      {avisosDeEntrada.length > 0 && (
        <div className="acceso-avisos" aria-live="polite">
          {/* Cada cartel sabe su lugar en la pila (--i) y cuántos hay (--n): así, cuando entra
              uno nuevo, los otros se DESLIZAN a su lugar en vez de saltar. */}
          {avisosDeEntrada.map((aviso, i) => (
            <div
              key={aviso.id}
              className={`acceso-aviso ${aviso.type}${aviso.saliendo ? ' saliendo' : ''}`}
              style={{ '--i': i, '--n': avisosDeEntrada.length }}
            >
              <div className="acceso-aviso-cabecera">
                <div className="acceso-aviso-inicial">{aviso.initials}</div>
                <div className="acceso-aviso-nombre">{aviso.name}</div>
              </div>

              {/* ⭐ EL NÚMERO ES EL CARTEL. Esta pantalla está a la vista de todo el
                  mostrador, y lo que el socio quiere saber al pasar es una sola cosa:
                  cuánto le queda. Tiene que leerse de lejos, sin acercarse ni preguntar. */}
              {(aviso.valor != null || aviso.unidad) && (
                <div className="acceso-aviso-cifra">
                  {aviso.valor != null && <strong>{aviso.valor}</strong>}
                  {/* Sin número (sin fecha, dado de baja), la palabra ocupa su lugar. */}
                  {aviso.unidad && <span className={aviso.valor == null ? 'sin-numero' : undefined}>{aviso.unidad}</span>}
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
