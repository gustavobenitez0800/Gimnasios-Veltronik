// ============================================
// VELTRONIK - El plan guardado en la PC del mostrador
// ============================================
// Sin internet la cajita abre con lo último que dijo el servidor. Desde que la prueba gratis
// incluye el molinete (02/11/2026), lo guardado dice también hasta cuándo: una PC que se queda
// sin internet el día que termina la prueba no puede seguir abriendo para siempre.
// ============================================

import { describe, it, expect, vi } from 'vitest';

vi.mock('../services/MolineteService', () => ({ molineteService: { habilitado: vi.fn() } }));
vi.mock('../lib/config', () => ({ default: { IS_DESKTOP: true } }));

const { leerPlanGuardado } = await import('./useCajitaMolinete');

const AHORA = new Date('2026-11-05T12:00:00');

describe('lo guardado en esta PC', () => {
  it('lee la forma vieja (1 / 0), de las PCs que ya lo tenían guardado', () => {
    expect(leerPlanGuardado('1', AHORA)).toEqual({ habilitado: true, pruebaHasta: null });
    expect(leerPlanGuardado('0', AHORA)).toEqual({ habilitado: false, pruebaHasta: null });
  });

  it('⭐ en la prueba, abre hasta el día que termina', () => {
    const guardado = JSON.stringify({ habilitado: true, pruebaHasta: '2026-11-14T10:30:00' });
    expect(leerPlanGuardado(guardado, AHORA)).toEqual({ habilitado: true, pruebaHasta: '2026-11-14T10:30:00' });
  });

  it('⭐ terminada la prueba, aunque diga que sí, ya no abre', () => {
    const guardado = JSON.stringify({ habilitado: true, pruebaHasta: '2026-11-04T10:30:00' });
    expect(leerPlanGuardado(guardado, AHORA)).toEqual({ habilitado: false, pruebaHasta: null });
  });

  it('el plan pago no vence por esto', () => {
    expect(leerPlanGuardado(JSON.stringify({ habilitado: true, pruebaHasta: null }), AHORA))
      .toEqual({ habilitado: true, pruebaHasta: null });
  });

  it('nada guardado, o basura: no abre', () => {
    expect(leerPlanGuardado(null, AHORA).habilitado).toBe(false);
    expect(leerPlanGuardado('{roto', AHORA).habilitado).toBe(false);
  });
});
