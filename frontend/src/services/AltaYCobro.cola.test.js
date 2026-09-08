// @vitest-environment happy-dom
//
// ============================================
// VELTRONIK - Dar de alta y cobrar en el MISMO acto, sin internet
// ============================================
// Es la decisión 1 del dueño y el paso 4 del mapa (docs/FASE3-CAMINOS.md), y el único caso
// donde el orden de la cola tiene que valer ENTRE TIPOS.
//
// ⚠️ EL PROBLEMA QUE RESUELVE: el cobro tiene que poder nombrar al socio. Si el id lo inventara
// el servidor, el cobro encolado apuntaría a alguien que todavía no existe — y llegaría antes
// que su alta, o después, según cómo se vaciaran dos colas separadas. Por eso el id lo genera
// el TERMINAL y por eso la cola es una sola.
// ============================================

import { describe, it, expect, beforeEach, vi } from 'vitest';

const apiClient = { post: vi.fn(), get: vi.fn(), put: vi.fn() };
vi.mock('../lib/apiClient', () => ({ default: apiClient }));
vi.mock('../lib/localMembers', () => ({
  prepararSocios: vi.fn(),
  buscarSocios: vi.fn(() => []),
  estadoSocios: vi.fn(() => ({ vacia: true })),
  refrescarSocios: vi.fn(() => Promise.resolve()),
  agregarSocioLocal: vi.fn(() => Promise.resolve(true)),
}));

const { memberService } = await import('./MemberService');
const { paymentService } = await import('./PaymentService');
const { vaciar } = await import('../lib/colaAccesos');
const { agregarSocioLocal } = await import('../lib/localMembers');

const GIMNASIO = '11111111-1111-1111-1111-111111111111';

function nucleoFalso() {
  let filas = [];
  return {
    filas: () => filas,
    encolar: vi.fn(async (item) => {
      filas.push({ ...item, intentos: 0, creadoEn: Date.now() + filas.length });
      return { ok: true, clientRef: item.clientRef };
    }),
    pendientes: vi.fn(async () => filas.slice().sort((a, b) => (
      a.ocurridoEn < b.ocurridoEn ? -1 : a.ocurridoEn > b.ocurridoEn ? 1 : a.creadoEn - b.creadoEn
    ))),
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

beforeEach(() => {
  vi.clearAllMocks();
  cola = nucleoFalso();
  window.electronAPI = { nucleo: { cola } };
  localStorage.clear();
  localStorage.setItem('current_org_id', GIMNASIO);
  sinRed(false); // todo este archivo es el caso sin internet
});

describe('⭐⭐ el alta y su cobro, sin conexión', () => {
  it('el terminal genera el id, y el cobro puede nombrar al socio', async () => {
    const socio = await memberService.createMember({ firstName: 'Jesus', lastName: 'Nazaret' });

    expect(socio.encolado).toBe(true);
    expect(socio.id, 'sin id, el cobro encolado apunta a nadie').toBeTruthy();

    const cobro = await paymentService.createPayment({ member_id: socio.id, amount: 25000 });
    expect(cobro.encolado).toBe(true);

    const [alta, elCobro] = cola.filas();
    expect(alta.tipo).toBe('ALTA');
    expect(elCobro.tipo).toBe('COBRO');
    expect(elCobro.member_id, 'el cobro nombra al socio por el id del terminal').toBe(socio.id);
  });

  it('⭐ y al vaciar, el ALTA sube ANTES que el cobro', async () => {
    // Es LA razón de que la cola sea una sola. Si el cobro llegara primero, el servidor
    // recibiría plata de alguien que para él no existe.
    const socio = await memberService.createMember({ firstName: 'Jesus', lastName: 'Nazaret' });
    await paymentService.createPayment({ member_id: socio.id, amount: 25000 });

    const orden = [];
    await vaciar({
      ALTA: async (i) => orden.push(`ALTA:${i.id}`),
      COBRO: async (i) => orden.push(`COBRO:${i.member_id}`),
    });

    expect(orden).toEqual([`ALTA:${socio.id}`, `COBRO:${socio.id}`]);
  });

  it('⚠️ el socio queda buscable EN EL ACTO, sin esperar al servidor', async () => {
    // Quien atiende lo da de alta y el paso siguiente es cobrarle. Sin esto lo daría de alta y
    // el buscador diría que no existe — el caso más confuso posible.
    await memberService.createMember({ firstName: 'Jesus', lastName: 'Nazaret' });

    expect(agregarSocioLocal).toHaveBeenCalledTimes(1);
    expect(agregarSocioLocal.mock.calls[0][0].firstName).toBe('Jesus');
  });

  it('no sale ningún pedido a la red: se guarda y listo', async () => {
    const socio = await memberService.createMember({ firstName: 'Jesus', lastName: 'Nazaret' });
    await paymentService.createPayment({ member_id: socio.id, amount: 25000 });

    expect(apiClient.post, 'intentar sería regalarle la espera del timeout a quien atiende')
      .not.toHaveBeenCalled();
  });
});

describe('con internet, el alta va derecho', () => {
  it('manda al servidor y devuelve lo que contestó', async () => {
    sinRed(true);
    apiClient.post.mockResolvedValue({ data: { id: 'del-servidor', firstName: 'Jesus' } });

    const r = await memberService.createMember({ firstName: 'Jesus' });

    expect(r.id).toBe('del-servidor');
    expect(cola.encolar).not.toHaveBeenCalled();
  });

  it('⭐ pero el id del terminal viaja igual: es lo que hace segura la reintentada', async () => {
    sinRed(true);
    apiClient.post.mockResolvedValue({ data: {} });

    await memberService.createMember({ firstName: 'Jesus' });

    const [, cuerpo] = apiClient.post.mock.calls[0];
    expect(cuerpo.id).toBeTruthy();
  });

  it('un rechazo del servidor se muestra, no se encola', async () => {
    sinRed(true);
    const rechazo = new Error('Falta el nombre');
    rechazo.response = { status: 400 };
    apiClient.post.mockRejectedValue(rechazo);

    await expect(memberService.createMember({})).rejects.toThrow('Falta el nombre');
    expect(cola.encolar).not.toHaveBeenCalled();
  });
});

describe('mandar el alta encolada', () => {
  it('saca los campos de la COLA pero conserva el id', async () => {
    apiClient.post.mockResolvedValue({ data: { id: 'x' } });

    await memberService.enviarEncolado({
      tipo: 'ALTA', clientRef: 'sello', ocurridoEn: '2026-09-07T10:00:00', intentos: 1,
      ultimoError: null, creadoEn: 123, tenantId: GIMNASIO,
      id: 'el-id-del-terminal', firstName: 'Jesus',
    });

    const [, cuerpo] = apiClient.post.mock.calls[0];
    expect(cuerpo.id, 'sin el id, el cobro que viene detrás no encuentra a nadie')
      .toBe('el-id-del-terminal');
    expect(cuerpo.tipo).toBeUndefined();
    expect(cuerpo.intentos).toBeUndefined();
  });
});
