// @vitest-environment happy-dom
//
// ============================================
// VELTRONIK - Los llaveros en la copia local (ADR-016 §4)
// ============================================
// El mostrador encuentra al socio que pasa su llavero SIN INTERNET: los llaveros viajan en la
// lista de socios y se buscan acá, en memoria. Todo exacto: un llavero parecido es otra persona.
// ============================================

import { describe, it, expect, beforeEach, vi } from 'vitest';

const apiClient = { get: vi.fn() };
vi.mock('./apiClient', () => ({ default: apiClient }));
vi.mock('./conexion', () => ({ sinConexion: () => false }));
vi.mock('./colaAccesos', () => ({ altasPendientes: async () => [] }));

const {
  refrescarSocios, olvidarSocios, buscarPorLlavero, buscarSocios, ponerLlaveroLocal, sacarLlaveroLocal,
  socioLocalPorId,
} = await import('./localMembers');

const GIMNASIO = '11111111-1111-1111-1111-111111111111';

const ANA = {
  id: 'ana', firstName: 'Ana', lastName: 'Pérez', dni: '30111222', active: true,
  situacion: 'AL_DIA', diasRestantes: 20, membershipEnd: '2099-01-01T23:59:59', llaveros: ['0012345678'],
};
const BETO = {
  id: 'beto', firstName: 'Beto', lastName: 'Gómez', dni: '12345678', active: true,
  situacion: 'AL_DIA', diasRestantes: 20, membershipEnd: '2099-01-01T23:59:59',
};
// Como llegó de ControlFit: el número del llavero en lugar del DNI.
const LARISSA = {
  id: 'larissa', firstName: 'Larissa', lastName: 'Cipriano', dni: '0055544433', active: true,
  situacion: 'AL_DIA', diasRestantes: 20, membershipEnd: '2099-01-01T23:59:59',
};

async function cargar(socios) {
  apiClient.get.mockResolvedValue({ data: socios });
  await refrescarSocios(GIMNASIO);
}

beforeEach(() => {
  olvidarSocios();
  apiClient.get.mockReset();
});

describe('⭐ quién pasó este llavero', () => {
  it('lo encuentra por su llavero, sin ir a la red', async () => {
    await cargar([ANA, BETO]);
    apiClient.get.mockClear();

    const encontrados = buscarPorLlavero('0012345678');

    expect(encontrados.map((s) => s.id)).toEqual(['ana']);
    expect(encontrados[0].fullName).toBe('Ana Pérez');
    expect(apiClient.get).not.toHaveBeenCalled();
  });

  it('🔴 exacto: 0012345678 NO es el socio del DNI 12345678, ni un pedazo encuentra a nadie', async () => {
    await cargar([BETO]);

    expect(buscarPorLlavero('0012345678')).toEqual([]);
    expect(buscarPorLlavero('234567')).toEqual([]);
  });

  it('⭐ encuentra a los que vinieron de ControlFit con el llavero en el DNI', async () => {
    await cargar([LARISSA]);

    expect(buscarPorLlavero(' 0055544433 ').map((s) => s.id)).toEqual(['larissa']);
  });

  it('si el llavero es de uno y el DNI de otro, devuelve los dos: no se elige por nadie', async () => {
    await cargar([{ ...ANA, llaveros: ['0055544433'] }, LARISSA]);

    expect(buscarPorLlavero('0055544433').map((s) => s.id)).toEqual(['ana', 'larissa']);
  });

  it('el buscador de siempre pone primero al dueño del llavero tecleado', async () => {
    await cargar([BETO, ANA]);

    expect(buscarSocios('0012345678').map((s) => s.id)[0]).toBe('ana');
  });
});

describe('cambios en el acto, sin esperar al refresco', () => {
  it('⭐ un llavero recién asignado se encuentra en la lectura siguiente', async () => {
    await cargar([ANA, BETO]);

    await ponerLlaveroLocal('beto', '0099887766');

    expect(buscarPorLlavero('0099887766').map((s) => s.id)).toEqual(['beto']);
    expect(socioLocalPorId('beto').llaveros).toEqual(['0099887766']);
  });

  it('pasárselo a otro se lo saca al primero, como hizo el servidor', async () => {
    await cargar([ANA, BETO]);

    await ponerLlaveroLocal('beto', '0012345678');

    expect(buscarPorLlavero('0012345678').map((s) => s.id)).toEqual(['beto']);
    expect(socioLocalPorId('ana').llaveros).toEqual([]);
  });

  it('uno dado de baja deja de encontrarse en el acto', async () => {
    await cargar([ANA]);

    await sacarLlaveroLocal('0012345678');

    expect(buscarPorLlavero('0012345678')).toEqual([]);
  });
});
