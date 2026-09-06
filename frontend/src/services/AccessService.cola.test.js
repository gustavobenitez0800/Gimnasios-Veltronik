// @vitest-environment happy-dom
//
// ============================================
// VELTRONIK - Tests de registrar el paso de un socio
// ============================================
// La regla: con internet se escribe DERECHO al servidor, y la cola es el paracaídas. No al
// revés. Escribir siempre local metería un retraso entre lo que pasa en el gimnasio y lo que
// el dueño puede ver, a cambio de nada — el mostrador ya es rápido porque lo que era lento
// eran las lecturas, y esas ya salen del espejo.
//
// ⭐ Y el caso que hace o rompe todo esto: EL PEDIDO QUE SALIÓ Y DEL QUE NUNCA VOLVIÓ
// RESPUESTA. Si ahí se encolara un acceso NUEVO, el servidor lo leería como un segundo paso
// del mismo socio — y dos pasos no duplican, INVIERTEN: el socio queda "afuera" sin haberse
// ido. Se prueba abajo, y es el test que justifica que el sello se genere ANTES de intentar.
// ============================================

import { describe, it, expect, beforeEach, vi } from 'vitest';

const apiClient = { post: vi.fn(), get: vi.fn(), put: vi.fn() };
vi.mock('../lib/apiClient', () => ({ default: apiClient }));

const { accessService } = await import('./AccessService');

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

/** Pone (o saca) la máquina en modo "sin red". */
function sinRed(hay) {
  Object.defineProperty(window.navigator, 'onLine', { value: hay, configurable: true });
}

let cola;

beforeEach(() => {
  vi.clearAllMocks();
  cola = nucleoFalso();
  window.electronAPI = { nucleo: { cola } };
  localStorage.clear();
  localStorage.setItem('current_org_id', GIMNASIO);
  sinRed(true);
});

describe('con internet, se escribe derecho', () => {
  it('manda al servidor y devuelve lo que contestó', async () => {
    apiClient.post.mockResolvedValue({ data: { direccion: 'ENTRADA' } });

    const r = await accessService.checkIn('m1', 'manual', 'José Pérez');

    expect(r.direccion).toBe('ENTRADA');
    expect(cola.encolar, 'con internet la cola no se toca').not.toHaveBeenCalled();
  });

  it('el pedido online TAMBIÉN lleva el sello y el momento', async () => {
    // No es decorativo: es lo que permite reintentar sin duplicar si la respuesta se pierde.
    apiClient.post.mockResolvedValue({ data: {} });

    await accessService.checkIn('m1');

    const [, cuerpo] = apiClient.post.mock.calls[0];
    expect(cuerpo.clientRef).toBeTruthy();
    expect(cuerpo.ocurridoEn, 'sin zona: del otro lado es un LocalDateTime')
      .toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
  });

  it('espera poco: un spinner largo con un socio adelante es lo que esto vino a matar', async () => {
    apiClient.post.mockResolvedValue({ data: {} });
    await accessService.checkIn('m1');
    const [, , opciones] = apiClient.post.mock.calls[0];
    expect(opciones.timeout).toBeLessThanOrEqual(5000);
  });
});

describe('sin internet, se guarda', () => {
  it('ni lo intenta: guarda y avisa que quedó encolado', async () => {
    sinRed(false);

    const r = await accessService.checkIn('m1', 'manual', 'José Pérez');

    expect(apiClient.post, 'intentar sería regalarle al socio la espera del timeout').not.toHaveBeenCalled();
    expect(r.encolado).toBe(true);
    expect(cola.filas()).toHaveLength(1);
    expect(cola.filas()[0].memberId).toBe('m1');
  });

  it('⭐⭐ el pedido que salió y no volvió se encola CON EL MISMO SELLO', async () => {
    // EL test de esta tanda. Si acá se generara un sello nuevo, el servidor —que quizá SÍ
    // guardó el acceso— leería el reintento como un segundo paso del socio y lo dejaría
    // "afuera" sin haberse ido. Con el mismo sello, su índice único lo reconoce.
    apiClient.post.mockRejectedValue(new Error('Network Error')); // sin `response`

    const r = await accessService.checkIn('m1');

    const [, cuerpoQueSalio] = apiClient.post.mock.calls[0];
    expect(r.encolado).toBe(true);
    expect(cola.filas()[0].clientRef).toBe(cuerpoQueSalio.clientRef);
  });

  it('y con el MISMO momento: la dirección se evalúa contra cuándo pasó', async () => {
    apiClient.post.mockRejectedValue(new Error('Network Error'));

    await accessService.checkIn('m1');

    const [, cuerpoQueSalio] = apiClient.post.mock.calls[0];
    expect(cola.filas()[0].ocurridoEn).toBe(cuerpoQueSalio.ocurridoEn);
  });
});

describe('lo que NO se encola', () => {
  it('un rechazo del servidor se muestra, no se guarda para reintentar para siempre', async () => {
    const rechazo = new Error('Ese socio no existe');
    rechazo.response = { status: 404 };
    apiClient.post.mockRejectedValue(rechazo);

    await expect(accessService.checkIn('m1')).rejects.toThrow('Ese socio no existe');
    expect(cola.encolar).not.toHaveBeenCalled();
  });

  it('en la web falla como antes, sin fingir que guardó algo', async () => {
    // El portal no promete andar sin internet. Decir "guardado" sin tener dónde guardarlo
    // sería la peor de las dos opciones.
    delete window.electronAPI;
    apiClient.post.mockRejectedValue(new Error('Network Error'));

    await expect(accessService.checkIn('m1')).rejects.toThrow('Network Error');
  });
});
