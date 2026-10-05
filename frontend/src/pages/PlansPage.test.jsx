// @vitest-environment happy-dom
//
// happy-dom y no jsdom: ver la nota de DeviceGate.test.jsx.
// ============================================
// VELTRONIK - Tests de la página de planes (el muro de cobro de la web)
// ============================================
// Mercado Pago admite UN solo formulario de tarjeta vivo por página. Cuando se prendió el
// premium esta pantalla pasó a montar dos —uno por plan— y ningún test lo miraba: los dos
// formularios dibujados adentro de la tarjeta del primer plan y un "Cargando pago seguro…"
// que no terminaba nunca.
//
// Acá el formulario es un doble: lo que se prueba es CUÁNTOS monta la página y CUÁNDO deja
// cambiarlo, que es lo único que la página decide. Que el Brick real se rompe con dos a la
// vez, o si se lo saca a medio armar, se comprobó a mano contra el SDK de MP (ver la nota
// de CardCheckout.jsx).
// ============================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

const BASICO = { code: 'BASICO', name: 'Veltronik', tagline: 'El sistema.', price: 55000, features: ['Socios'] };
const PREMIUM = { code: 'PREMIUM', name: 'Veltronik Premium', tagline: 'Más la puerta.', price: 145000, features: ['Molinetes'] };

/** SIEMPRE EL MISMO OBJETO: uno nuevo por render re-dispararía los efectos de la página. */
const auth = { gym: { id: 'org1' }, subscription: null };
const apiClient = { get: vi.fn(), post: vi.fn() };

/** El `onBusyChange` de cada formulario montado, por plan: así el test hace de Brick. */
const avisarOcupado = {};

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../contexts/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../lib/config', () => ({
  default: { ROUTES: { DASHBOARD: '/dashboard', LOBBY: '/lobby' } },
}));
vi.mock('../lib/apiClient', () => ({ default: apiClient }));
vi.mock('../hooks/useMonthlyPrice', () => ({ useMonthlyPrice: () => 55000 }));
vi.mock('../components/Icon', () => ({ default: () => null }));
vi.mock('../components/CardCheckout', () => ({
  default: ({ plan, onBusyChange }) => {
    avisarOcupado[plan] = onBusyChange;
    return <div data-formulario={plan} />;
  },
}));

const { default: PlansPage } = await import('./PlansPage');

let root;
let container;

async function pintar() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(<PlansPage />); });
  await tick();
  return container;
}

async function tick() {
  for (let i = 0; i < 4; i += 1) {
    await act(async () => { await Promise.resolve(); });
  }
}

const formularios = () => [...container.querySelectorAll('[data-formulario]')].map((f) => f.dataset.formulario);
const boton = (texto) => [...container.querySelectorAll('button')].find((b) => b.textContent.trim() === texto);

async function click(elemento) {
  await act(async () => {
    elemento.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  apiClient.get.mockResolvedValue({ data: [BASICO, PREMIUM] });
});

afterEach(() => {
  if (root) act(() => root.unmount());
  container?.remove();
});

describe('la página de planes muestra un solo formulario de tarjeta por vez', () => {

  // ⚠️ ESTE ES EL BUG DEL "CARGANDO PAGO SEGURO…" QUE NO CARGABA NUNCA.
  it('⚠️ con dos planes no abre ninguno hasta que el cliente elige, y nunca hay dos', async () => {
    await pintar();

    expect(formularios(), 'dos planes no pueden ser dos formularios').toEqual([]);

    await click(boton('Contratar Veltronik Premium'));
    expect(formularios()).toEqual(['PREMIUM']);

    // Cambiar de idea cierra el anterior: sigue habiendo uno solo, y es el del plan nuevo.
    await click(boton('Contratar Veltronik'));
    expect(formularios()).toEqual(['BASICO']);
  });

  // Sacar un Brick a medio armar deja colgado al siguiente, y cambiar de plan con un cobro
  // andando es pedir dos suscripciones. El formulario avisa cuándo no se lo puede sacar.
  it('mientras el formulario abierto se arma o cobra, no deja cambiar de plan', async () => {
    await pintar();
    await click(boton('Contratar Veltronik Premium'));

    await act(async () => { avisarOcupado.PREMIUM(true); });
    expect(boton('Contratar Veltronik').disabled).toBe(true);
    await click(boton('Contratar Veltronik'));
    expect(formularios()).toEqual(['PREMIUM']);

    await act(async () => { avisarOcupado.PREMIUM(false); });
    expect(boton('Contratar Veltronik').disabled).toBe(false);
    await click(boton('Contratar Veltronik'));
    expect(formularios()).toEqual(['BASICO']);
  });

  it('con un solo plan el formulario sale directo, sin botón de por medio', async () => {
    apiClient.get.mockResolvedValue({ data: [BASICO] });

    await pintar();

    expect(formularios()).toEqual(['BASICO']);
    expect(boton('Contratar Veltronik')).toBeUndefined();
  });

  // La tarjeta de respaldo se ve desde el primer instante. Si además abriera el formulario,
  // al llegar el segundo plan habría que sacárselo: montar y desmontar el Brick en pleno
  // arranque, que es justo lo que lo deja colgado.
  it('no abre el formulario antes de saber cuántos planes hay', async () => {
    let contestar;
    apiClient.get.mockReturnValue(new Promise((resolve) => { contestar = resolve; }));

    await pintar();
    expect(container.querySelectorAll('.plans-card').length, 'el muro de pago no queda en blanco').toBe(1);
    expect(formularios()).toEqual([]);

    await act(async () => { contestar({ data: [BASICO, PREMIUM] }); });
    await tick();
    expect(container.querySelectorAll('.plans-card').length).toBe(2);
    expect(formularios()).toEqual([]);
  });

  it('si el backend no contesta, el plan de respaldo se puede pagar igual', async () => {
    apiClient.get.mockRejectedValue(new Error('sin servidor'));

    await pintar();

    expect(formularios()).toEqual(['BASICO']);
  });
});
