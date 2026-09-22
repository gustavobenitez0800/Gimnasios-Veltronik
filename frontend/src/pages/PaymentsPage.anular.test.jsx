// @vitest-environment happy-dom
//
// ============================================
// VELTRONIK - Pagos: el total del período y el cobro anulado (2026-09-22)
// ============================================
// Dos cosas que la pantalla tiene que decir bien:
//   1. "Ingresos del período" es el número del SERVIDOR (el libro de ingresos), el mismo del
//      tablero y la caja, con las ventas dichas aparte. Antes se sumaba acá con parseFloat.
//   2. Un cobro no se borra: se ANULA, con motivo, y queda en la lista tachado.
// Datos inventados (el repositorio es público).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

const PAGOS = [
  {
    id: 'p1', member_id: 'm1', member: { id: 'm1', fullName: 'Ana Gómez', dni: '30111222' },
    amount: 45000, paymentDate: '2026-09-10', paymentMethod: 'cash', status: 'paid',
    notes: '', periodStart: null, periodEnd: null, importado: false, cerradoEnCaja: true,
  },
  {
    id: 'p2', member_id: 'm2', member: { id: 'm2', fullName: 'Beto Ruiz', dni: '31222333' },
    amount: 30000, paymentDate: '2026-09-11', paymentMethod: 'transfer', status: 'cancelled',
    notes: '', periodStart: null, periodEnd: null, importado: false,
    anuladoPorNombre: 'Gustavo', motivoAnulacion: 'Se cargó dos veces',
  },
];

const toastEstable = { showToast: vi.fn() };
const authEstable = { orgRole: 'owner', profile: { fullName: 'Gustavo' } };
const anularPayment = vi.fn();
const controladorEstable = {
  payments: PAGOS,
  // Lo que contó el servidor: los 45.000 cobrados y 5.000,50 de ventas de la caja.
  ingresos: { total: 50000.5, otrosIngresos: 5000.5, historial: 0 },
  loading: false,
  error: null,
  refresh: vi.fn(),
  savePayment: vi.fn(),
  anularPayment,
};

vi.mock('../contexts/ToastContext', () => ({ useToast: () => toastEstable }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => authEstable }));
vi.mock('../services', () => ({
  memberService: { searchForAccess: vi.fn().mockResolvedValue([]), getMemberById: vi.fn() },
  errorService: { getMessage: (e) => String(e?.message || e) },
  planService: { getVigentes: () => Promise.resolve([]) },
}));
vi.mock('../controllers/usePaymentController', () => ({
  usePaymentController: () => controladorEstable,
}));

const { default: PaymentsPage } = await import('./PaymentsPage');

let root;
let container;

async function pintar() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<MemoryRouter initialEntries={['/pagos']}><PaymentsPage /></MemoryRouter>);
  });
  for (let i = 0; i < 4; i++) await act(async () => { await Promise.resolve(); });
  return document.body.textContent.replace(/\s/g, '');
}

async function clic(el) {
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  for (let i = 0; i < 4; i++) await act(async () => { await Promise.resolve(); });
}

const setValor = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  anularPayment.mockResolvedValue({ pago: {}, vencimientoRestaurado: '2026-09-15T10:00:00' });
});

afterEach(() => {
  if (root) act(() => root.unmount());
  container?.remove();
});

describe('Pagos', () => {
  it('⭐ "Ingresos del período" es el total del servidor, con los centavos y las ventas dichas aparte', async () => {
    const texto = await pintar();
    expect(texto).toContain('$50.000,50Ingresosdelperíodo');
    expect(texto).toContain('Incluye$5.000,50deventasdelacaja');
  });

  it('⭐ el cobro anulado queda en la lista, tachado, con quién y por qué', async () => {
    const texto = await pintar();
    expect(texto).toContain('BetoRuiz');
    expect(texto).toContain('AnuladoporGustavo:Secargódosveces');
    const fila = [...container.querySelectorAll('tr')].find((tr) => tr.textContent.includes('Beto Ruiz'));
    expect(fila.className).toContain('pago-anulado');
    expect(fila.querySelector('button[title="Anular"]'), 'un anulado ya no se toca').toBeNull();
  });

  it('anular pide el motivo, y sin motivo no anula', async () => {
    await pintar();
    await clic(container.querySelector('button[title="Anular"]'));
    expect(document.body.textContent).toContain('¿Por qué se anula?');

    const enviar = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Anular cobro');
    await clic(enviar);
    expect(anularPayment).not.toHaveBeenCalled();

    const motivo = document.getElementById('motivo-anulacion');
    await act(async () => {
      setValor.call(motivo, 'Era de otro socio');
      motivo.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await clic(enviar);
    expect(anularPayment).toHaveBeenCalledWith('p1', { motivo: 'Era de otro socio', anuladoPor: 'Gustavo' });
    expect(toastEstable.showToast.mock.calls.at(-1)[0]).toContain('vuelve a vencer');
  });

  it('avisa que un cobro ya cerrado en caja va a entrar como corrección si se edita', async () => {
    await pintar();
    await clic(container.querySelector('button[title="Editar"]'));
    expect(document.body.textContent).toContain('ya entró en un cierre de caja');
  });
});
