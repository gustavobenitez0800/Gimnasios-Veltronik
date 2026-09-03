// @vitest-environment happy-dom
//
// ============================================
// VELTRONIK - Tests del aviso de versión nueva
// ============================================
// ⭐ EL PROBLEMA QUE ESTO ARREGLA, COMPROBADO EN VIVO: la app es una SPA con hash router.
// Moverse entre módulos NO recarga el documento, así que una pestaña abierta sigue corriendo
// el bundle con el que se abrió. En el gimnasio, el terminal se prende a la mañana y queda
// todo el día: un arreglo publicado al mediodía no le llega nunca.
//
// Lo que se defiende acá:
//   1. Que avise cuando el bundle publicado es distinto del que corre.
//   2. Que NO avise cuando es el mismo (un aviso que aparece sin motivo se ignora siempre).
//   3. Que NUNCA recargue solo: recargar a alguien en medio de un cobro le borra lo escrito.
//   4. Que sin internet no moleste.
//
// ⚠️ La salida trae varios "JavaScript file loading is disabled": es happy-dom avisando que
// NO ejecutó los <script> de mentira que estos tests cuelgan de la página para simular el
// bundle en curso. Es lo que queremos (nadie quiere que un test cargue scripts); no es un
// fallo y no hay nada que arreglar ahí.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

vi.mock('../lib/config', () => ({ default: { IS_DESKTOP: false } }));

const { useVersionNueva } = await import('./useVersionNueva');

let root;
let container;
let recargas;

/** Deja la página corriendo ese bundle, como lo haría Vite al servir el index. */
function corriendo(nombreBundle) {
  document.querySelectorAll('script[src]').forEach((s) => s.remove());
  const s = document.createElement('script');
  s.setAttribute('src', `/assets/${nombreBundle}`);
  document.head.appendChild(s);
}

/** Lo que contesta el servidor cuando se le pide el index.html. */
function servidorSirve(nombreBundle) {
  window.fetch = vi.fn(async () => ({
    ok: true,
    text: async () => `<!doctype html><script type="module" src="/assets/${nombreBundle}"></script>`,
  }));
}

/** Monta el hook y devuelve una función para leer su último valor. */
async function montar() {
  const valores = [];
  function Sonda() {
    valores.push(useVersionNueva());
    return null;
  }
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(<Sonda />); });
  return () => valores[valores.length - 1];
}

/** Empuja el reloj y deja que las promesas del hook terminen. */
async function pasaElTiempo(ms) {
  await act(async () => { vi.advanceTimersByTime(ms); });
  for (let i = 0; i < 6; i += 1) {
    await act(async () => { await Promise.resolve(); });
  }
}

const DIEZ_MINUTOS = 10 * 60 * 1000;

beforeEach(() => {
  vi.useFakeTimers();
  recargas = 0;
  // window.location.reload no se puede espiar directo en happy-dom: se reemplaza el objeto.
  delete window.location;
  window.location = { reload: () => { recargas += 1; } };
});

afterEach(() => {
  if (root) act(() => root.unmount());
  container?.remove();
  vi.useRealTimers();
});

describe('el aviso de versión nueva', () => {

  it('⭐ avisa cuando el servidor ya tiene otro bundle', async () => {
    corriendo('index-VIEJO.js');
    servidorSirve('index-NUEVO.js');
    const valor = await montar();

    expect(valor(), 'al abrir no avisa: todavía no preguntó').toBe(false);

    await pasaElTiempo(DIEZ_MINUTOS);

    expect(valor()).toBe(true);
  });

  it('no avisa si es la misma versión', async () => {
    corriendo('index-MISMO.js');
    servidorSirve('index-MISMO.js');
    const valor = await montar();

    await pasaElTiempo(DIEZ_MINUTOS);

    expect(valor(), 'un aviso que aparece sin motivo se ignora siempre').toBe(false);
  });

  /**
   * ⚠️ LA REGLA QUE NO SE PUEDE ROMPER. Recargar por su cuenta a alguien que está a mitad de
   * un cobro le borra lo que estaba escribiendo. El hook avisa; recarga la persona.
   */
  it('⚠️ NUNCA recarga solo', async () => {
    corriendo('index-VIEJO.js');
    servidorSirve('index-NUEVO.js');
    await montar();

    await pasaElTiempo(DIEZ_MINUTOS * 3);

    expect(recargas).toBe(0);
  });

  it('sin internet no molesta', async () => {
    corriendo('index-VIEJO.js');
    window.fetch = vi.fn(async () => { throw new Error('sin señal'); });
    const valor = await montar();

    await pasaElTiempo(DIEZ_MINUTOS);

    expect(valor(), 'el que está sin señal ya tiene otro problema').toBe(false);
  });

  it('pide el index SIN caché: si no, el navegador contesta el viejo y no detecta nada', async () => {
    corriendo('index-VIEJO.js');
    servidorSirve('index-NUEVO.js');
    await montar();

    await pasaElTiempo(DIEZ_MINUTOS);

    const [url, opciones] = window.fetch.mock.calls[0];
    expect(url).toContain('/index.html');
    expect(url, 'un parámetro que cambia, para que el CDN no lo sirva de su caché').toContain('?v=');
    expect(opciones.cache).toBe('no-store');
  });

  /**
   * El aviso también se dispara al volver a la pestaña, y eso no tiene ritmo propio: alt-tab
   * o mover la ventana lo llaman muchas veces seguidas. Sin freno, una tarde de idas y
   * vueltas son cientos de pedidos para preguntar algo que cambia una vez por día.
   */
  it('⚠️ volver a la pestaña muchas veces NO dispara un pedido por vez', async () => {
    corriendo('index-VIEJO.js');
    servidorSirve('index-NUEVO.js');
    await montar();

    for (let i = 0; i < 10; i += 1) {
      await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    }
    for (let i = 0; i < 6; i += 1) { await act(async () => { await Promise.resolve(); }); }

    expect(window.fetch.mock.calls.length, 'diez idas y vueltas, un solo pedido').toBeLessThanOrEqual(1);
  });

  it('en desarrollo (sin bundle con hash) no pregunta nada', async () => {
    document.querySelectorAll('script[src]').forEach((s) => s.remove());
    window.fetch = vi.fn();
    await montar();

    await pasaElTiempo(DIEZ_MINUTOS);

    expect(window.fetch).not.toHaveBeenCalled();
  });
});
