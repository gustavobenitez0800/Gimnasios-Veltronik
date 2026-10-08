import { describe, it, expect, vi, beforeEach } from 'vitest';

const get = vi.fn();
vi.mock('./apiClient', () => ({ default: { get: (...a) => get(...a) } }));

const { obtenerPlanes, planDe, olvidarPlanes, preciosDeLosPlanes } = await import('./planes');

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

describe('los planes con su precio, en una frase', () => {
  /** La frase con espacios comunes, para leerla en el test. */
  const frase = (planes) => preciosDeLosPlanes(planes).replace(/\u00a0/g, ' ');

  it('⭐ los dos planes, cada uno con el suyo', () => {
    expect(frase(CATALOGO)).toBe('Veltronik $55.000/mes o Veltronik Premium $145.000/mes');
  });

  it('el renglón solo se puede cortar entre un plan y otro, nunca adentro de uno', () => {
    // Los únicos espacios comunes son los del " o ": el resto no corta.
    expect(preciosDeLosPlanes(CATALOGO).split(' '))
      .toEqual(['Veltronik\u00a0$55.000/mes', 'o', 'Veltronik\u00a0Premium\u00a0$145.000/mes']);
  });

  it('con un solo plan, solo ese', () => {
    expect(frase([CATALOGO[0]])).toBe('Veltronik $55.000/mes');
  });

  it('con tres, "a, b o c"', () => {
    const tres = [...CATALOGO, { code: 'ORO', name: 'Oro', price: 200000 }];
    expect(frase(tres))
      .toBe('Veltronik $55.000/mes, Veltronik Premium $145.000/mes o Oro $200.000/mes');
  });

  it('el precio que llega como texto (BigDecimal) se muestra igual', () => {
    expect(frase([{ name: 'Veltronik', price: '55000.00' }])).toBe('Veltronik $55.000/mes');
  });

  it('sin planes, o sin precio, no dice ningún número', () => {
    expect(preciosDeLosPlanes([])).toBe('');
    expect(preciosDeLosPlanes(null)).toBe('');
    expect(preciosDeLosPlanes([{ name: 'Veltronik', price: null }])).toBe('');
    expect(preciosDeLosPlanes([{ name: '', price: 55000 }])).toBe('');
  });
});
