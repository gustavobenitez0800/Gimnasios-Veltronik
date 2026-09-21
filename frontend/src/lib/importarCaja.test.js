// ============================================
// LEER UN HISTORIAL DE CAJA
// ============================================
// Lo que se defiende: el export de ControlFit (el primero que llegó) se reconoce tal como
// viene, y un archivo al que le falta lo indispensable no viaja al servidor.
// ============================================

import { describe, it, expect } from 'vitest';
import { filasDeCaja, mapearEncabezadosCaja } from './importarCaja';

const CONTROLFIT = ['Fecha', 'Hora', 'Socio', 'DNI', 'Está en el padrón', 'Concepto', 'Medio', 'Monto', 'Nota', 'Detalle original'];

describe('leer un historial de caja', () => {
  it('⭐ reconoce el export de ControlFit tal como viene', () => {
    const r = filasDeCaja([
      CONTROLFIT,
      ['05/01/2026', '07:17', 'PEREYRA LUCIA', '33444555', 'No (ex-socio)', 'Cuota', 'Transferencia', '29000', '', 'PEREYRA LUCIA | Pago de cuota'],
      ['13/02/2026', '18:03', '', '', '', 'Gasto', 'Efectivo', '-3500', '', 'Gasto: Gasto: yerba'],
    ]);

    expect(r.error).toBeUndefined();
    expect(r.ignoradas).toEqual(['Está en el padrón']);
    expect(r.filas).toHaveLength(2);
    expect(r.filas[0]).toEqual({
      fila: 2, fecha: '05/01/2026', hora: '07:17', socio: 'PEREYRA LUCIA', documento: '33444555',
      concepto: 'Cuota', medio: 'Transferencia', monto: '29000', nota: '', detalle: 'PEREYRA LUCIA | Pago de cuota',
    });
    expect(r.filas[1].monto).toBe('-3500');
  });

  it('el número de fila es el del Excel, aunque haya un título arriba', () => {
    const r = filasDeCaja([['Caja 2026'], CONTROLFIT, ['05/01/2026', '07:17', 'ANA', '', '', 'Cuota', 'Efectivo', '29000', '', '']], 1);
    expect(r.filas[0].fila).toBe(3);
  });

  it('sin fecha, monto o medio no hay movimiento que cargar', () => {
    const r = filasDeCaja([['Fecha', 'Socio', 'Monto'], ['05/01/2026', 'ANA', '29000']]);
    expect(r.error).toContain('Medio de pago');
  });

  it('las filas vacías del final no cuentan', () => {
    const r = filasDeCaja([CONTROLFIT, ['05/01/2026', '07:17', 'ANA', '', '', 'Cuota', 'Efectivo', '29000', '', ''], ['', '', '', '', '', '', '', '', '', '']]);
    expect(r.filas).toHaveLength(1);
  });

  it('los títulos se leen sin acentos ni mayúsculas', () => {
    const { detectadas } = mapearEncabezadosCaja(['FECHA DE PAGO', 'Importe', 'Forma de pago', 'Descripción']);
    expect(detectadas.map((d) => d.campo)).toEqual(['fecha', 'monto', 'medio', 'detalle']);
  });
});
