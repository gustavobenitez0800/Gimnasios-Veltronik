// ============================================
// VELTRONIK - Tests de los rangos rápidos de fecha
// ============================================
// Hoy / Semana / Mes / Año, los botones de Pagos y Reportes. Se prueban con un "ahora"
// fijo: una fecha que depende del reloj real es un test que falla solo algún día.
// ============================================

import { describe, it, expect } from 'vitest';
import { getQuickDates } from './utils';

// Mediodía a propósito: si algo adentro usara UTC, a mediodía NO se nota. Los casos de
// borde (23:50, 00:10) van aparte, abajo.
const alMediodia = (iso) => new Date(`${iso}T12:00:00`);

describe('getQuickDates', () => {
  it('"Hoy" arranca y termina el mismo día', () => {
    const { from, to } = getQuickDates('today', alMediodia('2026-08-31'));
    expect(from).toBe('2026-08-31');
    expect(to).toBe('2026-08-31');
  });

  it('"Mes" va del primero del mes a hoy', () => {
    const { from, to } = getQuickDates('month', alMediodia('2026-08-31'));
    expect(from).toBe('2026-08-01');
    expect(to).toBe('2026-08-31');
  });

  it('"Año" va del 1 de enero a hoy', () => {
    const { from, to } = getQuickDates('year', alMediodia('2026-08-31'));
    expect(from).toBe('2026-01-01');
    expect(to).toBe('2026-08-31');
  });

  it('"Semana" arranca el lunes de esta semana', () => {
    // Miércoles 2026-09-02 → lunes 2026-08-31.
    const { from, to } = getQuickDates('week', alMediodia('2026-09-02'));
    expect(from).toBe('2026-08-31');
    expect(to).toBe('2026-09-02');
  });

  // ⭐ EL BUG
  // El domingo es getDay() === 0, y la cuenta `getDate() - getDay() + 1` da MAÑANA.
  // O sea: el rango queda al revés (desde > hasta) y la pantalla no muestra nada.
  // Un domingo entero, todos los domingos, en Pagos y en Reportes.
  it('"Semana" un DOMINGO sigue arrancando el lunes anterior, no mañana', () => {
    // Domingo 2026-09-06 → la semana arrancó el lunes 2026-08-31.
    const { from, to } = getQuickDates('week', alMediodia('2026-09-06'));
    expect(from).toBe('2026-08-31');
    expect(to).toBe('2026-09-06');
    expect(from <= to).toBe(true);
  });

  // La otra familia: la hora. Un cobro a las 23:50 no puede quedar fuera del rango
  // porque el "hasta" se calculó en UTC y ya es mañana en Londres.
  it('a las 23:50 el "hasta" sigue siendo HOY', () => {
    const { to } = getQuickDates('month', new Date('2026-08-31T23:50:00'));
    expect(to).toBe('2026-08-31');
  });

  it('a las 00:10 el "hasta" es el día nuevo, no el anterior', () => {
    const { from, to } = getQuickDates('month', new Date('2026-09-01T00:10:00'));
    expect(from).toBe('2026-09-01');
    expect(to).toBe('2026-09-01');
  });
});
