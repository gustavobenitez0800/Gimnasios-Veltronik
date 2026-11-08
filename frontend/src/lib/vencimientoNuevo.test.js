// ============================================
// VELTRONIK - Cómo queda el vencimiento después de cobrar (la gemela del backend)
// ============================================
// Los mismos casos que CoberturaDelMesIntegrationTest: si estos y aquellos dejan de coincidir,
// la pantalla promete una fecha y el servidor pone otra.
// ============================================

import { describe, it, expect } from 'vitest';
import { opcionesDeArranque, sumarCobertura, ARRANCA } from './vencimientoNuevo';

const dia = (a, m, d, h = 0) => new Date(a, m - 1, d, h);
const AHORA = dia(2026, 11, 5, 10);
const iso = (f) => `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;

describe('sumar lo que cubre un arancel', () => {
  it('un mes es el MISMO DÍA del mes que viene', () => {
    expect(iso(sumarCobertura(dia(2026, 3, 7), 1, 'MES'))).toBe('2026-04-07');
  });
  it('y si ese día no existe, el último que exista (como plusMonths)', () => {
    expect(iso(sumarCobertura(dia(2026, 1, 31), 1, 'MES'))).toBe('2026-02-28');
    expect(iso(sumarCobertura(dia(2028, 1, 31), 1, 'MES'))).toBe('2028-02-29');
  });
  it('los días son días (el Pase Semanal)', () => {
    expect(iso(sumarCobertura(dia(2026, 11, 28), 7, 'DIA'))).toBe('2026-12-05');
  });
});

describe('⭐ el que pagó tarde elige desde dónde arranca', () => {
  it('vencía el 2 y paga el 5: «desde que venció» queda el 2/12 y viene sugerida', () => {
    const o = opcionesDeArranque({ vence: '2026-11-02T00:00:00', ahora: AHORA });
    expect(iso(o.desdeQueVencio)).toBe('2026-12-02');
    expect(iso(o.desdeHoy)).toBe('2026-12-05');
    expect(o.sugerida).toBe(ARRANCA.VENCIMIENTO);
    expect(o.alDia).toBeNull();
  });

  it('con un trimestral, tres meses desde que vencía', () => {
    const o = opcionesDeArranque({ vence: '2026-10-26T00:00:00', plan: { coberturaCantidad: 3, coberturaUnidad: 'MES' }, ahora: AHORA });
    expect(iso(o.desdeQueVencio)).toBe('2027-01-26');
  });

  it('🔴 vencido hace 3 meses: «desde que venció» NO existe (lo dejaría vencido)', () => {
    const o = opcionesDeArranque({ vence: '2026-08-01T00:00:00', ahora: AHORA });
    expect(o.desdeQueVencio).toBeNull();
    expect(o.sugerida).toBe(ARRANCA.HOY);
  });

  it('al día: se le suma desde su vencimiento y no hay nada que elegir', () => {
    const o = opcionesDeArranque({ vence: '2026-11-10T00:00:00', ahora: AHORA });
    expect(iso(o.alDia)).toBe('2026-12-10');
    expect(o.desdeQueVencio).toBeNull();
  });

  it('el socio nuevo (sin vencimiento) arranca hoy', () => {
    const o = opcionesDeArranque({ vence: null, ahora: AHORA });
    expect(o.desdeQueVencio).toBeNull();
    expect(iso(o.desdeHoy)).toBe('2026-12-05');
  });

  it('un arancel que no cubre tiempo no tiene fecha que mostrar', () => {
    expect(opcionesDeArranque({ vence: '2026-11-02T00:00:00', plan: { coberturaCantidad: 0 }, ahora: AHORA })).toBeNull();
  });
});
