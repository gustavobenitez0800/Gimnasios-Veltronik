// @vitest-environment happy-dom
//
// ============================================
// VELTRONIK - Ajustes → Llaveros (ADR-016)
// ============================================
// Probar el lector es la prueba que se hace al instalar uno: qué número escribe, si se reconoce
// como lector y de quién es. Y el dueño revisa y pasa a llavero los números que vinieron en el
// DNI (ControlFit).
// ============================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

const servicios = vi.hoisted(() => ({
  memberService: { buscarPorLlavero: vi.fn() },
  llaveroService: { candidatosEnElDocumento: vi.fn(), pasarDelDocumento: vi.fn() },
  errorService: { getMessage: (e) => String(e?.message || e) },
}));
vi.mock('../../services', () => servicios);
const toast = vi.hoisted(() => ({ showToast: vi.fn() }));
vi.mock('../../contexts/ToastContext', () => ({ useToast: () => toast }));
vi.mock('../../hooks', () => ({ useEstaEnLinea: () => true }));
vi.mock('../../hooks/useQuienAtiende', () => ({ useQuienAtiende: () => () => 'Gustavo' }));
vi.mock('../Icon', () => ({ default: () => null }));

const { default: LlaverosSettings } = await import('./LlaverosSettings');

let root;
let contenedor;

async function pintar(props = {}) {
  contenedor = document.createElement('div');
  document.body.appendChild(contenedor);
  root = createRoot(contenedor);
  await act(async () => { root.render(<LlaverosSettings {...props} />); });
}

const setValor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;

/** Pasa `texto` por el campo de prueba, una tecla cada `cada` ms, y el Enter. */
async function pasarPorElLector(texto, { cada = 5 } = {}) {
  const campo = contenedor.querySelector('#llavero-prueba');
  let t = 1000;
  let escrito = '';
  await act(async () => {
    for (const c of texto) {
      const tecla = new KeyboardEvent('keydown', { key: c, bubbles: true, cancelable: true });
      Object.defineProperty(tecla, 'timeStamp', { value: t });
      campo.dispatchEvent(tecla);
      escrito += c;
      setValor.call(campo, escrito);
      campo.dispatchEvent(new Event('input', { bubbles: true }));
      t += cada;
    }
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    Object.defineProperty(enter, 'timeStamp', { value: t });
    campo.dispatchEvent(enter);
  });
  for (let i = 0; i < 4; i += 1) await act(async () => { await Promise.resolve(); });
}

async function clic(texto) {
  const boton = [...contenedor.querySelectorAll('button')].find((b) => b.textContent.includes(texto));
  expect(boton, `no está el botón «${texto}»`).toBeTruthy();
  await act(async () => { boton.click(); });
  for (let i = 0; i < 4; i += 1) await act(async () => { await Promise.resolve(); });
}

beforeEach(() => {
  vi.clearAllMocks();
  servicios.memberService.buscarPorLlavero.mockResolvedValue({ socios: [{ id: 'ana', fullName: 'Ana Pérez' }], ultimaBaja: null });
});

afterEach(() => {
  act(() => root.unmount());
  contenedor.remove();
});

describe('⭐ probar el lector', () => {
  it('dice el número, que es un lector, y de quién es', async () => {
    await pintar();
    await pasarPorElLector('0012345678');

    expect(contenedor.textContent).toContain('El lector escribió 0012345678');
    expect(contenedor.textContent).toContain('Lo reconocí como un lector');
    expect(contenedor.textContent).toContain('Es de Ana Pérez');
  });

  it('⭐ si llega lento, avisa que en Accesos se va a tomar como una persona', async () => {
    await pintar();
    await pasarPorElLector('0012345678', { cada: 120 });

    expect(contenedor.textContent).toContain('Eso parece tecleado a mano');
  });

  it('uno que no es de nadie dice cómo asignarlo', async () => {
    servicios.memberService.buscarPorLlavero.mockResolvedValue({ socios: [], ultimaBaja: null });
    await pintar();
    await pasarPorElLector('0099999999');

    expect(contenedor.textContent).toContain('No es de ningún socio todavía');
  });
});

describe('⭐ los llaveros que vinieron en el DNI', () => {
  const LARISSA = { socioId: 'larissa', nombre: 'Larissa Cipriano', documento: '0012345678', yaEsDe: null };
  const JOAO = { socioId: 'joao', nombre: 'Joao Silva', documento: '12345678901', yaEsDe: null };
  const REPETIDA = { socioId: 'repetida', nombre: 'Ficha Repetida', documento: '0055544433', yaEsDe: 'Beto Gómez' };

  it('solo el dueño o el admin lo ven', async () => {
    await pintar({ puedeAdministrar: false });
    expect(contenedor.textContent).not.toContain('Llaveros que vinieron en el DNI');
  });

  it('se revisa la lista, se destilda el documento extranjero, y se pasan los demás', async () => {
    servicios.llaveroService.candidatosEnElDocumento.mockResolvedValue([JOAO, LARISSA, REPETIDA]);
    servicios.llaveroService.pasarDelDocumento.mockResolvedValue({ pasados: 1, salteados: 0 });
    await pintar({ puedeAdministrar: true });
    await clic('Buscarlos');

    // El que ya es de otro sale, pero no se puede marcar.
    expect(contenedor.textContent).toContain('Ya es el llavero de Beto Gómez');
    // Joao tiene un CPF: se destilda.
    const marcaDeJoao = [...contenedor.querySelectorAll('label')].find((l) => l.textContent.includes('Joao'))
      .querySelector('input');
    await act(async () => { marcaDeJoao.click(); });

    await clic('Pasar 1 a llavero');

    expect(servicios.llaveroService.pasarDelDocumento).toHaveBeenCalledWith(['larissa'], { hechoPor: 'Gustavo' });
    expect(toast.showToast).toHaveBeenCalledWith('Listo: 1 socio tiene su llavero.', 'success');
  });

  it('si no hay ninguno, lo dice', async () => {
    servicios.llaveroService.candidatosEnElDocumento.mockResolvedValue([]);
    await pintar({ puedeAdministrar: true });
    await clic('Buscarlos');

    expect(contenedor.textContent).toContain('No hay socios con un número de llavero en el DNI');
  });
});
