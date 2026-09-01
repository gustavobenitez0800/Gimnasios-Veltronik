// @vitest-environment happy-dom
//
// ============================================
// VELTRONIK - Tests de la sesión en apiClient
// ============================================
// ⭐ EL BUG QUE MOTIVA ESTO: los dueños reportaron que el ESCRITORIO les pide usuario y
// contraseña de nuevo, solo. No es que la sesión venza: es que se la quemamos nosotros.
//
// Pasaba así. Si `getSession()` fallaba o se colgaba —el propio código admitía que puede
// colgarse por contención del lock de Supabase— el pedido salía IGUAL, sin la cabecera de
// autorización. Un pedido sin token es un 401 garantizado, y el 401 cerraba la sesión.
//
// Le pega al escritorio y casi no a la web porque el refresco del token puede tardar hasta
// 30 segundos (10 s de timeout, 3 intentos) y el mostrador consulta cada 15: un terminal
// prendido todo el día cae en esa ventana seguido. La web se abre, se usa y se cierra.
//
// Las dos reglas que se defienden acá:
//   1. Un pedido sin token NO SALE. Falla como error de red, que la app ya sabe reintentar.
//   2. Un 401 intenta renovar la sesión UNA vez antes de cerrarla.

import { describe, it, expect, beforeEach, vi } from 'vitest';

const getSession = vi.fn();
const refreshSession = vi.fn();
const signOut = vi.fn();

vi.mock('./supabase', () => ({
  supabase: { auth: { getSession, refreshSession, signOut } },
  INITIAL_URL: '',
}));
vi.mock('./deviceId', () => ({ getDeviceId: () => null }));
vi.mock('./shift', () => ({ getShiftId: () => null }));

const conSesion = (token) => ({ data: { session: { access_token: token } } });
const sinSesion = { data: { session: null } };

/** Carga apiClient de cero y le pone un adaptador falso que registra lo que sale. */
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
const noAutorizado = (config) => {
  const e = new Error('401');
  e.response = { status: 401, data: {}, headers: {}, config };
  e.config = config;
  return Promise.reject(e);
};

describe('la sesión no se quema sola', () => {
  beforeEach(() => {
    getSession.mockReset();
    refreshSession.mockReset();
    signOut.mockReset();
    localStorage.clear();
  });

  it('con sesión, el pedido sale con el token', async () => {
    getSession.mockResolvedValue(conSesion('tok-1'));
    const { apiClient, salidas } = await montar(ok);

    await apiClient.get('/algo');

    expect(salidas).toHaveLength(1);
    expect(salidas[0].headers.Authorization).toBe('Bearer tok-1');
  });

  // ⭐ EL TEST DEL BUG
  it('si no se puede leer la sesión, el pedido NO SALE', async () => {
    // Antes salía sin token, el backend devolvía 401 y eso cerraba la sesión: el dueño
    // veía la pantalla de login con un socio esperando en el mostrador.
    getSession.mockRejectedValue(new Error('lock de Supabase'));
    const { apiClient, salidas } = await montar(ok);

    await expect(apiClient.get('/algo')).rejects.toMatchObject({ sinSesion: true });

    expect(salidas, 'no puede haber salido ningún pedido sin token').toHaveLength(0);
    expect(signOut, 'y sobre todo: NO se cierra la sesión').not.toHaveBeenCalled();
  });

  it('una sesión vacía tampoco manda el pedido', async () => {
    getSession.mockResolvedValue(sinSesion);
    const { apiClient, salidas } = await montar(ok);

    await expect(apiClient.get('/algo')).rejects.toMatchObject({ sinSesion: true });
    expect(salidas).toHaveLength(0);
  });

  it('insiste: si el primer intento falla y el segundo anda, el pedido sale', async () => {
    // El caso real: el token se está renovando justo cuando el mostrador consulta. Es
    // cuestión de milisegundos, no de una sesión perdida.
    getSession
      .mockRejectedValueOnce(new Error('en pleno refresco'))
      .mockResolvedValue(conSesion('tok-2'));
    const { apiClient, salidas } = await montar(ok);

    await apiClient.get('/algo');

    expect(salidas).toHaveLength(1);
    expect(salidas[0].headers.Authorization).toBe('Bearer tok-2');
  });

  // ⭐ EL OTRO TEST DEL BUG
  it('un 401 intenta RENOVAR antes de cerrar la sesión', async () => {
    // Después de renovar, `getSession()` devuelve el token nuevo: es lo que hace Supabase
    // de verdad, y es de donde lo toma el reintento.
    getSession.mockResolvedValueOnce(conSesion('tok-viejo')).mockResolvedValue(conSesion('tok-nuevo'));
    refreshSession.mockResolvedValue(conSesion('tok-nuevo'));
    const { apiClient, salidas } = await montar((config, nro) =>
      nro === 1 ? noAutorizado(config) : ok(config),
    );

    const r = await apiClient.get('/algo');

    expect(r.status).toBe(200);
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(salidas[1].headers.Authorization, 'el reintento va con el token nuevo').toBe('Bearer tok-nuevo');
    expect(signOut, 'la sesión se salvó: no se cierra').not.toHaveBeenCalled();
  });

  it('si la renovación tampoco puede, ahí sí se cierra la sesión', async () => {
    // Una sesión muerta de verdad tiene que cerrarse: dejar al usuario dando vueltas con
    // una sesión inválida es peor que pedirle que entre de nuevo.
    getSession.mockResolvedValue(conSesion('tok-muerto'));
    refreshSession.mockResolvedValue(sinSesion);
    const avisos = [];
    window.addEventListener('auth-unauthorized', () => avisos.push(1));

    const { apiClient } = await montar(noAutorizado);

    await expect(apiClient.get('/algo')).rejects.toBeDefined();

    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalled();
    expect(avisos.length).toBeGreaterThan(0);
  });

  it('no entra en ciclo: el reintento por 401 se hace UNA sola vez', async () => {
    // Si el servidor rechaza el token pase lo que pase, renovar y reintentar sin freno
    // sería un bucle infinito contra la nube.
    getSession.mockResolvedValue(conSesion('tok'));
    refreshSession.mockResolvedValue(conSesion('otro-tok'));
    const { apiClient, salidas } = await montar(noAutorizado);

    await expect(apiClient.get('/algo')).rejects.toBeDefined();

    expect(salidas.length, 'el original y UN reintento, nada más').toBe(2);
    expect(refreshSession).toHaveBeenCalledTimes(1);
  });
});
