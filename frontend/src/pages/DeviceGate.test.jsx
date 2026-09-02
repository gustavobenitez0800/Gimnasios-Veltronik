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
