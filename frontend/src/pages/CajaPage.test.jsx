// @vitest-environment happy-dom
//
// ============================================
// VELTRONIK - Tests de la pantalla de caja
// ============================================
// Acá se prueba lo que la pantalla MUESTRA, que es lo que usa el gimnasio todos los días.
// La lógica de la plata vive en el backend y tiene sus propios tests; esto cuida que la
// pantalla no diga algo distinto de lo que pasó.
//
// Lo que se cuida en particular:
//   1. Que "caja cerrada" ofrezca abrirla, y "caja abierta" ofrezca cerrarla.
//   2. Que quien va a contar NO vea los montos antes de contar (si los ve, los suma y
//      escribe ese número, y el arqueo deja de medir nada).
//   3. Que el dueño SÍ vea de dónde sale el número, cobro por cobro.

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
  // Los COBROS del período (solo dueño).
  movimientos: vi.fn(),
  // Los MOVIMIENTOS DE CAJA: gastos y entradas que no son cobros. Nombres parecidos y cosas
  // distintas — el backend tuvo que llamarlos así porque `movimientos` ya estaba tomado por
  // los cobros y lo consumen escritorios ya instalados.
  movimientosDeCaja: vi.fn(),
  registrarMovimiento: vi.fn(),
  anularMovimiento: vi.fn(),
  abrir: vi.fn(),
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
// En la app real showToast es un useCallback, o sea estable — el bucle es solo del mock.
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

let root;
let container;

async function pintar() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(<CajaPage />); });
  // La carga son promesas encadenadas —primero el estado y lo pendiente, después los
  // importes, el historial y los movimientos— así que hace falta más de un tick.
  for (let i = 0; i < 6; i++) {
    await act(async () => { await Promise.resolve(); });
  }
  return container.textContent;
}

function conCajaCerrada() {
  cajaService.estado.mockResolvedValue({ abierta: false, cantidadCobros: 3 });
  cajaService.pendiente.mockResolvedValue({ desde: '2026-09-01T08:00:00', cantidadCobros: 3 });
}

function conCajaAbierta() {
  cajaService.estado.mockResolvedValue({
    abierta: true, desde: '2026-09-01T08:00:00', abiertaPor: 'Carla', fondoInicial: 10000,
    cantidadCobros: 3,
  });
  cajaService.pendiente.mockResolvedValue({ desde: '2026-09-01T08:00:00', cantidadCobros: 3 });
}

beforeEach(() => {
  rolActual = 'owner';
  vi.clearAllMocks();
  cajaService.abierto.mockResolvedValue({
    efectivo: 40000, transferencia: 45000, mercadopago: 60000, tarjeta: 0, otros: 0,
    cantidadCobros: 3,
  });
  cajaService.historial.mockResolvedValue([]);
  cajaService.movimientos.mockResolvedValue(COBROS);
  cajaService.movimientosDeCaja.mockResolvedValue([]);
});

afterEach(() => {
  if (root) act(() => root.unmount());
  container?.remove();
});

describe('la pantalla de caja', () => {

  it('con la caja cerrada, ofrece abrirla', async () => {
    conCajaCerrada();
    const texto = await pintar();

    expect(texto).toContain('Caja cerrada');
    expect(texto).toContain('Abrir caja');
  });

  it('avisa si quedaron cobros sin cerrar con la caja cerrada', async () => {
    // Cobrar sigue andando con la caja cerrada a propósito: nadie puede quedarse sin poder
    // cobrarle a un socio porque a la mañana se olvidaron de abrir. Pero esa plata está en
    // el cajón, y si nadie lo dice, aparece de golpe en el próximo cierre.
    conCajaCerrada();
    const texto = await pintar();

    expect(texto).toContain('3 cobros');
  });

  it('con la caja abierta, muestra quién la abrió y con cuánto cambio', async () => {
    conCajaAbierta();
    const texto = await pintar();

    expect(texto).toContain('Caja abierta');
    expect(texto).toContain('Carla');
    expect(texto).toContain('10.000');
    expect(texto).toContain('Contar y cerrar caja');
  });

  // ⭐ EL DUEÑO VE DE DÓNDE SALE EL NÚMERO
  it('el dueño ve cada cobro con su monto y su método', async () => {
    // Un total que no se puede abrir es un número en el que hay que creer.
    conCajaAbierta();
    const texto = await pintar();

    expect(texto).toContain('LURDES ROLLET');
    expect(texto).toContain('40.000');
    expect(texto).toContain('Efectivo');
    expect(texto).toContain('LAURA RODRIGUEZ');
    expect(texto).toContain('Transferencia');
    expect(texto).toContain('Mercado Pago');
  });

  it('el dueño ve cuánto TENDRÍA QUE HABER en el cajón, con el cambio adentro', async () => {
    // 40.000 cobrados en efectivo + 10.000 de cambio con el que se abrió.
    conCajaAbierta();
    const texto = await pintar();

    expect(texto).toContain('Tendría que haber en el cajón');
    expect(texto).toContain('50.000');
  });

  // ⭐ EL QUE CUENTA NO PUEDE VER LOS NÚMEROS
  it('recepción NO ve ningún monto de los cobros', async () => {
    // Si los ve, los suma y escribe ese número. El arqueo deja de medir nada, y esconderlo
    // solo en la pantalla no alcanza — por eso el backend tampoco se los da.
    rolActual = 'reception';
    conCajaAbierta();
    const texto = await pintar();

    expect(cajaService.movimientos).not.toHaveBeenCalled();
    expect(cajaService.abierto).not.toHaveBeenCalled();
    expect(texto).not.toContain('LURDES ROLLET');
    expect(texto).not.toContain('40.000');
    // Pero sí puede cerrar: es la que tiene el cajón adelante.
    expect(texto).toContain('Contar y cerrar caja');
  });

  it('recepción no ve el botón de cerrar sin contar', async () => {
    // Es la única con el cajón adelante. Si pudiera saltear el conteo, no habría arqueo.
    rolActual = 'reception';
    conCajaAbierta();
    const texto = await pintar();

    expect(texto).not.toContain('Cerrar sin contar');
  });

  it('si no se puede consultar, lo dice en vez de mostrar una caja vacía', async () => {
    // "No hay nada" y "no pudimos preguntar" no son lo mismo, y mostrarlos igual haría que
    // alguien cierre una caja creyendo que no hubo cobros.
    cajaService.estado.mockRejectedValue(new Error('sin red'));
    cajaService.pendiente.mockRejectedValue(new Error('sin red'));
    const texto = await pintar();

    expect(texto).toContain('No pudimos consultar');
  });
});

describe('los movimientos de caja', () => {

  const GASTO = {
    id: 'g1', tipo: 'EGRESO', categoria: 'Limpieza', detalle: 'Semana del 1 al 7',
    monto: 15000, metodo: 'CASH', fecha: '2026-09-02T11:00:00', hechoPorNombre: 'Carla',
  };
  const GASTO_ANULADO = {
    ...GASTO, id: 'g2', categoria: 'Proveedor', detalle: 'Agua',
    anuladoAt: '2026-09-02T12:00:00', anuladoPorNombre: 'Gustavo', motivoAnulacion: 'me equivoqué',
  };

  it('⭐ RECEPCIÓN los ve, al revés que los cobros', async () => {
    // No rompe el conteo a ciegas: quien cuenta ya sabe cuánto sacó del cajón —lo sacó ella—
    // y con el fondo y los egresos todavía le falta el número grande, que es lo cobrado en
    // efectivo. Y necesita verlos para no cargar dos veces el mismo gasto.
    rolActual = 'reception';
    conCajaAbierta();
    cajaService.movimientosDeCaja.mockResolvedValue([GASTO]);
    const texto = await pintar();

    expect(texto).toContain('Limpieza');
    expect(texto, 'pero los montos de los COBROS siguen ocultos').not.toContain('LURDES ROLLET');
  });

  it('⚠️ un movimiento anulado se muestra TACHADO, no desaparece', async () => {
    // Un egreso que se puede hacer desaparecer de la lista es justamente lo que este módulo
    // existe para impedir.
    conCajaAbierta();
    cajaService.movimientosDeCaja.mockResolvedValue([GASTO_ANULADO]);
    await pintar();

    const fila = container.querySelector('.caja-mov-anulado');
    expect(fila, 'la fila sigue ahí, marcada como anulada').toBeTruthy();
    expect(fila.textContent).toContain('Proveedor');
    expect(fila.textContent, 'y dice quién la anuló y por qué').toContain('Gustavo');
    expect(fila.textContent).toContain('me equivoqué');
  });

  it('el dueño ve lo que SALIÓ del cajón junto al esperado', async () => {
    // Es el número que hay que mirar cuando la caja cuadra demasiado bien: un egreso
    // inventado la hace cuadrar exacto, porque la plata salió y el sistema la esperaba afuera.
    conCajaAbierta();
    cajaService.abierto.mockResolvedValue({
      efectivo: 50000, transferencia: 0, mercadopago: 0, tarjeta: 0, otros: 0,
      cantidadCobros: 1, egresos: 15000, ingresosManuales: 0,
      esperadoEnElCajon: 45000,
    });
    cajaService.movimientosDeCaja.mockResolvedValue([GASTO]);
    const texto = await pintar();

    expect(texto).toContain('Salió del cajón');
    expect(texto, 'el esperado ya viene con el gasto restado, calculado por el backend')
      .toContain('45.000');
  });

  it('⚠️ el esperado lo manda el BACKEND, no se recalcula en la pantalla', async () => {
    // Una cuenta de plata copiada en dos lados es una cuenta que en algún lado va a quedar
    // mal — en este proyecto ya pasó con los vencimientos, con getQuickDates y con
    // addOneMonth. Si la pantalla rehiciera la cuenta sumando fondo (10.000) + efectivo
    // (50.000), mostraría 60.000 e ignoraría los 15.000 que salieron del cajón.
    //
    // Se mira EL RENGLÓN, no el texto de la página: la lista de cobros trae un cobro de
    // 60.000 y buscar ese número en todo el documento daría un falso positivo.
    conCajaAbierta();
    cajaService.abierto.mockResolvedValue({
      efectivo: 50000, transferencia: 0, mercadopago: 0, tarjeta: 0, otros: 0,
      cantidadCobros: 1, egresos: 15000, ingresosManuales: 0,
      esperadoEnElCajon: 45000,
    });
    await pintar();

    const renglon = [...container.querySelectorAll('.caja-metodos-total')]
      .find((d) => d.textContent.includes('Tendría que haber en el cajón'));

    expect(renglon, 'el renglón del esperado existe').toBeTruthy();
    expect(renglon.textContent).toContain('45.000');
    expect(renglon.textContent, 'si dijera 60.000 estaría rehaciendo la cuenta por su cuenta')
      .not.toContain('60.000');
  });

  it('un método que no es efectivo avisa que no toca el cajón', async () => {
    conCajaAbierta();
    cajaService.movimientosDeCaja.mockResolvedValue([{ ...GASTO, id: 'g3', metodo: 'TRANSFER' }]);
    const texto = await pintar();

    expect(texto).toContain('no toca el cajón');
  });
});
