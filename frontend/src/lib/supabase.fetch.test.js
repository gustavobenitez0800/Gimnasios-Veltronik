// @vitest-environment happy-dom
//
// ============================================
// VELTRONIK - El fetch de Supabase y los reintentos
// ============================================
// ⭐ EL BUG QUE MOTIVA ESTO: "el escritorio me manda al login solo, en medio de la atención".
//
// El refresh token de Supabase es de UN SOLO USO y rota. El servidor lo consume, emite uno
// nuevo, y tolera que se vuelva a presentar el viejo solo durante ~10 segundos. Pasada esa
// ventana, un token reusado se interpreta como token ROBADO y Supabase revoca la familia de
// sesiones entera.
//
// Le inyectábamos a TODO el cliente un fetch con reintentos (10 s de timeout, 2 reintentos),
// así que caíamos justo del lado malo:
//
//   t=0 s     sale el refresh con RT1 → el servidor CONSUME RT1 y emite RT2
//   t=10 s    la respuesta no volvió (el internet del gimnasio) → nuestro timeout aborta
//   t≈10,5 s  REINTENTO con el mismo RT1, ya fuera de la ventana → sesión revocada
//
// Lo que se defiende acá es una sola regla: UN PEDIDO QUE GASTA UNA CREDENCIAL DE UN SOLO USO
// NO SE REINTENTA. Y su reverso, que importa igual: el login SÍ se sigue reintentando, que es
// para lo que se construyó el fetch resiliente.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { createClient } = vi.hoisted(() => ({
  createClient: vi.fn(() => ({ auth: {} })),
}));
vi.mock('@supabase/supabase-js', () => ({ createClient }));

const BASE = 'http://localhost:54321/auth/v1';

/** Carga supabase.js de cero y devuelve el fetch que le pasó al cliente. */
async function fetchDelCliente() {
  vi.resetModules();
  createClient.mockClear();
  await import('./supabase');
  return createClient.mock.calls[0][2].global.fetch;
}

describe('el fetch que Supabase recibe', () => {
  let intentos;

  beforeEach(() => {
    intentos = [];
    // Falla como un error de RED (no como timeout): así el reintento dispara enseguida y el
    // test no tiene que esperar los 10 segundos del corte.
    vi.stubGlobal('fetch', vi.fn((input) => {
      intentos.push(String(input));
      return Promise.reject(new TypeError('Failed to fetch'));
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('NO reintenta la renovación del token: reintentarla revoca la sesión entera', async () => {
    const fetchDeSupabase = await fetchDelCliente();

    await expect(
      fetchDeSupabase(`${BASE}/token?grant_type=refresh_token`, { method: 'POST' }),
    ).rejects.toThrow();

    expect(
      intentos.length,
      'un solo tiro: el segundo presentaría un refresh token ya gastado y Supabase lo leería como robo',
    ).toBe(1);
  });

  it('NO reintenta el canje del código PKCE: el código ya se gastó', async () => {
    const fetchDeSupabase = await fetchDelCliente();

    await expect(
      fetchDeSupabase(`${BASE}/token?grant_type=pkce`, { method: 'POST' }),
    ).rejects.toThrow();

    expect(intentos.length).toBe(1);
  });

  it('SÍ reintenta el login: no gasta nada rotativo, y es para lo que existe el fetch resiliente', async () => {
    const fetchDeSupabase = await fetchDelCliente();

    await expect(
      fetchDeSupabase(`${BASE}/token?grant_type=password`, { method: 'POST' }),
    ).rejects.toThrow();

    expect(
      intentos.length,
      'tres intentos: un parpadeo de red no puede ser "Error de conexión" en el login',
    ).toBe(3);
  });

  it('SÍ reintenta el resto de las llamadas', async () => {
    const fetchDeSupabase = await fetchDelCliente();

    await expect(fetchDeSupabase(`${BASE}/user`, { method: 'GET' })).rejects.toThrow();

    expect(intentos.length).toBe(3);
  });

  it('reconoce la URL venga como string, como URL o como Request', async () => {
    const fetchDeSupabase = await fetchDelCliente();
    const url = `${BASE}/token?grant_type=refresh_token`;

    await expect(fetchDeSupabase(new URL(url), { method: 'POST' })).rejects.toThrow();
    expect(intentos.length, 'un objeto URL se lee igual que un string').toBe(1);

    intentos.length = 0;
    await expect(fetchDeSupabase({ url }, { method: 'POST' })).rejects.toThrow();
    expect(intentos.length, 'un Request expone su URL en .url').toBe(1);
  });
});
