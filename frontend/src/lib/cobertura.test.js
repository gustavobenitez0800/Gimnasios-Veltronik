// ============================================
// VELTRONIK - Tests de lo que cubre un arancel, en palabras
// ============================================
// La traducción de `coberturaCantidad` + `coberturaUnidad` que usan Ajustes, Pagos y el
// cobro rápido. Estuvo copiada en los tres lugares y cada copia decía otra cosa.

import { describe, it, expect } from 'vitest';
import { COBERTURAS, claveCobertura, queCubre, etiquetaCobertura } from './cobertura';

const arancel = (coberturaCantidad, coberturaUnidad) => ({ coberturaCantidad, coberturaUnidad });

describe('lo que cubre un arancel', () => {

  it.each([
    [1, 'DIA', '1 día'],
    [7, 'DIA', '1 semana'],
    [15, 'DIA', '15 días'],
    [1, 'MES', '1 mes'],
    [2, 'MES', '2 meses'],
    [3, 'MES', '3 meses'],
    [6, 'MES', '6 meses'],
    [12, 'MES', '1 año'],
  ])('%i %s se lee "%s"', (cantidad, unidad, etiqueta) => {
    expect(etiquetaCobertura(arancel(cantidad, unidad))).toBe(etiqueta);
  });

  it('cada opción de Ajustes se lee igual en las otras pantallas', () => {
    // La etiqueta que se eligió al crear el arancel es la que se ve después al cobrarlo.
    for (const { valor, etiqueta } of COBERTURAS) {
      const [cantidad, unidad] = valor.split('|');
      if (cantidad === '0') continue;
      expect(etiquetaCobertura(arancel(Number(cantidad), unidad))).toBe(etiqueta);
    }
  });

  it('un arancel que no corre el vencimiento lo dice', () => {
    expect(queCubre(arancel(0, 'DIA'))).toBe(null);
    expect(queCubre(arancel(0, 'MES'))).toBe(null);
    expect(etiquetaCobertura(arancel(0, 'DIA'))).toBe('No cubre tiempo');
  });

  it('un valor fuera de la lista se muestra tal cual, sin redondearlo a la opción más parecida', () => {
    // La migración conservó como días lo que no mapeaba a meses: un "45 días" no es un mes
    // y medio ni dos meses.
    expect(etiquetaCobertura(arancel(45, 'DIA'))).toBe('45 días');
    expect(etiquetaCobertura(arancel(4, 'MES'))).toBe('4 meses');
  });

  it('sin cobertura cargada vale un mes, que es el default de la columna', () => {
    expect(etiquetaCobertura({})).toBe('1 mes');
    expect(claveCobertura({})).toBe('1|MES');
  });

  // ⭐ EL BUG QUE ORIGINÓ ESTE ARCHIVO
  it('NO lee durationDays', () => {
    // Congelado en la V65: todo arancel creado desde el 2026-09-07 lo tiene en 0, y los
    // viejos guardan el valor de antes de la migración (un Pase Anual decía "360 días").
    const paseAnual = { durationDays: 360, coberturaCantidad: 12, coberturaUnidad: 'MES' };
    const nuevo = { durationDays: 0, coberturaCantidad: 3, coberturaUnidad: 'MES' };

    expect(etiquetaCobertura(paseAnual)).toBe('1 año');
    expect(etiquetaCobertura(nuevo)).toBe('3 meses');
  });
});
