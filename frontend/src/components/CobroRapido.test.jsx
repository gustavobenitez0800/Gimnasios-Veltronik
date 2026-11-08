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

// La clave para cobrar (Ajustes), de mentira: así se controla si la escribieron o no, y no se
// trae la capa de datos entera (en el Node 20 del CI, construir el cliente de Supabase revienta).
const clave = vi.hoisted(() => ({ pedirClave: vi.fn(async () => true) }));
vi.mock('../contexts/ClaveDeCobroContext', () => ({ useClaveDeCobro: () => clave }));

const { default: CobroRapido } = await import('./CobroRapido');

const ARANCELES = [
  { id: 'p1', name: 'Mensual', price: 45000, coberturaCantidad: 1, coberturaUnidad: 'MES', isActive: true },
  { id: 'p2', name: 'Pase Libre', price: 60000, coberturaCantidad: 1, coberturaUnidad: 'MES', classes: 12, isActive: true },
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

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  clave.pedirClave.mockReset();
  clave.pedirClave.mockResolvedValue(true);
});

/** Una fecha a N días de hoy, a las 00:00, como la manda el servidor. */
function enDias(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const dos = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}T00:00:00`;
}

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

describe('⚠️ sin conexión no se promete un vencimiento nuevo', () => {
  // La cobertura la corre el SERVIDOR cuando el cobro sube. Hasta entonces no se movió nada:
  // decir "ahora vence el 7 de octubre" —o incluso "el vencimiento se actualizó"— sería
  // afirmar algo que no pasó. Y calcularlo acá para poder mostrarlo sería una segunda cuenta
  // de la misma cobertura, que es el error que este proyecto ya cometió con las fechas.

  it('lo dice como lo que es: la plata quedó anotada, el vencimiento no se movió', async () => {
    await pintar({ onCobrar: async () => ({ encolado: true }) });
    await confirmar();

    const texto = container.textContent;
    expect(texto).toContain('sin conexión');
    expect(texto).toContain('cuando vuelva internet');
    expect(texto, 'no se afirma que ya se actualizó').not.toContain('El vencimiento se actualizó');
    expect(texto, 'y no se inventa una fecha').not.toMatch(/Ahora vence el/);
  });

  it('con conexión sigue diciendo el vencimiento real', async () => {
    await pintar({ onCobrar: async () => ({ membershipEnd: '2026-10-07T00:00:00' }) });
    await confirmar();

    expect(container.textContent).toContain('Ahora vence el');
    expect(container.textContent).not.toContain('sin conexión');
  });
});

describe('⭐ el modal dice QUÉ va a pasar con la fecha, antes de cobrar', () => {
  // ADR-013. Un arancel que no corre el vencimiento es legítimo —la clase suelta— pero si eso
  // se descubre dos semanas después, en la puerta, con el socio jurando que pagó y la
  // recepcionista sin saber qué contestar, ya es tarde. Es el silencio que costaba clientes.

  const SUELTA = {
    id: 'p3', name: 'Pase Diario', price: 10000,
    coberturaCantidad: 0, coberturaUnidad: 'DIA', isActive: true,
  };
  const TRIMESTRAL = {
    id: 'p4', name: 'Trimestral', price: 120000,
    coberturaCantidad: 3, coberturaUnidad: 'MES', isActive: true,
  };

  it('⚠️ avisa cuando el arancel NO corre el vencimiento', async () => {
    await pintar({ aranceles: [SUELTA], socio: { ...SOCIO, planId: 'p3' } });

    expect(container.textContent).toContain('NO corre el vencimiento');
  });

  it('y cuando sí, dice cuánto', async () => {
    await pintar({ aranceles: [TRIMESTRAL], socio: { ...SOCIO, planId: 'p4' } });

    expect(container.textContent).toContain('Corre el vencimiento 3 meses');
  });

  it('⭐ sin arancel elegido dice que igual corre un mes', async () => {
    // Es el cambio de fondo: antes, cobrar sin arancel no movía nada y nadie lo sabía.
    await pintar({ aranceles: [], socio: { ...SOCIO, planId: null } });

    expect(container.textContent).toContain('Sin arancel la cuota corre 1 mes');
  });
});

describe('⭐ al que pagó tarde: desde que venció o desde hoy (08/11/2026)', () => {
  it('ofrece las dos fechas, viene marcada «desde que venció», y manda lo elegido', async () => {
    // Lo pidió un gimnasio: vencía hace 3 días, pagó hoy, y no tiene que perder su ciclo ni que
    // alguien se acuerde la fecha vieja para corregirla a mano.
    const onCobrar = vi.fn().mockResolvedValue({});
    await pintar({ onCobrar, socio: { ...SOCIO, membershipEnd: enDias(-3) } });

    expect(texto()).toContain('Desde que venció');
    expect(texto()).toContain('Desde hoy');
    const radios = [...container.querySelectorAll('input[type="radio"]')];
    expect(radios[0].checked, 'viene marcada «desde que venció»').toBe(true);

    await confirmar();
    expect(onCobrar).toHaveBeenCalledWith(expect.objectContaining({ desde: 'VENCIMIENTO' }));

    // Ahora eligiendo «desde hoy».
    onCobrar.mockClear();
    root.unmount();
    container.remove();
    await pintar({ onCobrar, socio: { ...SOCIO, membershipEnd: enDias(-3) } });
    await act(async () => { container.querySelectorAll('input[type="radio"]')[1].click(); });
    await confirmar();
    expect(onCobrar).toHaveBeenCalledWith(expect.objectContaining({ desde: 'HOY' }));
  });

  it('al que todavía está al día no le pregunta nada (se le suma, como siempre)', async () => {
    const onCobrar = vi.fn().mockResolvedValue({});
    await pintar({ onCobrar, socio: { ...SOCIO, membershipEnd: enDias(10) } });

    expect(texto()).not.toContain('Desde que venció');
    await confirmar();
    expect(onCobrar).toHaveBeenCalledWith(expect.objectContaining({ desde: null }));
  });

  it('🔴 al vencido hace meses no le ofrece «desde que venció»: lo dejaría vencido', async () => {
    await pintar({ socio: { ...SOCIO, membershipEnd: enDias(-90) } });
    expect(texto()).not.toContain('Desde que venció');
  });
});

describe('⭐ la clave para cobrar (opcional, Ajustes)', () => {
  it('🔴 si la piden y no la escriben, no se cobra', async () => {
    clave.pedirClave.mockResolvedValue(false);
    const onCobrar = vi.fn().mockResolvedValue({});
    await pintar({ onCobrar });

    await confirmar();

    expect(clave.pedirClave).toHaveBeenCalledWith('cobrar');
    expect(onCobrar).not.toHaveBeenCalled();
    expect(texto(), 'el cobro sigue abierto, para escribirla o cancelar').toContain('Cobrar cuota');
  });

  it('escrita bien, se cobra', async () => {
    const onCobrar = vi.fn().mockResolvedValue({});
    await pintar({ onCobrar });
    await confirmar();
    expect(clave.pedirClave).toHaveBeenCalledTimes(1);
    expect(onCobrar).toHaveBeenCalledTimes(1);
  });
});
