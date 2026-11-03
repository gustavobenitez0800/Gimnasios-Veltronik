// @vitest-environment happy-dom
//
// ============================================
// VELTRONIK - Los que necesitan atención, con «Cobrar» (03/11/2026)
// ============================================
// Antes el aviso tenía un solo botón, «OK», y para cobrarle al socio había que irse a Socios a
// buscarlo. Ahora trae «Cobrar», y dice por dónde entró (el QR, el llavero, el molinete).
// ============================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

const accessService = vi.hoisted(() => ({ marcarAvisoVisto: vi.fn(), marcarRechazoVisto: vi.fn() }));
vi.mock('../services', () => ({ accessService }));
vi.mock('./Icon', () => ({ default: () => null }));

const { default: AvisosMostrador } = await import('./AvisosMostrador');

let root;
let contenedor;

async function pintar(props) {
  contenedor = document.createElement('div');
  document.body.appendChild(contenedor);
  root = createRoot(contenedor);
  await act(async () => { root.render(<AvisosMostrador {...props} />); });
}

const botones = () => [...contenedor.querySelectorAll('button')].map((b) => b.textContent.trim());
const aviso = (extra) => ({
  accesoId: 'a1', socioId: 'm1', nombre: 'Ana Paz', estado: 'VENCIDO', diasVencido: 4, hora: '2026-11-03T10:15:00', ...extra,
});

afterEach(() => {
  if (root) act(() => root.unmount());
  contenedor?.remove();
  root = null;
});

describe('⭐ cobrarle desde el aviso', () => {
  it('«Cobrar» al lado del «OK», y le pasa el aviso y de qué lista es', async () => {
    const onCobrar = vi.fn();
    await pintar({ avisos: [aviso()], onCobrar });

    expect(botones()).toEqual(['Cobrar', 'OK']);
    await act(async () => { contenedor.querySelector('button').click(); });
    expect(onCobrar).toHaveBeenCalledWith(expect.objectContaining({ accesoId: 'a1' }), 'entrada');
  });

  it('al frenado que ya está al día (pagó recién) no se le ofrece cobrar', async () => {
    await pintar({ avisos: [aviso({ estado: 'AL_DIA' })], onCobrar: vi.fn(), variante: 'rechazo' });
    expect(botones()).toEqual(['OK']);
  });

  it('sin `onCobrar` (una pantalla que no cobra) queda el «OK» solo, como antes', async () => {
    await pintar({ avisos: [aviso()] });
    expect(botones()).toEqual(['OK']);
  });
});

describe('dice por dónde entró', () => {
  it.each([
    ['LLAVERO', 'entró con el llavero'],
    ['QR', 'entró con el QR'],
    ['FACIAL', 'entró por el molinete'],
  ])('%s → «%s»', async (metodo, frase) => {
    await pintar({ avisos: [aviso({ metodo })] });
    expect(contenedor.textContent).toContain(frase);
  });

  it('un servidor viejo (sin método) dice la hora, como antes', async () => {
    await pintar({ avisos: [aviso()] });
    expect(contenedor.textContent).toContain('· entró 10:15');
  });
});
