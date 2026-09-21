// @vitest-environment happy-dom
//
// ============================================
// VELTRONIK - El período de cada arancel en el selector de Pagos
// ============================================
// Al cobrar, cada opción del selector dice qué período se está vendiendo: "Trimestral —
// $120.000 · 3 meses". Ese sufijo se armaba leyendo `durationDays`, que quedó congelado en
// la V65 (ADR-013): los aranceles creados desde el 2026-09-07 aparecían SIN período, y los
// viejos con el de antes de la migración —un Pase Anual decía "360 días"—.
//
// Estos tests dibujan Pagos de verdad y leen las opciones que ve el que cobra.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

// `durationDays` va a propósito con el valor que tienen de verdad en la base: 0 en los
// nuevos y el de antes de la migración en los viejos. La pantalla no tiene que mirarlo.
const ARANCELES = [
  { id: 'p1', name: 'Mensual', price: 45000, durationDays: 0, coberturaCantidad: 1, coberturaUnidad: 'MES', active: true },
  { id: 'p2', name: 'Trimestral', price: 120000, durationDays: 0, coberturaCantidad: 3, coberturaUnidad: 'MES', active: true },
  { id: 'p3', name: 'Pase Semanal', price: 15000, durationDays: 0, coberturaCantidad: 7, coberturaUnidad: 'DIA', active: true },
  { id: 'p4', name: 'Pase Anual', price: 400000, durationDays: 360, coberturaCantidad: 12, coberturaUnidad: 'MES', active: true },
  { id: 'p5', name: 'Clase suelta', price: 5000, durationDays: 0, coberturaCantidad: 0, coberturaUnidad: 'DIA', active: true },
];

// ⚠️ Objetos estables: un mock que devuelve uno nuevo en cada render le cambia la identidad a
// los callbacks que dependen de él, y los efectos entran en bucle.
const toastEstable = { showToast: vi.fn() };
const authEstable = { orgRole: 'owner', profile: { fullName: 'Gustavo' } };
const controladorEstable = {
  payments: [],
  loading: false,
  error: null,
  refresh: vi.fn(),
  savePayment: vi.fn(),
  deletePayment: vi.fn(),
};

vi.mock('../contexts/ToastContext', () => ({ useToast: () => toastEstable }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => authEstable }));
vi.mock('../services', () => ({
  memberService: { searchForAccess: vi.fn().mockResolvedValue([]), getMemberById: vi.fn() },
  errorService: { getMessage: (e) => String(e?.message || e) },
  planService: { getVigentes: () => Promise.resolve(ARANCELES) },
}));
vi.mock('../controllers/usePaymentController', () => ({
  usePaymentController: () => controladorEstable,
}));

const { default: PaymentsPage } = await import('./PaymentsPage');

let root;
let container;

/** Abre Pagos con el modal de cobro ya abierto, como llega desde el atajo del Dashboard. */
async function pintar() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/pagos?action=new']}>
        <PaymentsPage />
      </MemoryRouter>,
    );
  });
  for (let i = 0; i < 4; i++) {
    await act(async () => { await Promise.resolve(); });
  }
}

/** El texto de cada opción del selector de arancel, por id. */
function opcionesDeArancel() {
  const select = [...document.querySelectorAll('select')]
    .find((s) => s.options[0]?.textContent.includes('Sin arancel'));
  expect(select).toBeTruthy();
  return Object.fromEntries([...select.options].map((o) => [o.value, o.textContent]));
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  if (root) act(() => root.unmount());
  container?.remove();
});

describe('el selector de aranceles de Pagos dice qué período se vende', () => {

  it('un arancel creado después de la V65 muestra su período', async () => {
    // Tienen durationDays = 0: con la lectura vieja salían sin nada.
    await pintar();

    const opciones = opcionesDeArancel();
    expect(opciones.p1).toMatch(/· 1 mes$/);
    expect(opciones.p2).toMatch(/· 3 meses$/);
  });

  it('usa las mismas palabras que Ajustes', async () => {
    await pintar();

    expect(opcionesDeArancel().p3).toMatch(/· 1 semana$/);
  });

  // ⭐ EL CASO QUE MENTÍA
  it('un Pase Anual dice "1 año", no los 360 días de antes de la migración', async () => {
    await pintar();

    const anual = opcionesDeArancel().p4;
    expect(anual).toMatch(/· 1 año$/);
    expect(anual).not.toContain('360');
  });

  it('el que no corre el vencimiento lo avisa en vez de quedarse callado', async () => {
    await pintar();

    expect(opcionesDeArancel().p5).toMatch(/· No cubre tiempo$/);
  });
});
