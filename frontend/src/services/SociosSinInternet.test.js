// @vitest-environment happy-dom
//
// ============================================
// VELTRONIK - La lista de Socios sin internet
// ============================================
// ⚠️ ESTA PANTALLA NUNCA FUNCIONÓ SIN CONEXIÓN, y es la más usada del sistema. Pedía su página
// al servidor y nada más, así que con el cable desenchufado mostraba "Cargando…" para siempre y
// "0 socios registrados".
//
// Lo vio el dueño probando el alta sin internet: dio de alta a un socio, se guardó bien, y la
// lista siguió vacía. Un dueño que ve eso concluye —con razón— que el sistema no anda, por más
// que el alta y el cobro funcionen por otro lado. Y ADEMÁS deja el alta+cobro a medias: el
// botón de cobrar vive en la fila de la lista.
//
// No hacía falta traer nada nuevo: la copia local YA tiene todos los socios. Es la misma que
// usa el buscador de la puerta.
// ============================================

import { describe, it, expect, beforeEach, vi } from 'vitest';

const apiClient = { get: vi.fn(), post: vi.fn(), put: vi.fn() };
vi.mock('../lib/apiClient', () => ({ default: apiClient }));

const copia = { socios: [], total: 0 };
vi.mock('../lib/localMembers', () => ({
  prepararSocios: vi.fn(() => Promise.resolve()),
  buscarSocios: vi.fn(() => []),
  estadoSocios: vi.fn(() => ({ vacia: false })),
  refrescarSocios: vi.fn(() => Promise.resolve()),
  agregarSocioLocal: vi.fn(() => Promise.resolve(true)),
  listarSocios: vi.fn(() => ({ socios: copia.socios, total: copia.total })),
}));

const { memberService } = await import('./MemberService');
const { prepararSocios, listarSocios } = await import('../lib/localMembers');

const UN_SOCIO = {
  id: 'm1', firstName: 'Jesus', lastName: 'Nazaret', dni: '12345678',
  phone: '112233445', email: '', isActive: true,
  membershipEnd: '2026-11-07T23:59:59', situacion: 'AL_DIA', diasRestantes: 31,
};

function sinRed(hay) {
  Object.defineProperty(window.navigator, 'onLine', { value: hay, configurable: true });
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  localStorage.setItem('current_org_id', '11111111-1111-1111-1111-111111111111');
  copia.socios = [UN_SOCIO];
  copia.total = 1;
  sinRed(true);
});

describe('⭐ sin internet, la lista sale de la copia local', () => {
  it('no sale ningún pedido a la red: se responde con lo que hay', async () => {
    sinRed(false);

    const page = await memberService.getMembersPaged(0, 50, '');

    expect(apiClient.get, 'pedidos condenados a fallar, apilándose').not.toHaveBeenCalled();
    expect(page.totalElements).toBe(1);
    expect(page.content[0].firstName).toBe('Jesus');
    expect(page.deLaCopiaLocal).toBe(true);
  });

  it('⚠️ y los socios vienen con los MISMOS nombres de campo que los del servidor', async () => {
    // Dos formas de leer un socio serían dos formas de equivocarse: quien llama los convierte
    // con el mismo mapeo que usa para los del servidor.
    sinRed(false);

    const page = await memberService.getMembersPaged(0, 50, '');

    const s = page.content[0];
    expect(s.document, 'el servidor dice `document`, la copia guarda `dni`').toBe('12345678');
    expect(s.active, 'el servidor dice `active`, la copia guarda `isActive`').toBe(true);
    expect(s.situacion).toBe('AL_DIA');
  });

  it('carga la copia en memoria antes de leerla', async () => {
    // Quien entra directo a Socios sin conexión no pasó por la puerta, que es lo que la carga.
    // Sin esto vería el cartel de error teniendo los socios en el disco.
    sinRed(false);

    await memberService.getMembersPaged(0, 50, '');

    expect(prepararSocios).toHaveBeenCalled();
    expect(prepararSocios.mock.calls[0][1], 'sin red no hay contra qué refrescar')
      .toEqual({ refrescar: false });
  });

  it('sin copia tampoco se queda cargando: falla y lo dice', async () => {
    copia.socios = [];
    copia.total = 0;
    sinRed(false);

    await expect(memberService.getMembersPaged(0, 50, '')).rejects.toThrow(/Sin conexión/);
  });

  it('la búsqueda y la paginación se le pasan a la copia', async () => {
    sinRed(false);

    await memberService.getMembersPaged(2, 25, 'jesus');

    expect(listarSocios).toHaveBeenCalledWith('jesus', 2, 25);
  });
});

describe('con internet manda el servidor', () => {
  it('devuelve la página del servidor y no toca la copia', async () => {
    apiClient.get.mockResolvedValue({ data: { content: [{ id: 'del-servidor' }], totalElements: 1 } });

    const page = await memberService.getMembersPaged(0, 50, '');

    expect(page.content[0].id).toBe('del-servidor');
    expect(page.deLaCopiaLocal).toBeUndefined();
    expect(listarSocios).not.toHaveBeenCalled();
  });

  it('⚠️ un rechazo del SERVIDOR se muestra, no se tapa con la copia', async () => {
    // Si el servidor contestó que no, taparlo con datos viejos escondería el problema real.
    const rechazo = new Error('No autorizado');
    rechazo.response = { status: 403 };
    apiClient.get.mockRejectedValue(rechazo);

    await expect(memberService.getMembersPaged(0, 50, '')).rejects.toThrow('No autorizado');
    expect(listarSocios).not.toHaveBeenCalled();
  });

  it('pero si el servidor NO contesta, cae a la copia en vez de romper', async () => {
    // El caso del wifi que se cae con la app abierta: `navigator.onLine` todavía dice que sí.
    apiClient.get.mockRejectedValue(new Error('Network Error')); // sin `response`

    const page = await memberService.getMembersPaged(0, 50, '');

    expect(page.deLaCopiaLocal).toBe(true);
  });
});
