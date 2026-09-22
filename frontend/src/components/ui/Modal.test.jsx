// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import Modal from './Modal';

let root;
let container;
const cerrar = vi.fn();

async function pintar() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<Modal isOpen onClose={cerrar} title="Registrar pago"><input aria-label="Monto" /></Modal>);
  });
}

const fondo = () => container.querySelector('.modal-overlay');
const ventana = () => container.querySelector('[role="dialog"]');

beforeEach(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true; cerrar.mockClear(); });
afterEach(() => { act(() => root.unmount()); container.remove(); });

describe('la ventana (Modal)', () => {
  it('es un diálogo con nombre: el título', async () => {
    await pintar();
    expect(ventana().getAttribute('aria-modal')).toBe('true');
    const titulo = document.getElementById(ventana().getAttribute('aria-labelledby'));
    expect(titulo.textContent).toBe('Registrar pago');
  });

  it('la × tiene nombre y cierra', async () => {
    await pintar();
    const x = container.querySelector('button[aria-label="Cerrar"]');
    await act(async () => { x.click(); });
    expect(cerrar).toHaveBeenCalledTimes(1);
  });

  it('Escape cierra', async () => {
    await pintar();
    await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(cerrar).toHaveBeenCalledTimes(1);
  });

  it('tocar el fondo cierra', async () => {
    await pintar();
    await act(async () => {
      fondo().dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      fondo().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(cerrar).toHaveBeenCalledTimes(1);
  });

  it('⭐ arrastrar una selección desde adentro y soltar afuera NO cierra (se perdía lo cargado)', async () => {
    await pintar();
    const campo = container.querySelector('input');
    await act(async () => {
      campo.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      // El click lo recibe el ancestro común: el fondo.
      fondo().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(cerrar).not.toHaveBeenCalled();
  });

  it('un clic adentro no cierra', async () => {
    await pintar();
    const campo = container.querySelector('input');
    await act(async () => {
      campo.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      campo.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(cerrar).not.toHaveBeenCalled();
  });
});
