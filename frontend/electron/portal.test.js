import { describe, it, expect } from 'vitest';

const { isAllowedUrl } = await import('./portal.cjs');

describe('a dónde puede mandar la app el navegador del sistema', () => {
  it('el portal, por su origen completo', () => {
    expect(isAllowedUrl('https://veltronik-v2.vercel.app/#/plans')).toBe(true);
    // Contiene el dominio y no es nuestro.
    expect(isAllowedUrl('https://veltronik-v2.vercel.app.atacante.com/')).toBe(false);
  });

  it('⭐ el chat de WhatsApp de un socio (antes el botón del mostrador no abría nada)', () => {
    expect(isAllowedUrl('https://wa.me/5493756000123?text=Hola')).toBe(true);
  });

  it('nada que no sea web, ni un WhatsApp por http o de otro dominio', () => {
    expect(isAllowedUrl('file:///C:/Windows/System32/calc.exe')).toBe(false);
    expect(isAllowedUrl('http://wa.me/5493756000123')).toBe(false);
    expect(isAllowedUrl('https://wa.me.atacante.com/')).toBe(false);
    expect(isAllowedUrl('smb://servidor/recurso')).toBe(false);
  });
});
