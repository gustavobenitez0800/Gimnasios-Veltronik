// @vitest-environment happy-dom
//
// ============================================
// VELTRONIK - Tests de cobrar sin internet
// ============================================
// ⚠️ ACÁ LO QUE ESTÁ EN JUEGO ES PLATA, y el daño de equivocarse no es el que uno espera.
//
// Un cobro repetido NO es una fila de más. El período de cobertura arranca DONDE TERMINA la
// cobertura vigente del socio —está bien pensado: el que paga el 25 teniendo cuota hasta el 30
// no pierde esos cinco días—, así que una segunda copia arrancaría donde terminó la primera:
// el socio se lleva 30 días GRATIS y el ingreso del día queda contado dos veces en el arqueo.
//
// Por eso el sello se genera ANTES de intentar y viaja también en el pedido online: es lo único
// que hace segura la única situación ambigua, la del pedido que salió y del que nunca volvió
// respuesta.
// ============================================

import { describe, it, expect, beforeEach, vi } from 'vitest';

const apiClient = { post: vi.fn(), get: vi.fn(), put: vi.fn() };
vi.mock('../lib/apiClient', () => ({ default: apiClient }));
vi.mock('../lib/localMembers', () => ({ refrescarSocios: vi.fn(() => Promise.resolve()) }));

const { paymentService } = await import('./PaymentService');

const GIMNASIO = '11111111-1111-1111-1111-111111111111';

/** El núcleo, de mentira. Se usa la cola DE VERDAD sobre él: acá se prueba la integración. */
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

function sinRed(hay) {
  Object.defineProperty(window.navigator, 'onLine', { value: hay, configurable: true });
}

let cola;
const COBRO = { member_id: 'm1', plan_id: 'p1', amount: 45000, paymentMethod: 'CASH', status: 'PAID' };

beforeEach(() => {
  vi.clearAllMocks();
  cola = nucleoFalso();
  window.electronAPI = { nucleo: { cola } };
  localStorage.clear();
  localStorage.setItem('current_org_id', GIMNASIO);
  sinRed(true);
});

describe('con internet, se cobra derecho', () => {
  it('manda al servidor y devuelve lo que contestó', async () => {
    apiClient.post.mockResolvedValue({ data: { id: 'pago-1' } });

    const r = await paymentService.createPayment(COBRO);

    expect(r.id).toBe('pago-1');
    expect(cola.encolar, 'con internet la cola no se toca').not.toHaveBeenCalled();
  });

  it('⭐ el pedido online TAMBIÉN lleva el sello', async () => {
    // Es lo que permite reintentar sin regalar un mes si la respuesta se pierde.
    apiClient.post.mockResolvedValue({ data: {} });

    await paymentService.createPayment(COBRO);

    const [, cuerpo] = apiClient.post.mock.calls[0];
    expect(cuerpo.clientRef).toBeTruthy();
  });

  it('y con el momento como paymentDate: de eso depende en qué día cae el cobro', async () => {
    // Y por lo tanto, si el cierre de caja lo cuenta o no.
    apiClient.post.mockResolvedValue({ data: {} });

    await paymentService.createPayment(COBRO);

    const [, cuerpo] = apiClient.post.mock.calls[0];
    expect(cuerpo.paymentDate, 'sin zona: del otro lado es un LocalDateTime')
      .toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
  });

  it('⚠️ pero NO pisa la fecha que eligió quien carga el pago', async () => {
    // El portal web deja elegirla al cargar un pago viejo. Pisarla movería la plata de día.
    apiClient.post.mockResolvedValue({ data: {} });

    await paymentService.createPayment({ ...COBRO, paymentDate: '2026-08-01T10:00:00' });

    const [, cuerpo] = apiClient.post.mock.calls[0];
    expect(cuerpo.paymentDate).toBe('2026-08-01T10:00:00');
  });
});

describe('sin internet, se guarda', () => {
  it('ni lo intenta: guarda y avisa que quedó encolado', async () => {
    sinRed(false);

    const r = await paymentService.createPayment(COBRO);

    expect(apiClient.post, 'intentar sería regalarle al socio la espera del timeout').not.toHaveBeenCalled();
    expect(r.encolado).toBe(true);
    expect(cola.filas()).toHaveLength(1);
    expect(cola.filas()[0].tipo).toBe('COBRO');
    expect(cola.filas()[0].amount).toBe(45000);
  });

  it('⭐⭐ el pedido que salió y no volvió se encola CON EL MISMO SELLO', async () => {
    // EL test de esta tanda. Con un sello nuevo, el servidor —que quizá SÍ guardó el cobro—
    // procesaría el reintento como un cobro más: el período arrancaría donde terminó el
    // primero y el socio se llevaría 30 días gratis.
    apiClient.post.mockRejectedValue(new Error('Network Error')); // sin `response`

    const r = await paymentService.createPayment(COBRO);

    const [, cuerpoQueSalio] = apiClient.post.mock.calls[0];
    expect(r.encolado).toBe(true);
    expect(cola.filas()[0].clientRef).toBe(cuerpoQueSalio.clientRef);
  });

  it('con algo esperando, el cobro también espera', async () => {
    // La cola es una sola y el orden vale entre tipos: adelantarse por la escritura directa
    // rompe el orden global igual que lo rompía con los accesos.
    cola.filas().push({ clientRef: 'viejo', tipo: 'ACCESO', ocurridoEn: '2026-09-07T09:00:00' });
    apiClient.post.mockResolvedValue({ data: {} });

    const r = await paymentService.createPayment(COBRO);

    expect(apiClient.post).not.toHaveBeenCalled();
    expect(r.encolado).toBe(true);
  });
});

describe('lo que NO se encola', () => {
  it('un rechazo del servidor se muestra, no se guarda para reintentar para siempre', async () => {
    const rechazo = new Error('Ese arancel no existe');
    rechazo.response = { status: 404 };
    apiClient.post.mockRejectedValue(rechazo);

    await expect(paymentService.createPayment(COBRO)).rejects.toThrow('Ese arancel no existe');
    expect(cola.encolar).not.toHaveBeenCalled();
  });

  it('en la web falla como antes, sin fingir que guardó plata', async () => {
    // El portal no promete andar sin internet. Decir "cobrado" sin tener dónde guardarlo sería
    // la peor de las dos opciones — y con plata, la más cara.
    delete window.electronAPI;
    apiClient.post.mockRejectedValue(new Error('Network Error'));

    await expect(paymentService.createPayment(COBRO)).rejects.toThrow('Network Error');
  });
});

describe('mandar lo encolado', () => {
  it('saca los campos de la COLA: el servidor no sabe qué es `intentos`', async () => {
    apiClient.post.mockResolvedValue({ data: { id: 'pago-1' } });

    await paymentService.enviarEncolado({
      tipo: 'COBRO', ocurridoEn: '2026-09-07T10:00:00', intentos: 2, ultimoError: 'x',
      creadoEn: 123, tenantId: GIMNASIO, clientRef: 'sello', ...COBRO,
      paymentDate: '2026-09-07T10:00:00',
    });

    const [, cuerpo] = apiClient.post.mock.calls[0];
    expect(cuerpo.clientRef).toBe('sello');
    expect(cuerpo.paymentDate, 'el momento va adentro, como paymentDate').toBe('2026-09-07T10:00:00');
    expect(cuerpo.tipo).toBeUndefined();
    expect(cuerpo.intentos).toBeUndefined();
    expect(cuerpo.creadoEn).toBeUndefined();
  });
});
