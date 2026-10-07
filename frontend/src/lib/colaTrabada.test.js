// @vitest-environment happy-dom
//
// ============================================
// VELTRONIK - Tests del aviso de cola trabada
// ============================================
// El terminal le cuenta al servidor que no le está aceptando lo que tiene para subir. Lo que
// se defiende acá: que avise, que no avise de más, y que avisar NO PUEDA ROMPER NADA — es un
// aviso de que algo ya anda mal, y si él también falla hay que callarse y seguir.
// ============================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const api = { post: vi.fn() };
vi.mock('./apiClient', () => ({ default: { post: (...a) => api.post(...a) } }));

const { avisarColaTrabada, olvidarAvisoDeColaTrabada, REPETIR_CADA_MS } = await import('./colaTrabada');

const TRABADA = {
  cuantos: 139,
  dias: 1,
  desde: '2026-10-05T19:47:13',
  trabada: { tipo: 'ALTA', status: 500, intentos: 288, error: 'HTTP 500 x288 · could not initialize proxy' },
};

beforeEach(() => {
  localStorage.clear();
  api.post.mockReset();
  api.post.mockResolvedValue({ status: 204 });
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 7, 8, 15, 0));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('avisar que la cola está trabada', () => {
  it('⭐ le cuenta al servidor qué traba, desde cuándo y cuántos hay detrás', async () => {
    const seEntero = await avisarColaTrabada(TRABADA);

    expect(seEntero).toBe(true);
    const [ruta, cuerpo] = api.post.mock.calls[0];
    expect(ruta).toBe('/account/cola-trabada');
    expect(cuerpo).toEqual({
      cuantos: 139,
      desde: '2026-10-05T19:47:13',
      tipo: 'ALTA',
      status: 500,
      intentos: 288,
      error: 'HTTP 500 x288 · could not initialize proxy',
    });
  });

  it('⚠️ su propio 401 no cierra la sesión: es un aviso, no un pedido del mostrador', async () => {
    await avisarColaTrabada(TRABADA);

    expect(api.post.mock.calls[0][2]).toMatchObject({ __noCierraSesion: true });
  });

  it('si la cola no está trabada, no hay nada que avisar', async () => {
    expect(await avisarColaTrabada({ cuantos: 3, dias: 0, desde: null, trabada: null })).toBe(false);
    expect(await avisarColaTrabada(null)).toBe(false);
    expect(api.post).not.toHaveBeenCalled();
  });

  it('no repite el aviso en cada vuelta del vaciado: una vez cada media hora', async () => {
    await avisarColaTrabada(TRABADA);
    vi.advanceTimersByTime(5 * 60 * 1000);

    const seEntero = await avisarColaTrabada(TRABADA);

    expect(api.post).toHaveBeenCalledTimes(1);
    expect(seEntero, 'pero el servidor ya lo sabe, y la pantalla puede decirlo').toBe(true);
  });

  it('si sigue trabada, pasado el rato vuelve a avisar', async () => {
    await avisarColaTrabada(TRABADA);
    vi.advanceTimersByTime(REPETIR_CADA_MS + 1000);

    await avisarColaTrabada(TRABADA);

    expect(api.post).toHaveBeenCalledTimes(2);
  });

  it('⚠️ si el aviso falla NO rompe nada, y dice la verdad: el servidor no se enteró', async () => {
    api.post.mockRejectedValue(new Error('Network Error'));

    const seEntero = await avisarColaTrabada(TRABADA);

    expect(seEntero, 'la pantalla no puede afirmar "ya avisamos"').toBe(false);

    // Y se vuelve a intentar en la próxima vuelta, sin esperar la media hora.
    api.post.mockResolvedValue({ status: 204 });
    expect(await avisarColaTrabada(TRABADA)).toBe(true);
    expect(api.post).toHaveBeenCalledTimes(2);
  });

  it('cuando se destraba se olvida: un atasco nuevo se avisa en el acto', async () => {
    await avisarColaTrabada(TRABADA);
    olvidarAvisoDeColaTrabada();
    vi.advanceTimersByTime(60 * 1000);

    await avisarColaTrabada(TRABADA);

    expect(api.post).toHaveBeenCalledTimes(2);
  });
});
