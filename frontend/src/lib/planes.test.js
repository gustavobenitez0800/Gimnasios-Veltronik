import { describe, it, expect, vi, beforeEach } from 'vitest';

const get = vi.fn();
vi.mock('./apiClient', () => ({ default: { get: (...a) => get(...a) } }));

const { obtenerPlanes, planDe, olvidarPlanes } = await import('./planes');

const CATALOGO = [
  { code: 'BASICO', name: 'Veltronik', price: 55000 },
  { code: 'PREMIUM', name: 'Veltronik Premium', price: 145000 },
];

beforeEach(() => { get.mockReset(); olvidarPlanes(); });

describe('los planes del backend', () => {
  it('⭐ un solo pedido por sesión, aunque pregunten el Lobby, Planes y Ajustes', async () => {
    get.mockResolvedValue({ data: CATALOGO });
    const [a, b, c] = await Promise.all([obtenerPlanes(), obtenerPlanes(), obtenerPlanes()]);
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith('/public/plans');
    expect(a).toEqual(CATALOGO);
    expect(b).toBe(a);
    expect(c).toBe(a);
  });

  it('si falla, devuelve [] (nunca rechaza) y el próximo lo vuelve a intentar', async () => {
    get.mockRejectedValueOnce(new Error('sin conexión'));
    expect(await obtenerPlanes()).toEqual([]);
    get.mockResolvedValueOnce({ data: CATALOGO });
    expect(await obtenerPlanes()).toEqual(CATALOGO);
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('una respuesta que no es una lista cuenta como sin planes', async () => {
    get.mockResolvedValue({ data: { error: 'raro' } });
    expect(await obtenerPlanes()).toEqual([]);
  });

  it('el plan de una sucursal por su código; uno que no está a la venta, null', () => {
    expect(planDe(CATALOGO, 'PREMIUM').price).toBe(145000);
    expect(planDe(CATALOGO, 'ORO')).toBeNull();
    expect(planDe(CATALOGO, null)).toBeNull();
    expect(planDe(null, 'BASICO')).toBeNull();
  });
});
