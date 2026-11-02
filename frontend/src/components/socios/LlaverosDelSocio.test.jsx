// @vitest-environment happy-dom
//
// ============================================
// VELTRONIK - Los llaveros en la ficha del socio (ADR-016 §6)
// ============================================
// Se asignan pasándolos por el lector, que termina con un Enter. Ese Enter es para asignar el
// llavero, NO para guardar la ficha: la sección vive adentro del formulario.
// ============================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

const servicios = vi.hoisted(() => ({
  llaveroService: { delSocio: vi.fn(), asignar: vi.fn(), darDeBaja: vi.fn() },
  errorService: { getMessage: (e) => String(e?.message || e) },
}));
vi.mock('../../services', () => servicios);
const toast = vi.hoisted(() => ({ showToast: vi.fn() }));
vi.mock('../../contexts/ToastContext', () => ({ useToast: () => toast }));
const red = vi.hoisted(() => ({ enLinea: true }));
vi.mock('../../hooks', () => ({ useEstaEnLinea: () => red.enLinea }));
vi.mock('../../hooks/useQuienAtiende', () => ({ useQuienAtiende: () => () => 'Laura' }));
vi.mock('../Icon', () => ({ default: () => null }));

const { default: LlaverosDelSocio } = await import('./LlaverosDelSocio');

const ACTIVO = {
  id: 'l1', codigo: '0012345678', activo: true, asignadoEn: '2026-11-02T10:00:00', asignadoPor: 'Laura',
};
const PERDIDO = {
  id: 'l0', codigo: '0099887766', activo: false, asignadoEn: '2026-10-01T10:00:00',
  dadoDeBajaEn: '2026-10-20T10:00:00', motivoBaja: 'Lo perdió', dadoDeBajaPor: 'Laura',
};

let root;
let contenedor;
let guardarLaFicha;

async function pintar() {
  guardarLaFicha = vi.fn((e) => e.preventDefault());
  contenedor = document.createElement('div');
  document.body.appendChild(contenedor);
  root = createRoot(contenedor);
  await act(async () => {
    root.render(
      <form onSubmit={guardarLaFicha}>
        <LlaverosDelSocio socioId="maria" nombre="María Gómez" />
      </form>,
    );
  });
  for (let i = 0; i < 3; i += 1) await act(async () => { await Promise.resolve(); });
}

const setValor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;

async function clic(texto) {
  const boton = [...contenedor.querySelectorAll('button')].find((b) => b.textContent.includes(texto));
  expect(boton, `no está el botón «${texto}»`).toBeTruthy();
  await act(async () => { boton.click(); });
  for (let i = 0; i < 4; i += 1) await act(async () => { await Promise.resolve(); });
}

/** Lo que hace el lector: escribe el número y aprieta Enter. */
async function pasarElLlavero(codigo) {
  const campo = contenedor.querySelector('input');
  await act(async () => {
    setValor.call(campo, codigo);
    campo.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => {
    campo.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  });
  for (let i = 0; i < 4; i += 1) await act(async () => { await Promise.resolve(); });
}

beforeEach(() => {
  vi.clearAllMocks();
  red.enLinea = true;
  servicios.llaveroService.delSocio.mockResolvedValue([ACTIVO, PERDIDO]);
  servicios.llaveroService.asignar.mockResolvedValue({ llavero: { codigo: '0055544433' }, nuevo: true, reasignadoDe: null });
  servicios.llaveroService.darDeBaja.mockResolvedValue({ ...ACTIVO, activo: false });
});

afterEach(() => {
  act(() => root.unmount());
  contenedor.remove();
});

describe('⭐ la ficha muestra sus llaveros', () => {
  it('los activos con desde cuándo, y los perdidos aparte', async () => {
    await pintar();

    expect(servicios.llaveroService.delSocio).toHaveBeenCalledWith('maria');
    expect(contenedor.textContent).toContain('0012345678');
    expect(contenedor.textContent).toContain('Desde el 02/11/2026 · Laura');
    expect(contenedor.textContent).toContain('Dados de baja (1)');
  });

  it('sin internet lo dice, en vez de quedarse cargando', async () => {
    red.enLinea = false;
    await pintar();

    expect(contenedor.textContent).toContain('Sin internet no se pueden ver ni asignar llaveros');
    expect(servicios.llaveroService.delSocio).not.toHaveBeenCalled();
  });
});

describe('⭐ asignar pasándolo por el lector', () => {
  it('el Enter del lector asigna el llavero y NO guarda la ficha', async () => {
    await pintar();
    await clic('Asignar llavero');
    await pasarElLlavero(' 0055544433 ');

    expect(servicios.llaveroService.asignar).toHaveBeenCalledWith(
      'maria', '0055544433', { reasignar: false, hechoPor: 'Laura' });
    expect(guardarLaFicha).not.toHaveBeenCalled();
    // Y se vuelve a pedir la lista, para mostrarlo.
    expect(servicios.llaveroService.delSocio).toHaveBeenCalledTimes(2);
  });

  it('⭐ si es de otro socio, pregunta antes de sacárselo', async () => {
    servicios.llaveroService.asignar
      .mockRejectedValueOnce({ response: { status: 409, data: { socio: { id: 'juan', nombre: 'Juan Pérez' } } } });
    await pintar();
    await clic('Asignar llavero');
    await pasarElLlavero('0055544433');

    expect(contenedor.textContent).toContain('Ese llavero es de Juan Pérez');
    await clic('Sí, pasárselo');

    expect(servicios.llaveroService.asignar).toHaveBeenLastCalledWith(
      'maria', '0055544433', { reasignar: true, hechoPor: 'Laura' });
  });

  it('algo que no puede ser un llavero no viaja al servidor', async () => {
    await pintar();
    await clic('Asignar llavero');
    await pasarElLlavero('12');

    expect(servicios.llaveroService.asignar).not.toHaveBeenCalled();
    expect(toast.showToast).toHaveBeenCalledWith(expect.stringContaining('lector'), 'error');
  });
});

describe('⭐ lo perdió', () => {
  it('pide confirmar en el renglón y lo da de baja con el motivo', async () => {
    await pintar();
    await clic('Lo perdió');

    expect(contenedor.textContent).toContain('¿Darlo de baja? Deja de abrir.');
    await clic('Sí, lo perdió');

    expect(servicios.llaveroService.darDeBaja).toHaveBeenCalledWith(ACTIVO, { motivo: 'Lo perdió', hechoPor: 'Laura' });
  });

  it('decir que no lo deja como estaba', async () => {
    await pintar();
    await clic('Lo perdió');
    await clic('No');

    expect(servicios.llaveroService.darDeBaja).not.toHaveBeenCalled();
  });
});
