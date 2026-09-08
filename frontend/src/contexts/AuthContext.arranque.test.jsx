// @vitest-environment happy-dom
//
// happy-dom y no jsdom: jsdom arrastra undici, que usa `markAsUncloneable` de
// worker_threads SIN protección, y esa función existe recién en Node 22. CI corre en
// Node 20 a propósito, así que jsdom rompía ahí aunque pasara en la máquina local.
// ============================================
// VELTRONIK - Tests del ARRANQUE (la pantalla del logo)
// ============================================
// El síntoma que originó estos tests: "entra al lobby pero tarda muchísimo en entrar" —
// el logo girando durante medio minuto antes de mostrar nada.
//
// La causa no era una consulta lenta suelta, sino QUÉ ESPERABA la pantalla del logo antes
// de dejar dibujar. Esperaba dos consultas de la sucursal ANTERIOR (la que quedó en
// localStorage) aunque estuviera entrando al Lobby, que es la pantalla donde se ELIGE
// sucursal y que las vuelve a pedir sola. Dos vueltas al backend, en el camino crítico,
// por datos que se descartan — y siendo las primeras del día, las que pagan el arranque
// en frío de Cloud Run.
//
// Estos tests fijan la regla, que no es "no esperar nunca" sino ESPERAR SOLO LO QUE LA
// PANTALLA DE DESTINO NECESITA PARA DIBUJARSE.
// ============================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

const SESION = {
  access_token: 'token-de-mentira',
  user: {
    id: '11111111-1111-1111-1111-111111111111',
    email: 'dueño@gimnasio.com',
    user_metadata: { full_name: 'Gustavo Benítez' },
  },
};

const authService = {
  getSession: vi.fn(),
  // Se espía a propósito: el arreglo consiste, entre otras cosas, en NO llamarla.
  getCurrentUser: vi.fn(() => Promise.resolve(SESION.user)),
  onAuthStateChange: vi.fn(() => ({ unsubscribe: vi.fn() })),
  signOut: vi.fn(() => Promise.resolve()),
  clearPlatformState: vi.fn(),
};

/** Las consultas de la sucursal: el test decide cuándo (y si) contestan. */
const apiClient = { get: vi.fn() };

// ⚠️ SIEMPRE EL MISMO OBJETO/FUNCIÓN. Devolver uno nuevo por render cuelga el test: el
// efecto principal de AuthProvider depende de `navigate`, así que una identidad nueva lo
// re-dispara, initAuth vuelve a setear estado, y eso re-renderiza… sin fondo.
const navegar = vi.fn();
const ubicacion = { pathname: '/lobby' };
const toast = { showToast: vi.fn() };

vi.mock('react-router-dom', () => ({
  useNavigate: () => navegar,
  useLocation: () => ubicacion,
}));
vi.mock('../services', () => ({ authService }));
vi.mock('../lib/apiClient', () => ({ default: apiClient }));
vi.mock('./ToastContext', () => ({ useToast: () => toast }));
vi.mock('../hooks/useQueryCache', () => ({ clearQueryCache: vi.fn() }));
vi.mock('../lib/localMembers', () => ({ olvidarSocios: vi.fn() }));
vi.mock('../lib/access', () => ({ hasAccess: () => true }));

/** La sesión que quedó guardada en el disco de este terminal. */
const boveda = { sesionGuardada: vi.fn() };
vi.mock('../lib/boveda', () => ({ sesionGuardada: (...a) => boveda.sesionGuardada(...a) }));
vi.mock('../lib/supabase', () => ({
  CLAVE_DE_SESION: 'sb-de-mentira-auth-token',
  supabase: { auth: { stopAutoRefresh: vi.fn(), startAutoRefresh: vi.fn() } },
}));
const conectividad = { diagnoseConnectivity: vi.fn() };
vi.mock('../lib/connectivity', () => ({
  CONNECTIVITY: { ONLINE: 'ONLINE', OFFLINE: 'OFFLINE' },
  diagnoseConnectivity: (...a) => conectividad.diagnoseConnectivity(...a),
}));

/** Pone (o saca) la máquina en modo "sin red", como el terminal después de un apagón. */
function sinRed(hay) {
  Object.defineProperty(window.navigator, 'onLine', { value: hay, configurable: true });
}
vi.mock('../assets/LogotipoSecundario.png', () => ({ default: 'logo.png' }));

const { AuthProvider } = await import('./AuthContext');

let root;
let container;

/** ¿Sigue la pantalla del logo tapando todo? */
const hayLogoGirando = () => !!container.querySelector('.auth-splash');

async function pintarEn(ruta) {
  window.location.hash = ruta;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(<AuthProvider><p>ya se ve la app</p></AuthProvider>); });
  await tick();
}

/** El arranque encadena promesas; un solo tick lo deja a mitad de camino. */
async function tick() {
  for (let i = 0; i < 10; i += 1) {
    await act(async () => { await Promise.resolve(); });
  }
}

beforeEach(() => {
  // `clearAllMocks` borra las LLAMADAS pero no las implementaciones ni los valores de
  // retorno: sin este reseteo, el pedido congelado de un test se filtraba al siguiente y
  // lo hacía fallar por el orden en que corrieron, no por el código.
  vi.clearAllMocks();
  apiClient.get.mockReset();
  authService.onAuthStateChange.mockReset();
  authService.onAuthStateChange.mockReturnValue({ unsubscribe: vi.fn() });
  localStorage.clear();
  authService.getSession.mockResolvedValue(SESION);
  authService.getCurrentUser.mockResolvedValue(SESION.user);
  boveda.sesionGuardada.mockResolvedValue(null);
  conectividad.diagnoseConnectivity.mockResolvedValue('OFFLINE');
  sinRed(true);
  delete window.electronAPI;
});

afterEach(() => {
  if (root) act(() => root.unmount());
  if (container) container.remove();
  window.location.hash = '';
});

describe('el arranque de la app', () => {
  it('entra al Lobby sin esperar las consultas de la sucursal anterior', async () => {
    localStorage.setItem('current_org_id', '22222222-2222-2222-2222-222222222222');
    // Las consultas NO contestan nunca: el peor caso real, el backend recién despertando.
    apiClient.get.mockReturnValue(new Promise(() => {}));

    await pintarEn('#/lobby');

    expect(hayLogoGirando()).toBe(false);
    expect(container.textContent).toContain('ya se ve la app');
  });

  it('en el Lobby NI SIQUIERA pide la sucursal anterior', async () => {
    localStorage.setItem('current_org_id', '22222222-2222-2222-2222-222222222222');
    apiClient.get.mockResolvedValue({ data: {} });

    await pintarEn('#/lobby');

    // El Lobby no lee `gym` ni `subscription` del contexto, y fija la sucursal él mismo
    // al tocar una card. Precargar la anterior es trabajo muerto — y en el arranque son
    // dos pedidos más peleando por el único vCPU del backend, que es lo que hacía que
    // TODOS los demás pasaran de 300 ms a 2500 ms.
    expect(apiClient.get).not.toHaveBeenCalled();
  });

  it('abierta en el dominio pelado tampoco pide la sucursal anterior', async () => {
    localStorage.setItem('current_org_id', '22222222-2222-2222-2222-222222222222');
    apiClient.get.mockResolvedValue({ data: {} });

    // Sin "#" en la dirección la ruta de arranque es "/" (el login), no "/lobby". Es la
    // forma MÁS COMÚN de abrir la app, y se colaba por el costado de la regla anterior:
    // precargaba la sucursal anterior y después el guard mandaba al Lobby igual, donde
    // esos datos no se usan. Dos pedidos de más justo cuando el backend está despertando.
    await pintarEn('#');

    expect(apiClient.get).not.toHaveBeenCalled();
  });

  it('no dispara dos veces el arranque cuando Supabase avisa SIGNED_IN', async () => {
    localStorage.setItem('current_org_id', '22222222-2222-2222-2222-222222222222');
    let avisar;
    authService.onAuthStateChange.mockImplementation((cb) => {
      avisar = cb;
      return { unsubscribe: vi.fn() };
    });
    // La sucursal tarda: es lo que mantiene abierta la ventana del dedupe.
    apiClient.get.mockReturnValue(new Promise(() => {}));

    await pintarEn('#/plans'); // ruta que SÍ precarga la sucursal
    const pedidosDelArranque = apiClient.get.mock.calls.length;
    expect(pedidosDelArranque).toBeGreaterThan(0);

    // Supabase emite SIGNED_IN a los pocos ms del arranque y su listener vuelve a llamar
    // a initAuth. Si la corrida anterior ya soltó el candado, se pide TODO de nuevo: era
    // /tenants/{id} y su suscripción duplicados, 30 ms aparte, en cada arranque.
    // ⚠️ SIN await sobre `avisar`: el dedupe devuelve la promesa de la corrida EN VUELO,
    // que en este test no resuelve nunca (las consultas están congeladas a propósito).
    // Esperarla es esperar para siempre — el síntoma de que el arreglo anda, no de que falle.
    await act(async () => { avisar('SIGNED_IN', { access_token: 'x', user: SESION.user }); });
    await tick();

    expect(apiClient.get.mock.calls.length).toBe(pedidosDelArranque);
  });

  it('sí espera la sucursal cuando la pantalla de destino la necesita para dibujarse', async () => {
    localStorage.setItem('current_org_id', '22222222-2222-2222-2222-222222222222');
    let contestar;
    apiClient.get.mockReturnValue(new Promise((r) => { contestar = () => r({ data: {} }); }));

    await pintarEn('#/dashboard');

    // El Dashboard lee `gym` del contexto: dejarlo pasar sin sucursal sería dibujar una
    // pantalla vacía y después rellenarla. Acá el logo SÍ corresponde.
    expect(hayLogoGirando()).toBe(true);

    await act(async () => { contestar(); });
    await tick();
    expect(hayLogoGirando()).toBe(false);
  });

  it('no le vuelve a preguntar a Supabase quién es el usuario: ya viene en la sesión', async () => {
    await pintarEn('#/lobby');

    // Era una vuelta de red completa, en serie, con la pantalla del logo esperando — y
    // con 10 s de timeout y dos reintentos detrás. Cuando fallaba por un parpadeo de red,
    // el guard mandaba al login a alguien con la sesión viva ("me sacó solo").
    expect(authService.getCurrentUser).not.toHaveBeenCalled();
    expect(hayLogoGirando()).toBe(false);
  });

  it('sin sesión guardada no toca la red y muestra el login enseguida', async () => {
    authService.getSession.mockRejectedValue(new Error('No session found'));

    await pintarEn('#/');

    expect(hayLogoGirando()).toBe(false);
    expect(apiClient.get).not.toHaveBeenCalled();
  });
});

// ============================================
// EL ARRANQUE DESPUÉS DE UN APAGÓN
// ============================================
// Se corta la luz, el terminal reinicia, el token de una hora ya venció y la línea todavía
// no volvió. Es el caso MÁS PROBABLE de todos y el que justifica el núcleo local entero.
//
// ⚠️ ESTO SE ESCRIBIÓ DESPUÉS DE ROMPERLO EN UNA MÁQUINA DE VERDAD. La primera versión le
// preguntaba a la nube ANTES de fijarse si había red, y ahí `getSession()` se toma hasta 30
// segundos: Supabase reintenta la renovación con backoff hasta agotar su
// AUTO_REFRESH_TICK_DURATION_MS, bajo un candado que además hace esperar a la recuperación
// de sesión del arranque — y su ticker vuelve a empezar cada 30 s, para siempre. El
// mostrador se quedaba mirando el logo girar con la consola llena de ERR_INTERNET_DISCONNECTED.
//
// La regla que fijan estos tests: SI NO HAY RED, NO SE LE PREGUNTA A LA NUBE. La respuesta
// ya está en el disco.
describe('el arranque sin red', () => {
  /** Deja el terminal como queda después del apagón: escritorio, sin red, con sesión guardada. */
  function terminalDespuesDelApagon() {
    window.electronAPI = {};
    sinRed(false);
    boveda.sesionGuardada.mockResolvedValue({
      refresh_token: 'rt-guardado',
      user: SESION.user,
    });
  }

  it('abre el mostrador SIN preguntarle nada a la nube', async () => {
    terminalDespuesDelApagon();
    localStorage.setItem('current_org_id', '22222222-2222-2222-2222-222222222222');

    await pintarEn('#/acceso');

    // Lo que importa: ni siquiera se intentó. Esperar la respuesta era el bug — hasta 30
    // segundos de logo girando en el peor momento posible para un gimnasio.
    expect(authService.getSession).not.toHaveBeenCalled();
    expect(hayLogoGirando()).toBe(false);
    expect(container.textContent).toContain('ya se ve la app');
  });

  it('no sale a la red por la sucursal: no hay red', async () => {
    terminalDespuesDelApagon();
    localStorage.setItem('current_org_id', '22222222-2222-2222-2222-222222222222');

    await pintarEn('#/acceso');

    expect(apiClient.get).not.toHaveBeenCalled();
  });

  it('sin sesión guardada NO inventa una: va al login', async () => {
    // Un terminal recién instalado, sin red. No hay nada que sostener, y abrir el mostrador
    // con un usuario vacío sería peor que pedir la contraseña.
    window.electronAPI = {};
    sinRed(false);
    boveda.sesionGuardada.mockResolvedValue(null);
    authService.getSession.mockRejectedValue(new Error('No session found'));

    await pintarEn('#/');

    expect(hayLogoGirando()).toBe(false);
  });

  it('en el PORTAL WEB no aplica: ahí el login es la respuesta correcta', async () => {
    // La web no promete funcionar sin internet. `window.electronAPI` ausente = navegador.
    sinRed(false);
    boveda.sesionGuardada.mockResolvedValue({ refresh_token: 'rt', user: SESION.user });
    authService.getSession.mockRejectedValue(new Error('No session found'));

    await pintarEn('#/');

    // Se le preguntó a la nube igual, que es lo que corresponde en el navegador.
    expect(authService.getSession).toHaveBeenCalled();
  });

  it('con red, el atajo NO se toma aunque haya sesión guardada', async () => {
    // El atajo es para la ausencia de red, no para ahorrarse el arranque normal. Si se
    // tomara con red, el terminal se quedaría en modo local sin motivo — con `gym` sin
    // cargar y la marca del gimnasio en los valores por defecto.
    window.electronAPI = {};
    sinRed(true);
    boveda.sesionGuardada.mockResolvedValue({ refresh_token: 'rt', user: SESION.user });

    await pintarEn('#/lobby');

    expect(authService.getSession).toHaveBeenCalled();
  });
});
