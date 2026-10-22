// ============================================
// LA REGLA DEL RANGO (problemaDelRango)
// ============================================
// Una sola para todas las pantallas del selector: qué rango se le puede pedir al servidor.

import { describe, it, expect } from 'vitest';
import { problemaDelRango, DIAS_MAXIMOS_DEL_RANGO } from './useRangoDeFechas';

describe('problemaDelRango', () => {
  it('un rango completo y al derecho se puede pedir', () => {
    expect(problemaDelRango('2026-09-01', '2026-09-30')).toBeNull();
  });

  it('un día solo se puede pedir', () => {
    expect(problemaDelRango('2026-09-30', '2026-09-30')).toBeNull();
  });

  it('⭐ el año a medio escribir no se pide, y no es un error que haya que gritar', () => {
    // Lo que avisa el campo de Chrome mientras se escribe 2026, tecla por tecla.
    for (const anio of ['0002', '0020', '0202']) {
      const p = problemaDelRango(`${anio}-09-01`, '2026-10-22');
      expect(p, anio).not.toBeNull();
      expect(p.incompleto, anio).toBe(true);
    }
    expect(problemaDelRango('', '2026-10-22')?.incompleto).toBe(true);
    expect(problemaDelRango('2026-09-01', undefined)?.incompleto).toBe(true);
  });

  it('al revés: lo dice', () => {
    const p = problemaDelRango('2026-09-20', '2026-09-10');
    expect(p.incompleto).toBeFalsy();
    expect(p.texto).toMatch(/posterior/);
  });

  it('más de un año: lo dice, con el mismo tope que el servidor', () => {
    expect(DIAS_MAXIMOS_DEL_RANGO).toBe(400);
    expect(problemaDelRango('2025-09-01', '2026-10-05')).toBeNull(); // 399 días
    expect(problemaDelRango('2025-09-01', '2026-10-06')).toBeNull(); // 400 días
    expect(problemaDelRango('2025-09-01', '2026-10-07').texto).toMatch(/un año/); // 401
  });

  it('cuenta días de calendario, sin importar el cambio de hora ni el huso', () => {
    expect(problemaDelRango('2024-02-28', '2024-03-01')).toBeNull(); // con el 29 de febrero
    expect(problemaDelRango('2026-01-01', '2026-12-31')).toBeNull();
  });
});
