// @vitest-environment happy-dom
//
// ============================================
// VELTRONIK - El lector de llaveros, en cualquier campo (03/11/2026)
// ============================================
// El lector "tipo teclado" escribe en lo que tenga el foco. Antes solo se lo escuchaba en el
// buscador de Accesos, y si el profe estaba cobrando, el número del llavero terminaba en el monto
// (y su Enter, enviando el formulario). Lo que se defiende acá: que el número no quede en ningún
// campo, que el Enter del lector no llegue a nadie, y que una persona escribiendo siga siendo una
// persona. Si fue un lector o una persona lo decide `lib/rafagaDelLector` (sus propios tests).
// ============================================

import { describe, it, expect, afterEach } from 'vitest';
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useLectorDeLlaveros } from './useLectorDeLlaveros';

let root;
let contenedor;
const leidos = [];
const enviados = [];

/** Un formulario como el del cobro: un monto que ya tiene algo, y un Enter que lo enviaría. */
function Pantalla({ activo = true, vaciar = false, propio = false }) {
  const [monto, setMonto] = useState(vaciar ? 'pe' : propio ? '' : '15000');
  useLectorDeLlaveros((codigo) => leidos.push(codigo), { activo });
  return (
    <form onSubmit={(e) => { e.preventDefault(); enviados.push(monto); }}>
      <input aria-label="campo" value={monto} onChange={(e) => setMonto(e.target.value)}
        data-lector={vaciar ? 'vaciar' : propio ? 'propio' : undefined} />
      <span data-testid="estado">{monto}</span>
      <button type="submit">Cobrar</button>
    </form>
  );
}

async function pintar(props) {
  contenedor = document.createElement('div');
  document.body.appendChild(contenedor);
  root = createRoot(contenedor);
  await act(async () => { root.render(<Pantalla {...props} />); });
}

const campo = () => contenedor.querySelector('input');
const estado = () => contenedor.querySelector('[data-testid="estado"]').textContent;
const setValorNativo = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;

/**
 * Escribe como lo hace un teclado de verdad: el keydown, y si nadie lo frenó, la letra en el
 * campo (con su evento, para que React se entere). `cada` = milisegundos entre tecla y tecla.
 */
async function escribir(el, texto, { cada = 5, desde = 10_000 } = {}) {
  let t = desde;
  const eventos = [];
  await act(async () => {
    for (const c of texto) {
      const tecla = new KeyboardEvent('keydown', { key: c, bubbles: true, cancelable: true });
      Object.defineProperty(tecla, 'timeStamp', { value: t });
      el.dispatchEvent(tecla);
      if (!tecla.defaultPrevented && 'value' in el) {
        setValorNativo.call(el, el.value + c);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
      t += cada;
    }
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    Object.defineProperty(enter, 'timeStamp', { value: t });
    el.dispatchEvent(enter);
    eventos.push(enter);
    // Lo que haría el navegador con un Enter que nadie frenó, adentro de un formulario.
    if (!enter.defaultPrevented && el.form) el.form.requestSubmit();
  });
  return eventos[0];
}

afterEach(() => {
  if (root) act(() => root.unmount());
  contenedor?.remove();
  root = null;
  contenedor = null;
  leidos.length = 0;
  enviados.length = 0;
});

describe('⭐ el llavero en un campo que no es el buscador', () => {
  it('lo lee, el monto que se estaba escribiendo queda como estaba, y el Enter no envía el cobro', async () => {
    await pintar();
    const enter = await escribir(campo(), '0012345678');

    expect(leidos).toEqual(['0012345678']);
    expect(campo().value, 'el campo, como estaba').toBe('15000');
    expect(estado(), 'y la pantalla también lo sabe (React)').toBe('15000');
    expect(enter.defaultPrevented).toBe(true);
    expect(enviados, 'el Enter del lector no envió nada').toEqual([]);
  });

  it('el buscador de Accesos (data-lector="vaciar") queda vacío, sin lo de antes', async () => {
    await pintar({ vaciar: true });
    await escribir(campo(), '0012345678');

    expect(leidos).toEqual(['0012345678']);
    expect(campo().value).toBe('');
    expect(estado()).toBe('');
  });

  it('sin foco en ningún campo, también lo lee', async () => {
    await pintar();
    await escribir(document.body, '0012345678');
    expect(leidos).toEqual(['0012345678']);
  });

  it('⭐ un campo que lee el lector él mismo («Asignar llavero», «Probar el lector») recibe todo, Enter incluido', async () => {
    // Ahí pasar el llavero es para ASIGNARLO o probarlo. Si el portero se quedara con la lectura,
    // le registraría la entrada al socio en vez de darle el llavero.
    await pintar({ propio: true });
    const enter = await escribir(campo(), '0012345678');

    expect(leidos, 'el portero no se la queda').toEqual([]);
    expect(campo().value).toBe('0012345678');
    expect(enter.defaultPrevented, 'el Enter es del campo').toBe(false);
    expect(enviados).toEqual(['0012345678']);
  });
});

describe('una persona sigue siendo una persona', () => {
  it('⭐ escribir a ritmo humano en un campo no se toca, y su Enter envía como siempre', async () => {
    await pintar();
    await act(async () => { setValorNativo.call(campo(), ''); campo().dispatchEvent(new Event('input', { bubbles: true })); });
    const enter = await escribir(campo(), '20000', { cada: 120 });

    expect(leidos).toEqual([]);
    expect(campo().value).toBe('20000');
    expect(enter.defaultPrevented).toBe(false);
    expect(enviados).toEqual(['20000']);
  });

  it('apagado (con el aviso del llavero abierto) no escucha', async () => {
    await pintar({ activo: false });
    await escribir(campo(), '0012345678');

    expect(leidos).toEqual([]);
    expect(campo().value, 'lo que se escribe va al campo, que es donde se está buscando').toBe('150000012345678');
  });
});
