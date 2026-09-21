// @vitest-environment happy-dom
// ============================================
// EL LOBBY NO CONFUNDE "NO PUDE TRAERLOS" CON "NO TENÉS"
// ============================================
//
// `gymService.getUserGyms()` se tragaba el error y devolvía `[]`. Con un corte de red en el
// arranque, el Lobby del portal quedaba igual que el de un usuario nuevo: "Registrá tu
// Gimnasio · Empezá tus 14 días gratis". Un dueño que ya tiene gimnasio podía terminar
// creando uno duplicado —que además entra como segunda sucursal, sin prueba y pidiendo pago—.
// ============================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

const gymService = { getUserGyms: vi.fn() };
const auth = { profile: { fullName: 'Dueño' }, logout: vi.fn(), refreshOrgContext: vi.fn() };
const toast = { showToast: vi.fn() };

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../contexts/ToastContext', () => ({ useToast: () => toast }));
vi.mock('../services', () => ({ gymService }));
vi.mock('../services/GroupService', () => ({ groupService: { getMyGroups: vi.fn(async () => []) } }));
vi.mock('../services/AccountService', () => ({ accountService: { getDeletionStatus: vi.fn(async () => null) } }));
vi.mock('../hooks', () => ({ useVisualViewport: () => {}, useMonthlyPrice: () => 55000 }));
vi.mock('../lib/apiClient', () => ({ default: { get: vi.fn(async () => ({ data: [] })) } }));
vi.mock('../lib/api', () => ({ apiCall: vi.fn() }));
vi.mock('../lib/portal', () => ({ openPortal: vi.fn() }));
vi.mock('../components/UpdateIndicator', () => ({ default: () => null }));
vi.mock('../components/CuentaEnBorrado', () => ({ default: () => null }));
vi.mock('../components/BorrarCuentaModal', () => ({ default: () => null }));
vi.mock('../components/Icon', () => ({ default: () => null }));
vi.mock('../components/GymLogo', () => ({ default: () => null }));
vi.mock('../assets/LogotipoSecundario.png', () => ({ default: 'logo.png' }));

const { default: LobbyPage } = await import('./LobbyPage');

let root;
let container;

async function pintar() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(<LobbyPage />); });
  for (let i = 0; i < 6; i += 1) {
    await act(async () => { await Promise.resolve(); });
  }
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('la primera carga del Lobby', () => {
  it('⭐ si no pudo traer los gimnasios, lo dice y ofrece Reintentar — NO "Registrá tu gimnasio"', async () => {
    gymService.getUserGyms.mockRejectedValue(new Error('Network Error'));

    await pintar();

    expect(container.textContent).toContain('No pudimos traer tus gimnasios');
    expect(container.textContent).toContain('Reintentar');
    expect(container.textContent).not.toContain('Registrá tu Gimnasio');
  });

  it('un usuario nuevo de verdad (lista vacía) sí ve "Registrá tu gimnasio"', async () => {
    gymService.getUserGyms.mockResolvedValue([]);

    await pintar();

    expect(container.textContent).toContain('Registrá tu Gimnasio');
    expect(container.textContent).not.toContain('No pudimos traer tus gimnasios');
  });
});
