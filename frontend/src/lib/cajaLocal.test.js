// @vitest-environment happy-dom
// ============================================
// LA CAJA CONTADA POR EL TERMINAL
// ============================================
//
// Lo que se defiende acá NO es que la suma dé bien —eso es aritmética— sino las tres cosas
// que en este proyecto ya salieron mal cuando se duplicó una cuenta:
//
//  1. Que el número nunca se presente como completo cuando no lo es.
//  2. Que lo que ya se contó en un cierre no se vuelva a contar en el siguiente.
//  3. Que solo el efectivo mueva el cajón.

import { describe, it, expect, beforeEach, vi } from 'vitest';

const nucleo = { pendientes: vi.fn(async () => []) };

vi.mock('./colaAccesos', () => ({
  pendientes: (...a) => nucleo.pendientes(...a),
  disponible: () => true,
  orgActual: () => 'gimnasio-1',
}));

const { guardarEspejo, espejo, olvidarEspejo, arrancarPeriodoLocal, resumenSegunElTerminal } =
  await import('./cajaLocal');

/** Lo que contesta el servidor para el período abierto. */
function delServidor(extra = {}) {
  return {
    desde: '2026-09-15T08:00:00',
    efectivo: 40000, transferencia: 10000, mercadopago: 0, tarjeta: 0, otros: 0,
    cantidadCobros: 2,
    egresos: 5000, ingresosManuales: 0, cantidadMovimientos: 1,
    fondo: 20000,
    esperadoEnElCajon: 55000,
    digital: 10000,
    ...extra,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  nucleo.pendientes.mockResolvedValue([]);
});

describe('sin nada bajado todavía', () => {
  it('no inventa un cero: devuelve null', async () => {
    // Un cero se lee como "hoy no entró plata", que es una afirmación. No saber no es cero.
    expect(await resumenSegunElTerminal()).toBeNull();
  });
});

describe('el espejo de lo último que bajó', () => {
  it('guarda y devuelve lo que contestó el servidor', () => {
    guardarEspejo(delServidor());
    expect(espejo().resumen.efectivo).toBe(40000);
    expect(espejo().contarDesde).toBeNull();
  });

  it('olvidarlo lo borra', () => {
    guardarEspejo(delServidor());
    olvidarEspejo();
    expect(espejo()).toBeNull();
  });

  it('un espejo corrupto no rompe la pantalla', () => {
    localStorage.setItem('veltronik_caja_espejo', 'esto no es json');
    expect(espejo()).toBeNull();
  });
});

describe('⭐ el total = lo que bajó + lo que la cola tiene sin subir', () => {
  it('suma un cobro en efectivo encolado, y rehace la cuenta del cajón', async () => {
    guardarEspejo(delServidor());
    nucleo.pendientes.mockResolvedValue([
      { tipo: 'COBRO', amount: 15000, paymentMethod: 'CASH', ocurridoEn: '2026-09-15T14:00:00' },
    ]);

    const r = await resumenSegunElTerminal();

    expect(r.efectivo).toBe(55000);
    expect(r.cantidadCobros).toBe(3);
    // fondo 20000 + efectivo 55000 + ingresos 0 - egresos 5000
    expect(r.esperadoEnElCajon, 'el número que mira quien cierra tiene que incluirlo').toBe(70000);
  });

  it('un cobro por transferencia NO mueve el cajón', async () => {
    guardarEspejo(delServidor());
    nucleo.pendientes.mockResolvedValue([
      { tipo: 'COBRO', amount: 45000, paymentMethod: 'TRANSFER', ocurridoEn: '2026-09-15T14:00:00' },
    ]);

    const r = await resumenSegunElTerminal();

    expect(r.transferencia).toBe(55000);
    expect(r.digital).toBe(55000);
    expect(r.esperadoEnElCajon, 'esa plata nunca pasó por el cajón').toBe(55000);
  });

  it('un método que no conocemos cae en "otros" en vez de perderse', async () => {
    guardarEspejo(delServidor());
    nucleo.pendientes.mockResolvedValue([
      { tipo: 'COBRO', amount: 1000, paymentMethod: 'CRIPTO', ocurridoEn: '2026-09-15T14:00:00' },
    ]);

    expect((await resumenSegunElTerminal()).otros).toBe(1000);
  });

  it('un egreso en efectivo sale del cajón', async () => {
    guardarEspejo(delServidor());
    nucleo.pendientes.mockResolvedValue([
      { tipo: 'EGRESO', monto: 15000, metodo: 'CASH', ocurridoEn: '2026-09-15T14:00:00' },
    ]);

    const r = await resumenSegunElTerminal();

    expect(r.egresos).toBe(20000);
    expect(r.esperadoEnElCajon).toBe(40000);
  });

  it('⚠️ un egreso pagado por transferencia NO', async () => {
    // Salió de la cuenta, no del cajón. Restarlo acá inventaría un faltante y el cierre
    // acusaría a quien atendió — que es el bug que el módulo de movimientos vino a evitar.
    guardarEspejo(delServidor());
    nucleo.pendientes.mockResolvedValue([
      { tipo: 'EGRESO', monto: 15000, metodo: 'TRANSFER', ocurridoEn: '2026-09-15T14:00:00' },
    ]);

    const r = await resumenSegunElTerminal();

    expect(r.egresos).toBe(5000);
    expect(r.esperadoEnElCajon).toBe(55000);
  });

  it('los accesos encolados no tocan ningún número de plata', async () => {
    guardarEspejo(delServidor());
    nucleo.pendientes.mockResolvedValue([
      { tipo: 'ACCESO', memberId: 'm1', ocurridoEn: '2026-09-15T14:00:00' },
      { tipo: 'SALIDA', accessLogId: 'log-1', ocurridoEn: '2026-09-15T15:00:00' },
    ]);

    const r = await resumenSegunElTerminal();

    expect(r.efectivo).toBe(40000);
    expect(r.enCola).toBe(0);
  });
});

describe('⭐⭐ el total NUNCA se presenta como completo', () => {
  it('viene marcado incompleto y con la hora de los datos', async () => {
    // Regla 6 de la fase 3. El terminal no puede ver lo que entró por el portal o por Mercado
    // Pago durante el corte; decir un número redondo sin aclararlo sería inventar precisión.
    guardarEspejo(delServidor(), new Date('2026-09-15T15:00:00Z'));

    const r = await resumenSegunElTerminal();

    expect(r.incompleto).toBe(true);
    expect(r.bajadoEn).toBe('2026-09-15T15:00:00.000Z');
  });
});

describe('⭐⭐ después de cerrar, lo que sigue en la cola NO se cuenta de nuevo', () => {
  it('el período nuevo arranca en cero y con el resto del cajón como fondo', async () => {
    guardarEspejo(delServidor());
    arrancarPeriodoLocal(25000, '2026-09-15T22:00:00');

    const r = await resumenSegunElTerminal();

    expect(r.efectivo).toBe(0);
    expect(r.cantidadCobros).toBe(0);
    expect(r.fondo).toBe(25000);
    expect(r.esperadoEnElCajon).toBe(25000);
  });

  it('⭐ y no vuelve a sumar los cobros que ya contó el cierre', async () => {
    // EL CASO QUE HACE FALTA ACERTAR. Al cerrar, los cobros del día siguen en la cola
    // esperando para subir. Sin el corte por momento, el período nuevo los sumaría otra vez y
    // quien atiende vería el día de ayer de nuevo, con su plata incluida.
    arrancarPeriodoLocal(25000, '2026-09-15T22:00:00');
    nucleo.pendientes.mockResolvedValue([
      { tipo: 'COBRO', amount: 40000, paymentMethod: 'CASH', ocurridoEn: '2026-09-15T18:00:00' },
      { tipo: 'COBRO', amount: 12000, paymentMethod: 'CASH', ocurridoEn: '2026-09-16T09:00:00' },
    ]);

    const r = await resumenSegunElTerminal();

    expect(r.efectivo, 'solo el de la mañana siguiente').toBe(12000);
    expect(r.cantidadCobros).toBe(1);
    expect(r.esperadoEnElCajon).toBe(37000);
  });

  it('un cobro exactamente en el momento del cierre queda del lado cerrado', async () => {
    // El borde. Se cierra a las 22:00:00 y hay un cobro de las 22:00:00: el cierre lo contó
    // (su período va HASTA ese momento, inclusive), así que acá no va.
    arrancarPeriodoLocal(25000, '2026-09-15T22:00:00');
    nucleo.pendientes.mockResolvedValue([
      { tipo: 'COBRO', amount: 5000, paymentMethod: 'CASH', ocurridoEn: '2026-09-15T22:00:00' },
    ]);

    expect((await resumenSegunElTerminal()).efectivo).toBe(0);
  });
});
