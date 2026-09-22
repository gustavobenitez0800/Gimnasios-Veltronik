// @vitest-environment happy-dom
// ============================================
// EL MOSTRADOR SE ENTERA AL INSTANTE DE LO QUE PASA EN LA PUERTA
// ============================================
// La queja del dueño, convertida en prueba: por QR el cartel, el aviso y la X llegaban tarde.
// Lo que se defiende: que pregunte seguido, que pida el mostrador SOLO cuando algo cambió, y que
// el escritorio siga escuchando con la ventana tapada.
// ============================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

const api = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../lib/apiClient', () => ({ default: api }));
const config = vi.hoisted(() => ({ IS_DESKTOP: true }));
vi.mock('../lib/config', () => ({ default: config }));

const { useNovedadesDeLaPuerta, CADA_MS } = await import('./useNovedadesDeLaPuerta');

let root;
let container;
let alCambiar;

function Prueba({ activo = true }) {
  useNovedadesDeLaPuerta(alCambiar, activo);
  return null;
}

async function montar(props) {
  container = document.createElement('div');
  root = createRoot(container);
  await act(async () => { root.render(<Prueba {...props} />); });
}

/** De a medio segundo, dejando que cada respuesta llegue: como pasa el tiempo de verdad. */
async function pasar(ms) {
  for (let hecho = 0; hecho < ms; hecho += 500) {
    await act(async () => { vi.advanceTimersByTime(500); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  }
}

function marcas(...lista) {
  let i = 0;
  api.get.mockImplementation(async () => ({ data: { marca: lista[Math.min(i++, lista.length - 1)] } }));
}

function visible(si) {
  Object.defineProperty(document, 'visibilityState', { value: si ? 'visible' : 'hidden', configurable: true });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  alCambiar = vi.fn();
  config.IS_DESKTOP = true;
  visible(true);
});

afterEach(() => {
  act(() => root?.unmount());
  vi.useRealTimers();
  visible(true);
});

describe('las novedades de la puerta', () => {
  it('pregunta cada 2 segundos', async () => {
    marcas('1:a');
    await montar();
    await pasar(CADA_MS * 3);

    expect(api.get.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(api.get).toHaveBeenCalledWith('/gym/access/novedades', expect.anything());
  });

  it('⭐ la primera respuesta es el punto de partida: no pide nada', async () => {
    marcas('3:x', '3:x', '3:x');
    await montar();
    await pasar(CADA_MS * 2);

    expect(alCambiar).not.toHaveBeenCalled();
  });

  it('⭐ cuando alguien marca por QR, pide el mostrador una vez, y no de nuevo si nada cambia', async () => {
    marcas('3:x', '3:x', '4:y', '4:y', '4:y');
    await montar();
    await pasar(CADA_MS * 5);

    expect(alCambiar).toHaveBeenCalledTimes(1);
  });

  it('⭐ el escritorio sigue escuchando con la ventana tapada', async () => {
    marcas('3:x', '4:y');
    visible(false);
    await montar();
    await pasar(CADA_MS * 2);

    expect(alCambiar).toHaveBeenCalledTimes(1);
  });

  it('en el navegador, una pestaña que nadie mira no pregunta', async () => {
    config.IS_DESKTOP = false;
    marcas('3:x', '4:y');
    visible(false);
    await montar();
    await pasar(CADA_MS * 3);

    expect(api.get).not.toHaveBeenCalled();
  });

  it('sin red no pregunta', async () => {
    marcas('3:x');
    await montar({ activo: false });
    await pasar(CADA_MS * 3);

    expect(api.get).not.toHaveBeenCalled();
  });

  it('no encima pedidos si el anterior no volvió', async () => {
    api.get.mockImplementation(() => new Promise(() => {})); // nunca contesta
    await montar();
    await pasar(CADA_MS * 5);

    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it('un backend viejo (sin el endpoint) no rompe nada', async () => {
    api.get.mockRejectedValue(Object.assign(new Error('404'), { response: { status: 404 } }));
    await montar();
    await pasar(CADA_MS * 3);

    expect(alCambiar).not.toHaveBeenCalled();
  });
});
