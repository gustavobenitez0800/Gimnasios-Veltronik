import { describe, it, expect } from 'vitest';
import { tablaDeSocios, tablaDeIngresos, tablaDeAccesos, tablaDelResumen } from './reportesDelGimnasio';

const AHORA = new Date('2026-09-22T12:00:00');
// Intl separa el $ del número con un espacio duro: se compara como se lee.
const leer = (v) => (typeof v === 'string' ? v.replace(/\u00a0/g, ' ') : v);

describe('el reporte de socios', () => {
  it('⭐ el estado es el mismo de la pantalla de Socios, no una cuenta propia', () => {
    const { headers, rows } = tablaDeSocios([
      { fullName: 'Bruno', situacion: 'AL_DIA', active: true },
      { fullName: 'Ana', situacion: 'VENCIDO', active: true },
      { fullName: 'Carla', situacion: 'SIN_DATOS', active: true },
      { fullName: 'Dario', situacion: 'INACTIVO', active: false },
    ], AHORA);
    const estado = headers.indexOf('Estado');
    // En orden alfabético, y el que nunca pagó dice "Sin cuota", no "Activo".
    expect(rows.map((r) => [r[0], r[estado]])).toEqual([
      ['Ana', 'Vencido'], ['Bruno', 'Al día'], ['Carla', 'Sin cuota'], ['Dario', 'Baja'],
    ]);
  });

  it('las fechas se leen como fechas, no como ISO', () => {
    const { headers, rows } = tablaDeSocios([
      { fullName: 'Ana', situacion: 'AL_DIA', membershipEnd: '2026-10-12T00:00:00', createdAt: '2026-01-05T10:00:00' },
    ], AHORA);
    expect(rows[0][headers.indexOf('Vence')]).toBe('12/10/2026');
    expect(rows[0][headers.indexOf('Alta')]).toBe('05/01/2026');
  });
});

describe('el reporte de ingresos', () => {
  const reporte = {
    totales: { cobrado: 93000, ingresosEfectivo: 5000, ingresosOtros: 0, ingresos: 98000, cantidadCobros: 2 },
    cobros: [
      { fecha: '2026-09-22T09:15:00', socio: 'Ana', metodo: 'CASH', monto: 45000 },
      { fecha: '2026-09-22T10:00:00', socio: 'Bruno', metodo: 'TRANSFER', monto: 48000, importado: true },
    ],
    movimientos: [
      { fecha: '2026-09-22T11:00:00', tipo: 'INGRESO', categoria: 'Bebidas', metodo: 'CASH', monto: 5000 },
      { fecha: '2026-09-22T11:30:00', tipo: 'INGRESO', categoria: 'Bebidas', metodo: 'CASH', monto: 9999, anulado: true },
      { fecha: '2026-09-22T12:00:00', tipo: 'INGRESO', categoria: 'Aporte', metodo: 'CASH', monto: 20000, deFondos: true },
      { fecha: '2026-09-22T13:00:00', tipo: 'EGRESO', categoria: 'Limpieza', metodo: 'CASH', monto: 15000 },
    ],
  };

  it('⭐ el total es el del servidor (el libro de ingresos), no una suma de esta pantalla', () => {
    const { rows } = tablaDeIngresos({ ...reporte, totales: { ...reporte.totales, ingresos: 123456 } });
    expect(rows.at(-1)[2]).toBe('TOTAL QUE ENTRÓ');
    expect(leer(rows.at(-1)[4])).toBe('$ 123.456');
  });

  it('lista cada cobro y cada venta; no los anulados, ni los aportes del dueño, ni los gastos', () => {
    const { rows } = tablaDeIngresos(reporte);
    const detalle = rows.filter((r) => r[0]);
    expect(detalle.map((r) => [r[2], leer(r[4]), r[5]])).toEqual([
      ['Ana', '$ 45.000', 'Cuota'],
      ['Bruno', '$ 48.000', 'Historial importado'],
      ['Bebidas', '$ 5.000', 'Venta u otro ingreso'],
    ]);
    expect(detalle[0][1]).toBe('09:15');
    expect(detalle[0][3]).toBe('Efectivo');
  });
});

describe('el reporte de accesos', () => {
  it('fecha y horas legibles, en orden, y cómo entró con su nombre', () => {
    const { rows } = tablaDeAccesos([
      { checkInAt: '2026-09-22T17:26:00', checkOutAt: '2026-09-22T18:14:00', accessMethod: 'QR', member: { fullName: 'Ana', dni: '1' } },
      { checkInAt: '2026-09-22T08:05:00', checkOutAt: null, accessMethod: 'MANUAL', member: { fullName: 'Bruno', dni: '2' } },
    ]);
    expect(rows).toEqual([
      ['22/09/2026', '08:05', '', 'Bruno', '2', 'Manual'],
      ['22/09/2026', '17:26', '18:14', 'Ana', '1', 'QR'],
    ]);
  });
});

describe('el resumen', () => {
  it('⭐ las altas son las de createdAt en el período; un socio sin fecha NO cuenta como alta', () => {
    const { rows } = tablaDelResumen({
      socios: [
        { situacion: 'AL_DIA', createdAt: '2026-09-10T10:00:00' },
        { situacion: 'AL_DIA', createdAt: '2025-01-10T10:00:00', membershipStart: '2026-09-12T00:00:00' },
        { situacion: 'VENCIDO' },
        { situacion: 'INACTIVO', active: false, createdAt: '2026-09-15T10:00:00' },
      ],
      reporte: { totales: { ingresos: 98000, cantidadCobros: 2 } },
      accesos: [{}, {}, {}],
      desde: '2026-09-01', hasta: '2026-09-22',
    }, AHORA);
    const valor = (que) => leer(rows.find((r) => r[0] === que)?.[1]);
    expect(valor('Al día')).toBe(2);
    expect(valor('Vencidos')).toBe(1);
    expect(valor('Bajas')).toBe(1);
    expect(valor('Altas nuevas')).toBe(2);
    expect(valor('Total que entró')).toBe('$ 98.000');
    expect(valor('Entradas al gimnasio')).toBe(3);
  });
});
