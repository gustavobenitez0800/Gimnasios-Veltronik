// ============================================
// VELTRONIK - PUERTA DE ENTRADA DEL TERMINAL (Fase 3)
// ============================================
// Lo que en la web es el Lobby, en el escritorio es esto. Y la diferencia es el punto de
// toda la fase: acá NO se elige sucursal.
//
// Un terminal de mostrador se activa UNA vez y queda atado a su sucursal. A partir de ahí
// esta pantalla no pregunta nada: averigua a qué sucursal pertenece el equipo y entra.
// El empleado que se loguea no elige, porque la sucursal no la decide la persona — la
// decide la máquina donde está parada.
//
// LAS DOS IDENTIDADES
//   · la del EQUIPO  (enrolamiento)  → QUÉ sucursal
//   · la de la PERSONA (login + rol) → QUÉ puede hacer adentro
// Un empleado con acceso a dos sucursales no puede abrir la otra desde este terminal, y
// no porque la pantalla no se lo ofrezca: el backend lo rechaza (TenantContextFilter).
// Esconder el selector sin eso sería teatro.
//
// Ocupa la ruta /lobby a propósito, igual que BillingWall ocupa /blocked: así todo lo que
// ya manda al Lobby (el guard de AuthContext cuando no hay sucursal, el "Ya pagué" del
// muro, la expulsión por FORBIDDEN_TENANT) sigue funcionando sin tocar nada.
// ============================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { gymService, deviceService, errorService } from '../services';
import CONFIG from '../lib/config';
import Icon from '../components/Icon';
import logoSrc from '../assets/LogotipoSecundario.png';

/** Roles que pueden activar un terminal (los mismos que gestionan equipos en el backend). */
const PUEDEN_ACTIVAR = ['owner', 'admin'];

/**
 * Rol de equipo con el que se enrola.
 *
 * Siempre CAJA. El otro rol, ENCARGADO ("Caja Madre"), existía para el cerebro local del
 * circuito offline: era el equipo que arbitraba el stock. Ese circuito se dio de baja en
 * la V43, así que hoy elegirlo solo serviría para chocar contra la regla de "un ENCARGADO
 * activo por sucursal" sin ganar nada. Se sigue pudiendo elegir a mano desde Ajustes →
 * Equipos, que es donde vive la gestión fina.
 */
const ROL_DE_EQUIPO = 'CAJA';

/** A dónde entra cada rol después de activar. Mismo criterio que el Lobby web. */
function landingRoute(role) {
  return (role === 'owner' || role === 'admin') ? CONFIG.ROUTES.DASHBOARD : CONFIG.ROUTES.ACCESS;
}

export default function DeviceGate() {
  const { profile, logout, refreshOrgContext } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [estado, setEstado] = useState('cargando'); // cargando | activar | sin-permiso | error
  const [sucursales, setSucursales] = useState([]);
  /**
   * Las sucursales que se ofrecen en el desplegable. NO es siempre la misma lista que
   * `sucursales`: al ACTIVAR un equipo virgen vale dueño o admin, pero al REASIGNAR uno
   * que ya pertenece a otra sucursal solo vale dueño (ver el porqué más abajo). Vive en
   * estado y no se recalcula en el render justamente para que las dos pantallas no se
   * desincronicen.
   */
  const [elegibles, setElegibles] = useState([]);
  const [elegida, setElegida] = useState('');
  const [nombreEquipo, setNombreEquipo] = useState('Recepción');
  const [activando, setActivando] = useState(false);
  const [detalleError, setDetalleError] = useState('');
  /** Aviso cuando el equipo YA estaba activado en otra sucursal y se lo va a reasignar. */
  const [avisoReasignacion, setAvisoReasignacion] = useState('');

  /**
   * ⚠️⚠️ LAS FUNCIONES DEL CONTEXTO SE LEEN POR REFERENCIA, Y ES LO QUE ARREGLA EL CUELGUE.
   *
   * `refreshOrgContext` depende de `user`, y `user` se REEMPLAZA por un objeto nuevo cada
   * vez que Supabase emite TOKEN_REFRESHED (AuthContext llama a initAuth). O sea: una
   * función que cambia de identidad sola, en cualquier momento, sin que nadie toque nada.
   *
   * Con ella en las dependencias, `entrarA` → `identificar` → el efecto de abajo se
   * re-disparaban en medio de una identificación en curso. Y `identificar` arranca
   * BORRANDO `current_org_id`, así que la segunda pasada borraba la sucursal que la
   * primera acababa de escribir: el guard de rutas veía "no hay sucursal", rebotaba al
   * lobby (que en el escritorio es esta misma pantalla), y de ahí no salía más. Se veía
   * como "Identificando este equipo…" para siempre, sin error y sin avanzar.
   *
   * Pasa sobre todo al abrir la app a la mañana: el token venció durante la noche, así
   * que el refresco llega a los pocos segundos del arranque — justo encima de esto.
   */
  const navigateRef = useRef(navigate);
  const refreshOrgContextRef = useRef(refreshOrgContext);
  // Al día después de cada render (no DURANTE: escribir un ref mientras se renderiza está
  // prohibido y el lint lo marca). En el primer render ya valen, por el valor inicial.
  useEffect(() => {
    navigateRef.current = navigate;
    refreshOrgContextRef.current = refreshOrgContext;
  });

  /** Corrida en curso: lo que devuelva una vieja se descarta (ver `vigente`). */
  const corridaRef = useRef(0);

  /** Deja la sucursal fija para esta sesión y entra. */
  const entrarA = useCallback(async (orgId, orgName, role) => {
    localStorage.setItem('current_org_id', orgId);
    localStorage.setItem('current_org_role', role);
    localStorage.setItem('current_org_name', orgName || '');
    navigateRef.current(landingRoute(role), { replace: true });
    // A propósito NO se espera: la pantalla ya navegó y el contexto termina de cargar
    // por detrás. Pero sí lleva red — antes, si esto fallaba, era una promesa rechazada
    // que no miraba nadie: el contexto quedaba a medias, el guard rebotaba para acá y la
    // pantalla se quedaba con el spinner, sin decir nunca qué había pasado.
    Promise.resolve(refreshOrgContextRef.current(orgId)).catch((e) => {
      console.error('[DeviceGate] no se pudo cargar el contexto de la sucursal', e);
    });
  }, []);

  const identificar = useCallback(async () => {
    // Si llegara a arrancar una identificación nueva con otra en vuelo, la vieja se calla:
    // lo único peor que no contestar es contestar tarde y pisar lo que ya se resolvió.
    const corrida = corridaRef.current + 1;
    corridaRef.current = corrida;
    const vigente = () => corridaRef.current === corrida;

    setEstado('cargando');
    setDetalleError('');
    setAvisoReasignacion('');

    // Sin sucursal en el contexto: si quedara una vieja, apiClient la mandaría en el
    // header y el propio chequeo de atadura podría rechazar esta consulta — la pantalla
    // que existe para averiguar a qué sucursal pertenecemos quedaría en un punto muerto.
    localStorage.removeItem('current_org_id');

    try {
      // Las dos preguntas en paralelo: a qué sucursal pertenece el equipo, y a cuáles
      // pertenece la persona (que además trae su rol en cada una).
      const [equipo, misSucursales] = await Promise.all([
        deviceService.me(),
        gymService.getUserGyms().catch(() => []),
      ]);

      if (!vigente()) return;

      const lista = Array.from(new Map((misSucursales || []).map((o) => [o.id, o])).values());
      setSucursales(lista);

      const activables = lista.filter((o) => PUEDEN_ACTIVAR.includes(o.role));

      // ── Equipo ya activado: entramos derecho, sin preguntar nada ──
      if (equipo?.enrolledTenantId) {
        const propia = lista.find((o) => o.id === equipo.enrolledTenantId);
        if (propia) {
          await entrarA(propia.id, propia.name, propia.role || 'staff');
          return;
        }

        // El equipo quedó atado a una sucursal que esta persona no puede abrir. Pasa de
        // verdad: un terminal que se enroló a un negocio que después se borró, o una
        // máquina que cambió de dueño.
        //
        // ⚠️ Esto ANTES era un callejón sin salida: se mostraba el cartel y la única
        // opción era cerrar sesión, así que el equipo quedaba inservible para siempre.
        // Estaba mal — re-enrolar es legal por diseño (la sucursal es una etiqueta
        // reasignable, ver DeviceRegistryService.enroll). Si esta persona puede activar
        // terminales, hay que dejarla reasignarlo.
        // Solo el DUEÑO puede reasignar, y no es una regla de pantalla: el enrolamiento
        // viaja con el X-Device-Id, así que pasa por el chequeo de atadura del backend
        // (TenantContextFilter), donde el único rol exento es OWNER. Un ADMIN vería el
        // formulario, elegiría sucursal, y se comería un 403 al confirmar. Mejor no
        // ofrecerle un camino que no existe.
        const puedenReasignar = lista.filter((o) => o.role === 'owner');
        if (puedenReasignar.length > 0) {
          setElegibles(puedenReasignar);
          setElegida(puedenReasignar[0].id);
          setAvisoReasignacion(
            equipo.enrolledTenantName
              ? `Este equipo estaba activado en "${equipo.enrolledTenantName}", una sucursal a la que tu usuario no tiene acceso. Si lo activás acá, deja de pertenecer a la anterior.`
              : 'Este equipo estaba activado en una sucursal que ya no existe. Elegí a cuál pertenece ahora.',
          );
          setEstado('activar');
          return;
        }

        // Sin permiso para reasignar: acá sí no hay nada que la persona pueda hacer.
        setEstado('sin-permiso');
        setDetalleError(
          `Este equipo pertenece a ${equipo.enrolledTenantName || 'otra sucursal'}, y tu usuario no tiene acceso a ella.`,
        );
        return;
      }

      // ── Equipo sin activar ── acá sí vale dueño o admin: no hay atadura previa que el
      // backend pueda rechazar.
      if (activables.length === 0) {
        setEstado('sin-permiso');
        setDetalleError('');
        return;
      }
      setElegibles(activables);
      setElegida(activables[0].id);
      setEstado('activar');
    } catch (error) {
      if (!vigente()) return;
      setEstado('error');
      setDetalleError(errorService.getMessage(error));
    }
  }, [entrarA]);

  // ⚠️ Corre UNA vez por montaje, y de eso depende que la pantalla no se trabe: `identificar`
  // es estable porque `entrarA` lo es (ver los refs de arriba). Si alguna vez vuelve a
  // depender de algo que cambia solo, esto se re-dispara solo — que es el bug de origen.
  useEffect(() => { identificar(); }, [identificar]);

  // ─── RED DE SEGURIDAD: NUNCA MÁS UN SPINNER ETERNO ───
  //
  // El camino feliz de `identificar` no cambia de estado: entra, navega, y la pantalla
  // desaparece. Elegante mientras la navegación ocurra — pero si algo la deshace (el guard
  // que rebota al lobby, un contexto que no cargó), no queda NADA que sacar a la pantalla
  // del "Identificando…", y la única salida era cerrar la app y volver a abrirla.
  //
  // 25 s: más que el timeout con reintentos del apiClient (20 s), para no cortarle la mano
  // a una consulta lenta que todavía puede llegar bien.
  useEffect(() => {
    if (estado !== 'cargando') return undefined;
    const t = setTimeout(() => {
      corridaRef.current += 1; // lo que llegue de la corrida colgada ya no pisa nada
      setEstado('error');
      setDetalleError(
        'La identificación de este equipo está tardando demasiado. Puede ser la conexión. '
        + 'Probá de nuevo; si sigue igual, cerrá sesión y volvé a entrar.',
      );
    }, 25000);
    return () => clearTimeout(t);
  }, [estado]);

  const activar = async () => {
    const sucursal = sucursales.find((o) => o.id === elegida);
    if (!sucursal) return;
    if (!nombreEquipo.trim()) {
      showToast('Poné un nombre para este equipo (ej: Recepción).', 'error');
      return;
    }

    setActivando(true);
    try {
      // El backend lee la sucursal del header X-Tenant-ID, que apiClient toma de acá:
      // hay que fijarla ANTES de enrolar o el equipo termina atado a otra sucursal.
      localStorage.setItem('current_org_id', sucursal.id);
      await deviceService.enroll({ role: ROL_DE_EQUIPO, displayName: nombreEquipo.trim() });
      showToast(`Equipo activado en ${sucursal.name}`, 'success');
      await entrarA(sucursal.id, sucursal.name, sucursal.role || 'owner');
    } catch (error) {
      localStorage.removeItem('current_org_id'); // no dejar una sucursal a medio fijar
      showToast(errorService.getMessage(error), 'error');
      setActivando(false);
    }
  };

  return (
    <div className="auth-card" style={{ maxWidth: '460px' }}>
      <img src={logoSrc} alt="Veltronik" style={{ height: '44px', margin: '0 auto 1.5rem', display: 'block' }} />

      {estado === 'cargando' && (
        <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
          <span className="spinner" />
          <p style={{ color: 'var(--text-muted)', marginTop: '0.75rem' }}>Identificando este equipo…</p>
        </div>
      )}

      {estado === 'activar' && (
        <>
          <h1 style={{ fontSize: '1.35rem', fontWeight: 800, marginBottom: '0.5rem', textAlign: 'center' }}>
            {avisoReasignacion ? 'Reasigná este equipo' : 'Activá este equipo'}
          </h1>

          {/* Cuando el equipo venía de otra sucursal hay que decirlo ANTES de que elija:
              no es lo mismo estrenar un terminal que sacárselo a otro local. */}
          {avisoReasignacion && (
            <div style={{
              display: 'flex', gap: '0.6rem', alignItems: 'flex-start',
              background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)',
              borderRadius: 'var(--border-radius-md)', padding: '0.75rem 0.9rem',
              margin: '0 0 1.25rem', color: '#fbbf24', fontSize: 'var(--font-size-sm)', lineHeight: 1.5,
            }}>
              <Icon name="alertTriangle" size="1.1em" />
              <span>{avisoReasignacion}</span>
            </div>
          )}
          <p style={{ color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: '1.5rem', textAlign: 'center', fontSize: '0.95rem' }}>
            Elegí a qué sucursal pertenece esta computadora. Queda fija: de acá en más, quien
            trabaje en este equipo entra siempre a esa sucursal.
          </p>

          <div className="form-group">
            <label className="form-label">Sucursal</label>
            <select
              className="form-input"
              value={elegida}
              onChange={(e) => setElegida(e.target.value)}
              disabled={activando}
            >
              {elegibles.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Nombre de este equipo</label>
            <input
              type="text"
              className="form-input"
              value={nombreEquipo}
              onChange={(e) => setNombreEquipo(e.target.value)}
              placeholder="Recepción"
              maxLength={120}
              disabled={activando}
            />
            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-xs)', marginTop: '0.4rem' }}>
              Para reconocerlo en Ajustes → Equipos si tenés varias computadoras.
            </p>
          </div>

          <button className="auth-submit" style={{ width: '100%' }} onClick={activar} disabled={activando}>
            {activando ? (<><span className="spinner" /> Activando…</>) : 'Activar y entrar'}
          </button>

          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-xs)', marginTop: '1rem', textAlign: 'center', lineHeight: 1.5 }}>
            ¿Te equivocaste? Se puede cambiar después desde Ajustes → Equipos.
          </p>
        </>
      )}

      {estado === 'sin-permiso' && (
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: 'var(--primary-400)', marginBottom: '1rem' }}>
            <Icon name="monitor" size="2.5rem" />
          </div>
          <h1 style={{ fontSize: '1.3rem', fontWeight: 800, marginBottom: '0.75rem' }}>
            Este equipo todavía no está activado
          </h1>
          <p style={{ color: 'var(--text-muted)', lineHeight: 1.6 }}>
            {detalleError || 'Pedile al dueño que inicie sesión una vez en esta computadora para activarla en su sucursal. Después vas a poder entrar normalmente.'}
          </p>
          <button className="btn btn-ghost" style={{ width: '100%', marginTop: '1.5rem' }} onClick={logout}>
            <Icon name="logout" size="1em" /> Cerrar sesión
          </button>
        </div>
      )}

      {estado === 'error' && (
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: '#ef4444', marginBottom: '1rem' }}>
            <Icon name="alertTriangle" size="2.5rem" />
          </div>
          <h1 style={{ fontSize: '1.3rem', fontWeight: 800, marginBottom: '0.75rem' }}>
            No pudimos identificar este equipo
          </h1>
          <p style={{ color: 'var(--text-muted)', lineHeight: 1.6 }}>{detalleError}</p>
          <button className="auth-submit" style={{ width: '100%', marginTop: '1.5rem' }} onClick={identificar}>
            Reintentar
          </button>
          <button className="btn btn-ghost" style={{ width: '100%', marginTop: '0.75rem' }} onClick={logout}>
            Cerrar sesión
          </button>
        </div>
      )}

      {estado !== 'cargando' && profile?.email && (
        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-xs)', marginTop: '1.25rem', textAlign: 'center' }}>
          Sesión de {profile.email}
        </p>
      )}
    </div>
  );
}
