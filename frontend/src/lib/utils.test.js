// ============================================
// VELTRONIK - Tests de los rangos rápidos de fecha
// ============================================
// Hoy / Semana / Mes / Año, los botones de Pagos y Reportes. Se prueban con un "ahora"
// fijo: una fecha que depende del reloj real es un test que falla solo algún día.
// ============================================

import { describe, it, expect } from 'vitest';
import { getQuickDates, addOneMonth } from './utils';

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

describe('addOneMonth', () => {
  it('suma un mes en el caso normal', () => {
    expect(addOneMonth('2026-02-15')).toBe('2026-03-15');
    expect(addOneMonth('2026-12-10')).toBe('2027-01-10');
  });

  // ⭐ EL BUG
  // `setMonth(getMonth() + 1)` sobre un 31 desborda: febrero 31 no existe, y JavaScript
  // lo empuja a marzo. El socio se lleva días de regalo, y cuanto más corto el mes
  // siguiente, más días. Cobrar un 31 de agosto daba 1 de octubre.
  it('no se pasa de mes cuando el día no existe en el mes siguiente', () => {
    expect(addOneMonth('2026-08-31')).toBe('2026-09-30'); // septiembre tiene 30
    expect(addOneMonth('2026-01-31')).toBe('2026-02-28'); // febrero tiene 28 en 2026
    expect(addOneMonth('2026-03-31')).toBe('2026-04-30');
    expect(addOneMonth('2026-05-31')).toBe('2026-06-30');
    expect(addOneMonth('2026-01-30')).toBe('2026-02-28');
  });

  it('respeta el 29 de febrero de un año bisiesto', () => {
    expect(addOneMonth('2028-01-31')).toBe('2028-02-29'); // 2028 es bisiesto
  });

  // El mediodía no es decorativo: a las 00:00 un cambio de horario de verano puede
  // correr la fecha un día hacia atrás.
  it('acepta un timestamp completo y devuelve solo la fecha', () => {
    expect(addOneMonth('2026-02-15T23:59:59')).toBe('2026-03-15');
  });
});
