// @vitest-environment happy-dom
//
// ============================================
// VELTRONIK - Quién puede plantar el muro de cobro
// ============================================
// ⭐ EL BUG QUE MOTIVA ESTO: un gimnasio AL DÍA veía "Renová la suscripción" cada pocos
// minutos. Entraba, trabajaba un rato, y de la nada aparecía el muro.
//
// La causa era un 402 con dos significados. El `KillSwitchFilter` lo devuelve cuando la
// sucursal está impaga —y el interceptor, con razón, planta el muro—. Pero el padrón del
// molinete ADEMÁS lo devolvía para decir "el control de acceso no está en tu plan", que es
// otra cosa completamente distinta. Como el escritorio pide el padrón cada varios minutos,
// cualquier cliente en plan básico terminaba con el muro en la cara. Y con el premium
// apagado, TODOS resuelven a básico.
//
// Las dos reglas que se fijan acá:
//   1. El 402 significa UNA sola cosa: la sucursal está impaga. Eso planta el muro.
//   2. "Esta función no está en tu plan" viaja como 403 + FEATURE_NOT_IN_PLAN, y NO toca el
//      muro ni el contexto de la sucursal. El error se propaga a quien lo pidió.

import { describe, it, expect, beforeEach, vi } from 'vitest';

const getSession = vi.fn();
const refreshSession = vi.fn();
const signOut = vi.fn();

vi.mock('./supabase', () => ({
  supabase: { auth: { getSession, refreshSession, signOut } },
  INITIAL_URL: '',
}));
vi.mock('./deviceId', () => ({ getDeviceId: () => null }));
vi.mock('./shift', () => ({ getShiftId: () => null }));

/** Carga apiClient de cero con un adaptador que contesta lo que le digamos. */
async function montar(responder) {
  vi.resetModules();
  const { default: apiClient } = await import('./apiClient');
  apiClient.defaults.adapter = async (config) => responder(config);
  return apiClient;
}

const falla = (status, data) => (config) => {
  const e = new Error(String(status));
  e.response = { status, data, headers: {}, config };
  e.config = config;
  return Promise.reject(e);
};

/** Escucha los eventos globales que disparan pantallas de bloqueo. */
function espiarEventos() {
  const vistos = [];
  const anotar = (nombre) => () => vistos.push(nombre);
  const oyentes = ['auth-payment-required', 'auth-forbidden-tenant', 'auth-unauthorized']
    .map((nombre) => {
      const fn = anotar(nombre);
      window.addEventListener(nombre, fn);
      return [nombre, fn];
    });
  return {
    vistos,
    soltar: () => oyentes.forEach(([nombre, fn]) => window.removeEventListener(nombre, fn)),
  };
}

describe('el muro de cobro solo lo planta una deuda real', () => {
  beforeEach(() => {
    getSession.mockReset();
    refreshSession.mockReset();
    signOut.mockReset();
    localStorage.clear();
    getSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } });
  });

  it('un 402 planta el muro: la sucursal está impaga', async () => {
    const apiClient = await montar(falla(402, { message: 'Sucursal inactiva' }));
    const espia = espiarEventos();

    await expect(apiClient.get('/algo')).rejects.toBeTruthy();

    expect(espia.vistos).toContain('auth-payment-required');
    espia.soltar();
  });

  it('una función fuera del plan NO planta el muro', async () => {
    const apiClient = await montar(falla(403, {
      error: 'FEATURE_NOT_IN_PLAN',
      message: 'El control de acceso no está incluido en el plan de este gimnasio.',
    }));
    const espia = espiarEventos();

    await expect(apiClient.get('/gym/molinete/padron')).rejects.toBeTruthy();

    // Lo central: un cliente al día no puede recibir "Renová la suscripción".
    expect(espia.vistos).not.toContain('auth-payment-required');
    espia.soltar();
  });

  it('una función fuera del plan tampoco saca al usuario de la sucursal', async () => {
    localStorage.setItem('current_org_id', 'a8712a90-cae6-4a34-a018-8821994e5ffd');
    const apiClient = await montar(falla(403, {
      error: 'FEATURE_NOT_IN_PLAN',
      message: 'El control de acceso no está incluido en el plan de este gimnasio.',
    }));
    const espia = espiarEventos();

    await expect(apiClient.get('/gym/molinete/padron')).rejects.toBeTruthy();

    // FORBIDDEN_TENANT y DEVICE_BOUND_TO_OTHER_TENANT sí limpian el contexto. Éste no:
    // la persona tiene acceso al gimnasio, solo que esa función no está contratada.
    expect(localStorage.getItem('current_org_id')).toBe('a8712a90-cae6-4a34-a018-8821994e5ffd');
    expect(espia.vistos).not.toContain('auth-forbidden-tenant');
    espia.soltar();
  });

  it('el error igual llega a quien lo pidió, para que la pantalla lo muestre', async () => {
    const apiClient = await montar(falla(403, {
      error: 'FEATURE_NOT_IN_PLAN',
      message: 'El control de acceso no está incluido en el plan de este gimnasio.',
    }));

    await expect(apiClient.get('/gym/molinete/padron')).rejects.toMatchObject({
      response: { data: { error: 'FEATURE_NOT_IN_PLAN' } },
    });
  });
});
