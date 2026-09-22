// ============================================
// EL EXCEL DE LA CAJA
// ============================================
// Se arma con la librería de verdad y se vuelve a LEER: lo que se prueba es lo que va a abrir
// el contador, no lo que creemos haber escrito. Datos inventados (el repositorio es público).
// ============================================

import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import {
  armarLibroDeCaja, nombreDelArchivo, serieDeExcel, rangoLegible, nombreDelMetodo,
} from './excelDeCaja';

const REPORTE = {
  gimnasio: 'Gimnasio Ejemplo',
  desde: '2026-09-22',
  hasta: '2026-09-22',
  generado: '2026-09-22T21:05:00',
  totales: {
    efectivo: 34000, transferencia: 30000, mercadopago: 32000, tarjeta: 0, otros: 0,
    cobrado: 96000, cantidadCobros: 3,
    ingresosEfectivo: 5000, ingresosOtros: 0, egresosEfectivo: 15000, egresosOtros: 20000, neto: 66000,
  },
  cobros: [
    { fecha: '2026-09-22T09:15:00', socio: 'Lucía Pereyra', dni: '30111222', arancel: 'Musculación',
      nota: null, periodoDesde: '2026-09-22', periodoHasta: '2026-10-22', metodo: 'cash', monto: 34000, cobradoPor: 'Carla' },
    { fecha: '2026-09-22T11:40:00', socio: 'Juan Gómez', dni: '28999111', arancel: null,
      nota: null, periodoDesde: null, periodoHasta: null, metodo: 'transfer', monto: 30000, cobradoPor: null },
    { fecha: '2026-09-22T18:02:00', socio: null, dni: null, arancel: null,
      nota: 'Pase', periodoDesde: null, periodoHasta: null, metodo: 'mercadopago', monto: 32000, cobradoPor: 'Carla' },
  ],
  movimientos: [
    { fecha: '2026-09-22T10:00:00', tipo: 'EGRESO', categoria: 'Limpieza', detalle: 'Productos', metodo: 'CASH',
      monto: 15000, hechoPor: 'Carla', tocaElCajon: true, anulado: false },
    { fecha: '2026-09-22T12:00:00', tipo: 'EGRESO', categoria: 'Proveedor', detalle: 'Agua, factura 4412', metodo: 'TRANSFER',
      monto: 20000, hechoPor: 'Carla', tocaElCajon: false, anulado: false },
    { fecha: '2026-09-22T13:00:00', tipo: 'EGRESO', categoria: 'Otro', detalle: 'cargado dos veces', metodo: 'CASH',
      monto: 15000, hechoPor: 'Carla', tocaElCajon: true, anulado: true, anuladoPor: 'Dueño', motivoAnulacion: 'Duplicado' },
    { fecha: '2026-09-22T17:00:00', tipo: 'INGRESO', categoria: 'Venta', detalle: null, metodo: 'CASH',
      monto: 5000, hechoPor: 'Carla', tocaElCajon: true, anulado: false },
  ],
  cierres: [
    { desde: '2026-09-21T21:00:00', hasta: '2026-09-22T21:00:00', cerradoPor: 'Carla', fondo: 10000,
      efectivo: 34000, transferencia: 30000, mercadopago: 32000, tarjeta: 0, otros: 0, cantidadCobros: 3,
      ingresosEfectivo: 5000, egresosEfectivo: 15000, enElCajon: 34000, retiro: 30000, quedaEnCaja: 4000, nota: null },
  ],
};

/** Escribe el libro como archivo y lo vuelve a abrir, como lo haría Excel. */
function abrir(reporte) {
  const bytes = XLSX.write(armarLibroDeCaja(XLSX, reporte), { type: 'array', bookType: 'xlsx' });
  return XLSX.read(bytes, { type: 'array', cellFormula: true, cellNF: true });
}

/** Busca en una hoja la fila cuya primera celda dice `titulo` y devuelve la celda de al lado. */
function alLadoDe(ws, titulo, col = 1) {
  const rango = XLSX.utils.decode_range(ws['!ref']);
  for (let r = rango.s.r; r <= rango.e.r; r += 1) {
    if (ws[XLSX.utils.encode_cell({ r, c: 0 })]?.v === titulo) return ws[XLSX.utils.encode_cell({ r, c: col })];
  }
  return undefined;
}

describe('el Excel de la caja', () => {
  it('tiene las tres hojas, en el orden en que se leen', () => {
    expect(abrir(REPORTE).SheetNames).toEqual(['Resumen', 'Cobros', 'Gastos e ingresos']);
  });

  it('⭐ los totales del resumen son los del servidor, como números con formato de plata', () => {
    const ws = abrir(REPORTE).Sheets.Resumen;
    expect(alLadoDe(ws, 'Efectivo').v).toBe(34000);
    expect(alLadoDe(ws, 'Total cobrado').v).toBe(96000);
    expect(alLadoDe(ws, 'Total cobrado').z).toContain('#,##0');
    expect(alLadoDe(ws, 'Gastos pagados por otros medios').v).toBe(20000);
    expect(alLadoDe(ws, 'RESULTADO (todo lo que entró menos todo lo que salió)').v).toBe(66000);
    expect(alLadoDe(ws, 'Tarjeta'), 'sin tarjeta, no hay fila en cero').toBeUndefined();
  });

  it('⭐ la fecha y la hora son números de verdad, y se leen como en Argentina', () => {
    const ws = abrir(REPORTE).Sheets.Cobros;
    expect(ws.A2.t).toBe('n');
    expect(XLSX.SSF.format(ws.A2.z, ws.A2.v)).toBe('22/09/2026');
    expect(XLSX.SSF.format(ws.B2.z, ws.B2.v)).toBe('09:15');
    expect(XLSX.SSF.format(ws.F2.z, ws.F2.v), 'período desde').toBe('22/09/2026');
    expect(XLSX.SSF.format(ws.G2.z, ws.G2.v), 'período hasta').toBe('22/10/2026');
  });

  it('cada cobro con su socio, su forma de pago y quién cobró', () => {
    const ws = abrir(REPORTE).Sheets.Cobros;
    expect(ws.C2.v).toBe('Lucía Pereyra');
    expect(ws.D2.v, 'el DNI como texto: conserva el cero de adelante').toBe('30111222');
    expect(ws.H2.v).toBe('Efectivo');
    expect(ws.H3.v).toBe('Transferencia');
    expect(ws.H4.v).toBe('Mercado Pago');
    expect(ws.J2.v).toBe('Carla');
    expect(ws.C4.v, 'un cobro sin socio lo dice').toBe('Sin socio');
  });

  it('⭐ el total de cobros es una fórmula que el contador puede auditar, con el valor adentro', () => {
    const ws = abrir(REPORTE).Sheets.Cobros;
    const total = alLadoDe(ws, 'Total', 8);
    expect(total.f).toBe('SUM(I2:I4)');
    expect(total.v).toBe(96000);
  });

  it('⭐ el gasto anulado se ve, dice por qué, y el total no lo cuenta', () => {
    const ws = abrir(REPORTE).Sheets['Gastos e ingresos'];
    expect(ws.J4.v).toBe('Anulado por Dueño: Duplicado');
    expect(ws.G3.v, 'el pagado por transferencia no salió del cajón').toBe('No');
    const gastos = alLadoDe(ws, 'Total gastos (sin anulados)', 7);
    expect(gastos.f).toContain('SUMIFS');
    expect(gastos.v, '15.000 en efectivo + 20.000 por transferencia; el anulado no').toBe(35000);
  });

  it('los cierres del día, con la cuenta del cajón', () => {
    const ws = abrir(REPORTE).Sheets.Resumen;
    const rango = XLSX.utils.decode_range(ws['!ref']);
    let fila = -1;
    for (let r = 0; r <= rango.e.r; r += 1) if (ws[XLSX.utils.encode_cell({ r, c: 2 })]?.v === 'Carla') fila = r;
    expect(fila).toBeGreaterThan(0);
    const celda = (c) => ws[XLSX.utils.encode_cell({ r: fila, c })].v;
    expect(celda(3), 'quedaba de antes').toBe(10000);
    expect(celda(7), 'había en el cajón').toBe(34000);
    expect(celda(8), 'retiro').toBe(30000);
    expect(celda(9), 'quedó en caja').toBe(4000);
  });

  it('un día sin movimiento no es un archivo vacío: lo dice', () => {
    const vacio = { ...REPORTE, cobros: [], movimientos: [], cierres: [] };
    const libro = abrir(vacio);
    expect(libro.Sheets.Cobros.A2.v).toBe('No hubo cobros en este período.');
    expect(alLadoDe(libro.Sheets.Resumen, 'No se cerró la caja en este período.', 0)).toBeDefined();
  });
});

describe('los nombres', () => {
  it('el archivo lleva el gimnasio y el día, sin barras (Windows no las acepta)', () => {
    expect(nombreDelArchivo(REPORTE)).toBe('Gimnasio Ejemplo - Caja 22-09-2026.xlsx');
    expect(nombreDelArchivo({ ...REPORTE, gimnasio: 'A/B: "gym"', hasta: '2026-09-30' }))
      .toBe('AB gym - Caja 22-09-2026 al 30-09-2026.xlsx');
  });

  it('un rango de un día se dice con una sola fecha', () => {
    expect(rangoLegible(REPORTE)).toBe('22/09/2026');
    expect(rangoLegible({ desde: '2026-09-01', hasta: '2026-09-22' })).toBe('01/09/2026 al 22/09/2026');
  });

  it('la serie de Excel no depende del huso horario de la PC', () => {
    expect(serieDeExcel('2026-09-22')).toBe(46287);
    expect(serieDeExcel('2026-09-22T12:00:00')).toBe(46287.5);
    expect(serieDeExcel(null)).toBeNull();
  });

  it('las formas de pago se leen igual que en la pantalla, vengan como vengan', () => {
    expect(nombreDelMetodo('CASH')).toBe('Efectivo');
    expect(nombreDelMetodo('mercadopago')).toBe('Mercado Pago');
    expect(nombreDelMetodo('MERCADOPAGO')).toBe('Mercado Pago');
  });
});
