// @vitest-environment happy-dom
//
// ============================================
// VELTRONIK - La puerta del arranque: sin sucursal no se dibuja el sistema
// ============================================
// EL BUG QUE FIJA, y lo encontró el dueño mirando la consola con internet:
//
//     GET /api/gym/dashboard/retention  →  401 (Unauthorized)
//
// No era el token —Spring, cuando rechaza un token, manda `WWW-Authenticate`, y ahí no
// estaba—. Era el `KillSwitchFilter` cortando el pedido con "Falta contexto de negocio":
// había llegado SIN sucursal.
//
// La causa está a la vista y es deliberada: `main.desktop.jsx` borra `current_org_id` ANTES
// de montar nada, porque a qué sucursal pertenece el equipo lo manda el enrolamiento y no la
// memoria del navegador. Eso abre una ventana en la que la app no sabe en qué gimnasio está.
//
// Había una guarda para eso en AuthContext, pero llegaba tarde: EN REACT LOS EFECTOS DE LOS
// HIJOS CORREN ANTES QUE LOS DEL PADRE, así que la pantalla ya había pedido sus datos cuando
// el padre se enteraba de que había que redirigir.
//
// Se veía sano porque el reintento salía después, ya con sucursal. Pero no se curaba por el
// reintento: se curaba por suerte de timing. Y en producción el vaciador de la cola quemaba
// dos intentos en cada arranque por lo mismo.
// ============================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

const sesion = {
  loading: false,
  subscription: null,
  gym: null,
  orgName: 'Gimnasio',
  orgId: '11111111-1111-1111-1111-111111111111',
};

vi.mock('../contexts/AuthContext', () => ({ useAuth: () => sesion }));
vi.mock('./Sidebar', () => ({ default: () => <nav data-testid="sidebar" /> }));
vi.mock('../hooks/useVersionNueva', () => ({ useVersionNueva: () => false }));
vi.mock('react-router-dom', () => ({
  Outlet: () => <div data-testid="pantalla">la pantalla de operación</div>,
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/retention' }),
}));

const { AppLayout } = await import('./Layout');

let root;
let container;

async function montar() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(<AppLayout />); });
}

beforeEach(() => {
  vi.clearAllMocks();
  sesion.loading = false;
  sesion.orgId = '11111111-1111-1111-1111-111111111111';
  document.body.innerHTML = '';
});

describe('sin sucursal no se dibuja nada del sistema', () => {
  it('⭐ con sucursal todavía sin resolver, la pantalla NO se monta', async () => {
    // Si se montara, pediría sus datos sin `X-Tenant-ID` y se comería un 401.
    sesion.orgId = null;

    await montar();

    expect(container.querySelector('[data-testid="pantalla"]'),
      'montarla es exactamente lo que dispara el pedido sin sucursal').toBeNull();
    expect(container.querySelector('.loading-overlay'),
      'mientras tanto se espera, no se dibuja a medias').not.toBeNull();
  });

  it('con la sucursal ya resuelta, dibuja normal', async () => {
    await montar();

    expect(container.querySelector('[data-testid="pantalla"]')).not.toBeNull();
    expect(container.querySelector('.loading-overlay')).toBeNull();
  });

  it('⚠️ esperar no es colgarse: apenas aparece la sucursal, dibuja', async () => {
    // La salida de emergencia real es el efecto de AuthContext, que manda al DeviceGate si
    // no hay sucursal. Este test fija la otra mitad: que cuando llega, la espera termina.
    sesion.orgId = null;
    await montar();
    expect(container.querySelector('[data-testid="pantalla"]')).toBeNull();

    sesion.orgId = '22222222-2222-2222-2222-222222222222';
    await act(async () => { root.render(<AppLayout />); });

    expect(container.querySelector('[data-testid="pantalla"]')).not.toBeNull();
  });

  it('la sesión todavía cargando también espera', async () => {
    sesion.loading = true;

    await montar();

    expect(container.querySelector('[data-testid="pantalla"]')).toBeNull();
  });
});
