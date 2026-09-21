// @vitest-environment happy-dom
// ============================================
// EL MOLINETE NO SINCRONIZA SIN SUCURSAL
// ============================================
//
// `MolineteAlDia` corre fuera de las pantallas —en cualquier ruta— y sincronizaba APENAS abría
// la app. Pero el escritorio arranca borrando la sucursal a propósito (main.desktop.jsx) hasta
// que DeviceGate la confirma, así que en un gimnasio CON molinete el primer pedido
// (`GET /gym/molinete/padron`) salía sin sucursal en cada arranque. El backend lo cortaba con
// 401, el frontend lo leía como sesión muerta, renovaba, reintentaba y —si la sucursal todavía
// no había llegado— cerraba la sesión. Una carrera en cada arranque, justo en los clientes con
// molinete.
// ============================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

const sesion = { orgId: null };
const sincronizar = vi.fn(async () => ({ ok: true }));

vi.mock('../contexts/AuthContext', () => ({ useAuth: () => sesion }));
vi.mock('../lib/molinete', () => ({ sincronizarMolinete: () => sincronizar() }));

const { default: MolineteAlDia } = await import('./MolineteAlDia');

let root;
let container;

async function pintar() {
  await act(async () => { root.render(<MolineteAlDia />); });
  await act(async () => { await Promise.resolve(); });
}

beforeEach(() => {
  vi.clearAllMocks();
  sesion.orgId = null;
  window.electronAPI = { molinete: {} };
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  delete window.electronAPI;
});

describe('el molinete espera la sucursal', () => {
  it('⭐ sin sucursal no sale ningún pedido', async () => {
    await pintar();
    expect(sincronizar).not.toHaveBeenCalled();
  });

  it('apenas llega la sucursal, sincroniza', async () => {
    await pintar();
    sesion.orgId = '11111111-1111-1111-1111-111111111111';
    await pintar();
    expect(sincronizar).toHaveBeenCalledTimes(1);
  });

  it('en la web (sin molinete) no hace nada, haya sucursal o no', async () => {
    delete window.electronAPI;
    sesion.orgId = '11111111-1111-1111-1111-111111111111';
    await pintar();
    expect(sincronizar).not.toHaveBeenCalled();
  });
});
