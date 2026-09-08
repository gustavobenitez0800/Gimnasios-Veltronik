// @vitest-environment happy-dom
//
// ============================================
// VELTRONIK - Anotar un gasto de caja sin internet (Fase 3, paso 5)
// ============================================
// ⚠️ EL DAÑO DE NO TENER ESTO ES CONCRETO Y YA PASÓ CON EL MÓDULO ENTERO.
//
// Del cajón sale plata durante el día. Se le pagan $15.000 a la chica de la limpieza y, si eso
// no queda anotado, a la noche el sistema espera esa plata igual: el cierre dice FALTANTE y
// acusa a quien atendió, que no robó nada. Para eso se construyeron los movimientos de caja.
//
// Con el internet caído volvía el mismo agujero por la puerta de al lado: no había dónde
// anotarlo. Y el modo de fallar peor es más sutil todavía — que se pueda anotar pero no se vea
// en la lista, porque entonces se carga DOS VECES y el faltante lo inventa el sistema.
// ============================================

import { describe, it, expect, beforeEach, vi } from 'vitest';

const apiClient = { post: vi.fn(), get: vi.fn(), patch: vi.fn() };
vi.mock('../lib/apiClient', () => ({ default: apiClient }));

const { cajaService } = await import('./CajaService');

const GIMNASIO = '11111111-1111-1111-1111-111111111111';

/** El núcleo, de mentira. La cola que corre encima es la DE VERDAD: acá se prueba el conjunto. */
function nucleoFalso() {
  let filas = [];
  return {
    filas: () => filas,
    encolar: vi.fn(async (item) => { filas.push({ ...item, intentos: 0 }); return { ok: true, clientRef: item.clientRef }; }),
    pendientes: vi.fn(async () => filas),
    contar: vi.fn(async () => filas.length),
    sacar: vi.fn(async (ref) => { filas = filas.filter((f) => f.clientRef !== ref); return true; }),
    anotarFallo: vi.fn(async () => true),
    olvidar: vi.fn(async () => { filas = []; return true; }),
  };
}

function conRed(hay) {
  Object.defineProperty(window.navigator, 'onLine', { value: hay, configurable: true });
}

let cola;
const GASTO = {
  tipo: 'EGRESO',
  categoria: 'Limpieza',
  detalle: 'Sueldo de la semana',
  monto: 15000,
  metodo: 'CASH',
  hechoPor: 'Recepción',
};

beforeEach(() => {
  vi.clearAllMocks();
  cola = nucleoFalso();
  window.electronAPI = { nucleo: { cola } };
  localStorage.clear();
  localStorage.setItem('current_org_id', GIMNASIO);
  conRed(true);
});

describe('con internet, se anota derecho', () => {
  it('manda al servidor y devuelve lo que contestó', async () => {
    apiClient.post.mockResolvedValue({ data: { id: 'mov-1' } });

    const r = await cajaService.registrarMovimiento(GASTO);

    expect(r).toEqual({ id: 'mov-1' });
    expect(cola.encolar).not.toHaveBeenCalled();
  });

  it('⭐ pero el sello y el momento viajan IGUAL, con conexión', async () => {
    apiClient.post.mockResolvedValue({ data: { id: 'mov-1' } });
    await cajaService.registrarMovimiento(GASTO);

    const [, cuerpo] = apiClient.post.mock.calls[0];
    // Cierra el agujero del pedido ambiguo: salió, el servidor lo guardó, y la respuesta se
    // perdió en el camino de vuelta. Sin sello, el reintento anotaría el gasto de nuevo.
    expect(cuerpo.clientRef).toBeTruthy();
    expect(cuerpo.ocurridoEn).toBeTruthy();
  });
});

describe('sin internet, se guarda y se avisa', () => {
  it('⭐ el gasto queda en la cola en vez de perderse', async () => {
    conRed(false);

    const r = await cajaService.registrarMovimiento(GASTO);

    expect(r.encolado).toBe(true);
    expect(apiClient.post).not.toHaveBeenCalled();
    expect(cola.filas()).toHaveLength(1);
  });

  it('viaja con su MOMENTO, que es lo que decide en qué arqueo cae', async () => {
    conRed(false);
    await cajaService.registrarMovimiento(GASTO);

    const fila = cola.filas()[0];
    // Sin esto, un gasto de las 22:00 que sube a las 09:00 del día siguiente deja el arqueo
    // de anoche con un faltante que nunca existió y el de hoy con un sobrante.
    expect(fila.ocurridoEn).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
    expect(fila.clientRef).toBeTruthy();
  });

  it('⚠️ el tipo del MOVIMIENTO no se pisa con el tipo de la COLA', async () => {
    // En la cola, `tipo` significa qué clase de cosa es (ACCESO, COBRO, EGRESO…). El del
    // movimiento —INGRESO o EGRESO— es otra cosa. Mandados en el mismo campo, un ingreso
    // manual volvería del otro lado convertido en un gasto: la plata cambiaría de signo.
    conRed(false);
    await cajaService.registrarMovimiento({ ...GASTO, tipo: 'INGRESO', categoria: 'Aporte' });

    const fila = cola.filas()[0];
    expect(fila.tipo).toBe('EGRESO');           // para la cola: un movimiento de caja
    expect(fila.movimientoTipo).toBe('INGRESO'); // para el arqueo: entra plata, no sale
  });

  it('si el servidor no contesta —pero hay red— también se guarda', async () => {
    apiClient.post.mockRejectedValue(new Error('Network Error'));

    const r = await cajaService.registrarMovimiento(GASTO);

    expect(r.encolado).toBe(true);
    expect(cola.filas()).toHaveLength(1);
  });

  it('⛔ pero un RECHAZO del servidor no se encola: falla y se muestra', async () => {
    // Un egreso sin detalle da 400 y va a dar 400 siempre. Encolarlo sería dejar una fila
    // reintentándose para siempre contra una respuesta que nunca va a cambiar.
    const rechazo = new Error('Escribí en qué se gastó.');
    rechazo.response = { status: 400 };
    apiClient.post.mockRejectedValue(rechazo);

    await expect(cajaService.registrarMovimiento(GASTO)).rejects.toThrow();
    expect(cola.filas()).toHaveLength(0);
  });

  it('si hay algo esperando, este también espera aunque haya internet', async () => {
    // La cola es una sola y el orden vale entre tipos. Adelantarse por la escritura directa
    // rompería el orden global.
    conRed(false);
    await cajaService.registrarMovimiento(GASTO);
    conRed(true);
    apiClient.post.mockResolvedValue({ data: { id: 'mov-2' } });

    const r = await cajaService.registrarMovimiento({ ...GASTO, monto: 3000 });

    expect(r.encolado).toBe(true);
    expect(apiClient.post).not.toHaveBeenCalled();
    expect(cola.filas()).toHaveLength(2);
  });
});

describe('⭐ la lista sigue mostrando lo que no subió', () => {
  it('sin internet, el gasto recién anotado SE VE', async () => {
    // Es el punto más importante del paso. La lista existe, según el propio endpoint, "para
    // no cargar dos veces el mismo gasto". Vacía sin conexión, provoca justo eso.
    conRed(false);
    await cajaService.registrarMovimiento(GASTO);

    const lista = await cajaService.movimientosDeCaja();

    expect(lista).toHaveLength(1);
    expect(lista[0].categoria).toBe('Limpieza');
    expect(lista[0].monto).toBe(15000);
    expect(lista[0].sinSubir).toBe(true);
    expect(apiClient.get).not.toHaveBeenCalled();
  });

  it('con internet, va junto a los del servidor y sigue marcado', async () => {
    conRed(false);
    await cajaService.registrarMovimiento(GASTO);
    conRed(true);
    apiClient.get.mockResolvedValue({ data: [{ id: 'mov-viejo', categoria: 'Proveedor', monto: 3000 }] });

    const lista = await cajaService.movimientosDeCaja();

    expect(lista).toHaveLength(2);
    expect(lista[0].sinSubir).toBe(true);
    expect(lista[1].sinSubir).toBeUndefined();
  });

  it('el id del pendiente es su sello: no salta de identidad al subir', async () => {
    conRed(false);
    const r = await cajaService.registrarMovimiento(GASTO);

    const lista = await cajaService.movimientosDeCaja();
    expect(lista[0].id).toBe(r.clientRef);
  });
});

describe('el envío de lo encolado', () => {
  it('manda el sello y el momento tal como se guardaron', async () => {
    conRed(false);
    await cajaService.registrarMovimiento(GASTO);
    const fila = cola.filas()[0];

    apiClient.post.mockResolvedValue({ data: { id: 'mov-9' } });
    await cajaService.enviarEncolado(fila);

    const [ruta, cuerpo] = apiClient.post.mock.calls[0];
    expect(ruta).toBe('/gym/caja/movimientos-de-caja');
    expect(cuerpo.clientRef).toBe(fila.clientRef);
    expect(cuerpo.ocurridoEn).toBe(fila.ocurridoEn);
    expect(cuerpo.tipo).toBe('EGRESO');
    expect(cuerpo.monto).toBe(15000);
  });

  it('un ingreso encolado sube como INGRESO, no como gasto', async () => {
    conRed(false);
    await cajaService.registrarMovimiento({ ...GASTO, tipo: 'INGRESO' });
    apiClient.post.mockResolvedValue({ data: {} });

    await cajaService.enviarEncolado(cola.filas()[0]);

    expect(apiClient.post.mock.calls[0][1].tipo).toBe('INGRESO');
  });
});
