// @vitest-environment happy-dom
//
// ============================================
// VELTRONIK - Tests de "cobrar sin salir de Socios"
// ============================================
// Lo que se cuida acá es el gesto entero: que abrir el cobro de un socio ya venga con SU
// arancel elegido y SU monto puesto, y que lo que se manda al servidor lleve el arancel.
//
// Esa última parte es la que estuvo rota todo este tiempo: se podía elegir el arancel, ver
// el monto completarse, y el arancel no salía nunca del navegador.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import CobroRapido from './CobroRapido';

const ARANCELES = [
  { id: 'p1', name: 'Mensual', price: 45000, durationDays: 30, isActive: true },
  { id: 'p2', name: 'Pase Libre', price: 60000, durationDays: 30, classes: 12, isActive: true },
];

const SOCIO = { id: 's1', fullName: 'LURDES ROLLET', planId: 'p2', planNombre: 'Pase Libre' };

let root;
let container;

async function pintar(props) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <CobroRapido
        socio={SOCIO}
        aranceles={ARANCELES}
        abierto
        onCerrar={() => {}}
        onCobrar={async () => ({})}
        {...props}
      />,
    );
  });
  await act(async () => { await Promise.resolve(); });
  return container;
}

/** El <select> del arancel. */
const selectArancel = () => container.querySelector('select');
/** El campo del monto. */
const inputMonto = () => container.querySelector('input[type="number"]');

function texto() {
  return container.textContent;
}

/**
 * Escribe en un campo controlado por React.
 *
 * React guarda el último valor que él puso y compara contra eso, así que asignar `.value`
 * a mano no dispara nada: hay que usar el setter nativo del prototipo para que la
 * comparación falle y el evento llegue al onChange.
 */
async function escribir(elemento, valor) {
  const proto = elemento instanceof HTMLSelectElement
    ? HTMLSelectElement.prototype
    : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(elemento, valor);
  await act(async () => {
    elemento.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

/**
 * Aprieta el botón de confirmar DE VERDAD.
 *
 * ⚠️ Antes esto disparaba el evento 'submit' sobre el <form> a mano, y eso dio falsa
 * seguridad: el test pasaba mientras el botón real —dibujado FUERA del formulario, en la
 * ranura de acciones del Modal— no enviaba nada al apretarlo. Un <button type="submit">
 * fuera de su form es decorativo. Lo agarró mirar la pantalla, no el test.
 */
async function confirmar() {
  const boton = [...container.querySelectorAll('button')]
    .find((b) => b.type === 'submit');
  if (!boton) throw new Error('no hay botón de confirmar en el modal');
  await act(async () => { boton.click(); });
  await act(async () => { await Promise.resolve(); });
}

beforeEach(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true; });

afterEach(() => {
  if (root) act(() => root.unmount());
  container?.remove();
});

describe('cobrar la cuota desde Socios', () => {

  // ⭐ EL GESTO COMPLETO: abrir y confirmar. Nada más.
  it('llega con el arancel del socio ya elegido y el monto puesto', async () => {
    // Antes había que buscar de nuevo al socio, elegir el arancel y escribir el monto —
    // en OTRA pantalla. Para la operación más común del gimnasio.
    await pintar();

    expect(selectArancel().value).toBe('p2');
    expect(inputMonto().value).toBe('60000');
  });

  it('manda el arancel del socio al confirmar', async () => {
    // ⭐ Esto es lo que estuvo roto: el arancel se elegía y no salía nunca del navegador.
    const onCobrar = vi.fn().mockResolvedValue({});
    await pintar({ onCobrar });

    await confirmar();

    expect(onCobrar).toHaveBeenCalledWith(
      expect.objectContaining({ planId: 'p2', monto: 60000, metodo: 'cash' }),
    );
  });

  it('cambiar el arancel cambia el monto', async () => {
    await pintar();

    await escribir(selectArancel(), 'p1');

    expect(inputMonto().value).toBe('45000');
  });

  it('el monto se puede pisar a mano', async () => {
    // Hay descuentos, cuotas partidas y arreglos que ningún catálogo contempla. El arancel
    // sugiere; no impone.
    const onCobrar = vi.fn().mockResolvedValue({});
    await pintar({ onCobrar });

    await escribir(inputMonto(), '30000');
    await confirmar();

    expect(onCobrar).toHaveBeenCalledWith(expect.objectContaining({ monto: 30000, planId: 'p2' }));
  });

  it('un socio sin arancel puede cobrarse igual, escribiendo el monto', async () => {
    const onCobrar = vi.fn().mockResolvedValue({});
    await pintar({ socio: { id: 's2', fullName: 'Nuevo' }, onCobrar });

    expect(selectArancel().value).toBe('');
    await escribir(inputMonto(), '20000');
    await confirmar();

    expect(onCobrar).toHaveBeenCalledWith(expect.objectContaining({ planId: null, monto: 20000 }));
  });

  it('no cobra si el monto es cero o está vacío', async () => {
    // Un cobro de $0 corre el vencimiento igual: el socio queda al día sin haber pagado.
    const onCobrar = vi.fn().mockResolvedValue({});
    await pintar({ socio: { id: 's2', fullName: 'Nuevo' }, onCobrar });

    await confirmar();

    expect(onCobrar).not.toHaveBeenCalled();
  });

  // ⭐ EL CASO INCÓMODO
  it('avisa si el socio tiene un arancel que ya no se vende', async () => {
    // Si no se dice ACÁ, el dueño se entera cuando el monto no es el que esperaba.
    await pintar({ socio: { id: 's3', fullName: 'Viejo', planId: 'borrado', planNombre: 'Trimestral' } });

    expect(texto()).toContain('ya no está en la lista');
    expect(texto()).toContain('Trimestral');
  });

  // ⚠️ NO SE PIDEN FECHAS, Y ES A PROPÓSITO
  it('no pide fechas: el vencimiento lo corre el backend', async () => {
    // Calcularlo también acá sería tener dos cuentas para lo mismo, que es el error que ya
    // costó los días de vencimiento en cinco lugares.
    await pintar();

    expect(container.querySelector('input[type="date"]')).toBe(null);
    expect(texto()).toContain('El vencimiento lo corre el sistema');
  });

  it('después de cobrar muestra el vencimiento que dijo el SERVIDOR', async () => {
    await pintar({ onCobrar: async () => ({ membershipEnd: '2026-10-15T23:59:59' }) });

    await confirmar();

    expect(texto()).toContain('Cobro registrado');
    expect(texto()).toContain('15/10/2026');
  });

  it('si el servidor no dice el vencimiento, NO se inventa una fecha', async () => {
    // Decir un vencimiento que no es el real es peor que no decir ninguno: el socio se va
    // convencido de una fecha equivocada.
    await pintar({ onCobrar: async () => ({}) });

    await confirmar();

    expect(texto()).toContain('Cobro registrado');
    expect(texto()).toContain('El vencimiento se actualizó');
  });
});
