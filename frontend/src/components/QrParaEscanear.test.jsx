// @vitest-environment happy-dom
// ============================================
// EL QR DE LA ENTRADA EN LA PANTALLA DEL MOSTRADOR
// ============================================
// Lo que se defiende: que se vea el código de verdad (el mismo del cartel), que siga viéndose
// sin internet (el celular del socio tiene su propia conexión) y que crearlo sea del dueño.
// ============================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../lib/apiClient', () => ({ default: api }));
vi.mock('../lib/portal', () => ({ portalUrl: (p) => `https://portal.test${p}` }));
const toast = vi.hoisted(() => ({ showToast: vi.fn() }));
vi.mock('../contexts/ToastContext', () => ({ useToast: () => toast }));
vi.mock('./Icon', () => ({ default: () => null }));
// El SVG del QR no importa acá: importa QUÉ dirección codifica.
vi.mock('qrcode.react', () => ({ QRCodeSVG: ({ value }) => <svg data-valor={value} /> }));

const { default: QrParaEscanear } = await import('./QrParaEscanear');

let root;
let container;

async function pintar(props = {}) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(<QrParaEscanear {...props} />); });
  for (let i = 0; i < 4; i += 1) await act(async () => { await Promise.resolve(); });
}

const qr = () => container.querySelector('svg[data-valor]');

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  localStorage.setItem('current_org_id', 'gym-1');
});

afterEach(() => {
  if (root) act(() => root.unmount());
  container?.remove();
});

describe('el QR para escanear', () => {
  it('⭐ muestra el mismo código que el cartel de la pared', async () => {
    api.get.mockResolvedValue({ status: 200, data: { token: 'abc123' } });
    await pintar();

    expect(api.get).toHaveBeenCalledWith('/gym/checkin-points/activo', expect.anything());
    expect(qr().dataset.valor).toBe('https://portal.test/#/marcar/abc123');
    expect(container.textContent).toContain('Escaneá para marcar tu entrada');
  });

  it('⭐ sin internet sigue mostrando el último que vio', async () => {
    api.get.mockResolvedValue({ status: 200, data: { token: 'abc123' } });
    await pintar();
    act(() => root.unmount());
    container.remove();

    api.get.mockRejectedValue(new Error('Network Error'));
    await pintar();

    expect(qr().dataset.valor, 'el celular del socio tiene su propia conexión').toContain('abc123');
  });

  it('sin internet y sin haberlo visto nunca, lo dice en vez de girar para siempre', async () => {
    api.get.mockRejectedValue(new Error('Network Error'));
    await pintar();

    expect(qr()).toBeNull();
    expect(container.textContent).toContain('Sin conexión');
  });

  it('si el gimnasio no tiene cartel, a recepción le dice quién lo crea', async () => {
    api.get.mockResolvedValue({ status: 204, data: '' });
    await pintar({ puedeCrear: false });

    expect(container.textContent).toContain('Lo crea el dueño');
    expect(container.querySelector('button')).toBeNull();
  });

  it('el dueño lo crea desde ahí mismo, y aparece', async () => {
    api.get.mockResolvedValue({ status: 204, data: '' });
    api.post.mockResolvedValue({ data: { token: 'nuevo' } });
    await pintar({ puedeCrear: true });

    await act(async () => {
      container.querySelector('button').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    for (let i = 0; i < 4; i += 1) await act(async () => { await Promise.resolve(); });

    expect(api.post).toHaveBeenCalledWith('/gym/checkin-points', {});
    expect(qr().dataset.valor).toContain('nuevo');
  });

  it('el guardado es por gimnasio: otro gimnasio en la misma PC no ve el QR del primero', async () => {
    api.get.mockResolvedValue({ status: 200, data: { token: 'del-uno' } });
    await pintar();
    act(() => root.unmount());
    container.remove();

    localStorage.setItem('current_org_id', 'gym-2');
    api.get.mockRejectedValue(new Error('Network Error'));
    await pintar();

    expect(qr()).toBeNull();
  });
});
