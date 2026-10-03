import { describe, it, expect } from 'vitest';
import { numeroDeWhatsApp, enlaceDeWhatsApp } from './whatsapp';

describe('el número de WhatsApp de un socio', () => {
  it('un celular cargado como en el mostrador: 54 + 9 + el número', () => {
    expect(numeroDeWhatsApp('3756000123')).toBe('5493756000123');
    expect(numeroDeWhatsApp('3756 00-0123')).toBe('5493756000123');
    expect(numeroDeWhatsApp('(3756) 000123')).toBe('5493756000123');
  });

  it('con el 0 de larga distancia adelante', () => {
    expect(numeroDeWhatsApp('03756000123')).toBe('5493756000123');
  });

  it('⭐ ya internacional: NO le pega otro 54 adelante', () => {
    expect(numeroDeWhatsApp('+54 9 3756 000123')).toBe('5493756000123');
    expect(numeroDeWhatsApp('5493756000123')).toBe('5493756000123');
    expect(numeroDeWhatsApp('0054 9 3756 000123')).toBe('5493756000123');
  });

  it('con el 54 pero sin el 9 del celular: se lo agrega', () => {
    expect(numeroDeWhatsApp('54 3756 000123')).toBe('5493756000123');
  });

  it('sin teléfono, o uno que no alcanza para ser un número: null', () => {
    expect(numeroDeWhatsApp('')).toBeNull();
    expect(numeroDeWhatsApp(null)).toBeNull();
    expect(numeroDeWhatsApp('000123')).toBeNull();
    expect(numeroDeWhatsApp('sin tel')).toBeNull();
  });
});

describe('el enlace', () => {
  it('con el mensaje ya escrito, codificado', () => {
    expect(enlaceDeWhatsApp('3756000123', '¿Renovás?'))
      .toBe('https://wa.me/5493756000123?text=%C2%BFRenov%C3%A1s%3F');
  });

  it('sin mensaje, solo la conversación', () => {
    expect(enlaceDeWhatsApp('3756000123')).toBe('https://wa.me/5493756000123');
  });

  it('con un teléfono que no sirve no arma nada', () => {
    expect(enlaceDeWhatsApp('123', 'hola')).toBeNull();
  });
});
