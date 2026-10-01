// @vitest-environment happy-dom
//
// ============================================
// VELTRONIK - apiClient sin conexión: a la velocidad del clic
// ============================================
// ⭐ EL REPORTE (dueño, 2026-09-30): "la versión offline es demasiado lenta, tiene que funcionar
// a la velocidad del click".
//
// Cada servicio ya sabía caer a su copia local ante un corte. Lo lento era ENTERARSE del corte:
// cada pedido salía, esperaba morir en la red, gastaba su reintento, y recién ahí caía a la
// copia. En cada clic. Lo que se fija acá:
//   1. Declarado el corte, el pedido no sale: falla en el acto, sin leer la sesión ni reintentar.
//   2. Un pedido que muere en el transporte pregunta si hay servidor antes de reintentar.
//   3. Una lectura que estaba en el aire se suelta al cortarse, y sale como "sin conexión".
//   4. La web no cambia: ahí nadie vigila y todo sigue como estaba.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CanceledError } from 'axios';

const getSession = vi.fn();
vi.mock('./supabase', () => ({
  supabase: { auth: { getSession, refreshSession: vi.fn(), signOut: vi.fn() } },
  INITIAL_URL: '',
}));
vi.mock('./deviceId', () => ({ getDeviceId: () => null }));
vi.mock('./shift', () => ({ getShiftId: () => null }));

/** La conexión, en manos del test. `errorSinConexion` va real: es el contrato con los servicios. */
const estado = { cortado: false, vigila: true, hayServidor: true, corte: new AbortController() };
const sondear = vi.fn(async () => estado.hayServidor);
const avisarQueContesto = vi.fn();
vi.mock('./conexion', async () => {
  const real = await vi.importActual('./conexion');
  return {
    ...real,
    cortado: () => estado.cortado,
    vigila: () => estado.vigila,
    sondear: (...a) => sondear(...a),
    avisarQueContesto: (...a) => avisarQueContesto(...a),
    senalDelCorte: () => estado.corte.signal,
  };
});

async function montar(responder) {
  vi.resetModules();
  const { default: apiClient } = await import('./apiClient');
  const salidas = [];
  apiClient.defaults.adapter = async (config) => {
    salidas.push(config);
    return responder(config, salidas.length);
  };
  return { apiClient, salidas };
}

const ok = (config) => ({ status: 200, data: { ok: true }, headers: {}, config });
/** Lo que llega cuando el pedido muere en el camino: un error SIN respuesta. */
const muereEnLaRed = (config) => {
  const e = new Error('Network Error');
  e.code = 'ERR_NETWORK';
  e.config = config;
  return Promise.reject(e);
};

beforeEach(() => {
  getSession.mockReset();
  getSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } });
  sondear.mockClear();
  avisarQueContesto.mockClear();
  estado.cortado = false;
  estado.vigila = true;
  estado.hayServidor = true;
  estado.corte = new AbortController();
  localStorage.clear();
});

describe('⭐ con el corte declarado, el pedido no sale', () => {
  it('falla en el acto: ni sale, ni lee la sesión, ni pregunta por el servidor', async () => {
    estado.cortado = true;
    const { apiClient, salidas } = await montar(ok);

    const error = await apiClient.get('/gym/members/paged').catch((e) => e);

    expect(salidas, 'no salió a la red').toHaveLength(0);
    expect(getSession, 'ni siquiera leyó la sesión').not.toHaveBeenCalled();
    expect(sondear).not.toHaveBeenCalled();
    // Sin `response`: los servicios lo leen como un corte y van a su copia.
    expect(error.sinConexion).toBe(true);
    expect(error.response).toBeUndefined();
  });

  it('las escrituras también: el servicio que tiene cola la usa en el acto', async () => {
    estado.cortado = true;
    const { apiClient, salidas } = await montar(ok);

    const error = await apiClient.post('/gym/payments', { amount: 1 }).catch((e) => e);

    expect(salidas).toHaveLength(0);
    expect(error.sinConexion).toBe(true);
  });
});

describe('⭐ un pedido que muere en la red pregunta por qué', () => {
  it('sin servidor: falla YA, sin gastar el reintento', async () => {
    estado.hayServidor = false;
    const { apiClient, salidas } = await montar(muereEnLaRed);

    const error = await apiClient.get('/gym/members/paged').catch((e) => e);

    expect(sondear).toHaveBeenCalledTimes(1);
    expect(salidas, 'un solo intento: el reintento esperaba para nada').toHaveLength(1);
    expect(error.response).toBeUndefined();
  });

  it('con servidor, fue un parpadeo: reintenta como siempre', async () => {
    const { apiClient, salidas } = await montar((config, n) => (n === 1 ? muereEnLaRed(config) : ok(config)));

    const { data } = await apiClient.get('/gym/members/paged');

    expect(sondear).toHaveBeenCalledTimes(1);
    expect(salidas).toHaveLength(2);
    expect(data.ok).toBe(true);
  });

  it('en la WEB no pregunta nada: el reintento de siempre, como antes', async () => {
    estado.vigila = false;
    const { apiClient, salidas } = await montar((config, n) => (n === 1 ? muereEnLaRed(config) : ok(config)));

    await apiClient.get('/gym/members/paged');

    expect(sondear).not.toHaveBeenCalled();
    expect(salidas).toHaveLength(2);
  });
});

describe('⭐ lo que estaba en el aire cuando se cortó', () => {
  /** Como el adaptador de axios (xhr.js): si la señal se aborta, cancela con la config puesta. */
  const colgado = (config) => new Promise((_, rechazar) => {
    config.signal?.addEventListener('abort', () => rechazar(new CanceledError(null, config)));
  });

  it('una lectura se suelta al cortarse, y sale como "sin conexión" (no como "canceled")', async () => {
    const { apiClient, salidas } = await montar(colgado);

    const pedido = apiClient.get('/gym/caja/abierto').catch((e) => e);
    await vi.waitFor(() => expect(salidas).toHaveLength(1));
    estado.cortado = true;
    estado.corte.abort();
    const error = await pedido;

    // "canceled" en inglés es lo que alguna pantalla terminaría mostrando tal cual.
    expect(error.sinConexion).toBe(true);
    expect(error.message).not.toMatch(/cancel/i);
  });

  it('una ESCRITURA no: puede que ya haya llegado, y el servicio sabe qué hacer si no vuelve', async () => {
    const { apiClient, salidas } = await montar(ok);

    await apiClient.post('/gym/payments', { amount: 1 });
    await apiClient.get('/gym/payments');

    expect(salidas[0].signal, 'el cobro no se ata al corte').toBeUndefined();
    expect(salidas[1].signal).toBeDefined();
  });

  it('en la web nada se ata al corte', async () => {
    estado.vigila = false;
    const { apiClient, salidas } = await montar(ok);

    await apiClient.get('/gym/payments');

    expect(salidas[0].signal).toBeUndefined();
  });
});

describe('cualquier respuesta prueba que hay servidor', () => {
  it('una respuesta buena lo avisa', async () => {
    const { apiClient } = await montar(ok);
    await apiClient.get('/algo');
    expect(avisarQueContesto).toHaveBeenCalled();
  });

  it('un 404 también: es alguien del otro lado', async () => {
    const { apiClient } = await montar((config) => {
      const e = new Error('404');
      e.response = { status: 404, data: {}, headers: {}, config };
      e.config = config;
      return Promise.reject(e);
    });

    await apiClient.get('/algo').catch(() => {});

    expect(avisarQueContesto).toHaveBeenCalled();
    expect(sondear, 'no hace falta preguntar: contestó').not.toHaveBeenCalled();
  });
});
