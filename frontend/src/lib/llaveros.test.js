// ============================================
// VELTRONIK - La regla del llavero (ADR-016 §2)
// ============================================
// Es la gemela de LlaveroTest.java: lo que escribe el lector se limpia acá con la misma regla
// con la que se guardó en el servidor, o el llavero no se encuentra. Si cambia una, cambia la
// otra.
// ============================================

import { describe, it, expect } from 'vitest';
import { normalizarLlavero, esLlaveroValido } from './llaveros';

describe('la regla del llavero', () => {
  it('⭐ sin espacios y en mayúsculas, y nada más: los ceros de adelante se quedan', () => {
    expect(normalizarLlavero('  0012345678\r\n')).toBe('0012345678');
    expect(normalizarLlavero('00bc 5678')).toBe('00BC5678');
    expect(normalizarLlavero('188,22136')).toBe('188,22136');
    expect(normalizarLlavero(null)).toBe('');
    expect(normalizarLlavero(undefined)).toBe('');
  });

  it('🔴 0012345678 no se convierte en 12345678, que tiene forma de DNI', () => {
    expect(normalizarLlavero('0012345678')).toHaveLength(10);
  });

  it('un llavero tiene entre 4 y 64 letras, dígitos o separadores de lector', () => {
    expect(esLlaveroValido('0012345678')).toBe(true);
    expect(esLlaveroValido('188,22136')).toBe(true);
    expect(esLlaveroValido('00:BC:56:78')).toBe(true);
    expect(esLlaveroValido('123')).toBe(false);
    expect(esLlaveroValido('1'.repeat(65))).toBe(false);
    expect(esLlaveroValido('0012Ñ45678')).toBe(false);
    expect(esLlaveroValido('')).toBe(false);
    expect(esLlaveroValido(null)).toBe(false);
  });
});
