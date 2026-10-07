// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import MenuDeAcciones from './MenuDeAcciones';

let root;
let container;
const historial = vi.fn();
const eliminar = vi.fn();

async function pintar() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <MenuDeAcciones
        titulo="Más acciones para Ana"
        acciones={[
          { etiqueta: 'Historial de pagos', icono: 'creditCard', onClick: historial },
          { etiqueta: 'Eliminar', icono: 'trash', onClick: eliminar, peligro: true },
        ]}
      />,
    );
  });
}

const boton = () => container.querySelector('button[aria-haspopup="menu"]');
const menu = () => document.querySelector('[role="menu"]');
const abrir = async () => { await act(async () => { boton().click(); }); };

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  historial.mockClear();
  eliminar.mockClear();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('el menú "⋯" de una fila', () => {
  it('cerrado no dibuja nada, y el botón dice para quién es', async () => {
    await pintar();
    expect(menu()).toBeNull();
    expect(boton().getAttribute('aria-label')).toBe('Más acciones para Ana');
    expect(boton().getAttribute('aria-expanded')).toBe('false');
  });

  it('⭐ se abre FUERA de la tabla (en el body), así no lo corta el scroll de la tabla', async () => {
    await pintar();
    await abrir();
    expect(menu()).toBeTruthy();
    expect(container.contains(menu())).toBe(false);
    expect(boton().getAttribute('aria-expanded')).toBe('true');
    // El primero recibe el foco: se usa también con el teclado.
    expect(document.activeElement.textContent).toContain('Historial de pagos');
  });

  it('elegir una acción la hace y cierra el menú', async () => {
    await pintar();
    await abrir();
    const item = [...menu().querySelectorAll('[role="menuitem"]')].find((b) => b.textContent.includes('Historial'));
    await act(async () => { item.click(); });
    expect(historial).toHaveBeenCalledTimes(1);
    expect(eliminar).not.toHaveBeenCalled();
    expect(menu()).toBeNull();
  });

  it('lo peligroso se marca como peligroso', async () => {
    await pintar();
    await abrir();
    const item = [...menu().querySelectorAll('[role="menuitem"]')].find((b) => b.textContent.includes('Eliminar'));
    expect(item.classList.contains('es-peligro')).toBe(true);
  });

  it('Escape y un clic afuera lo cierran sin hacer nada', async () => {
    await pintar();
    await abrir();
    await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(menu()).toBeNull();

    await abrir();
    await act(async () => { document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
    expect(menu()).toBeNull();
    expect(historial).not.toHaveBeenCalled();
    expect(eliminar).not.toHaveBeenCalled();
  });
});
