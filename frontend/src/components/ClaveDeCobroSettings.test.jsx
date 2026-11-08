// @vitest-environment happy-dom
//
// ============================================
// VELTRONIK - Ajustes → Clave para cobrar
// ============================================
// Opcional: el dueño la pone, la cambia o la saca. Para cambiarla o sacarla hay que saber la
// actual (la sesión del mostrador suele ser la del dueño).
// ============================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

const servicios = vi.hoisted(() => ({
  claveDeCobroService: { fijar: vi.fn(), sacar: vi.fn() },
  errorService: { getMessage: (e) => e?.response?.data?.message || 'Error' },
}));
const clave = vi.hoisted(() => ({ activa: false, alCambiar: vi.fn() }));
vi.mock('../services', () => servicios);
vi.mock('../contexts/ClaveDeCobroContext', () => ({ useClaveDeCobro: () => clave }));
vi.mock('./Icon', () => ({ default: () => null }));

const { default: ClaveDeCobroSettings } = await import('./ClaveDeCobroSettings');

let root;
let contenedor;

async function pintar() {
  contenedor = document.createElement('div');
  document.body.appendChild(contenedor);
  root = createRoot(contenedor);
  await act(async () => { root.render(<ClaveDeCobroSettings />); });
}

const boton = (texto) => [...contenedor.querySelectorAll('button')].find((b) => b.textContent.includes(texto));
const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;

async function escribir(id, valor) {
  const campo = contenedor.querySelector(`#${id}`);
  await act(async () => {
    set.call(campo, valor);
    campo.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function enviar() {
  await act(async () => { contenedor.querySelector('form').requestSubmit(); });
  for (let i = 0; i < 4; i += 1) await act(async () => { await Promise.resolve(); });
}

beforeEach(() => {
  vi.clearAllMocks();
  clave.activa = false;
  servicios.claveDeCobroService.fijar.mockResolvedValue();
  servicios.claveDeCobroService.sacar.mockResolvedValue();
});

afterEach(() => {
  if (root) act(() => root.unmount());
  contenedor?.remove();
});

describe('poner la clave', () => {
  it('⭐ se escribe dos veces y queda puesta, también en esta PC', async () => {
    await pintar();
    expect(contenedor.textContent).toContain('No está puesta');

    await act(async () => { boton('Poner una clave').click(); });
    await escribir('clave-nueva', '4827');
    await escribir('clave-repetida', '4827');
    await enviar();

    expect(servicios.claveDeCobroService.fijar).toHaveBeenCalledWith('4827', null);
    expect(clave.alCambiar).toHaveBeenCalledWith(true, '4827');
    expect(contenedor.textContent).toContain('desde ahora se pide la clave');
  });

  it('si las dos no coinciden, no se guarda nada', async () => {
    await pintar();
    await act(async () => { boton('Poner una clave').click(); });
    await escribir('clave-nueva', '4827');
    await escribir('clave-repetida', '4828');
    await enviar();

    expect(servicios.claveDeCobroService.fijar).not.toHaveBeenCalled();
    expect(contenedor.textContent).toContain('no coinciden');
  });
});

describe('con la clave puesta', () => {
  beforeEach(() => { clave.activa = true; });

  it('cambiarla manda la actual', async () => {
    await pintar();
    await act(async () => { boton('Cambiar la clave').click(); });
    await escribir('clave-actual', '4827');
    await escribir('clave-nueva', '9051');
    await escribir('clave-repetida', '9051');
    await enviar();

    expect(servicios.claveDeCobroService.fijar).toHaveBeenCalledWith('9051', '4827');
  });

  it('🔴 sacarla con la actual equivocada dice lo que dijo el servidor, y sigue puesta', async () => {
    servicios.claveDeCobroService.sacar.mockRejectedValue({ response: { data: { message: 'Clave incorrecta.' } } });
    await pintar();
    await act(async () => { boton('Sacar la clave').click(); });
    await escribir('clave-actual', '1111');
    await enviar();

    expect(contenedor.textContent).toContain('Clave incorrecta.');
    expect(clave.alCambiar).not.toHaveBeenCalled();
  });
});
