// Lo que la tarjeta dibujada puede mostrar sin que Veltronik tenga nunca el número.
import { describe, it, expect } from 'vitest';
import {
  numeroEnLaTarjeta, nombreEnLaTarjeta, vencimientoEnLaTarjeta, marcaDeLaTarjeta,
  codigoEnLaTarjeta, mensajeDelCampo,
} from './tarjeta';

describe('numeroEnLaTarjeta', () => {
  it('sin nada escrito, todo puntos de a cuatro', () => {
    expect(numeroEnLaTarjeta()).toBe('•••• •••• •••• ••••');
  });

  it('con el bin muestra los primeros dígitos y nada más', () => {
    expect(numeroEnLaTarjeta({ bin: '45099535' })).toBe('4509 9535 •••• ••••');
  });

  it('con el token suma los últimos 4, y el medio sigue tapado', () => {
    expect(numeroEnLaTarjeta({ bin: '450995', ultimos4: '3704' })).toBe('4509 95•• •••• 3704');
  });

  it('Amex: 15 dígitos agrupados 4-6-5', () => {
    expect(numeroEnLaTarjeta({ bin: '371180', ultimos4: '1004', largo: 15 })).toBe('3711 80•••• •1004');
  });

  it('un largo imposible no rompe el dibujo: vuelve a 16', () => {
    expect(numeroEnLaTarjeta({ largo: 99 })).toBe('•••• •••• •••• ••••');
  });

  it('ignora cualquier cosa que no sea un dígito', () => {
    expect(numeroEnLaTarjeta({ bin: '45-09 95', ultimos4: 'abcd' })).toBe('4509 95•• •••• ••••');
  });
});

describe('nombreEnLaTarjeta', () => {
  it('en mayúsculas y con un solo espacio', () => {
    expect(nombreEnLaTarjeta('  maría   lópez ')).toBe('MARÍA LÓPEZ');
  });

  it('vacío, el molde', () => {
    expect(nombreEnLaTarjeta('')).toBe('NOMBRE Y APELLIDO');
  });

  it('un nombre larguísimo se corta en vez de salirse de la tarjeta', () => {
    const r = nombreEnLaTarjeta('María de los Ángeles Fernández Etcheverry');
    expect(r.length).toBe(26);
    expect(r.endsWith('…')).toBe(true);
  });
});

describe('vencimientoEnLaTarjeta', () => {
  it('sin escribir, el molde', () => {
    expect(vencimientoEnLaTarjeta()).toBe('MM/AA');
  });

  it('bien escrito pero sin token: se sabe que está bien, no qué dice', () => {
    expect(vencimientoEnLaTarjeta({ valido: true })).toBe('••/••');
  });

  it('con el token, el real con el año corto', () => {
    expect(vencimientoEnLaTarjeta({ mes: 3, anio: 2030 })).toBe('03/30');
  });
});

describe('marcaDeLaTarjeta', () => {
  it('lee nombre, largo y código de lo que contesta Mercado Pago', () => {
    const amex = marcaDeLaTarjeta({
      id: 'amex', name: 'American Express', payment_type_id: 'credit_card',
      settings: [{ card_number: { length: 15, validation: 'standard' }, security_code: { length: 4, mode: 'mandatory' } }],
    });
    expect(amex).toMatchObject({ id: 'amex', nombre: 'American Express', largo: 15, largoCodigo: 4, debito: false });
    expect(amex.ajustesNumero).toEqual({ length: 15, validation: 'standard' });
  });

  it('una débito se reconoce como tal', () => {
    expect(marcaDeLaTarjeta({ id: 'debvisa', name: 'Visa Débito', payment_type_id: 'debit_card' }).debito).toBe(true);
  });

  it('sin ajustes, los de una tarjeta común', () => {
    expect(marcaDeLaTarjeta({ id: 'visa' })).toMatchObject({ largo: 16, largoCodigo: 3, nombre: 'visa' });
  });

  it('sin método, nada', () => {
    expect(marcaDeLaTarjeta(null)).toBeNull();
    expect(marcaDeLaTarjeta({})).toBeNull();
  });
});

describe('codigoEnLaTarjeta', () => {
  it('tres puntos, o cuatro si la marca pide cuatro', () => {
    expect(codigoEnLaTarjeta()).toBe('•••');
    expect(codigoEnLaTarjeta(4)).toBe('••••');
  });
});

describe('mensajeDelCampo', () => {
  it('sin errores, nada', () => {
    expect(mensajeDelCampo('cardNumber', [])).toBeNull();
    expect(mensajeDelCampo('cardNumber', undefined)).toBeNull();
  });

  it('traduce la causa de Mercado Pago a algo que se pueda corregir', () => {
    expect(mensajeDelCampo('cardNumber', [{ cause: 'invalid_length', message: 'cardNumber should be of length...' }]))
      .toBe('Al número le faltan dígitos.');
    expect(mensajeDelCampo('securityCode', [{ cause: 'invalid_length' }])).toBe('Al código le faltan dígitos.');
  });

  it('una causa desconocida no deja el campo sin aviso', () => {
    expect(mensajeDelCampo('expirationDate', [{ cause: 'algo_nuevo' }])).toBe('Revisá este dato.');
  });
});
