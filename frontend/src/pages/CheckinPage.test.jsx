// @vitest-environment happy-dom
// ============================================
// EL CELULAR DEL SOCIO: MARCAR ENTRADA Y SALIDA
// ============================================
// Lo que se defiende (reportado por el dueño el 2026-09-22):
//   1. El botón dice lo que el SERVIDOR sabe, y lo vuelve a preguntar al volver a mirar el
//      teléfono: si el mostrador le marcó la salida, no sigue diciendo "Marcá tu salida".
//   2. Cada marca dice qué quiere hacer el socio: el servidor ya no es un interruptor.
//   3. Salir a los dos minutos de entrar no se puede, y salir son dos toques.
// ============================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const api = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock('../lib/apiClient', () => ({ default: api }));

const { default: CheckinPage } = await import('./CheckinPage');

let root;
let container;
let estado;

/** El servidor de mentira: el estado se puede cambiar entre pedido y pedido. */
function servidor({ marca } = {}) {
  api.post.mockImplementation(async (url, body) => {
    if (url === '/public/checkin/estado') return { data: { ...estado } };
    return { data: marca ? marca(body) : { ok: true, direccion: 'ENTRADA', titulo: '¡Hola!', detalle: 'Entrada registrada.' } };
  });
}

async function tick(n = 6) {
  for (let i = 0; i < n; i += 1) await act(async () => { await Promise.resolve(); });
}

async function pintar() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/marcar/tok']}>
        <Routes><Route path="/marcar/:token" element={<CheckinPage />} /></Routes>
      </MemoryRouter>,
    );
  });
  await tick();
}

const boton = (texto) => [...container.querySelectorAll('button')].find((b) => b.textContent.includes(texto));
const pedidosDeEstado = () => api.post.mock.calls.filter(([u]) => u === '/public/checkin/estado').length;
const marcas = () => api.post.mock.calls.filter(([u]) => u === '/public/checkin').map(([, b]) => b);

async function clic(el) {
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await tick();
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  localStorage.setItem('veltronik_checkin_doc_tok', '30111222');
  estado = { adentro: false, desde: null, faltaParaSalir: 0 };
});

afterEach(() => {
  vi.useRealTimers();
  if (root) act(() => root.unmount());
  container?.remove();
});

describe('el celular del socio', () => {
  it('afuera: ofrece la entrada, y la marca dice que quiere ENTRAR', async () => {
    servidor();
    await pintar();

    expect(container.textContent).toContain('Marcá tu entrada');
    await clic(boton('Marcar entrada'));

    expect(marcas()[0]).toMatchObject({ documento: '30111222', quiere: 'ENTRADA' });
  });

  it('⭐ recién entrado: dice desde cuándo está adentro y NO ofrece la salida todavía', async () => {
    estado = { adentro: true, desde: '2026-09-22T18:05:00', faltaParaSalir: 15 * 60 };
    servidor();
    await pintar();

    expect(container.textContent).toContain('Estás adentro');
    expect(container.textContent).toContain('Entraste a las 18:05');
    expect(container.textContent).toContain('Se habilita en 15 minutos');
    expect(boton('Marcar salida'), 'el curioso no tiene qué tocar').toBeFalsy();
  });

  it('la salida aparece sola cuando se cumplen los 20 minutos', async () => {
    vi.useFakeTimers();
    estado = { adentro: true, desde: '2026-09-22T18:05:00', faltaParaSalir: 60 };
    servidor();
    await pintar();
    expect(boton('Marcar salida')).toBeFalsy();

    await act(async () => { vi.advanceTimersByTime(61_000); });

    expect(boton('Marcar salida')).toBeTruthy();
  });

  it('⭐ salir son dos toques, y la marca dice que quiere SALIR', async () => {
    estado = { adentro: true, desde: '2026-09-22T18:05:00', faltaParaSalir: 0 };
    servidor({ marca: () => ({ ok: true, direccion: 'SALIDA', titulo: '¡Hasta luego!', detalle: 'Salida registrada.' }) });
    await pintar();

    await clic(boton('Marcar salida'));
    expect(marcas(), 'el primer toque todavía no marca nada').toHaveLength(0);
    expect(container.textContent).toContain('¿Ya te vas?');
    expect(boton('No, sigo entrenando')).toBeTruthy();

    await clic(boton('Sí, marcar salida'));
    expect(marcas()[0]).toMatchObject({ quiere: 'SALIDA' });
  });

  it('"No, sigo entrenando" vuelve atrás sin marcar nada', async () => {
    estado = { adentro: true, desde: '2026-09-22T18:05:00', faltaParaSalir: 0 };
    servidor();
    await pintar();

    await clic(boton('Marcar salida'));
    await clic(boton('No, sigo entrenando'));

    expect(marcas()).toHaveLength(0);
    expect(container.textContent).toContain('Estás adentro');
  });

  it('⭐ al volver a mirar el teléfono pregunta de nuevo: si el mostrador le marcó la salida, se entera', async () => {
    estado = { adentro: true, desde: '2026-09-22T18:05:00', faltaParaSalir: 0 };
    servidor();
    await pintar();
    expect(boton('Marcar salida')).toBeTruthy();

    // El mostrador le marcó la salida mientras el teléfono estaba en el bolsillo.
    estado = { adentro: false, desde: null, faltaParaSalir: 0 };
    const antes = pedidosDeEstado();
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    await tick();

    expect(pedidosDeEstado()).toBeGreaterThan(antes);
    expect(boton('Marcar salida')).toBeFalsy();
    expect(container.textContent).toContain('Marcá tu entrada');
  });

  it('si igual tocó con el botón viejo, el servidor dice que ya salió y el botón se corrige', async () => {
    estado = { adentro: true, desde: '2026-09-22T18:05:00', faltaParaSalir: 0 };
    servidor({ marca: () => ({ ok: true, direccion: 'YA_AFUERA', titulo: 'Tu salida ya está registrada', detalle: 'Quedó marcada a las 19:40.' }) });
    await pintar();
    estado = { adentro: false, desde: null, faltaParaSalir: 0 };

    await clic(boton('Marcar salida'));
    await clic(boton('Sí, marcar salida'));
    expect(container.textContent).toContain('Quedó marcada a las 19:40');

    await clic(boton('Listo'));
    expect(container.textContent).toContain('Marcá tu entrada');
  });

  it('sin saber el estado (sin señal), no adivina: la marca va sin intención y decide el servidor', async () => {
    api.post.mockImplementation(async (url) => {
      if (url === '/public/checkin/estado') throw new Error('Network Error');
      return { data: { ok: true, direccion: 'ENTRADA', titulo: '¡Hola!', detalle: 'Entrada registrada.' } };
    });
    await pintar();

    await clic(boton('Marcar'));

    expect(marcas()[0].quiere).toBeUndefined();
  });
});
