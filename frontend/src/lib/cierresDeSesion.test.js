// @vitest-environment happy-dom
//
// ============================================
// VELTRONIK - Tests de "por qué se cerró la sesión"
// ============================================
// Lo que importa acá: que un cierre no se cuente dos veces (Supabase emite su evento también
// cuando cerramos nosotros), que no se anote un cierre en una app donde nunca entró nadie, y
// que nada de esto pueda romper o demorar un cierre de sesión.
// ============================================

import { describe, it, expect, beforeEach, vi } from 'vitest';

const post = vi.fn();
vi.mock('./apiClient', () => ({ default: { post } }));

const {
  MOTIVOS, MAXIMO_PENDIENTES, anotarCierre, anotarSiHabiaSesion, recordarQueHaySesion,
  habiaSesion, cierresPendientes, subirCierres, subirCierresSinDemorar,
} = await import('./cierresDeSesion');

beforeEach(() => {
  post.mockReset();
  window.localStorage.clear();
  delete window.electronAPI;
});

describe('anotar un cierre', () => {
  it('queda guardado con su motivo, cuándo pasó, de quién era y desde dónde', () => {
    window.electronAPI = {};
    recordarQueHaySesion('u-orlando');

    anotarCierre(MOTIVOS.RESPUESTA_401, { detalle: 'GET /gym/access/mostrador' });

    const [cierre] = cierresPendientes();
    expect(cierre.motivo).toBe('RESPUESTA_401');
    expect(cierre.detalle).toBe('GET /gym/access/mostrador');
    expect(cierre.userId).toBe('u-orlando');
    expect(cierre.plataforma).toBe('escritorio');
    expect(cierre.clientRef).toMatch(/^[0-9a-f-]{36}$/);
    // Hora local SIN zona, como la cola del mostrador: el servidor la lee tal cual.
    expect(cierre.ocurridoEn).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
  });

  it('en el navegador dice "web"', () => {
    anotarCierre(MOTIVOS.USUARIO);
    expect(cierresPendientes()[0].plataforma).toBe('web');
  });

  it('guarda los últimos veinte: los más viejos se van', () => {
    for (let i = 0; i < MAXIMO_PENDIENTES + 5; i += 1) anotarCierre(MOTIVOS.USUARIO, { detalle: `n${i}` });

    const lista = cierresPendientes();
    expect(lista).toHaveLength(MAXIMO_PENDIENTES);
    expect(lista[0].detalle).toBe('n5');
    expect(lista.at(-1).detalle).toBe(`n${MAXIMO_PENDIENTES + 4}`);
  });

  it('con el almacenamiento roto no tira: un cierre de sesión no se frena por esto', () => {
    const roto = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('lleno'); });
    expect(() => anotarCierre(MOTIVOS.USUARIO)).not.toThrow();
    expect(() => recordarQueHaySesion('u1')).not.toThrow();
    roto.mockRestore();
  });

  it('basura guardada de antes no rompe nada', () => {
    window.localStorage.setItem('veltronik_cierres_de_sesion', '{esto no es una lista');
    expect(cierresPendientes()).toEqual([]);
    anotarCierre(MOTIVOS.USUARIO);
    expect(cierresPendientes()).toHaveLength(1);
  });
});

describe('los cierres que nadie pidió', () => {
  // Cada apertura de una app en la que nunca entró nadie termina en "no hay sesión".
  it('⚠️ sin una sesión previa NO se anota nada', () => {
    expect(anotarSiHabiaSesion(MOTIVOS.SE_PERDIO_AL_ABRIR)).toBe(false);
    expect(cierresPendientes()).toEqual([]);
  });

  it('si había alguien adentro, se anota y dice quién', () => {
    recordarQueHaySesion('u-orlando');

    expect(anotarSiHabiaSesion(MOTIVOS.SE_PERDIO_AL_ABRIR)).toBe(true);

    expect(cierresPendientes()[0]).toMatchObject({ motivo: 'SE_PERDIO_AL_ABRIR', userId: 'u-orlando' });
  });

  // Cuando cerramos nosotros (un botón, o un 401), Supabase emite SIGNED_OUT igual. Y cuando
  // rechaza el token al abrir, llegan su evento Y el "abrí y no había nada".
  it('⚠️ un mismo cierre no se cuenta dos veces', () => {
    recordarQueHaySesion('u-orlando');

    anotarCierre(MOTIVOS.USUARIO);                 // el botón
    anotarSiHabiaSesion(MOTIVOS.SUPABASE);         // el evento que le sigue
    anotarSiHabiaSesion(MOTIVOS.SE_PERDIO_AL_ABRIR); // y la apertura siguiente

    expect(cierresPendientes().map((c) => c.motivo)).toEqual(['USUARIO']);
    expect(habiaSesion()).toBeNull();
  });
});

describe('avisarle al servidor', () => {
  it('sube los pendientes y borra los que el servidor dijo que anotó', async () => {
    anotarCierre(MOTIVOS.USUARIO);
    anotarCierre(MOTIVOS.SUPABASE);
    const [uno, dos] = cierresPendientes();
    post.mockResolvedValue({ data: { anotados: [uno.clientRef] } });

    const cuantos = await subirCierres();

    expect(cuantos).toBe(1);
    expect(post).toHaveBeenCalledWith('/account/cierres-de-sesion', { cierres: [uno, dos] }, expect.anything());
    expect(cierresPendientes()).toEqual([dos]);
  });

  // Avisar de un cierre no puede provocar otro.
  it('⚠️ el pedido va marcado para que un 401 suyo no cierre la sesión', async () => {
    anotarCierre(MOTIVOS.USUARIO);
    post.mockResolvedValue({ data: { anotados: [] } });

    await subirCierres();

    expect(post.mock.calls[0][2]).toMatchObject({ __noCierraSesion: true });
  });

  it('si el servidor no contesta, no tira y quedan para la próxima', async () => {
    anotarCierre(MOTIVOS.USUARIO);
    post.mockRejectedValue(new Error('sin servidor'));

    await expect(subirCierres()).resolves.toBe(0);

    expect(cierresPendientes()).toHaveLength(1);
  });

  it('sin pendientes no molesta al servidor', async () => {
    await expect(subirCierres()).resolves.toBe(0);
    expect(post).not.toHaveBeenCalled();
  });

  it('un cierre anotado mientras el pedido viajaba no se pierde', async () => {
    anotarCierre(MOTIVOS.USUARIO);
    const [primero] = cierresPendientes();
    let contestar;
    post.mockReturnValue(new Promise((resolve) => { contestar = resolve; }));

    const subida = subirCierres();
    anotarCierre(MOTIVOS.SUPABASE);
    contestar({ data: { anotados: [primero.clientRef] } });
    await subida;

    expect(cierresPendientes().map((c) => c.motivo)).toEqual(['SUPABASE']);
  });

  it('dos subidas a la vez son un solo pedido', async () => {
    anotarCierre(MOTIVOS.USUARIO);
    post.mockResolvedValue({ data: { anotados: [] } });

    await Promise.all([subirCierres(), subirCierres()]);

    expect(post).toHaveBeenCalledTimes(1);
  });

  it('"Salir" no espera más de lo que se le dice: un servidor colgado no lo demora', async () => {
    vi.useFakeTimers();
    anotarCierre(MOTIVOS.USUARIO);
    post.mockReturnValue(new Promise(() => {})); // no contesta nunca

    const espera = subirCierresSinDemorar(2000);
    await vi.advanceTimersByTimeAsync(2000);

    await expect(espera).resolves.toBe(0);
    expect(cierresPendientes()).toHaveLength(1);
    vi.useRealTimers();
  });
});
