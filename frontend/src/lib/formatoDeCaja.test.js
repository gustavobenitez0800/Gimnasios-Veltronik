// ============================================
// VELTRONIK - La hora del cobro (08/11/2026)
// ============================================
// Lo pidió un gimnasio: para cruzar un cobro con la cámara cuando la caja no cierra.
// ============================================

import { describe, it, expect } from 'vitest';
import { horaDelCobro } from './formatoDeCaja';

describe('la hora de un cobro', () => {
  it('la del mostrador, en horas y minutos', () => {
    expect(horaDelCobro('2026-11-05T18:15:42')).toBe('18:15');
  });

  it('🔴 un cobro cargado a mano con el día de otro día (00:00 en punto) no tiene hora', () => {
    // Mostrar «00:00» mandaría a mirar la cámara a la medianoche.
    expect(horaDelCobro('2026-11-05T00:00:00')).toBe('');
    expect(horaDelCobro('2026-11-05T00:00')).toBe('');
  });

  it('sin fecha, nada', () => {
    expect(horaDelCobro(null)).toBe('');
  });
});
