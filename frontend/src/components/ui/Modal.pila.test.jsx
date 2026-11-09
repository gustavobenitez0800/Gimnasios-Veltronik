// @vitest-environment happy-dom
//
// ============================================
// VELTRONIK - Una sola ventana a la vista (09/11/2026)
// ============================================
// Con una ventana abierta encima de otra (la clave para cobrar sobre el cobro, la confirmación
// sobre el detalle de una clase), solo se ve y atiende el teclado la de arriba.
// ============================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Modal from './Modal';
import ConfirmDialog from './ConfirmDialog';
import { _vaciarPilaDeVentanas } from '../../hooks/useCapaDeVentana';

vi.mock('../Icon', () => ({ default: () => null }));

let root;
let contenedor;

function Pantalla({ alCerrarAbajo, alCerrarArriba, arriba = 'modal' }) {
  const [encima, setEncima] = useState(false);
  return (
    <>
      {/* Fuera de las ventanas, como el botón de la pantalla que abre la segunda. */}
      <button type="button" data-prueba="abrir" onClick={() => setEncima(true)}>abrir</button>
      <button type="button" data-prueba="cerrar" onClick={() => setEncima(false)}>cerrar</button>
      <Modal isOpen onClose={alCerrarAbajo} title="Cobrar cuota">
        <p>el cobro</p>
      </Modal>
      {arriba === 'modal' ? (
        <Modal isOpen={encima} onClose={() => { alCerrarArriba(); setEncima(false); }} title="Clave para cobrar" size="small">
          <p>la clave</p>
        </Modal>
      ) : (
        <ConfirmDialog open={encima} title="¿Seguro?" message="la confirmación"
          onConfirm={() => {}} onCancel={() => { alCerrarArriba(); setEncima(false); }} />
      )}
    </>
  );
}

async function pintar(props) {
  contenedor = document.createElement('div');
  document.body.appendChild(contenedor);
  root = createRoot(contenedor);
  await act(async () => { root.render(<Pantalla {...props} />); });
}

const tocar = (cual) => act(async () => { contenedor.querySelector(`[data-prueba="${cual}"]`).click(); });
const fondos = () => [...contenedor.querySelectorAll('.modal-overlay')];
const escape = () => act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });

beforeEach(() => _vaciarPilaDeVentanas());
afterEach(() => {
  if (root) act(() => root.unmount());
  contenedor?.remove();
});

describe('una ventana encima de otra', () => {
  it('⭐ la de abajo se esconde y queda inerte; la de arriba no oscurece de nuevo', async () => {
    await pintar({ alCerrarAbajo: vi.fn(), alCerrarArriba: vi.fn() });
    expect(fondos()[0].className).not.toContain('ventana-tapada');

    await tocar('abrir');

    const [abajo, arriba] = fondos();
    expect(abajo.className).toContain('ventana-tapada');
    expect(abajo.querySelector('.modal-container').hasAttribute('inert')).toBe(true);
    expect(abajo.querySelector('.modal-container').getAttribute('aria-hidden')).toBe('true');
    expect(arriba.className).toContain('ventana-encima');
    expect(arriba.className).not.toContain('ventana-tapada');
    expect(arriba.querySelector('.modal-container').getAttribute('aria-modal')).toBe('true');
  });

  it('🔴 Escape cierra solo la de arriba (antes cerraba las dos)', async () => {
    const alCerrarAbajo = vi.fn();
    const alCerrarArriba = vi.fn();
    await pintar({ alCerrarAbajo, alCerrarArriba });
    await tocar('abrir');

    await escape();

    expect(alCerrarArriba).toHaveBeenCalledTimes(1);
    expect(alCerrarAbajo).not.toHaveBeenCalled();
  });

  it('al cerrarse la de arriba, la de abajo vuelve a verse y a escuchar el Escape', async () => {
    const alCerrarAbajo = vi.fn();
    await pintar({ alCerrarAbajo, alCerrarArriba: vi.fn() });
    await tocar('abrir');
    await tocar('cerrar');

    const [abajo] = fondos();
    expect(fondos()).toHaveLength(1);
    expect(abajo.className).not.toContain('ventana-tapada');
    expect(abajo.querySelector('.modal-container').hasAttribute('inert')).toBe(false);

    await escape();
    expect(alCerrarAbajo).toHaveBeenCalledTimes(1);
  });

  it('la confirmación también entra en la pila, y se cancela con Escape', async () => {
    const alCerrarAbajo = vi.fn();
    const alCerrarArriba = vi.fn();
    await pintar({ alCerrarAbajo, alCerrarArriba, arriba: 'confirmacion' });
    await tocar('abrir');

    const [abajo, arriba] = fondos();
    expect(abajo.className).toContain('ventana-tapada');
    expect(arriba.querySelector('[role="alertdialog"]')).not.toBeNull();

    await escape();
    expect(alCerrarArriba).toHaveBeenCalledTimes(1);
    expect(alCerrarAbajo).not.toHaveBeenCalled();
  });
});
