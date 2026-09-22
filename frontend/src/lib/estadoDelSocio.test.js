import { describe, it, expect } from 'vitest';
import { estadoDelSocio, ESTADOS_DEL_SOCIO } from './situacionSocio';

const AHORA = new Date('2026-09-22T12:00:00');

describe('en cuál de los cuatro está un socio', () => {
  it('⭐ manda la situación que calculó el servidor', () => {
    expect(estadoDelSocio({ situacion: 'AL_DIA' }, AHORA)).toBe('al_dia');
    expect(estadoDelSocio({ situacion: 'POR_VENCER' }, AHORA)).toBe('al_dia');
    expect(estadoDelSocio({ situacion: 'VENCIDO' }, AHORA)).toBe('vencido');
    // Los días de gracia son vencidos: todavía entra, pero debe.
    expect(estadoDelSocio({ situacion: 'EN_GRACIA' }, AHORA)).toBe('vencido');
    expect(estadoDelSocio({ situacion: 'SIN_DATOS' }, AHORA)).toBe('sin_cuota');
    expect(estadoDelSocio({ situacion: 'INACTIVO' }, AHORA)).toBe('baja');
  });

  it('la baja, dicha por la ficha local (status) o por el servidor (active), gana siempre', () => {
    expect(estadoDelSocio({ status: 'inactive', situacion: 'AL_DIA' }, AHORA)).toBe('baja');
    expect(estadoDelSocio({ active: false, situacion: 'AL_DIA' }, AHORA)).toBe('baja');
  });

  it('sin situación del servidor (un alta sin conexión), la calcula acá con la fecha', () => {
    expect(estadoDelSocio({ status: 'active', membershipEnd: '2026-10-22T00:00:00' }, AHORA)).toBe('al_dia');
    // Sin fecha de vencimiento: no tiene cuota. No es "activo".
    expect(estadoDelSocio({ status: 'active' }, AHORA)).toBe('sin_cuota');
  });

  it('cada estado tiene su texto y su color, uno solo para todas las pantallas', () => {
    expect(Object.keys(ESTADOS_DEL_SOCIO)).toEqual(['al_dia', 'vencido', 'sin_cuota', 'baja']);
    expect(ESTADOS_DEL_SOCIO.vencido.clase).toBe('badge-error');
    // El sin cuota en ámbar: no debe nada, todavía no se le cobró.
    expect(ESTADOS_DEL_SOCIO.sin_cuota.clase).toBe('badge-warning');
  });
});
