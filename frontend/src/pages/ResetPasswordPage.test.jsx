// @vitest-environment happy-dom
//
// happy-dom y no jsdom: ver la nota de DeviceGate.test.jsx.
// ============================================
// VELTRONIK - La pantalla de la contraseña nueva, al volver del link del correo
// ============================================
// Hasta el 2026-11-01, si el link ya no servía (el `?code=` vence a los 5 minutos de pedirlo y
// solo anda en el navegador donde se pidió), a los 4 segundos se mostraba el formulario igual:
// la persona escribía la contraseña dos veces y recién ahí le decía "Auth session missing".
// ============================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

const authService = vi.hoisted(() => ({
  verifyRecoveryLink: vi.fn(),
  exchangeRecoveryCode: vi.fn(),
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(() => ({ unsubscribe: () => {} })),
  updatePassword: vi.fn(),
  signOutEverywhere: vi.fn(),
}));
const toast = vi.hoisted(() => ({ showToast: () => {} }));

vi.mock('react-router-dom', () => ({ Link: ({ children }) => <a>{children}</a>, useNavigate: () => () => {} }));
vi.mock('../contexts/ToastContext', () => ({ useToast: () => toast }));
vi.mock('../lib/config', () => ({ default: { ROUTES: { LOGIN: '/' } } }));
vi.mock('../services', () => ({ authService, errorService: { getMessage: (e) => e.message } }));
vi.mock('../components/Icon', () => ({ default: () => null }));
vi.mock('../assets/marca-veltronik.svg', () => ({ default: 'logo.svg' }));

const { default: ResetPasswordPage } = await import('./ResetPasswordPage');

let root;
let container;

async function pintar() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(<ResetPasswordPage />); });
}

const texto = () => container.textContent.replace(/\s+/g, ' ');

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  authService.verifyRecoveryLink.mockResolvedValue(false);
  authService.exchangeRecoveryCode.mockResolvedValue(false);
  authService.getSession.mockRejectedValue(new Error('No session found'));
});

afterEach(() => {
  vi.useRealTimers();
  act(() => root.unmount());
  container.remove();
});

describe('la contraseña nueva, al volver del link', () => {
  it('⭐ con el token_hash de la plantilla nueva, abre el formulario sin probar el ?code=', async () => {
    authService.verifyRecoveryLink.mockResolvedValue(true);
    await pintar();
    expect(texto()).toContain('Restablecer contraseña');
    expect(authService.exchangeRecoveryCode).not.toHaveBeenCalled();
  });

  it('⭐ un token vencido o ya usado lo dice al toque, sin mostrar el formulario', async () => {
    authService.verifyRecoveryLink.mockRejectedValue(new Error('Email link is invalid or has expired'));
    await pintar();
    expect(texto()).toContain('Ese enlace ya no sirve');
    expect(texto()).toContain('¿Olvidaste tu contraseña?');
    expect(container.querySelector('form')).toBeNull();
  });

  it('con el ?code= de siempre que se puede canjear, abre el formulario', async () => {
    authService.exchangeRecoveryCode.mockResolvedValue(true);
    await pintar();
    expect(texto()).toContain('Restablecer contraseña');
  });

  it('⭐ sin token, sin código que sirva y sin sesión: a los 4 s dice que el enlace no sirve', async () => {
    vi.useFakeTimers();
    await pintar();
    expect(texto()).toContain('Verificando enlace');
    await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
    expect(texto()).toContain('Ese enlace ya no sirve');
    expect(container.querySelector('form')).toBeNull();
  });

  it('si la sesión aparece mientras tanto (un link con el formato viejo), el formulario abre', async () => {
    vi.useFakeTimers();
    await pintar();
    authService.getSession.mockResolvedValue({ access_token: 't' });
    await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
    expect(texto()).toContain('Restablecer contraseña');
  });
});
