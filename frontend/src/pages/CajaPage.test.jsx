// @vitest-environment happy-dom
//
// ============================================
// VELTRONIK - Tests de la pantalla de caja (cierre diario)
// ============================================
// Acá se prueba lo que la pantalla MUESTRA, que es lo que usa el gimnasio todos los días.
// La lógica de la plata vive en el backend y tiene sus propios tests; esto cuida que la
// pantalla no diga algo distinto de lo que pasó.
//
// ⚠️ ESTOS TESTS SE REESCRIBIERON EL 2026-09-02. Antes defendían el ARQUEO A CIEGAS: que
// quien iba a contar NO viera los montos, porque si los veía los sumaba y escribía ese
// número. El dueño dio de baja ese modelo —el sistema ya sabe cuánto entró por cada forma
// de pago— así que ahora se defiende lo contrario: que los totales SE VEAN, y que la única
// decisión que queda (cuánto se retira) no se pueda equivocar en silencio.
//
// Lo que se cuida ahora:
//   1. Que los cobros se vean con su forma de pago: es la cuenta que el dueño quería hacer
//      de un vistazo (de 20 cobros, cuántos por transferencia y cuántos en efectivo).
//   2. Que la cuenta del cajón la mande el BACKEND y la pantalla no la recalcule.
//   3. Que no se pueda retirar más de lo que hay.
//   4. Que cerrar pida confirmación, y que cancelar no cierre nada.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

/** Estable a propósito: ver el comentario del mock de ToastContext. */
const toastEstable = { showToast: vi.fn() };

const cajaService = {
  estado: vi.fn(),
  pendiente: vi.fn(),
  abierto: vi.fn(),
  historial: vi.fn(),
  balance: vi.fn(),
  // Los COBROS del período.
  movimientos: vi.fn(),
  // Los MOVIMIENTOS DE CAJA: gastos y entradas que no son cobros. Nombres parecidos y cosas
  // distintas — el backend tuvo que llamarlos así porque `movimientos` ya estaba tomado por
  // los cobros y lo consumen escritorios ya instalados.
  movimientosDeCaja: vi.fn(),
  registrarMovimiento: vi.fn(),
  anularMovimiento: vi.fn(),
  cerrar: vi.fn(),
  explicar: vi.fn(),
};

let rolActual = 'owner';
const perfilEstable = { fullName: 'Gustavo' };

vi.mock('../services/CajaService', () => ({ cajaService, default: cajaService }));
vi.mock('../services', () => ({ errorService: { getMessage: (e) => String(e?.message || e) } }));
// ⚠️ EL OBJETO TIENE QUE SER SIEMPRE EL MISMO.
//
// `cargar` es un useCallback que depende de `showToast`. Si el mock devuelve un objeto
// nuevo en cada render, `cargar` cambia de identidad, el efecto que lo llama se vuelve a
// disparar, y eso provoca otro render: bucle infinito y el test se cuelga sin decir por qué.
vi.mock('../contexts/ToastContext', () => ({ useToast: () => toastEstable }));
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ orgRole: rolActual, profile: perfilEstable }),
}));
const turnoEstable = { name: 'Carla' };
vi.mock('../lib/shift', () => ({ getShift: () => turnoEstable }));

const { default: CajaPage } = await import('./CajaPage');

/** Los cobros del período, con los mismos datos que muestra la pantalla de Pagos. */
const COBROS = [
  { id: '1', socio: 'LURDES ROLLET', monto: 40000, metodo: 'cash', fecha: '2026-09-01T10:12:00' },
  { id: '2', socio: 'LAURA RODRIGUEZ', monto: 45000, metodo: 'transfer', fecha: '2026-09-01T11:03:00' },
  { id: '3', socio: 'joaquin bonutti', monto: 60000, metodo: 'mercadopago', fecha: '2026-09-01T18:05:00' },
];

/**
 * El período abierto tal como lo manda el backend.
 *
 * ⚠️ `esperadoEnElCajon` viene CALCULADO de allá (fondo + efectivo + ingresos − egresos).
 * La pantalla no lo recalcula, y hay un test abajo que lo defiende: una cuenta de plata
 * copiada en dos lados es una cuenta que en algún lado va a estar mal.
 */
const ABIERTO = {
  desde: '2026-09-01T08:00:00',
  fondo: 10000,
  efectivo: 40000,
  transferencia: 45000,
  mercadopago: 60000,
  digital: 105000,
  tarjeta: 0,
  otros: 0,
  cantidadCobros: 3,
  egresos: 0,
  ingresosManuales: 0,
  esperadoEnElCajon: 50000,
  ultimoCierre: null,
};

let root;
let container;

async function pintar() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(<CajaPage />); });
  // La carga son promesas encadenadas, así que hace falta más de un tick.
  for (let i = 0; i < 6; i++) {
    await act(async () => { await Promise.resolve(); });
  }
  return container.textContent;
}

/** Busca un botón por su texto. */
const boton = (texto) => [...container.querySelectorAll('button')]
  .find((b) => b.textContent.includes(texto));

async function clic(elemento) {
  await act(async () => {
    elemento.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  for (let i = 0; i < 4; i++) {
    await act(async () => { await Promise.resolve(); });
  }
}

/** Escribe en un input pasando por el setter nativo (si no, React no ve el cambio). */
const setValorNativo = Object.getOwnPropertyDescriptor(
  window.HTMLInputElement.prototype, 'value',
).set;

async function escribirRetiro(valor) {
  const input = container.querySelector('.caja-monto');
  await act(async () => {
    setValorNativo.call(input, valor);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  rolActual = 'owner';
  cajaService.abierto.mockResolvedValue({ ...ABIERTO });
  cajaService.movimientos.mockResolvedValue(COBROS);
  cajaService.movimientosDeCaja.mockResolvedValue([]);
  cajaService.historial.mockResolvedValue([]);
  cajaService.balance.mockResolvedValue({
    periodo: 'hoy', efectivo: 40000, digital: 105000, total: 145000, cantidadCobros: 3,
  });
  cajaService.cerrar.mockResolvedValue({
    id: 'c1', esperadoEfectivo: 40000, esperadoTransferencia: 45000, esperadoMercadopago: 60000,
    retiroEfectivo: 30000, quedaEnCaja: 20000,
  });
});

afterEach(() => {
  if (root) act(() => root.unmount());
  container?.remove();
});

describe('los cobros a cerrar', () => {

  // ⭐ EL PEDIDO DEL DUEÑO, TAL CUAL: "de 20 personas, cuántas por transferencia y cuántas
  // en efectivo". Antes había que mirar cobro por cobro en otra pantalla.
  it('se ve cada cobro con su socio, su forma de pago y su monto', async () => {
    const texto = await pintar();

    expect(texto).toContain('LURDES ROLLET');
    expect(texto).toContain('Efectivo');
    expect(texto).toContain('LAURA RODRIGUEZ');
    expect(texto).toContain('Transferencia');
    expect(texto).toContain('joaquin bonutti');
    expect(texto).toContain('Mercado Pago');
  });

  /**
   * Lo que está en el cajón y lo que está en el banco se separan con COLOR, no solo con
   * texto: es la distinción que ordena toda la pantalla, y la que decide cuánto se puede
   * retirar de verdad.
   */
  it('el efectivo y lo digital se distinguen a simple vista', async () => {
    await pintar();

    const metodos = [...container.querySelectorAll('.caja-metodo')];
    expect(metodos).toHaveLength(3);
    expect(metodos[0].className).toContain('es-efectivo');
    expect(metodos[1].className).toContain('es-digital');
  });

  // ⚠️ Hasta el 2026-09-02 esto era al revés: recepción NO podía ver los montos, porque el
  // cierre era un arqueo a ciegas. Ahora recepción también cierra, y para cerrar hay que ver.
  it('⚠️ recepción también ve los cobros: ahora es quien cierra', async () => {
    rolActual = 'reception';

    const texto = await pintar();

    expect(texto).toContain('LURDES ROLLET');
    expect(cajaService.movimientos).toHaveBeenCalled();
  });

  it('el historial de cierres sigue siendo solo del dueño', async () => {
    rolActual = 'reception';

    await pintar();

    expect(cajaService.historial).not.toHaveBeenCalled();
  });
});

describe('la distribución del efectivo', () => {

  /**
   * ⚠️ EL NÚMERO DEL CAJÓN LO MANDA EL BACKEND.
   *
   * Es fondo + cobrado en efectivo + ingresos manuales − egresos, y cada término de esa
   * cuenta costó un bug: sin el fondo todos los cierres daban sobrante, sin los egresos
   * todos daban faltante. Recalcularla acá sería tener dos versiones de la misma cuenta.
   */
  it('⚠️ lo que hay en el cajón sale del backend, no se recalcula en la pantalla', async () => {
    // El backend dice 50.000 aunque los cobros en efectivo sumen 40.000: hay 10.000 de
    // fondo. Si la pantalla hiciera su propia cuenta, mostraría otra cosa.
    const texto = await pintar();

    // Sin el signo: formatCurrency separa con un espacio NO-SEPARABLE, y comparar con un
    // espacio común falla por un carácter invisible.
    expect(texto).toContain('50.000');
  });

  it('lo que se retira se descuenta de lo que queda para mañana', async () => {
    await pintar();

    await escribirRetiro('30000');

    expect(container.textContent).toContain('20.000');
  });

  /**
   * Un cero de más dejaría el fondo de mañana en negativo, y ese error viajaría encadenado
   * de día en día — porque el fondo de mañana ES este número.
   */
  it('⚠️ no deja retirar más de lo que hay en el cajón', async () => {
    await pintar();

    await escribirRetiro('999999');

    expect(container.textContent).toContain('No podés retirar más de lo que hay');
    expect(boton('Cerrar caja diaria').disabled, 'el botón no puede quedar apretable').toBe(true);
  });

  it('sin retiro, queda en caja todo lo que hay', async () => {
    const texto = await pintar();

    // 50.000 aparece dos veces: en el cajón y en lo que queda.
    expect(texto).toContain('Queda en caja');
    expect(boton('Cerrar caja diaria').disabled).toBe(false);
  });
});

describe('cerrar la caja', () => {

  it('pide confirmación antes de cerrar', async () => {
    await pintar();

    await clic(boton('Cerrar caja diaria'));

    expect(container.textContent).toContain('Confirmar cierre');
    expect(boton('Sí, cerrar caja')).toBeTruthy();
    expect(boton('Cancelar')).toBeTruthy();
    expect(cajaService.cerrar, 'todavía no se cerró nada').not.toHaveBeenCalled();
  });

  it('cancelar no cierra nada', async () => {
    await pintar();
    await clic(boton('Cerrar caja diaria'));

    await clic(boton('Cancelar'));

    expect(cajaService.cerrar).not.toHaveBeenCalled();
  });

  it('confirmar cierra con el retiro que se escribió', async () => {
    await pintar();
    await escribirRetiro('30000');
    await clic(boton('Cerrar caja diaria'));

    await clic(boton('Sí, cerrar caja'));

    expect(cajaService.cerrar).toHaveBeenCalledWith(
      expect.objectContaining({ retiroEfectivo: 30000, cerradoPor: 'Carla' }),
    );
  });

  it('después de cerrar se ve qué quedó en el cajón para mañana', async () => {
    await pintar();
    await clic(boton('Cerrar caja diaria'));

    await clic(boton('Sí, cerrar caja'));

    expect(container.textContent).toContain('Queda en caja para mañana');
  });
});

describe('el balance de ingresos', () => {

  it('arranca mostrando el día', async () => {
    const texto = await pintar();

    expect(texto).toContain('Balance de ingresos');
    expect(texto).toContain('Total de hoy');
    expect(cajaService.balance).toHaveBeenCalledWith('hoy');
  });

  it('se puede pasar al mes', async () => {
    await pintar();
    cajaService.balance.mockResolvedValue({
      periodo: 'mes', efectivo: 400000, digital: 900000, total: 1300000, cantidadCobros: 31,
    });

    await clic(boton('Mes'));

    expect(cajaService.balance).toHaveBeenCalledWith('mes');
    expect(container.textContent).toContain('Total del mes');
  });

  /** Un backend que todavía no tiene el balance no puede dejar sin cerrar la caja. */
  it('⚠️ si el backend no conoce el balance, la caja se cierra igual', async () => {
    cajaService.balance.mockRejectedValue(new Error('404'));

    const texto = await pintar();

    expect(texto).not.toContain('Balance de ingresos');
    expect(boton('Cerrar caja diaria')).toBeTruthy();
  });
});

describe('los movimientos de caja', () => {

  const EGRESO = {
    id: 'm1', tipo: 'EGRESO', categoria: 'Limpieza', detalle: 'Semana del 1 al 7',
    monto: 15000, metodo: 'CASH', hechoPorNombre: 'Carla', fecha: '2026-09-02T11:00:00',
  };

  /**
   * ⚠️ SIN ESTO LA CAJA MIENTE TODOS LOS DÍAS. Se le pagan $15.000 a la chica de la
   * limpieza del cajón: si no queda anotado, el sistema espera esa plata igual.
   */
  it('un gasto en efectivo se ve y baja lo que hay en el cajón', async () => {
    cajaService.movimientosDeCaja.mockResolvedValue([EGRESO]);
    cajaService.abierto.mockResolvedValue({ ...ABIERTO, egresos: 15000, esperadoEnElCajon: 35000 });

    const texto = await pintar();

    expect(texto).toContain('Limpieza');
    expect(texto).toContain('Gastos pagados del cajón');
    expect(texto).toContain('35.000');
  });

  it('un movimiento anulado queda tachado, no desaparece', async () => {
    cajaService.movimientosDeCaja.mockResolvedValue([
      { ...EGRESO, anuladoAt: '2026-09-02T12:00:00', anuladoPorNombre: 'Gustavo', motivoAnulacion: 'cargado dos veces' },
    ]);

    const texto = await pintar();

    expect(container.querySelector('.caja-mov-anulado'), 'se muestra tachado').toBeTruthy();
    expect(texto).toContain('cargado dos veces');
  });

  /**
   * Un backend que todavía no tiene esta función responde 404. Si eso tumbara la pantalla,
   * el cierre —que funciona en cualquier versión— quedaría inutilizable.
   */
  it('⚠️ si el backend NO conoce los movimientos, la caja sigue funcionando', async () => {
    cajaService.movimientosDeCaja.mockRejectedValue(new Error('404'));

    const texto = await pintar();

    expect(texto, 'la caja se sigue pudiendo cerrar').toContain('Cerrar caja diaria');
    expect(boton('Anotar un gasto'), 'pero el botón que fallaría no se ofrece').toBeFalsy();
  });
});

describe('cuando algo falla', () => {

  /** Un pedido que falló NO es un período vacío: cerrar así sería cerrar a ciegas. */
  it('si no se pueden traer los datos, lo dice en vez de mostrar una caja vacía', async () => {
    cajaService.abierto.mockRejectedValue(new Error('sin respuesta'));

    const texto = await pintar();

    expect(texto).toContain('No pudimos traer los datos de la caja');
    expect(boton('Cerrar caja diaria').disabled).toBe(true);
  });
});
