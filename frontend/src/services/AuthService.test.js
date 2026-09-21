// @vitest-environment happy-dom
// ============================================
// CERRAR SESIÓN: ESTE DISPOSITIVO, O TODOS
// ============================================
//
// `supabase.auth.signOut()` SIN parámetros es GLOBAL: revoca la sesión del usuario en todos
// los dispositivos (verificado en @supabase/auth-js 2.106.2: `signOut(options = { scope:
// 'global' })`). Así fue hasta la fase A de la sesión, y era el camino más grave hacia el
// login: el dueño tocaba "Salir" en el celular —o la app expulsaba sola en una máquina— y el
// mostrador caía al login una hora después, cuando le vencía el token, sin ninguna relación
// visible con lo que lo había causado.
//
// Instagram hace lo contrario, y esto también: salir en un dispositivo no toca a los demás.
// Cerrar en todos es una acción aparte, que alguien elige.
// ============================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const signOut = vi.fn(async () => ({ error: null }));
const onAuthStateChange = vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } }));

vi.mock('../lib/supabase', () => ({ supabase: { auth: { signOut, onAuthStateChange } } }));
vi.mock('../lib/authCode', () => ({ readAuthCode: () => null }));
vi.mock('../lib/desktopAuth', () => ({ startGoogleSignIn: vi.fn(), canUseBrowserSignIn: () => false }));

const { authService } = await import('./AuthService');

beforeEach(() => {
  signOut.mockClear();
  onAuthStateChange.mockClear();
});

describe('cerrar sesión', () => {
  it('⭐ "Salir" cierra SOLO este dispositivo', async () => {
    await authService.signOut();
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('cerrar en todos los dispositivos es una acción aparte, explícita', async () => {
    await authService.signOutEverywhere();
    expect(signOut).toHaveBeenCalledWith({ scope: 'global' });
  });
});

describe('los avisos de la sesión', () => {
  it('⭐ un 401 del backend NO se disfraza de "Supabase cerró la sesión"', () => {
    // Antes, el aviso 'auth-unauthorized' se reenviaba a los oyentes como un SIGNED_OUT
    // falso. El único registro de diagnóstico —"[auth] SIGNED_OUT: Supabase dio la sesión
    // por terminada"— quedaba mintiendo: decía que la cerró Supabase cuando la cerramos
    // nosotros. El 401 ya tiene quien lo atienda (AuthContext.logout).
    const eventos = [];
    const suscripcion = authService.onAuthStateChange((evento) => eventos.push(evento));

    window.dispatchEvent(new Event('auth-unauthorized'));
    suscripcion.unsubscribe();

    expect(eventos).toEqual([]);
  });
});
