// @vitest-environment happy-dom
//
// ============================================
// VELTRONIK - «¿No te llegó? Reenviar el correo»
// ============================================
// El correo de confirmación sale bien, pero a veces cae en Spam o en «Correo no deseado». Sin
// este botón la persona quedaba con una cuenta que no podía abrir y sin forma de pedir otro.
// ============================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

const servicios = vi.hoisted(() => ({ authService: { reenviarConfirmacion: vi.fn() } }));
vi.mock('../../services', () => servicios);
const toast = vi.hoisted(() => ({ showToast: vi.fn() }));
vi.mock('../../contexts/ToastContext', () => ({ useToast: () => toast }));

const { default: ReenviarConfirmacion } = await import('./ReenviarConfirmacion');

let root;
let contenedor;

async function pintar(props) {
  contenedor = document.createElement('div');
  document.body.appendChild(contenedor);
  root = createRoot(contenedor);
  await act(async () => { root.render(<ReenviarConfirmacion {...props} />); });
}

const boton = () => contenedor.querySelector('button');

async function apretar() {
  await act(async () => { boton().click(); });
  for (let i = 0; i < 3; i += 1) await act(async () => { await Promise.resolve(); });
}

beforeEach(() => {
  vi.clearAllMocks();
  servicios.authService.reenviarConfirmacion.mockResolvedValue(undefined);
});

afterEach(() => {
  act(() => root.unmount());
  contenedor.remove();
});

describe('⭐ reenviar el correo de confirmación', () => {
  it('lo manda al mismo correo, lo dice, y hay que esperar un minuto para el siguiente', async () => {
    await pintar({ email: 'nuevo@gimnasio.com', esperaInicial: 0 });
    await apretar();

    expect(servicios.authService.reenviarConfirmacion).toHaveBeenCalledWith('nuevo@gimnasio.com');
    expect(toast.showToast).toHaveBeenCalledWith(expect.stringContaining('Correo no deseado'), 'success', 8000);
    expect(boton().disabled).toBe(true);
    expect(boton().textContent).toContain('en 60 s');
  });

  it('recién creada la cuenta, el correo acaba de salir: espera antes de dejar pedir otro', async () => {
    await pintar({ email: 'nuevo@gimnasio.com' });

    expect(boton().disabled).toBe(true);
    expect(boton().textContent).toContain('Reenviar el correo (en 60 s)');
  });

  it('si Supabase dice que se pidió hace muy poco, avisa que espere (no es un error)', async () => {
    servicios.authService.reenviarConfirmacion.mockRejectedValue(
      Object.assign(new Error('For security purposes, you can only request this after 42 seconds.'), { status: 429 }));
    await pintar({ email: 'nuevo@gimnasio.com', esperaInicial: 0 });
    await apretar();

    expect(toast.showToast).toHaveBeenCalledWith(expect.stringContaining('Esperá un minuto'), 'warning');
    expect(boton().disabled).toBe(true);
  });

  it('cualquier otro problema lo dice y deja volver a intentar', async () => {
    servicios.authService.reenviarConfirmacion.mockRejectedValue(new Error('Network Error'));
    await pintar({ email: 'nuevo@gimnasio.com', esperaInicial: 0 });
    await apretar();

    expect(toast.showToast).toHaveBeenCalledWith(expect.stringContaining('No se pudo mandar'), 'error');
    expect(boton().disabled).toBe(false);
  });
});
