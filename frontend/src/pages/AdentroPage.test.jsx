// @vitest-environment happy-dom
//
// happy-dom y no jsdom: jsdom arrastra undici, que usa `markAsUncloneable` de
// worker_threads SIN protección, y esa función existe recién en Node 22. CI corre en
// Node 20 a propósito —el mismo que arma el instalador en release.yml— así que jsdom
// rompía ahí aunque pasara en la máquina de desarrollo.
// ============================================
// VELTRONIK - Tests de "En el gimnasio"
// ============================================
// La pantalla que contesta "¿quién está adentro ahora?". Sale del mismo pedido que el
// mostrador, pero acá la información ES la pantalla, no un costado.
// ============================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

/** Estables a propósito: un objeto nuevo por render dispara un bucle infinito y cuelga el test. */
const toastEstable = { showToast: vi.fn() };
const accessService = { getMostrador: vi.fn(), checkOut: vi.fn() };
const errorService = { getMessage: (e) => String(e?.message || e) };

vi.mock('../contexts/ToastContext', () => ({ useToast: () => toastEstable }));
vi.mock('../services', () => ({ accessService, errorService }));
vi.mock('../lib/gym', () => ({ GYM: { placeLabel: 'gimnasio', placeLabelCap: 'Gimnasio' } }));
vi.mock('../components/Layout', () => ({ PageHeader: () => null }));
vi.mock('../components/Icon', () => ({ default: () => null }));

const mostrador = vi.hoisted(() => ({
  datos: { adentro: [], hoy: [], avisos: [], ingresos: [], hoyTotal: 0, hoyPromedioMin: null },
}));
vi.mock('../hooks', () => ({
  useQueryCache: () => ({
    data: mostrador.datos,
    loading: false,
    isFetching: false,
    invalidate: vi.fn(),
  }),
  // El latido tiene sus propios tests en el mostrador; acá solo estorbaría con timers.
  useRefrescoAutomatico: () => {},
}));

const { default: AdentroPage } = await import('./AdentroPage');

const visita = (id, nombre, extra = {}) => ({
  id,
  member: { id: `m-${id}`, fullName: nombre, dni: '24732531' },
  checkInAt: '2026-09-02T10:00:00',
  checkOutAt: null,
  accessMethod: 'qr',
  ...extra,
});

let root;
let container;

async function pintar() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(<AdentroPage />); });
  await act(async () => { await Promise.resolve(); });
  return container;
}

const cifras = () => [...container.querySelectorAll('.stat-value')].map((e) => e.textContent);

beforeEach(() => {
  vi.clearAllMocks();
  mostrador.datos = { adentro: [], hoy: [], avisos: [], ingresos: [], hoyTotal: 0, hoyPromedioMin: null };
});

afterEach(() => {
  if (root) act(() => root.unmount());
  container?.remove();
});

describe('En el gimnasio', () => {

  it('muestra los tres números del día', async () => {
    mostrador.datos = {
      ...mostrador.datos,
      adentro: [visita('a1', 'Lurdes Rollet')],
      hoyTotal: 11,
      hoyPromedioMin: 43,
    };
    await pintar();

    expect(cifras()).toEqual(['1', '11', '43 min']);
  });

  // ⚠️ `hoy` llega RECORTADO a 30 filas: contarlo diría "30 accesos" en un gimnasio que tuvo
  // 250. El total y el promedio los calcula el backend sobre el día completo.
  it('⚠️ el total del día lo dice el backend, no el largo de la lista', async () => {
    mostrador.datos = {
      ...mostrador.datos,
      adentro: [],
      hoy: [visita('h1', 'Uno'), visita('h2', 'Dos')],
      hoyTotal: 250,
      hoyPromedioMin: 61,
    };
    await pintar();

    expect(cifras()[1], 'el 250 del backend, no los 2 renglones que llegaron').toBe('250');
  });

  it('sin nadie adentro lo dice, en vez de mostrar una lista vacía', async () => {
    await pintar();
    expect(container.textContent).toContain('Nadie en el gimnasio');
  });

  it('lista a cada uno con su hora de entrada y su botón de salida', async () => {
    mostrador.datos = { ...mostrador.datos, adentro: [visita('a1', 'Lurdes Rollet')] };
    await pintar();

    const item = container.querySelector('.checked-in-item');
    expect(item).toBeTruthy();
    expect(item.textContent).toContain('Lurdes Rollet');
    expect(item.querySelector('.checkout-btn'), 'se puede marcar la salida desde acá').toBeTruthy();
  });

  it('marcar la salida se la pide al servidor', async () => {
    accessService.checkOut.mockResolvedValue({});
    mostrador.datos = { ...mostrador.datos, adentro: [visita('a1', 'Lurdes Rollet')] };
    await pintar();

    await act(async () => {
      container.querySelector('.checkout-btn').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(accessService.checkOut).toHaveBeenCalledWith('a1');
  });

  // El que entró y todavía no salió tiene que distinguirse de un renglón a medio cargar.
  it('en el registro, al que sigue adentro le dice "Adentro" en vez de dejar la salida vacía', async () => {
    mostrador.datos = {
      ...mostrador.datos,
      hoy: [visita('h1', 'Lurdes Rollet'), visita('h2', 'Pedro Gómez', { checkOutAt: '2026-09-02T11:30:00' })],
      hoyTotal: 2,
    };
    await pintar();

    const filas = container.querySelectorAll('tbody tr');
    expect(filas).toHaveLength(2);
    expect(filas[0].textContent).toContain('Adentro');
  });
});
