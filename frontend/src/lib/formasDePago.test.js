import { describe, it, expect } from 'vitest';
import { FORMAS_DE_PAGO, codigoDeForma, nombreDeForma, esEfectivo } from './formasDePago';

describe('las formas de pago, en un solo lugar', () => {
  it('⭐ reconoce los mismos alias que MetodoDePago.java', () => {
    const casos = {
      CASH: ['CASH', 'cash', 'Efectivo', 'contado', 'caja'],
      TRANSFER: ['TRANSFER', 'transferencia', 'Transf.', 'depósito', 'CBU', 'alias'],
      MERCADOPAGO: ['MERCADOPAGO', 'MERCADO_PAGO', 'Mercado Pago', 'mp', 'QR', 'mercado'],
      CARD: ['CARD', 'tarjeta', 'Tarjeta de débito', 'débito', 'crédito', 'posnet'],
    };
    for (const [codigo, alias] of Object.entries(casos)) {
      for (const a of alias) expect(codigoDeForma(a), a).toBe(codigo);
    }
  });

  it('lo que no entiende queda como OTHER: la plata se cuenta en algún lado', () => {
    expect(codigoDeForma('cheque')).toBe('OTHER');
    expect(codigoDeForma('')).toBe('OTHER');
    expect(codigoDeForma(null)).toBe('OTHER');
  });

  it('el nombre que se lee, igual en Pagos, la Caja y el Excel', () => {
    expect(nombreDeForma('MERCADO_PAGO')).toBe('Mercado Pago');
    expect(nombreDeForma('cash')).toBe('Efectivo');
    expect(nombreDeForma('cheque')).toBe('Otro');
    // Sin dato, vacío: la pantalla decide si dice "Sin dato".
    expect(nombreDeForma(null)).toBe('');
    expect(nombreDeForma('')).toBe('');
  });

  it('solo el efectivo pasa por el cajón', () => {
    expect(esEfectivo('Efectivo')).toBe(true);
    expect(esEfectivo('MERCADOPAGO')).toBe(false);
    expect(esEfectivo(undefined)).toBe(false);
  });

  it('se ofrecen las cuatro, en el orden del mostrador, sin "Otro"', () => {
    expect(FORMAS_DE_PAGO.map((f) => f.codigo)).toEqual(['CASH', 'TRANSFER', 'MERCADOPAGO', 'CARD']);
  });
});
