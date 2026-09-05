// ============================================
// VELTRONIK V2 - AUTH CONTEXT (React)
// ============================================
// Refactorizado para usar la API REST de Java
// en lugar de Supabase directamente.
// ============================================

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { authService } from '../services';
import apiClient from '../lib/apiClient';
import { clearQueryCache } from '../hooks/useQueryCache';
// La copia local de socios se borra al cerrar sesión: la lista de un gimnasio no puede
// quedar en la máquina para que la vea quien entre después.
import { olvidarSocios } from '../lib/localMembers';
import { hasAccess } from '../lib/access';
import CONFIG from '../lib/config';
import { useToast } from './ToastContext';
import logoSrc from '../assets/LogotipoSecundario.png';

// Se exporta el Context crudo (no solo el Provider) para poder proveer un valor mínimo
// sin Supabase: lo usaba el shell del modo local del POS, y hoy lo usan los tests que
// renderizan una página con un contexto de mentira.
export const AuthContext = createContext(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

// Public routes that don't require auth
const PUBLIC_ROUTES = [
  CONFIG.ROUTES.LOGIN,
  CONFIG.ROUTES.REGISTER,
  CONFIG.ROUTES.RESET_PASSWORD,
  // Relevo del login de escritorio: quien la abre viene de Google y NO tiene sesión en
  // este navegador (el código es de la app, que es la única que puede canjearlo). Sin
  // esto, el guard la mandaría al login y el código se perdería.
  CONFIG.ROUTES.DESKTOP_AUTH,
];

/**
 * Rutas públicas CON PARÁMETRO en el path.
 *
 * <p>Van aparte porque la lista de arriba se compara EXACTA (`includes`), y el path real trae
 * el valor puesto: `/marcar/ABC123` nunca va a ser igual a `/marcar/:token`. Sumarla a
 * PUBLIC_ROUTES no serviría de nada — el guard no la reconocería jamás y mandaría al socio al
 * login, que es exactamente lo que pasó la primera vez.</p>
 *
 * <p>Se comparan por prefijo terminado en barra, a propósito: `/marcar/` acepta
 * `/marcar/ABC123` pero NO `/marcarcualquier-otra-cosa`, ni `/marcar` pelado (sin token no hay
 * check-in que hacer). En código de autenticación, un prefijo flojo es una puerta abierta.</p>
 */
const PUBLIC_PREFIXES = [
  // '/marcar/' — el check-in del socio por QR. Quien la abre es un cliente del gimnasio con su
  // teléfono: no tiene ni puede tener cuenta en Veltronik.
  `${CONFIG.ROUTES.CHECKIN.split('/:')[0]}/`,
];

/** ¿El path cae en una ruta pública con parámetro? */
const matchesPublicPrefix = (path) => PUBLIC_PREFIXES.some((p) => path.startsWith(p));

/**
 * Páginas públicas que un usuario YA LOGUEADO igual tiene que poder ver.
 *
 * La regla general manda al Lobby a quien entra logueado a una pantalla pública, y está
 * bien: no tiene sentido mostrarle el login. Pero estas dos terminan un trámite:
 *   · reset-password → el link del mail crea una sesión de recuperación; echarlo sería
 *     no dejarlo escribir la contraseña nueva.
 *   · desktop-auth   → si además usa el portal en ese mismo navegador, tiene sesión web;
 *     mandarlo al Lobby dejaría a la app de escritorio esperando para siempre.
 */
const PUBLIC_ROUTES_ALLOWED_WHEN_LOGGED_IN = [
  CONFIG.ROUTES.RESET_PASSWORD,
  CONFIG.ROUTES.DESKTOP_AUTH,
];

// Routes that don't need org context or active subscription
const NO_ORG_ROUTES = [
  ...PUBLIC_ROUTES,
  CONFIG.ROUTES.LOBBY,
  CONFIG.ROUTES.ONBOARDING,
  CONFIG.ROUTES.PLANS,
  CONFIG.ROUTES.PAYMENT_CALLBACK,
  CONFIG.ROUTES.BLOCKED,
  // El resumen del dueño habla de TODAS sus sucursales, así que no puede exigir tener una
  // seleccionada: el guard lo mandaría al Lobby justo cuando quiere ver el conjunto.
  CONFIG.ROUTES.OWNER_INSIGHTS,
];

/**
 * La ruta con la que se abrió la app, leída del "#".
 *
 * <p>Se lee de `window.location` y no del `location` de React Router a propósito:
 * `doInitAuth` corre una sola vez, desde un callback creado en el primer render, así que
 * cualquier `location` que capturara quedaría congelado ahí. Ir a la barra de direcciones
 * es explícito y no depende de qué render capturó qué.</p>
 *
 * <p>HashRouter: la ruta vive DESPUÉS del "#" ("...index.html#/lobby"). Sin sesión previa
 * el hash viene vacío, y eso es la raíz.</p>
 */
const rutaDeArranque = () => {
  if (typeof window === 'undefined') return '/';
  const hash = window.location.hash || '';
  const sinNumeral = hash.startsWith('#') ? hash.slice(1) : hash;
  return sinNumeral.split('?')[0] || '/';
};

/**
 * ¿Esta pantalla necesita tener una sucursal cargada para poder dibujarse?
 *
 * <p>Mismo criterio que el guard de rutas de más abajo, y a propósito: si las dos
 * respondieran distinto, el arranque podría no esperar un dato que el guard sí da por
 * puesto. Cuando se toque una, hay que tocar la otra.</p>
 */
const necesitaSucursal = (path) => !NO_ORG_ROUTES.includes(path) && !matchesPublicPrefix(path);

/**
 * ⏱️ EL CRONÓMETRO DEL ARRANQUE — POR QUÉ ESTÁ Y POR QUÉ NO SE SACA.
 *
 * <p>Mientras `loading` es true no se dibuja NADA: solo el logo con el spinner. Cuando
 * alguien dice "tarda muchísimo en entrar", eso es todo lo que se ve, y desde afuera no
 * hay forma de saber cuál de los pasos se comió el tiempo — si la sesión de Supabase (que
 * a la mañana suele estar renovando el token), si el backend recién despertándose, o el
 * internet del gimnasio. Los tres se parecen: un logo girando.</p>
 *
 * <p>Solo habla cuando hay algo que decir: por debajo de {@link ARRANQUE_LENTO_MS} no
 * imprime nada. Un arranque sano no ensucia la consola; uno lento deja UNA línea con el
 * desglose, en warning, para que salte a la vista sin ir a buscarla. (Además el lint del
 * proyecto solo admite `warn` y `error`, que es la misma idea escrita como regla.)</p>
 */
const ARRANQUE_LENTO_MS = 3000;

function cronometro() {
  const t0 = Date.now();
  const tramos = {};
  let ultimo = t0;
  // El `finally` de doInitAuth informa siempre, y los caminos que cortan antes también
  // quieren dejar su contexto. Se informa UNA vez: gana el primero, que es el que sabe
  // por qué terminó.
  let yaInformado = false;
  return {
    /** Cierra un tramo y lo nombra. */
    marca(nombre) {
      const ahora = Date.now();
      tramos[nombre] = ahora - ultimo;
      ultimo = ahora;
    },
    informe(extra) {
      if (yaInformado) return;
      yaInformado = true;
      const total = Date.now() - t0;
      const detalle = Object.entries(tramos).map(([k, v]) => `${k} ${v}ms`).join(' · ');
      if (total < ARRANQUE_LENTO_MS) return;
      console.warn(`[arranque] ${total}ms — ${detalle}${extra ? ` · ${extra}` : ''}`);
    },
  };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [gym, setGym] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isTrialActive, setIsTrialActive] = useState(false);
  const [trialDaysRemaining, setTrialDaysRemaining] = useState(0);
  const [orgRole, setOrgRole] = useState(localStorage.getItem('current_org_role') || 'owner');
  const [orgName, setOrgName] = useState(localStorage.getItem('current_org_name') || '');
  // Track if initial auth has completed to prevent premature redirects
  const initCompleteRef = useRef(false);
  // Guard reentrante del logout: el evento 'auth-unauthorized' y el botón Salir pueden
  // dispararlo en cascada; solo el primero debe ejecutar la salida (evita el crash
  // de múltiples signOut + redirects encadenados al cambiar de cuenta).
  const loggingOutRef = useRef(false);
  // Dedupe de initAuth: el signIn dispara SIGNED_IN (cuyo listener llama initAuth) y
  // login() también la llama → dos cargas idénticas en paralelo pisándose el estado.
  const initAuthPromiseRef = useRef(null);
  // Último negocio cuyo contexto se cargó: la caché solo se limpia al CAMBIAR de negocio.
  const lastLoadedOrgRef = useRef(localStorage.getItem('current_org_id'));

  const navigate = useNavigate();
  const location = useLocation();
  const { showToast } = useToast();

  // Prevent trial warning toast from firing on every navigation
  const trialWarningShownRef = useRef(false);

  // Check trial status
  const checkTrialStatus = useCallback((gymData) => {
    if (!gymData?.trialEndsAt) return false;
    return new Date() < new Date(gymData.trialEndsAt);
  }, []);

  const getTrialDays = useCallback((gymData) => {
    if (!gymData?.trialEndsAt) return 0;
    const diff = new Date(gymData.trialEndsAt) - new Date();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }, []);

  // ¿Esta sucursal puede entrar? Delega en lib/access, que es la ÚNICA fuente del
  // frontend (la misma que dibuja el estado de cada card del Lobby).
  //
  // Antes esta función tenía su propia copia del criterio y era MÁS PERMISIVA que la del
  // Lobby en un caso: daba acceso a una suscripción 'active' SIN período pago registrado
  // (`!periodEnd`). O sea que el Lobby mostraba el muro de pago y el guard de rutas dejaba
  // pasar. Ahora las dos preguntan lo mismo, y lo mismo que corta el KillSwitch del backend.
  const hasValidAccess = useCallback((gymData, sub) => hasAccess(gymData, sub), []);

  /**
   * Load the gym (org) data for a specific org ID via Java API.
   */
  const loadOrgById = useCallback(async (orgId) => {
    if (!orgId) return null;
    try {
      const response = await apiClient.get(`/tenants/${orgId}`);
      return response.data;
    } catch (err) {
      console.error('loadOrgById error:', err);
      return null;
    }
  }, []);

  /**
   * Load subscription for a specific org ID via Java API.
   */
  const loadSubscriptionForOrg = useCallback(async (orgId) => {
    if (!orgId) return null;
    try {
      const response = await apiClient.get(`/tenants/${orgId}/subscription`);
      return response.data;
    } catch {
      // Los endpoints de suscripción aún no existen — no crashear
      return null;
    }
  }, []);

  /**
   * Load the role of the current user for a specific org.
   */
  const loadRoleForOrg = useCallback(async (orgId, userId) => {
    if (!orgId || !userId) return 'owner';
    try {
      const response = await apiClient.get(`/tenants/${orgId}/members/${userId}/role`);
      return response.data?.role || 'owner';
    } catch {
      return localStorage.getItem('current_org_role') || 'owner';
    }
  }, []);

  /**
   * Refresh the org context for a specific org.
   * Called when switching orgs in the Lobby to ensure state is fresh.
   */
  const refreshOrgContext = useCallback(async (orgId) => {
    if (!orgId) return;

    // ⚠️ PRIMERA línea, y antes de cualquier await: `current_org_id` es de dónde saca el
    // apiClient el header X-Tenant-ID, y de ese header sale el `currentTenant()` del
    // backend. Si no se escribe acá, TODO lo que se pida mientras esta función está en
    // vuelo viaja con la sucursal ANTERIOR.
    // Así se rompía el cobro: el muro de pago llamaba a refreshOrgContext(sucursalBloqueada)
    // y navegaba sin esperar, con lo cual la suscripción se creaba contra OTRA sucursal
    // (o contra ninguna). Se escribía en un solo lugar de toda la app —el click normal de
    // una card del Lobby—, así que entrar andaba y pagar no.
    localStorage.setItem('current_org_id', orgId);

    // Limpiar la caché SOLO al cambiar de negocio (previene fugas cross-org). Antes se
    // limpiaba siempre: al re-entrar al MISMO negocio tiraba los datos recién cargados
    // y obligaba a cada módulo a refetchear de cero (parte de la lentitud percibida).
    if (lastLoadedOrgRef.current !== orgId) {
      clearQueryCache();
    }
    lastLoadedOrgRef.current = orgId;

    // Load gym data, subscription, and role in parallel
    const currentUserId = user?.id;
    const [gymData, sub, role] = await Promise.all([
      loadOrgById(orgId),
      loadSubscriptionForOrg(orgId),
      loadRoleForOrg(orgId, currentUserId),
    ]);

    setGym(gymData);
    setSubscription(sub);
    setOrgRole(role);
    setOrgName(gymData?.name || '');

    // Sync localStorage with fresh data
    if (gymData) {
      localStorage.setItem('current_org_name', gymData.name || '');
    }
    localStorage.setItem('current_org_role', role);

    if (gymData) {
      const trialActive = checkTrialStatus(gymData) && !['active', 'past_due', 'canceled'].includes(sub?.status);
      const trialDays = getTrialDays(gymData);
      setIsTrialActive(trialActive);
      setTrialDaysRemaining(trialDays);
    } else {
      setIsTrialActive(false);
      setTrialDaysRemaining(0);
    }
  }, [user, loadOrgById, checkTrialStatus, getTrialDays, loadSubscriptionForOrg, loadRoleForOrg]);

  // Initialize auth state from Supabase
  const doInitAuth = async () => {
    const reloj = cronometro();
    try {
      const session = await authService.getSession().catch(() => null);
      reloj.marca('sesion');
      if (!session) {
        reloj.informe('sin sesión guardada → login');
        setLoading(false);
        initCompleteRef.current = true;
        return;
      }

      // ⭐ EL USUARIO YA VIENE ADENTRO DE LA SESIÓN — NO SE LO VUELVE A PEDIR.
      //
      // Acá antes se llamaba a `getCurrentUser()`, que es una vuelta de red COMPLETA a
      // Supabase (`GET /auth/v1/user`), en serie, con la pantalla del logo girando. Y no
      // traía nada nuevo: `session.user` ya tiene el id, el mail y el `user_metadata`,
      // que es todo lo que se lee dos líneas más abajo.
      //
      // Peor: era la primera pieza del arranque que se podía colgar. El fetch de Supabase
      // tiene 10 s de timeout y DOS reintentos, así que un internet malo la convertía en
      // 30 segundos de logo girando. Y si al final fallaba, `currentUser` quedaba en null
      // → el guard de rutas mandaba al login a alguien con la sesión perfectamente viva.
      // O sea que un parpadeo de red en el arranque se veía como "me sacó solo".
      //
      // El fallback queda por si la sesión llegara sin el usuario adentro.
      const currentUser = session.user || await authService.getCurrentUser().catch(() => null);
      if (currentUser) {
        // Map Supabase user to our expected format.
        // El nombre real vive en user_metadata.full_name (el signup manda un único
        // "fullName"); first_name/last_name casi siempre vienen vacíos. Por eso
        // priorizamos full_name y recién después el split o el prefijo del email.
        const meta = currentUser.user_metadata || {};
        const emailPrefix = currentUser.email ? currentUser.email.split('@')[0] : '';
        const fullName = (
          meta.full_name ||
          meta.name ||
          `${meta.first_name || ''} ${meta.last_name || ''}`.trim() ||
          emailPrefix
        ).trim();
        setUser({
          id: currentUser.id,
          email: currentUser.email,
          firstName: meta.first_name || '',
          lastName: meta.last_name || '',
          fullName,
        });
        // Sidebar / Settings / Lobby leen `profile?.fullName`; sin poblar `profile`
        // queda siempre en "Usuario" aunque el nombre exista en la sesión.
        setProfile({ fullName, email: currentUser.email });
      }

      // Intentar cargar el contexto de la org seleccionada
      const orgId = localStorage.getItem('current_org_id');

      if (orgId) {
        const contexto = Promise.all([
          loadOrgById(orgId),
          loadSubscriptionForOrg(orgId),
        ]).then(([gymData, sub]) => {
          setGym(gymData);
          setSubscription(sub);

          if (gymData) {
            const trialActive = checkTrialStatus(gymData) && !['active', 'past_due', 'canceled'].includes(sub?.status);
            const trialDays = getTrialDays(gymData);
            setIsTrialActive(trialActive);
            setTrialDaysRemaining(trialDays);
          }
        });

        // ⭐ EL LOGO NO ESPERA DATOS QUE LA PANTALLA SIGUIENTE VA A TIRAR.
        //
        // Estas dos consultas son de la sucursal ANTERIOR (la que quedó en localStorage).
        // Una pantalla de operación sí las necesita para dibujarse, así que ahí se espera.
        // Pero las de NO_ORG_ROUTES —el Lobby, donde aterriza casi todo arranque, y el
        // DeviceGate del escritorio, que ocupa su misma ruta— existen justamente para
        // ELEGIR sucursal: el Lobby las vuelve a pedir en `refreshOrgContext` apenas se
        // toca una card, y el DeviceGate arranca BORRANDO `current_org_id`.
        //
        // O sea que el arranque más común pagaba dos vueltas al backend, en el camino
        // crítico, por datos que se descartan. Y son las PRIMERAS consultas del día: las
        // que se comen el arranque en frío de Cloud Run. Ahí "tarda muchísimo en entrar"
        // deja de ser un segundo y pasa a ser medio minuto de logo girando.
        //
        // La única de esa lista que igual LEE el contexto es /plans, y ya venía escrita
        // para no tenerlo: cae a `localStorage` para saber a qué sucursal cobrarle, y
        // `hasAccess(null, null)` da false — o sea, muestra la página de pago. Falla del
        // lado seguro: lo peor que puede pasar es que un cliente al día vea el precio un
        // instante de más, nunca que un moroso entre gratis.
        //
        // Se siguen cargando igual — por detrás, sin bloquear el dibujo.
        if (necesitaSucursal(rutaDeArranque())) {
          await contexto;
          reloj.marca('sucursal');
        } else {
          contexto.catch((e) => console.warn('[auth] no se pudo precargar la sucursal anterior:', e?.message));
        }
      }
    } catch (error) {
      console.error('Auth init error:', error);
    } finally {
      reloj.informe(`ruta ${rutaDeArranque()}`);
      setLoading(false);
      initCompleteRef.current = true;
    }
  };

  const initAuth = useCallback(async () => {
    // Si ya hay una carga en curso, reusarla: evita la doble corrida (listener SIGNED_IN
    // + llamada directa de login/register) que duplicaba requests y pisaba estados.
    if (initAuthPromiseRef.current) return initAuthPromiseRef.current;
    const run = doInitAuth();
    initAuthPromiseRef.current = run.finally(() => { initAuthPromiseRef.current = null; });
    return initAuthPromiseRef.current;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkTrialStatus, getTrialDays, loadOrgById, loadSubscriptionForOrg]);

  // Declarado ANTES del useEffect que lo usa (handleUnauthorized): si no, el
  // listener captura una referencia todavía no inicializada del primer render.
  const logout = async () => {
    // Reentrante: si ya hay un logout en curso (botón Salir + evento auth-unauthorized,
    // o varios 401 simultáneos), los siguientes no hacen nada. Antes cada disparo
    // encadenaba su propio signOut + redirect + reload → crash al cambiar de cuenta.
    if (loggingOutRef.current) return;
    loggingOutRef.current = true;
    try {
      await authService.signOut();
    } catch {
      // Force redirect anyway
    }
    clearQueryCache();
    olvidarSocios();
    lastLoadedOrgRef.current = null;
    setUser(null);
    setProfile(null);
    setGym(null);
    setSubscription(null);
    setIsTrialActive(false);
    setTrialDaysRemaining(0);
    trialWarningShownRef.current = false;
    initCompleteRef.current = false;
    localStorage.removeItem('current_org_id');
    localStorage.removeItem('current_org_name');

    // HARD REDIRECT para limpiar el estado en memoria (evita caché retenido tras logout).
    // OJO Electron: la app usa HashRouter y se sirve por file://. Un `location.href='/'`
    // apunta a la RAÍZ DEL DISCO (no al index.html) → pantalla en blanco. Hay que
    // recargar el index.html ACTUAL (location.pathname) y mandar el hash al login.
    const loginHash = `#${CONFIG.ROUTES.LOGIN || '/'}`;
    window.location.href = `${window.location.pathname}${window.location.search}${loginHash}`;
    window.location.reload();
  };

  useEffect(() => {
    initAuth();

    // Listen for auth changes from Supabase
    const authListener = authService.onAuthStateChange(
      async (event, session) => {
        // ⚠️ Acá decía `if (event === 'SIGNED_OUT' || !session)`, y ese `|| !session` barría
        // el estado ante CUALQUIER evento que llegara sin sesión. Supabase emite varios con
        // `session: null` que no son un cierre —`INITIAL_SESSION` al arrancar sin sesión
        // guardada es el más común— y tratarlos a todos como un logout convierte un evento
        // informativo en una pantalla vacía. El cierre lo dice el EVENTO, no que falte el dato.
        if (event === 'SIGNED_OUT') {
          // Queda registrado a propósito: cuando alguien reporta "me sacó solo", esto es lo
          // único que dice si la sesión la cerró Supabase o la cerramos nosotros.
          console.warn('[auth] SIGNED_OUT: Supabase dio la sesión por terminada');
          clearQueryCache();
          olvidarSocios();
          lastLoadedOrgRef.current = null;
          setUser(null);
          setProfile(null);
          setGym(null);
          setSubscription(null);
          setIsTrialActive(false);
          setTrialDaysRemaining(0);
          trialWarningShownRef.current = false;
          initCompleteRef.current = false;
          authService.clearPlatformState();
        } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          // Estos dos SIEMPRE traen sesión. Si llega uno sin ella es una anomalía: se anota
          // y no se toca nada, en vez de expulsar a quien está atendiendo por un evento raro.
          if (!session) {
            console.warn(`[auth] ${event} llegó sin sesión — se ignora, no se cierra nada`);
            return;
          }
          // Si iniciamos sesión, recargamos initAuth
          await initAuth();
        }
      }
    );

    const handleUnauthorized = () => logout();
    const handlePaymentRequired = () => navigate(CONFIG.ROUTES.BLOCKED, { replace: true });
    const handleForbiddenTenant = () => {
      // El negocio seleccionado dejó de ser accesible: limpiar contexto y volver al Lobby.
      setGym(null);
      setSubscription(null);
      setOrgName('');
      navigate(CONFIG.ROUTES.LOBBY, { replace: true });
    };

    window.addEventListener('auth-unauthorized', handleUnauthorized);
    window.addEventListener('auth-payment-required', handlePaymentRequired);
    window.addEventListener('auth-forbidden-tenant', handleForbiddenTenant);

    return () => {
      authListener?.unsubscribe();
      window.removeEventListener('auth-unauthorized', handleUnauthorized);
      window.removeEventListener('auth-payment-required', handlePaymentRequired);
      window.removeEventListener('auth-forbidden-tenant', handleForbiddenTenant);
    };
  }, [initAuth, navigate]);

  // Route protection
  useEffect(() => {
    // Don't run until initial auth is complete to prevent premature redirects
    if (loading || !initCompleteRef.current) return;

    const currentPath = location.pathname;
    const conParametro = matchesPublicPrefix(currentPath);
    const isPublic = PUBLIC_ROUTES.includes(currentPath) || conParametro;
    const needsOrg = !NO_ORG_ROUTES.includes(currentPath) && !conParametro;

    // Las públicas con parámetro tampoco echan al que SÍ está logueado: el dueño probando su
    // propio cartel de QR es lo primero que pasa, y rebotarlo al Lobby haría parecer que la
    // función está rota justo en la única prueba que va a hacer.
    const permitidaLogueado =
      PUBLIC_ROUTES_ALLOWED_WHEN_LOGGED_IN.includes(currentPath) || conParametro;

    // Not logged in → redirect to login (except public pages)
    if (!user && !isPublic) {
      navigate(CONFIG.ROUTES.LOGIN, { replace: true });
      return;
    }

    // Logged in on public page → redirect to lobby, salvo las que terminan un trámite
    // (ver PUBLIC_ROUTES_ALLOWED_WHEN_LOGGED_IN arriba).
    if (user && isPublic && !permitidaLogueado) {
      navigate(CONFIG.ROUTES.LOBBY, { replace: true });
      return;
    }

    // Logged in, needs org context but none selected
    if (user && needsOrg) {
      const orgId = localStorage.getItem('current_org_id');
      if (!orgId) {
        navigate(CONFIG.ROUTES.LOBBY, { replace: true });
        return;
      }
    }

    // CRITICAL: Billing is now centralized in the Java Backend (KillSwitchFilter)
    // If a tenant is blocked or trial expired, the API will return 402 Payment Required
    // The apiClient interceptor will catch it and dispatch 'auth-payment-required', redirecting to BLOCKED.
    // We no longer evaluate dates in the frontend.

    // Trial warning (only show once per session, not on every navigation)
    if (user && gym && isTrialActive && trialDaysRemaining <= 7 && needsOrg && !trialWarningShownRef.current) {
      trialWarningShownRef.current = true;
      const msg = trialDaysRemaining <= 1
        ? 'Tu período de prueba termina hoy. Suscribite para seguir usando Veltronik.'
        : `Tu período de prueba vence en ${trialDaysRemaining} días. Suscribite para no perder acceso.`;
      showToast(msg, 'warning', 10000);
    }
  }, [user, loading, location.pathname, gym, subscription, isTrialActive, trialDaysRemaining, hasValidAccess, navigate, showToast]);

  // Auth actions
  const login = async (email, password) => {
    trialWarningShownRef.current = false;
    await authService.signIn(email, password);
    await initAuth();
    navigate(CONFIG.ROUTES.LOBBY);
  };

  const register = async (email, password, fullName) => {
    trialWarningShownRef.current = false;
    await authService.signUp(email, password, fullName);
    await initAuth();
    navigate(CONFIG.ROUTES.LOBBY);
  };

  const loginWithGoogle = async () => {
    trialWarningShownRef.current = false;
    await authService.signInWithGoogle();
  };

  const refreshAuth = async () => {
    setLoading(true);
    await initAuth();
  };

  const updateGym = async (updates) => {
    const orgId = gym?.id || localStorage.getItem('current_org_id');
    if (!orgId) throw new Error('No org selected');

    const response = await apiClient.put(`/tenants/${orgId}`, updates);
    const data = response.data;

    if (data) {
      setGym(data);
      setOrgName(data.name || '');
      // Keep localStorage in sync for page refreshes
      localStorage.setItem('current_org_name', data.name || '');
    }
    return data;
  };

  const value = {
    user,
    profile,
    gym,
    subscription,
    loading,
    isTrialActive,
    trialDaysRemaining,
    hasValidAccess,
    orgRole,
    orgName,
    login,
    register,
    loginWithGoogle,
    logout,
    refreshAuth,
    refreshOrgContext,
    updateGym,
  };

  // ─── Splash screen while checking session (Instagram-style) ───
  // Never show login page flash — show branded splash until auth resolves
  if (loading) {
    return (
      <AuthContext.Provider value={value}>
        <div className="auth-splash">
          <img src={logoSrc} alt="Veltronik" className="auth-splash-logo" />
          <div className="auth-splash-spinner"><span className="spinner" /></div>
        </div>
      </AuthContext.Provider>
    );
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
