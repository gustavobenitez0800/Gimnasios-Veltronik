// @vitest-environment happy-dom
//
// happy-dom y no jsdom: ver la nota de DeviceGate.test.jsx.
// ============================================
// VELTRONIK - Tests del alta de un gimnasio (el cartel de lo que se va a cobrar)
// ============================================
// El alta de una sucursal adicional decía "Se activa al pagar • $55.000/mes por sucursal",
// el precio del básico, y al ir a activarla aparecían los dos planes: Veltronik y Veltronik
// Premium. Acá se cuida que el cartel diga los mismos planes que la página de activación, y
// que sin la lista no invente ningún número.
// ============================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

const BASICO = { code: 'BASICO', name: 'Veltronik', price: 55000 };
const PREMIUM = { code: 'PREMIUM', name: 'Veltronik Premium', price: 145000 };

/** SIEMPRE LOS MISMOS OBJETOS: uno nuevo por render re-dispararía los efectos de la página. */
const auth = { user: { email: 'dueno@gimnasio.com' } };
const toast = { showToast: vi.fn() };
const apiClient = { get: vi.fn(), post: vi.fn() };
const gymService = { getUserGyms: vi.fn() };

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../contexts/ToastContext', () => ({ useToast: () => toast }));
vi.mock('../lib/apiClient', () => ({ default: apiClient }));
vi.mock('../services', () => ({ gymService }));
vi.mock('../lib/config', () => ({ default: { ROUTES: { LOBBY: '/lobby' } } }));
vi.mock('../components/Icon', () => ({ default: () => null }));
vi.mock('../components/LogoPicker', () => ({ default: () => null }));

const { default: OnboardingPage } = await import('./OnboardingPage');
const { olvidarPlanes } = await import('../lib/planes');

let root;
let container;

async function pintar() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(<OnboardingPage />); });
  for (let i = 0; i < 4; i += 1) {
    await act(async () => { await Promise.resolve(); });
  }
  return container;
}

const texto = () => container.textContent.replace(/\s+/g, ' ');

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  olvidarPlanes();
  // Una sucursal ya existe: esta es la adicional, la que se activa pagando.
  gymService.getUserGyms.mockResolvedValue([{ id: 'org1' }]);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('el cartel de una sucursal adicional', () => {
  it('⭐ dice los dos planes con sus precios, como la página de activación', async () => {
    apiClient.get.mockResolvedValue({ data: [BASICO, PREMIUM] });
    await pintar();

    expect(apiClient.get).toHaveBeenCalledWith('/public/plans');
    expect(texto()).toContain('Sucursal adicional · Se activa al pagar');
    expect(texto()).toContain(
      'Al activarla elegís el plan: Veltronik $55.000/mes o Veltronik Premium $145.000/mes',
    );
    // El cartel de antes: el precio del básico como si fuera el único.
    expect(texto()).not.toContain('por sucursal');
  });

  it('con un solo plan a la venta, solo ese', async () => {
    apiClient.get.mockResolvedValue({ data: [BASICO] });
    await pintar();

    expect(texto()).toContain('Al activarla elegís el plan: Veltronik $55.000/mes');
    expect(texto()).not.toContain('Premium');
  });

  it('si el backend no contesta, no inventa ningún precio', async () => {
    apiClient.get.mockRejectedValue(new Error('sin conexión'));
    await pintar();

    expect(texto()).toContain('Al activarla elegís el plan');
    expect(texto()).not.toContain('$');
  });
});

describe('la primera sucursal', () => {
  it('sigue ofreciendo la prueba gratis, sin precios', async () => {
    gymService.getUserGyms.mockResolvedValue([]);
    apiClient.get.mockResolvedValue({ data: [BASICO, PREMIUM] });
    await pintar();

    expect(texto()).toContain('14 días de prueba GRATIS');
    expect(texto()).not.toContain('Sucursal adicional');
    expect(texto()).not.toContain('$');
  });
});
