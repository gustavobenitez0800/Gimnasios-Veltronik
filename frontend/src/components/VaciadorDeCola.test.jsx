// @vitest-environment happy-dom
//
// ============================================
// VELTRONIK - Tests del vaciado de la cola
// ============================================
// ⚠️ ESTE COMPONENTE EXISTE POR UN AGUJERO QUE TENÍA LA PRIMERA VERSIÓN. El vaciado vivía en
// la pantalla de Acceso, así que solo corría mientras ESA pantalla estuviera abierta: un
// terminal que quedó en el Dashboard cuando volvió el internet se guardaba las visitas
// adentro hasta que a alguien se le ocurriera volver al mostrador. Y como no avisa nada,
// podían pasar días.
//
// Lo que hay en esa cola son visitas reales que el gimnasio TODAVÍA NO TIENE en ningún otro
// lado. Que suban no puede depender de en qué pantalla quedó parado el terminal — y eso es
// exactamente lo que fijan estos tests.
// ============================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

const toast = { showToast: vi.fn() };
const accessService = { enviarEncolado: vi.fn() };
const cola = { vaciar: vi.fn(), disponible: vi.fn(() => true) };

vi.mock('../contexts/ToastContext', () => ({ useToast: () => toast }));
vi.mock('../services', () => ({ accessService }));
vi.mock('../lib/colaAccesos', () => ({
  vaciar: (...a) => cola.vaciar(...a),
  disponible: () => cola.disponible(),
}));

const { default: VaciadorDeCola, EVENTO_COLA_CAMBIO } = await import('./VaciadorDeCola');

/** Pone (o saca) la máquina en modo "sin red". */
function sinRed(hay) {
  Object.defineProperty(window.navigator, 'onLine', { value: hay, configurable: true });
}

let root;
let container;

async function montar() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(<VaciadorDeCola />); });
  await act(async () => { await Promise.resolve(); });
}

beforeEach(() => {
  vi.clearAllMocks();
  cola.disponible.mockReturnValue(true);
  cola.vaciar.mockResolvedValue({ enviados: 0, quedan: 0, descartados: 0 });
  sinRed(true);
});

describe('el vaciado corre esté abierta la pantalla que esté', () => {
  it('intenta apenas monta, sin que nadie abra el mostrador', async () => {
    await montar();
    expect(cola.vaciar).toHaveBeenCalledTimes(1);
  });

  it('vuelve a intentar cuando el navegador avisa que volvió la red', async () => {
    await montar();
    cola.vaciar.mockClear();

    await act(async () => { window.dispatchEvent(new Event('online')); });
    await act(async () => { await Promise.resolve(); });

    expect(cola.vaciar).toHaveBeenCalled();
  });

  it('sin red NO intenta: serían pedidos condenados a fallar', async () => {
    sinRed(false);
    await montar();
    expect(cola.vaciar).not.toHaveBeenCalled();
  });

  it('en la web no hace nada: ahí no hay cola', async () => {
    cola.disponible.mockReturnValue(false);
    await montar();
    expect(cola.vaciar).not.toHaveBeenCalled();
  });
});

describe('lo que le cuenta al resto de la app', () => {
  it('avisa por evento para que el mostrador vuelva a contar', async () => {
    const oido = vi.fn();
    window.addEventListener(EVENTO_COLA_CAMBIO, oido);

    await montar();

    expect(oido).toHaveBeenCalled();
    window.removeEventListener(EVENTO_COLA_CAMBIO, oido);
  });

  it('cuando sube algo lo dice, y en singular si fue una sola', async () => {
    cola.vaciar.mockResolvedValue({ enviados: 1, quedan: 0, descartados: 0 });
    await montar();

    const mensaje = toast.showToast.mock.calls.at(-1)?.[0] || '';
    expect(mensaje).toContain('1');
    expect(mensaje).toMatch(/registró/);
    expect(mensaje).not.toMatch(/registraron/);
  });

  it('si no subió nada, no molesta a nadie', async () => {
    await montar();
    expect(toast.showToast).not.toHaveBeenCalled();
  });

  it('un vaciado que explota no rompe la app: la cola se reintenta sola', async () => {
    cola.vaciar.mockRejectedValue(new Error('lo que sea'));
    const oido = vi.fn();
    window.addEventListener(EVENTO_COLA_CAMBIO, oido);

    await montar();

    expect(container.innerHTML, 'no dibuja nada, ni siquiera cuando falla').toBe('');
    expect(oido, 'y avisa igual: quizá alcanzó a subir algo antes de fallar').toHaveBeenCalled();
    window.removeEventListener(EVENTO_COLA_CAMBIO, oido);
  });
});
