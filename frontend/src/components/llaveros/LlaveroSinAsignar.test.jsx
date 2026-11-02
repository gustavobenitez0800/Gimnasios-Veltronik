// @vitest-environment happy-dom
//
// ============================================
// VELTRONIK - El llavero que no es de nadie (ADR-016 §6.2)
// ============================================
// Así se carga un gimnasio entero sin sentarse a hacerlo: cada socio, la primera vez que pasa
// su llavero, cae acá; quien atiende lo busca, se lo asigna y el socio entra.
// ============================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

const servicios = vi.hoisted(() => ({
  memberService: { searchForAccess: vi.fn() },
  llaveroService: { asignar: vi.fn() },
  errorService: { getMessage: (e) => String(e?.response?.data?.message || e?.message || e) },
}));
vi.mock('../../services', () => servicios);

const toast = vi.hoisted(() => ({ showToast: vi.fn() }));
vi.mock('../../contexts/ToastContext', () => ({ useToast: () => toast }));

const red = vi.hoisted(() => ({ enLinea: true }));
vi.mock('../../hooks', () => ({ useEstaEnLinea: () => red.enLinea }));
vi.mock('../../hooks/useQuienAtiende', () => ({ useQuienAtiende: () => () => 'Laura' }));
vi.mock('../Icon', () => ({ default: () => null }));

const { default: LlaveroSinAsignar } = await import('./LlaveroSinAsignar');

const MARIA = { id: 'maria', fullName: 'María Gómez', dni: '30111222' };

let root;
let contenedor;
let onAsignado;

async function pintar(lectura = { codigo: '0012345678', ultimaBaja: null }) {
  onAsignado = vi.fn();
  contenedor = document.createElement('div');
  document.body.appendChild(contenedor);
  root = createRoot(contenedor);
  await act(async () => {
    root.render(<LlaveroSinAsignar lectura={lectura} onCerrar={() => {}} onAsignado={onAsignado} />);
  });
}

const setValor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;

async function buscar(textoBuscado) {
  const campo = document.querySelector('input.form-input');
  await act(async () => {
    setValor.call(campo, textoBuscado);
    campo.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => { await Promise.resolve(); });
}

async function clic(texto) {
  const boton = [...document.querySelectorAll('button')].find((b) => b.textContent.includes(texto));
  expect(boton, `no está el botón «${texto}»`).toBeTruthy();
  await act(async () => { boton.click(); });
  for (let i = 0; i < 4; i += 1) await act(async () => { await Promise.resolve(); });
}

beforeEach(() => {
  vi.clearAllMocks();
  red.enLinea = true;
  servicios.memberService.searchForAccess.mockResolvedValue([MARIA]);
  servicios.llaveroService.asignar.mockResolvedValue({ llavero: { codigo: '0012345678' }, nuevo: true, reasignadoDe: null });
});

afterEach(() => {
  act(() => root.unmount());
  contenedor.remove();
});

describe('⭐ asignar el llavero en el mostrador', () => {
  it('se busca al socio, se le asigna con la firma de quien atiende, y entra', async () => {
    await pintar();
    await buscar('mar');
    await clic('Asignárselo');

    expect(servicios.llaveroService.asignar).toHaveBeenCalledWith(
      'maria', '0012345678', { reasignar: false, hechoPor: 'Laura' });
    expect(onAsignado).toHaveBeenCalledWith(MARIA);
  });

  it('⭐ si el llavero ya es de otro, pregunta antes de sacárselo', async () => {
    servicios.llaveroService.asignar
      .mockRejectedValueOnce({ response: { status: 409, data: { socio: { id: 'juan', nombre: 'Juan Pérez' } } } });
    await pintar();
    await buscar('mar');
    await clic('Asignárselo');

    expect(document.body.textContent).toContain('ya es de Juan Pérez');
    expect(onAsignado).not.toHaveBeenCalled();

    await clic('Sí, pasárselo');

    expect(servicios.llaveroService.asignar).toHaveBeenLastCalledWith(
      'maria', '0012345678', { reasignar: true, hechoPor: 'Laura' });
    expect(onAsignado).toHaveBeenCalledWith(MARIA);
  });

  it('decir que no deja el llavero como estaba', async () => {
    servicios.llaveroService.asignar
      .mockRejectedValueOnce({ response: { status: 409, data: { socio: { id: 'juan', nombre: 'Juan Pérez' } } } });
    await pintar();
    await buscar('mar');
    await clic('Asignárselo');
    await clic('No');

    expect(servicios.llaveroService.asignar).toHaveBeenCalledTimes(1);
    expect(onAsignado).not.toHaveBeenCalled();
  });
});

describe('lo que tiene que saber quien atiende', () => {
  it('si se había perdido, lo dice antes que nada', async () => {
    await pintar({
      codigo: '0012345678',
      ultimaBaja: { llavero: { dadoDeBajaEn: '2026-11-02T10:00:00', motivoBaja: 'Lo perdió' }, socio: { nombre: 'Ana Pérez' } },
    });

    expect(document.body.textContent).toContain('Este llavero era de Ana Pérez');
    expect(document.body.textContent).toContain('Lo perdió');
  });

  it('⭐ sin internet no ofrece asignar (y dice cómo seguir)', async () => {
    red.enLinea = false;
    await pintar();

    expect(document.body.textContent).toContain('Sin internet no se puede asignar');
    expect(document.querySelector('input.form-input')).toBeNull();
  });

  it('si el servidor no contesta, lo dice y no hace entrar a nadie', async () => {
    servicios.llaveroService.asignar.mockRejectedValueOnce(new Error('Network Error'));
    await pintar();
    await buscar('mar');
    await clic('Asignárselo');

    expect(toast.showToast).toHaveBeenCalledWith(expect.stringContaining('Sin conexión'), 'error');
    expect(onAsignado).not.toHaveBeenCalled();
  });
});
