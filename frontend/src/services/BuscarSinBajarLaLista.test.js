// @vitest-environment happy-dom
//
// ============================================
// VELTRONIK - Buscar en el mostrador NO es bajar la lista de socios
// ============================================
// 🔴 El buscador del mostrador llamaba a `prepararSocios` en cada búsqueda, y eso bajaba la lista
// ENTERA de socios cada vez: una o dos descargas de los 400 socios por cada DNI tipeado. Sumado al
// mostrador, en septiembre de 2026 hizo pasar al proyecto del plan gratis de Supabase en doce días.
//
// Estos tests fijan las dos mitades, y hacen falta las dos:
//   · buscar seguido NO vuelve a pedir la lista (como mucho una vez por minuto);
//   · pero si alguien se dio de alta en OTRA máquina, buscarlo y no encontrarlo SÍ la pide —
//     que es lo único que el pedido por búsqueda resolvía de verdad.
// ============================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const apiClient = { get: vi.fn(), post: vi.fn(), put: vi.fn() };
vi.mock('../lib/apiClient', () => ({ default: apiClient }));

// La cola (altas sin internet) no participa de esto: vacía.
vi.mock('../lib/colaAccesos', () => ({
  altasPendientes: vi.fn(async () => []),
  encolarPendiente: vi.fn(),
  disponible: vi.fn(() => false),
  nuevoSello: vi.fn(() => 'sello'),
  cuantosPendientes: vi.fn(async () => 0),
}));

const {
  prepararSocios, refrescarSiHaceMas, olvidarSocios, REFRESCO_AL_BUSCAR_MS, REFRESCO_SI_NO_ESTA_MS,
} = await import('../lib/localMembers');
const { memberService } = await import('./MemberService');

const GYM = '11111111-1111-1111-1111-111111111111';
const OTRO_GYM = '22222222-2222-2222-2222-222222222222';

const LURDES = { id: 'm1', firstName: 'Lurdes', lastName: 'Gómez', document: '30111222', active: true };
const NUEVO = { id: 'm2', firstName: 'Recién', lastName: 'Llegado', document: '40999888', active: true };

let ahora;
function pasan(ms) {
  ahora += ms;
  vi.setSystemTime(ahora);
}

/** Deja terminar el refresco que quedó corriendo en el fondo (sin await a propósito). */
async function queTermine() {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
}

function laListaEs(...socios) {
  apiClient.get.mockResolvedValue({ data: socios });
}

beforeEach(async () => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  ahora = new Date('2026-10-01T10:00:00').getTime();
  vi.setSystemTime(ahora);
  Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
  localStorage.clear();
  localStorage.setItem('current_org_id', GYM);
  olvidarSocios();
  laListaEs(LURDES);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('⭐ buscar seguido no vuelve a bajar la lista', () => {
  it('cinco búsquedas en medio minuto: la lista se pide UNA vez', async () => {
    for (let i = 0; i < 5; i++) {
      await prepararSocios(GYM);
      await queTermine();
      pasan(5_000);
    }

    expect(apiClient.get, 'una descarga de todos los socios por cada búsqueda').toHaveBeenCalledTimes(1);
  });

  it('pasado el minuto, la búsqueda siguiente sí la pide', async () => {
    await prepararSocios(GYM);
    await queTermine();

    pasan(REFRESCO_AL_BUSCAR_MS + 1);
    await prepararSocios(GYM);
    await queTermine();

    expect(apiClient.get).toHaveBeenCalledTimes(2);
  });

  it('un pedido que falló tampoco se repite en cada búsqueda', async () => {
    apiClient.get.mockRejectedValue(new Error('500'));

    for (let i = 0; i < 4; i++) {
      await prepararSocios(GYM);
      await queTermine();
      pasan(3_000);
    }

    expect(apiClient.get).toHaveBeenCalledTimes(1);
  });

  it('la lista de OTRO gimnasio se pide en el acto: la de este no le sirve', async () => {
    await prepararSocios(GYM);
    await queTermine();

    pasan(1_000);
    await prepararSocios(OTRO_GYM);
    await queTermine();

    expect(apiClient.get).toHaveBeenCalledTimes(2);
  });
});

describe('⭐ pero el que se dio de alta en otra máquina aparece', () => {
  /** La copia ya bajó una vez, como pasa al abrir el mostrador. */
  async function mostradorAbierto() {
    await prepararSocios(GYM);
    await queTermine();
    apiClient.get.mockClear();
  }

  it('buscarlo y no encontrarlo pide la lista, y la búsqueda siguiente ya lo encuentra', async () => {
    await mostradorAbierto();

    // Otro equipo da de alta a alguien. Este mostrador todavía no lo sabe.
    laListaEs(LURDES, NUEVO);
    pasan(REFRESCO_SI_NO_ESTA_MS + 1);

    expect(await memberService.searchForAccess('40999888')).toEqual([]);
    await queTermine();
    expect(apiClient.get, 'no encontrar a nadie tiene que pedir la lista').toHaveBeenCalledTimes(1);

    const otraVez = await memberService.searchForAccess('40999888');
    expect(otraVez.map((s) => s.id)).toEqual(['m2']);
  });

  it('tipear un DNI que no existe no es una descarga por tecla', async () => {
    await mostradorAbierto();
    pasan(REFRESCO_SI_NO_ESTA_MS + 1);

    // La búsqueda corre en cada pausa al tipear: 9, 99, 999...
    for (const parcial of ['99', '999', '9999', '99999', '999999']) {
      await memberService.searchForAccess(parcial);
      await queTermine();
      pasan(400);
    }

    expect(apiClient.get).toHaveBeenCalledTimes(1);
  });

  it('encontrar al socio no pide nada: la copia ya sirvió', async () => {
    await mostradorAbierto();
    pasan(REFRESCO_SI_NO_ESTA_MS + 1);

    const encontrados = await memberService.searchForAccess('Lurdes');
    await queTermine();

    expect(encontrados.map((s) => s.id)).toEqual(['m1']);
    expect(apiClient.get).not.toHaveBeenCalled();
  });

  it('el piso de diez segundos también vale para el que no se encuentra', async () => {
    await mostradorAbierto();

    pasan(2_000);
    await refrescarSiHaceMas(GYM, REFRESCO_SI_NO_ESTA_MS);

    expect(apiClient.get).not.toHaveBeenCalled();
  });
});
