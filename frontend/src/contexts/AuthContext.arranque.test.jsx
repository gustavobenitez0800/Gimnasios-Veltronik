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
