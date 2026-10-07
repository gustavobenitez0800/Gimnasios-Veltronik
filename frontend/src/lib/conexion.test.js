// @vitest-environment happy-dom
//
// ============================================
// VELTRONIK - Tests de lib/conexion
// ============================================
// ⭐ EL REPORTE QUE ORIGINA ESTO (dueño, 2026-09-30): "el modo offline es demasiado lento, tiene
// que funcionar a la velocidad del click" y "al prender internet no muestra los datos, tengo que
// salir y volver a entrar".
//
// Las dos cosas tenían la misma raíz: el offline le creía a `navigator.onLine`, que con el
// router prendido y sin internet —o con una placa virtual levantada, como en la PC del dueño—
// dice que hay red. Estos tests fijan que el corte y la vuelta los decide el SERVIDOR.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('./config', () => ({ default: { API_URL: 'https://api.ejemplo.test/api' } }));

const fetchOriginal = globalThis.fetch;

/** Un fetch que contesta (resuelve) o no (rechaza), a pedido del test. */
function servidor({ contesta }) {
  globalThis.fetch = vi.fn(() => (contesta.valor
    ? Promise.resolve({ ok: true, status: 200 })
    : Promise.reject(new TypeError('Failed to fetch'))));
}

/** El módulo de cero en cada test: guarda estado de módulo, y un test no puede heredar otro. */
async function cargar() {
  vi.resetModules();
  return import('./conexion');
}

// La vigilancia engancha oyentes en `window`, que es el mismo para todos los tests: sin
// soltarlos, el `online` de un test despertaría a los módulos de los anteriores.
let dejarDeVigilar = null;
function vigilar(c) {
  dejarDeVigilar = c.vigilarLaConexion();
}

function placaDeRed(hay) {
  Object.defineProperty(window.navigator, 'onLine', { value: hay, configurable: true });
}

/** Deja correr las promesas pendientes (el sondeo es async aunque el fetch conteste en el acto). */
async function drenar() {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
}

const contesta = { valor: true };

beforeEach(() => {
  vi.useFakeTimers();
  contesta.valor = true;
  servidor({ contesta });
  placaDeRed(true);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  dejarDeVigilar?.();
  dejarDeVigilar = null;
  vi.clearAllTimers();
  vi.useRealTimers();
  globalThis.fetch = fetchOriginal;
  placaDeRed(true);
  vi.restoreAllMocks();
});

describe('en la web no vigila: responde lo que dice el sistema, como antes', () => {
  it('sin placa de red, sin conexión; con placa, con conexión', async () => {
    const c = await cargar();

    expect(c.sinConexion()).toBe(false);
    placaDeRed(false);
    expect(c.sinConexion()).toBe(true);
  });

  it('un sondeo que falla NO declara el corte: en la web nada deja de salir', async () => {
    contesta.valor = false;
    const c = await cargar();

    await c.sondear();

    expect(c.sinConexion()).toBe(false);
    expect(c.cortado()).toBe(false);
  });
});

describe('⭐ en el escritorio el corte lo decide el servidor, no Windows', () => {
  it('sondea apenas arranca, sin esperar al primer pedido', async () => {
    const c = await cargar();

    vigilar(c);
    await drenar();

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch.mock.calls[0][0]).toBe('https://api.ejemplo.test/api');
  });

  it('⭐ Windows dice que hay red pero el servidor no contesta: SIN CONEXIÓN', async () => {
    // El caso del reporte: el router prendido (o una placa virtual) y nada del otro lado.
    contesta.valor = false;
    const c = await cargar();
    const avisos = [];
    c.alCambiarLaConexion((hay) => avisos.push(hay));

    vigilar(c);
    await drenar();

    expect(navigator.onLine, 'el sistema cree que hay red').toBe(true);
    expect(c.sinConexion()).toBe(true);
    expect(c.cortado()).toBe(true);
    expect(avisos).toEqual([false]);
  });

  it('con el servidor contestando, no se declara nada y no se avisa nada', async () => {
    const c = await cargar();
    const avisos = [];
    c.alCambiarLaConexion((hay) => avisos.push(hay));

    vigilar(c);
    await drenar();

    expect(c.sinConexion()).toBe(false);
    expect(avisos).toEqual([]);
  });

  it('un servidor que no contesta en el plazo cuenta como que no está', async () => {
    // Router sin salida a internet: el pedido no falla, se queda colgado. No se lo espera.
    globalThis.fetch = vi.fn((url, { signal }) => new Promise((_, rechazar) => {
      signal.addEventListener('abort', () => rechazar(new DOMException('abortado', 'AbortError')));
    }));
    const c = await cargar();

    vigilar(c);
    await drenar();
    expect(c.sinConexion(), 'todavía no se sabe').toBe(false);

    await vi.advanceTimersByTimeAsync(c.PLAZO_SONDEO_MS);

    expect(c.sinConexion()).toBe(true);
  });

  it('sin placa de red se declara el corte en el acto, sin preguntar', async () => {
    placaDeRed(false);
    const c = await cargar();

    vigilar(c);

    expect(c.cortado()).toBe(true);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('el aviso `offline` del sistema sí se cree', async () => {
    const c = await cargar();
    vigilar(c);
    await drenar();

    placaDeRed(false);
    window.dispatchEvent(new Event('offline'));

    expect(c.cortado()).toBe(true);
  });

  it('dos sondeos a la vez son uno solo', async () => {
    const c = await cargar();

    const a = c.sondear();
    const b = c.sondear();

    expect(a).toBe(b);
    await a;
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});

describe('⭐ y la vuelta también la decide el servidor', () => {
  async function cortada() {
    contesta.valor = false;
    const c = await cargar();
    const avisos = [];
    c.alCambiarLaConexion((hay) => avisos.push(hay));
    vigilar(c);
    await drenar();
    expect(c.cortado()).toBe(true);
    return { c, avisos };
  }

  it('sin conexión, sigue preguntando solo, y avisa la vuelta apenas contesta', async () => {
    // El otro medio del reporte: nadie avisaba que había vuelto internet.
    const { c, avisos } = await cortada();

    await vi.advanceTimersByTimeAsync(c.CADA_MS_SIN_CONEXION);
    expect(c.cortado(), 'sigue sin contestar').toBe(true);

    contesta.valor = true;
    await vi.advanceTimersByTimeAsync(c.CADA_MS_SIN_CONEXION);

    expect(c.cortado()).toBe(false);
    expect(avisos).toEqual([false, true]);
  });

  it('⚠️ SIN que llegue ningún `online`: con el router prendido ese evento no existe', async () => {
    // Nunca hubo un `offline`, así que tampoco hay `online` del que enterarse. Si la vuelta
    // dependiera de ese evento, sería este el caso que se queda colgado para siempre.
    const { c } = await cortada();
    const alOnline = vi.fn();
    window.addEventListener('online', alOnline);

    contesta.valor = true;
    await vi.advanceTimersByTimeAsync(c.CADA_MS_SIN_CONEXION);

    expect(alOnline).not.toHaveBeenCalled();
    expect(c.cortado()).toBe(false);
    window.removeEventListener('online', alOnline);
  });

  it('el `online` del sistema no se cree a ciegas: se pregunta', async () => {
    // Aparecer una placa no es tener internet (el router sin salida también la levanta).
    const { c } = await cortada();
    const antes = globalThis.fetch.mock.calls.length;

    window.dispatchEvent(new Event('online'));
    await drenar();

    expect(globalThis.fetch.mock.calls.length).toBe(antes + 1);
    expect(c.cortado(), 'el servidor sigue sin contestar').toBe(true);
  });

  it('cualquier respuesta de un pedido cuenta como vuelta', async () => {
    const { c, avisos } = await cortada();

    c.avisarQueContesto();

    expect(c.cortado()).toBe(false);
    expect(avisos).toEqual([false, true]);
  });

  it('ya de vuelta, deja de preguntar', async () => {
    const { c } = await cortada();
    contesta.valor = true;
    await vi.advanceTimersByTimeAsync(c.CADA_MS_SIN_CONEXION);
    const hechos = globalThis.fetch.mock.calls.length;

    await vi.advanceTimersByTimeAsync(c.CADA_MS_SIN_CONEXION * 5);

    expect(globalThis.fetch.mock.calls.length).toBe(hechos);
  });
});

describe('lo que el corte les da a los demás', () => {
  it('suelta la señal: los pedidos que estaban en el aire no esperan su plazo', async () => {
    contesta.valor = false;
    const c = await cargar();
    const senal = c.senalDelCorte();

    vigilar(c);
    await drenar();

    expect(senal.aborted).toBe(true);
  });

  it('y a la vuelta hay una señal nueva, sin abortar', async () => {
    contesta.valor = false;
    const c = await cargar();
    vigilar(c);
    await drenar();

    c.avisarQueContesto();

    expect(c.senalDelCorte().aborted).toBe(false);
  });

  it('`cuandoSeCorte` se resuelve al declararse, y en el acto si ya estaba', async () => {
    contesta.valor = false;
    const c = await cargar();
    let resuelta = false;
    c.cuandoSeCorte().then(() => { resuelta = true; });

    vigilar(c);
    await drenar();

    expect(resuelta).toBe(true);
    await expect(c.cuandoSeCorte()).resolves.toBeUndefined();
  });

  it('el error de "sin conexión" no trae respuesta: se trata igual que un corte de red', async () => {
    const c = await cargar();

    const e = c.errorSinConexion({ url: '/gym/members' });

    expect(e.response).toBeUndefined();
    expect(e.sinConexion).toBe(true);
    expect(e.config.url).toBe('/gym/members');
    expect(e.message).toMatch(/sin conexión/i);
  });
});
