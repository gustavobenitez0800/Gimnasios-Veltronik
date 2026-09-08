// @vitest-environment happy-dom
//
// happy-dom y no jsdom: jsdom arrastra undici, que usa `markAsUncloneable` de
// worker_threads SIN protección, y esa función existe recién en Node 22. CI corre en
// Node 20 a propósito —el mismo que arma el instalador en release.yml— así que jsdom
// rompía ahí aunque pasara en la máquina de desarrollo.
// ============================================
// VELTRONIK - Tests de la puerta de entrada del terminal
// ============================================
// Esta pantalla es lo primero que ve el escritorio al abrirse, y su camino feliz no pinta
// nada: averigua a qué sucursal pertenece el equipo y NAVEGA. Elegante mientras funcione;
// cuando algo lo deshace, no queda nada en pantalla más que "Identificando este equipo…",
// para siempre, y la única salida era cerrar la app y volver a entrar.
//
// Los dos tests de acá son las dos formas en que eso pasaba de verdad.
// ============================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

const navegado = [];

/**
 * ⚠️ SIEMPRE EL MISMO OBJETO. Uno nuevo por render dispara un bucle infinito y cuelga el
 * test. Para simular que AuthContext se re-crea se MUTA `refreshOrgContext`, que es
 * exactamente lo que hace React: la función cambia de identidad, el objeto se re-lee.
 */
const auth = {
  profile: { email: 'dueño@gimnasio.com' },
  logout: vi.fn(),
  refreshOrgContext: vi.fn(() => Promise.resolve()),
};

const deviceService = { me: vi.fn(), enroll: vi.fn() };
const gymService = { getUserGyms: vi.fn() };
const errorService = { getMessage: (e) => String(e?.message || e) };

vi.mock('react-router-dom', () => ({
  useNavigate: () => (ruta) => { navegado.push(ruta); },
}));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../contexts/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../services', () => ({ gymService, deviceService, errorService }));
vi.mock('../lib/config', () => ({
  default: { ROUTES: { DASHBOARD: '/dashboard', ACCESS: '/access', LOBBY: '/lobby' } },
}));
vi.mock('../components/Icon', () => ({ default: () => null }));
vi.mock('../assets/LogotipoSecundario.png', () => ({ default: 'logo.png' }));

const { default: DeviceGate } = await import('./DeviceGate');

let root;
let container;

async function pintar() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(<DeviceGate />); });
  await tick();
  return container;
}

/** La identificación encadena promesas; un solo tick deja la pantalla a mitad de camino. */
async function tick() {
  for (let i = 0; i < 8; i += 1) {
    await act(async () => { await Promise.resolve(); });
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  navegado.length = 0;
  localStorage.clear();
  auth.refreshOrgContext = vi.fn(() => Promise.resolve());
});

afterEach(() => {
  if (root) act(() => root.unmount());
  container?.remove();
});

describe('la puerta de entrada del terminal no se traba', () => {

  it('el equipo ya activado entra derecho, sin preguntar nada', async () => {
    deviceService.me.mockResolvedValue({ enrolledTenantId: 'org1', enrolledTenantName: 'HaA Fitness' });
    gymService.getUserGyms.mockResolvedValue([{ id: 'org1', name: 'HaA Fitness', role: 'owner' }]);

    await pintar();

    expect(navegado).toEqual(['/dashboard']);
    expect(localStorage.getItem('current_org_id')).toBe('org1');
  });

  // ⚠️⚠️ ESTE ES EL BUG DE "SE QUEDA EN IDENTIFICANDO Y HAY QUE CERRAR Y VOLVER A ENTRAR".
  //
  // `refreshOrgContext` depende de `user`, y `user` se REEMPLAZA cada vez que Supabase
  // emite TOKEN_REFRESHED — o sea, sola, sin que nadie toque nada, y sobre todo al abrir
  // la app a la mañana, cuando el token venció durante la noche. Con esa función en las
  // dependencias, la identificación se re-disparaba ENCIMA de la que estaba en curso.
  //
  // Y como `identificar` arranca borrando `current_org_id`, la segunda pasada borraba la
  // sucursal que la primera acababa de escribir: el guard de rutas veía "no hay sucursal",
  // rebotaba al lobby —que en el escritorio es esta misma pantalla— y de ahí no salía más.
  it('⚠️ identifica UNA sola vez, aunque el contexto de auth se re-cree solo', async () => {
    deviceService.me.mockResolvedValue({ enrolledTenantId: 'org1', enrolledTenantName: 'HaA Fitness' });
    gymService.getUserGyms.mockResolvedValue([{ id: 'org1', name: 'HaA Fitness', role: 'owner' }]);

    await pintar();
    expect(deviceService.me).toHaveBeenCalledTimes(1);

    // Supabase refresca el token: AuthContext se re-crea y sus funciones cambian de identidad.
    auth.refreshOrgContext = vi.fn(() => Promise.resolve());
    await act(async () => { root.render(<DeviceGate />); });
    await tick();

    expect(
      deviceService.me,
      'una identificación nueva encima de la anterior es de donde salía el cuelgue',
    ).toHaveBeenCalledTimes(1);
    expect(
      localStorage.getItem('current_org_id'),
      'la segunda pasada borraba la sucursal recién puesta y el guard rebotaba para acá',
    ).toBe('org1');
  });

  // La red de seguridad. Aunque algo vuelva a dejar la pantalla en el aire, tiene que
  // haber una salida que no sea cerrar la aplicación.
  it('si la identificación se cuelga, ofrece reintentar en vez de spinner eterno', async () => {
    vi.useFakeTimers();
    try {
      deviceService.me.mockReturnValue(new Promise(() => {})); // no contesta nunca
      gymService.getUserGyms.mockResolvedValue([]);

      await pintar();
      expect(container.textContent).toContain('Identificando este equipo');

      await act(async () => { vi.advanceTimersByTime(26000); });

      expect(container.textContent).toContain('tardando demasiado');
      expect(container.textContent).toContain('Reintentar');
    } finally {
      vi.useRealTimers();
    }
  });
});

// ============================================
// EL TERMINAL SE ACUERDA DE SU SUCURSAL
// ============================================
// ⚠️ ESCRITO DESPUÉS DE VERLO ROMPER EN UNA MÁQUINA DE VERDAD. Con el núcleo local, la app
// ya arrancaba sin internet… y chocaba acá: esta pantalla le pregunta al servidor a qué
// sucursal pertenece el equipo, y sin servidor mostraba "No pudimos identificar este
// equipo".
//
// Y el daño era peor que el cartel: `identificar` arranca BORRANDO `current_org_id`, así
// que un arranque sin red dejaba al mostrador sin saber de qué gimnasio es la copia de
// socios que tiene en el disco. La pantalla que existe para identificar el equipo lo
// dejaba más perdido que antes de entrar.
//
// La regla: la sucursal la decide el EQUIPO, y un equipo no se muda solo. Si ya se
// identificó alguna vez, esa respuesta sigue valiendo cuando no hay a quién preguntarle.
describe('sin conexión, el equipo se acuerda de su sucursal', () => {
  /** Deja anotada una identificación anterior, como la de la última vez que hubo internet. */
  function yaSeIdentificoAntes() {
    localStorage.setItem('terminal_org_id', 'org1');
    localStorage.setItem('terminal_org_name', 'HaA Fitness');
    localStorage.setItem('terminal_org_role', 'owner');
  }

  /** Pone (o saca) la máquina en modo "sin red". */
  function sinRed(hay) {
    Object.defineProperty(window.navigator, 'onLine', { value: hay, configurable: true });
  }

  // ⚠️ `clearAllMocks` borra las LLAMADAS pero NO las implementaciones, así que lo que
  // devolvió un test se filtra al siguiente. Acá eso es especialmente traicionero: un test
  // del camino sin red podía pasar por el camino CON red, usando el `mockResolvedValue`
  // que dejó otro — y quedar verde probando lo contrario de lo que dice su nombre.
  beforeEach(() => {
    deviceService.me.mockReset();
    gymService.getUserGyms.mockReset();
    gymService.getUserGyms.mockResolvedValue([]);
    deviceService.me.mockRejectedValue(new Error('Network Error'));
  });

  afterEach(() => sinRed(true));

  it('una identificación exitosa deja la copia durable', async () => {
    deviceService.me.mockResolvedValue({ enrolledTenantId: 'org1', enrolledTenantName: 'HaA Fitness' });
    gymService.getUserGyms.mockResolvedValue([{ id: 'org1', name: 'HaA Fitness', role: 'owner' }]);

    await pintar();

    // Sin esto no hay nada de lo que acordarse después, y es la única parte del flujo que
    // sale con una sucursal CONFIRMADA por el servidor.
    expect(localStorage.getItem('terminal_org_id')).toBe('org1');
    expect(localStorage.getItem('terminal_org_role')).toBe('owner');
  });

  it('sin red entra con la recordada, sin preguntarle nada al servidor', async () => {
    yaSeIdentificoAntes();
    sinRed(false);

    await pintar();

    expect(deviceService.me).not.toHaveBeenCalled();
    expect(localStorage.getItem('current_org_id')).toBe('org1');
  });

  it('sin red entra por ACCESO, no por el Dashboard, aunque sea el dueño', async () => {
    // El Dashboard es, sin internet, la pantalla que menos sirve: todo lo que muestra viene
    // del servidor. El mostrador funciona entero contra la copia local. Sin conexión se
    // entra por la puerta que anda, no por la que corresponde al rol.
    yaSeIdentificoAntes(); // rol 'owner', que con red iría al Dashboard
    sinRed(false);

    await pintar();

    expect(navegado).toEqual(['/access']);
  });

  it('sin red NO pide el contexto de la sucursal', async () => {
    // Serían tres pedidos condenados a fallar (sucursal, suscripción, rol), cada uno con
    // sus reintentos, en el arranque de un terminal que ya sabe todo lo que necesita saber.
    yaSeIdentificoAntes();
    sinRed(false);

    await pintar();

    expect(auth.refreshOrgContext).not.toHaveBeenCalled();
  });

  it('⚠️ sin red NO se queda sin sucursal: el mostrador necesita saber de qué gimnasio es su copia', async () => {
    yaSeIdentificoAntes();
    localStorage.setItem('current_org_id', 'org1');
    sinRed(false);

    await pintar();

    // El bug era justamente este: `identificar` borra `current_org_id` para poder preguntar
    // limpio, y sin servidor no lo volvía a escribir nunca.
    expect(localStorage.getItem('current_org_id')).toBe('org1');
  });

  it('con la red caída pero el sistema diciendo que hay, también entra', async () => {
    // `navigator.onLine` da true cuando se está colgado de un router sin internet. El
    // error de transporte —sin respuesta HTTP— es la segunda señal, y lleva a lo mismo.
    yaSeIdentificoAntes();
    deviceService.me.mockRejectedValue(new Error('Network Error')); // sin `response`
    gymService.getUserGyms.mockResolvedValue([]);

    await pintar();

    expect(navegado).toEqual(['/access']);
    expect(localStorage.getItem('current_org_id')).toBe('org1');
  });

  it('un rechazo DEL SERVIDOR no se tapa con la sucursal recordada', async () => {
    // Un 403 sí dice algo sobre este equipo: que no puede abrir esa sucursal. Entrar igual
    // con la recordada sería esconder una respuesta legítima detrás de un dato viejo.
    yaSeIdentificoAntes();
    const rechazo = new Error('Este equipo pertenece a otra sucursal');
    rechazo.response = { status: 403 };
    deviceService.me.mockRejectedValue(rechazo);
    gymService.getUserGyms.mockResolvedValue([]);

    await pintar();

    expect(navegado).toEqual([]);
    expect(container.textContent).toContain('No pudimos identificar este equipo');
  });

  it('un terminal nuevo sin red sí muestra el error: no hay nada que recordar', async () => {
    sinRed(false);
    deviceService.me.mockRejectedValue(new Error('Network Error'));
    gymService.getUserGyms.mockResolvedValue([]);

    await pintar();

    expect(container.textContent).toContain('No pudimos identificar este equipo');
  });
});
