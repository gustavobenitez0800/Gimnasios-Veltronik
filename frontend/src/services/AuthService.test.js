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
const signUp = vi.fn(async () => ({ data: { user: { id: 'u1' }, session: null }, error: null }));
const initialize = vi.fn(async () => ({ error: null }));
const verifyOtp = vi.fn(async () => ({ data: { session: { access_token: 't' } }, error: null }));

vi.mock('../lib/supabase', () => ({
  supabase: { auth: { signOut, onAuthStateChange, signUp, initialize, verifyOtp } },
}));
const recuperacion = { tokenHash: null };
const clearRecoveryTokenHash = vi.fn();
vi.mock('../lib/authCode', () => ({
  readAuthCode: () => null,
  readRecoveryTokenHash: () => recuperacion.tokenHash,
  clearRecoveryTokenHash,
}));
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

describe('el alta y el link del correo', () => {
  it('⭐ el alta marca su vuelta con ?alta=1, para que la app sepa que el `?code=` es de un alta', async () => {
    await authService.signUp('dueno@gym.com', 'secreta', 'Ana Pérez');
    const { options } = signUp.mock.calls.at(-1)[0];
    expect(options.emailRedirectTo).toBe(`${window.location.origin}/?alta=1`);
    expect(options.data).toEqual({ first_name: 'Ana', last_name: 'Pérez' });
  });

  it('el token_hash se canjea con verifyOtp, después de que el cliente terminó de arrancar', async () => {
    await authService.confirmarCorreo('xyz', 'email');
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: 'xyz', type: 'email' });
    expect(initialize.mock.invocationCallOrder[0]).toBeLessThan(verifyOtp.mock.invocationCallOrder[0]);
  });

  it('un token_hash vencido falla, para que el arranque lo anote y siga', async () => {
    verifyOtp.mockResolvedValueOnce({ data: {}, error: new Error('Email link is invalid or has expired') });
    await expect(authService.confirmarCorreo('xyz', 'email')).rejects.toThrow('expired');
  });
});

describe('el link de recuperar la contraseña', () => {
  it('⭐ el token_hash se canjea como recuperación y sale de la barra de direcciones', async () => {
    recuperacion.tokenHash = 'rec123';
    clearRecoveryTokenHash.mockClear();
    await expect(authService.verifyRecoveryLink()).resolves.toBe(true);
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: 'rec123', type: 'recovery' });
    expect(clearRecoveryTokenHash).toHaveBeenCalled();
  });

  it('uno vencido falla, y también sale de la barra (si no, se reintenta en cada recarga)', async () => {
    recuperacion.tokenHash = 'rec123';
    clearRecoveryTokenHash.mockClear();
    verifyOtp.mockResolvedValueOnce({ data: {}, error: new Error('Email link is invalid or has expired') });
    await expect(authService.verifyRecoveryLink()).rejects.toThrow('expired');
    expect(clearRecoveryTokenHash).toHaveBeenCalled();
  });

  it('sin token (el ?code= de siempre) no hace nada', async () => {
    recuperacion.tokenHash = null;
    verifyOtp.mockClear();
    await expect(authService.verifyRecoveryLink()).resolves.toBe(false);
    expect(verifyOtp).not.toHaveBeenCalled();
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
