// @vitest-environment happy-dom
//
// ============================================
// VELTRONIK - CERRAR LA CAJA SIN INTERNET
// ============================================
//
// Hasta la fase 3 paso 6, cerrar exigía conexión: la pantalla le pedía los totales al
// servidor y el botón iba derecho. Con el internet caído el gimnasio terminaba el día y no
// podía cerrar — y como el período de un cierre arranca donde terminó el anterior, el día
// siguiente arrastraba el anterior y los dos quedaban mezclados en un solo número.
//
// Lo que se defiende acá son las reglas de docs/FASE3-CAMINOS.md del lado del terminal:
//
//   · el cierre lleva SU momento (sin eso se come las ventas del día siguiente);
//   · lleva sello (sin eso un reintento crea un segundo cierre, que cuenta cero y ese cero
//     se vuelve el fondo de mañana);
//   · con algo esperando en la cola, el cierre TAMBIÉN espera;
//   · un rechazo del servidor se muestra, no se encola.

import { describe, it, expect, beforeEach, vi } from 'vitest';

const apiClient = { get: vi.fn(), post: vi.fn(), patch: vi.fn() };
vi.mock('../lib/apiClient', () => ({ default: apiClient }));

const cola = {
  encolarPendiente: vi.fn(async () => 'sello-1'),
  cuantosPendientes: vi.fn(async () => 0),
  movimientosPendientes: vi.fn(async () => []),
  pendientes: vi.fn(async () => []),
};

vi.mock('../lib/colaAccesos', () => ({
  encolarPendiente: (...a) => cola.encolarPendiente(...a),
  cuantosPendientes: (...a) => cola.cuantosPendientes(...a),
  movimientosPendientes: (...a) => cola.movimientosPendientes(...a),
  pendientes: (...a) => cola.pendientes(...a),
  disponible: () => true,
  orgActual: () => 'gimnasio-1',
  nuevoSello: () => '11111111-2222-3333-4444-555555555555',
  momentoLocal: () => '2026-09-15T22:00:00',
}));

const { cajaService } = await import('./CajaService');
const { espejo } = await import('../lib/cajaLocal');

function sinRed(hay) {
  Object.defineProperty(window.navigator, 'onLine', { value: hay, configurable: true });
}

const cierre = {
  retiroEfectivo: 30000,
  nota: null,
  cerradoPor: 'Carla',
  esperadoSegunTerminal: 55000,
  cobrosSegunTerminal: 3,
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  localStorage.setItem('current_org_id', 'gimnasio-1');
  cola.encolarPendiente.mockResolvedValue('sello-1');
  cola.cuantosPendientes.mockResolvedValue(0);
  cola.pendientes.mockResolvedValue([]);
  sinRed(true);
});

describe('con internet, se cierra derecho', () => {
  it('manda el momento, el sello y los dos números del terminal', async () => {
    apiClient.post.mockResolvedValue({ data: { id: 'c1', quedaEnCaja: 25000 } });

    await cajaService.cerrar(cierre);

    const [ruta, cuerpo] = apiClient.post.mock.calls[0];
    expect(ruta).toBe('/gym/caja/cierre');
    expect(cuerpo.ocurridoEn, 'sin esto, un cierre que sube tarde se come el día siguiente')
      .toBe('2026-09-15T22:00:00');
    expect(cuerpo.clientRef).toBeTruthy();
    expect(cuerpo.esperadoSegunTerminal).toBe(55000);
    expect(cuerpo.cobrosSegunTerminal).toBe(3);
  });

  it('⭐ y arranca el período siguiente acá mismo, con lo que quedó en el cajón', async () => {
    // Sin esto, un corte diez minutos después de cerrar mostraría el día que se acaba de
    // cerrar, con su plata incluida.
    apiClient.post.mockResolvedValue({ data: { id: 'c1', quedaEnCaja: 25000 } });

    await cajaService.cerrar(cierre);

    expect(espejo().resumen.fondo).toBe(25000);
    expect(espejo().resumen.efectivo).toBe(0);
    expect(espejo().contarDesde).toBe('2026-09-15T22:00:00');
  });
});

describe('sin internet, se guarda', () => {
  it('ni lo intenta: encola el cierre y avisa', async () => {
    sinRed(false);

    const r = await cajaService.cerrar(cierre);

    expect(apiClient.post, 'intentar es regalarle el timeout a quien está cerrando')
      .not.toHaveBeenCalled();
    expect(r.encolado).toBe(true);
    const item = cola.encolarPendiente.mock.calls[0][0];
    expect(item.tipo).toBe('CIERRE');
    expect(item.ocurridoEn).toBe('2026-09-15T22:00:00');
    expect(item.esperadoSegunTerminal).toBe(55000);
  });

  it('el pedido que salió y no volvió también se encola', async () => {
    apiClient.post.mockRejectedValue(new Error('Network Error')); // sin `response`

    const r = await cajaService.cerrar(cierre);

    expect(r.encolado).toBe(true);
    expect(cola.encolarPendiente).toHaveBeenCalled();
  });

  it('y el período local arranca igual: quien atiende no puede quedar sin pantalla', async () => {
    sinRed(false);

    await cajaService.cerrar(cierre);

    // 55.000 esperados − 30.000 retirados
    expect(espejo().resumen.fondo).toBe(25000);
  });
});

describe('⚠️ con algo esperando, el cierre TAMBIÉN espera', () => {
  it('no se adelanta aunque haya internet', async () => {
    // Si se adelantara, el servidor lo contaría ANTES de haber recibido los cobros del día y
    // cerraría con un total de menos. El orden de la cola es lo único que garantiza que el
    // cierre vea el día completo.
    cola.cuantosPendientes.mockResolvedValue(4);

    const r = await cajaService.cerrar(cierre);

    expect(apiClient.post).not.toHaveBeenCalled();
    expect(r.encolado).toBe(true);
  });
});

describe('lo que NO se encola', () => {
  it('un rechazo del servidor se muestra', async () => {
    // Un 400 ("no podés retirar más de lo que hay") o un 409 ("ese período ya lo cerró otro")
    // no se arreglan reintentando. Encolarlos escondería el problema detrás de un "guardado".
    const rechazo = new Error('Conflict');
    rechazo.response = { status: 409 };
    apiClient.post.mockRejectedValue(rechazo);

    await expect(cajaService.cerrar(cierre)).rejects.toThrow('Conflict');
    expect(cola.encolarPendiente).not.toHaveBeenCalled();
  });
});

describe('⭐ los totales de la pantalla sin conexión', () => {
  it('con red se los pide al servidor y los guarda para después', async () => {
    apiClient.get.mockResolvedValue({ data: { efectivo: 40000, fondo: 20000, cantidadCobros: 2 } });

    const r = await cajaService.abierto();

    expect(r.efectivo).toBe(40000);
    expect(espejo().resumen.efectivo, 'guardado: es el piso si la conexión se corta').toBe(40000);
  });

  it('sin red NI LO INTENTA y contesta con lo último que bajó, marcado incompleto', async () => {
    apiClient.get.mockResolvedValue({ data: { efectivo: 40000, fondo: 20000, cantidadCobros: 2 } });
    await cajaService.abierto();          // deja el espejo

    sinRed(false);
    apiClient.get.mockClear();

    const r = await cajaService.abierto();

    expect(apiClient.get).not.toHaveBeenCalled();
    expect(r.efectivo).toBe(40000);
    expect(r.incompleto, 'el terminal no ve lo que entró por el portal durante el corte').toBe(true);
    expect(r.bajadoEn).toBeTruthy();
  });

  it('sin red y sin nada bajado nunca, falla en vez de mostrar ceros', async () => {
    // Un cero se lee como "hoy no entró plata". No saber no es cero.
    sinRed(false);

    await expect(cajaService.abierto()).rejects.toThrow(/Sin conexión/);
  });

  it('un rechazo del servidor se muestra, no se tapa con el número viejo', async () => {
    apiClient.get.mockResolvedValue({ data: { efectivo: 40000 } });
    await cajaService.abierto();

    const rechazo = new Error('Forbidden');
    rechazo.response = { status: 403 };
    apiClient.get.mockRejectedValue(rechazo);

    await expect(cajaService.abierto()).rejects.toThrow('Forbidden');
  });
});
