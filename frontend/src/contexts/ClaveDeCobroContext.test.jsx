// @vitest-environment happy-dom
//
// ============================================
// VELTRONIK - La clave para cobrar (la que la pide)
// ============================================
// Lo pidió un gimnasio: «a veces los socios se renuevan solos la cuota». Lo que se defiende acá:
// que sin clave puesta no se pida nada, que con clave se cobre solo escribiéndola bien, y que sin
// internet la caja siga andando (contra la huella de la última vez).
// ============================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

const servicios = vi.hoisted(() => ({
  claveDeCobroService: { estado: vi.fn(), verificar: vi.fn(), fijar: vi.fn(), sacar: vi.fn() },
  errorService: { getMessage: (e) => e?.response?.data?.message || 'Error' },
}));
vi.mock('../services', () => servicios);
vi.mock('./AuthContext', () => ({ useAuth: () => ({ orgId: 'g1' }) }));
vi.mock('../hooks/useAlPonerseAlDia', () => ({ useAlPonerseAlDia: () => {} }));
vi.mock('../components/Icon', () => ({ default: () => null }));

const { ClaveDeCobroProvider, useClaveDeCobro, _reiniciarFreno } = await import('./ClaveDeCobroContext');
const { huellaDe, guardarLocal, leerLocal } = await import('../lib/claveDeCobro');

let root;
let contenedor;
let resultado;

function Cobrar() {
  const { pedirClave } = useClaveDeCobro();
  return <button type="button" className="cobrar" onClick={async () => { resultado = await pedirClave('cobrar'); }}>Cobrar</button>;
}

async function esperar() {
  // La huella sale de crypto.subtle, que contesta en otra vuelta del reloj: no alcanza con
  // dejar correr las promesas.
  for (let i = 0; i < 6; i += 1) await act(async () => { await new Promise((r) => { setTimeout(r, 0); }); });
}

async function pintar(conProveedor = true) {
  contenedor = document.createElement('div');
  document.body.appendChild(contenedor);
  root = createRoot(contenedor);
  await act(async () => {
    root.render(conProveedor ? <ClaveDeCobroProvider><Cobrar /></ClaveDeCobroProvider> : <Cobrar />);
  });
  await esperar();
}

async function apretarCobrar() {
  await act(async () => { contenedor.querySelector('.cobrar').click(); });
  await esperar();
}

async function escribirClave(clave) {
  const campo = contenedor.querySelector('.clave-cobro-campo');
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  await act(async () => {
    set.call(campo, clave);
    campo.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => { contenedor.querySelector('.clave-cobro').requestSubmit(); });
  await esperar();
}

const rechazo = (mensaje) => Object.assign(new Error(mensaje), { response: { status: 400, data: { message: mensaje } } });
const sinRed = () => new Error('Network Error');

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  _reiniciarFreno();
  resultado = undefined;
  servicios.claveDeCobroService.estado.mockResolvedValue(false);
});

afterEach(() => {
  if (root) act(() => root.unmount());
  contenedor?.remove();
});

describe('sin clave puesta', () => {
  it('sin el proveedor alrededor (un test, una pantalla suelta) no pide nada', async () => {
    await pintar(false);
    await apretarCobrar();
    expect(resultado).toBe(true);
  });

  it('la sucursal que no la puso cobra como siempre', async () => {
    await pintar();
    await apretarCobrar();
    expect(resultado).toBe(true);
    expect(contenedor.textContent).not.toContain('Clave para cobrar');
  });
});

describe('⭐ con la clave puesta', () => {
  beforeEach(() => { servicios.claveDeCobroService.estado.mockResolvedValue(true); });

  it('la pide; equivocada no deja, bien escrita sí', async () => {
    await pintar();
    await apretarCobrar();
    expect(contenedor.textContent).toContain('Escribí la clave para registrar el cobro');

    servicios.claveDeCobroService.verificar.mockRejectedValueOnce(rechazo('Clave incorrecta.'));
    await escribirClave('1111');
    expect(contenedor.textContent).toContain('Clave incorrecta.');
    expect(resultado).toBeUndefined();

    servicios.claveDeCobroService.verificar.mockResolvedValueOnce();
    await escribirClave('4827');
    expect(resultado).toBe(true);
    expect(leerLocal('g1').huella, 'guarda la huella para cuando no haya internet').toBe(await huellaDe('g1', '4827'));
  });

  it('cancelar es no cobrar', async () => {
    await pintar();
    await apretarCobrar();
    await act(async () => {
      [...contenedor.querySelectorAll('button')].find((b) => b.textContent === 'Cancelar').click();
    });
    await esperar();
    expect(resultado).toBe(false);
  });
});

describe('⭐ sin internet, la caja no para', () => {
  beforeEach(() => {
    servicios.claveDeCobroService.estado.mockRejectedValue(sinRed());
    servicios.claveDeCobroService.verificar.mockRejectedValue(sinRed());
  });

  it('compara con la huella de la última vez: la correcta pasa, la equivocada no', async () => {
    guardarLocal('g1', { activa: true, huella: await huellaDe('g1', '4827') });
    await pintar();

    await apretarCobrar();
    await escribirClave('9999');
    expect(contenedor.textContent).toContain('Clave incorrecta.');

    await escribirClave('4827');
    expect(resultado).toBe(true);
  });

  it('si esta PC nunca la comprobó, no hay contra qué comparar y se deja cobrar', async () => {
    guardarLocal('g1', { activa: true, huella: null });
    await pintar();
    await apretarCobrar();
    await escribirClave('1234');
    expect(resultado).toBe(true);
  });
});
