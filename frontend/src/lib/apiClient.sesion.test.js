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

  // ⭐ EL TEST DE "QUEDA CARGANDO"
  //
  // `getSession()` no solo puede fallar: puede COLGARSE por contención del lock de
  // Supabase. Y una espera sin límite en el interceptor NO la salva el timeout de axios,
  // porque ese cubre la petición HTTP — y si el interceptor nunca termina, la petición
  // nunca sale. La promesa no se resuelve jamás.
  //
  // El síntoma es el peor de todos: la pantalla dice "Cargando…" para siempre, sin un
  // error en ningún lado, sin nada en la consola, sin nada que reintentar. Se ve como si
  // el sistema se hubiera colgado — y en la pantalla de Accesos, eso es el mostrador
  // parado.
  it('si la sesión se cuelga, el pedido FALLA en vez de colgarse para siempre', async () => {
    vi.useFakeTimers();
    try {
      // Una promesa que no se resuelve nunca: exactamente el lock trabado.
      getSession.mockReturnValue(new Promise(() => {}));
      const { apiClient, salidas } = await montar(ok);

      const pedido = apiClient.get('/algo');
      const resultado = pedido.then(() => 'resolvió').catch(() => 'falló');

      // Se deja correr MUCHO más que el techo de espera. Si no hubiera techo, acá seguiría
      // colgado y el test se quedaría esperando igual que la pantalla.
      await vi.advanceTimersByTimeAsync(30000);

      expect(await resultado).toBe('falló');
      expect(salidas, 'nunca salió el pedido, y está bien: no había token').toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

/**
 * ⭐⭐ EL BUG DEL QR: "la gente no puede entrar, dice que no funciona el servidor".
 *
 * La regla de arriba —un pedido sin token NO SALE— es correcta para las pantallas del
 * gimnasio, pero se aplicaba a TODO. Y hay endpoints que se llaman justamente sin sesión:
 * el socio que escanea el QR con su celular no tiene cuenta.
 *
 * El síntoma no se parecía a la causa. Como el error no traía respuesta HTTP, la pantalla
 * del QR lo tomaba por un corte de red, reintentaba treinta segundos y terminaba diciendo
 * "Sin señal, pedile al mostrador que te marque la entrada" — con el servidor sano del otro
 * lado y sin una sola petición saliendo del teléfono.
 */
describe('las rutas públicas no necesitan sesión', () => {
  beforeEach(() => {
    getSession.mockReset();
    refreshSession.mockReset();
    signOut.mockReset();
    localStorage.clear();
  });

  it('⭐ el check-in por QR SALE aunque no haya ninguna sesión', async () => {
    getSession.mockResolvedValue(sinSesion);
    const { apiClient, salidas } = await montar(ok);

    await apiClient.post('/public/checkin', { token: 't', documento: '12345678' });

    expect(salidas, 'el socio no tiene cuenta: este pedido tiene que salir igual').toHaveLength(1);
  });

  it('y sale sin cabecera de autorización', async () => {
    getSession.mockResolvedValue(sinSesion);
    const { apiClient, salidas } = await montar(ok);

    await apiClient.get('/public/plans');

    expect(salidas[0].headers.Authorization).toBeUndefined();
  });

  /**
   * No hay razón para contarle al endpoint público en qué sucursal está la sesión de otra
   * persona que abrió el navegador en la misma computadora.
   */
  it('tampoco lleva la sucursal de quien haya usado antes ese navegador', async () => {
    getSession.mockResolvedValue(sinSesion);
    localStorage.setItem('current_org_id', 'la-sucursal-de-otro');
    const { apiClient, salidas } = await montar(ok);

    await apiClient.post('/public/checkin/estado', { token: 't' });

    expect(salidas[0].headers['X-Tenant-ID']).toBeUndefined();
  });

  /**
   * El caso real del gimnasio: el escritorio está abierto en el mostrador con la sesión
   * trabada, y el socio escanea desde su celular. Una cosa no puede frenar a la otra.
   */
  it('si la sesión está colgada, la ruta pública sale igual y no espera', async () => {
    getSession.mockReturnValue(new Promise(() => {}));   // el lock trabado
    const { apiClient, salidas } = await montar(ok);

    await apiClient.post('/public/checkin', { token: 't', documento: '12345678' });

    expect(salidas).toHaveLength(1);
  });

  it('⚠️ pero una ruta privada SIGUE sin salir sin token', async () => {
    // La regla original no se tocó: es la que evita que un 401 cierre la sesión.
    getSession.mockResolvedValue(sinSesion);
    const { apiClient, salidas } = await montar(ok);

    await expect(apiClient.get('/gym/members')).rejects.toMatchObject({ sinSesion: true });
    expect(salidas).toHaveLength(0);
  });
});
