// @vitest-environment happy-dom
//
// happy-dom y no jsdom: ver la nota de DeviceGate.test.jsx.
// ============================================
// VELTRONIK - Tests del alta con confirmación de correo, en las dos pantallas
// ============================================
// El bug: "confirmo el correo, no entra al panel, y si entro de nuevo anda". El registro decía
// "¡Cuenta creada! Redirigiendo..." y lo mandaba al login, y al volver del link —si el canje
// del código fallaba, que pasa a los 5 minutos o en otro navegador— el login no decía nada.
// La causa y el detalle están en lib/vueltaDelCorreo.js.
// ============================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

/** SIEMPRE LOS MISMOS OBJETOS: uno nuevo por render re-dispararía los efectos de la página. */
const auth = { user: null, login: vi.fn(), loginWithGoogle: vi.fn(), register: vi.fn() };
const toast = { showToast: vi.fn() };
const supabase = { INITIAL_URL: 'https://veltronik-v2.vercel.app/' };

vi.mock('react-router-dom', () => ({ Link: ({ children }) => <a>{children}</a> }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../contexts/ToastContext', () => ({ useToast: () => toast }));
vi.mock('../lib/supabase', () => ({ get INITIAL_URL() { return supabase.INITIAL_URL; } }));
vi.mock('../lib/config', () => ({ default: { IS_DESKTOP: false, ROUTES: { LOGIN: '/', REGISTER: '/register' } } }));
vi.mock('../lib/portal', () => ({ openPortal: vi.fn() }));
vi.mock('../lib/desktopAuth', () => ({ canUseBrowserSignIn: () => false }));
vi.mock('../lib/connectivity', () => ({ diagnoseConnectivity: vi.fn() }));
vi.mock('../services', () => ({ authService: {}, errorService: { isNetworkError: () => false } }));
vi.mock('../components/Icon', () => ({ default: () => null }));
vi.mock('../assets/marca-veltronik.svg', () => ({ default: 'logo.svg' }));

const { default: LoginPage } = await import('./LoginPage');
const { default: RegisterPage } = await import('./RegisterPage');

let root;
let container;

async function pintar(elemento) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(elemento); });
  return container;
}

const texto = () => container.textContent.replace(/\s+/g, ' ');

/** Escribe en un campo controlado de React (el setter nativo, para que React lo vea). */
function escribir(id, valor) {
  const campo = container.querySelector(`#${id}`);
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(campo, valor);
  campo.dispatchEvent(new Event('input', { bubbles: true }));
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  auth.user = null;
  supabase.INITIAL_URL = 'https://veltronik-v2.vercel.app/';
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('el login, al volver del link del correo', () => {
  it('⭐ si el canje del código falló, dice que el correo quedó confirmado', async () => {
    supabase.INITIAL_URL = 'https://veltronik-v2.vercel.app/?alta=1&code=abc';
    await pintar(<LoginPage />);
    expect(texto()).toContain('Tu correo quedó confirmado. Entrá con tu email y tu contraseña.');
  });

  it('si Supabase devolvió que el link venció, lo dice', async () => {
    supabase.INITIAL_URL = 'https://veltronik-v2.vercel.app/?alta=1&error=access_denied&error_code=otp_expired';
    await pintar(<LoginPage />);
    expect(texto()).toContain('Ese enlace ya se usó o venció');
  });

  it('con sesión no muestra nada: es el instante antes de que el guard lo mande al Lobby', async () => {
    supabase.INITIAL_URL = 'https://veltronik-v2.vercel.app/?alta=1&code=abc';
    auth.user = { id: 'u1' };
    await pintar(<LoginPage />);
    expect(texto()).not.toContain('confirmado');
  });

  it('una entrada común, o la vuelta de Google, no muestra ningún aviso', async () => {
    supabase.INITIAL_URL = 'https://veltronik-v2.vercel.app/?code=abc#/lobby';
    await pintar(<LoginPage />);
    expect(container.querySelector('.auth-aviso')).toBeNull();
  });
});

describe('el registro', () => {
  async function registrarse() {
    await pintar(<RegisterPage />);
    await act(async () => {
      escribir('fullName', 'Ana Pérez');
      escribir('email', 'ana@gym.com');
      escribir('password', 'secreta1');
      escribir('confirmPassword', 'secreta1');
    });
    await act(async () => {
      container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
  }

  it('⭐ sin sesión (falta confirmar el correo) dice "Revisá tu correo", no "Redirigiendo"', async () => {
    auth.register.mockResolvedValue({ confirmarCorreo: true });
    await registrarse();

    expect(auth.register).toHaveBeenCalledWith('ana@gym.com', 'secreta1', 'Ana Pérez');
    expect(texto()).toContain('Revisá tu correo');
    expect(texto()).toContain('Te mandamos un correo a ana@gym.com');
    expect(toast.showToast).not.toHaveBeenCalledWith(expect.stringContaining('Redirigiendo'), expect.anything());
  });

  it('si Supabase abrió la sesión de una (confirmación apagada), sigue como antes', async () => {
    auth.register.mockResolvedValue({ confirmarCorreo: false });
    await registrarse();

    expect(toast.showToast).toHaveBeenCalledWith('¡Cuenta creada! Redirigiendo...', 'success');
    expect(texto()).not.toContain('Revisá tu correo');
  });
});
