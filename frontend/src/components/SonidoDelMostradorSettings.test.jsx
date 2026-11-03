// @vitest-environment happy-dom
//
// ============================================
// VELTRONIK - Ajustes → Sonido del mostrador
// ============================================
// Lo que más falla del sonido no se ve: que la música baje. Esta sección lo prueba y lo dice en
// palabras de mostrador.
// ============================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

// El sonido va de mentira; la traducción de lo que pasó con la música va REAL (se prueba en
// lib/alertaSonora.test.js, y acá se ve que llega a la pantalla).
const sonido = vi.hoisted(() => ({
  probarSonido: vi.fn(), prepararSonido: vi.fn(), volumenDeAvisos: vi.fn(() => 0.8), fijarVolumenDeAvisos: vi.fn((v) => v),
}));
vi.mock('../lib/alertaSonora', async (importOriginal) => ({ ...(await importOriginal()), ...sonido }));
vi.mock('./Icon', () => ({ default: () => null }));

const { default: SonidoDelMostradorSettings } = await import('./SonidoDelMostradorSettings');

let root;
let contenedor;

async function pintar() {
  contenedor = document.createElement('div');
  document.body.appendChild(contenedor);
  root = createRoot(contenedor);
  await act(async () => { root.render(<SonidoDelMostradorSettings />); });
  await act(async () => { await Promise.resolve(); });
}

async function clic(texto) {
  const boton = [...contenedor.querySelectorAll('button')].find((b) => b.textContent.includes(texto));
  await act(async () => { boton.click(); });
  await act(async () => { await Promise.resolve(); });
}

beforeEach(() => {
  vi.clearAllMocks();
  window.electronAPI = { audio: { estado: vi.fn().mockResolvedValue({ disponible: true, listo: true, rendido: false, ultimoError: null }) } };
});

afterEach(() => {
  if (root) act(() => root.unmount());
  contenedor?.remove();
  root = null;
  contenedor = null;
  delete window.electronAPI;
});

describe('⭐ probar los avisos', () => {
  it('dice si el que baja la música está listo', async () => {
    await pintar();
    expect(contenedor.textContent).toContain('Bajar la música: listo.');
  });

  it('el botón del vencido suena y dice qué pasó con la música', async () => {
    sonido.probarSonido.mockResolvedValue(0);
    await pintar();
    await clic('Probar: socio vencido');

    expect(sonido.probarSonido).toHaveBeenCalledWith('vencido');
    expect(contenedor.textContent).toContain('No encontré música sonando');
  });

  it('si no anda en esta PC, lo dice con el motivo (y que los avisos suenan igual)', async () => {
    window.electronAPI.audio.estado.mockResolvedValue({ disponible: true, listo: false, rendido: true, ultimoError: 'PowerShell bloqueado' });
    await pintar();

    expect(contenedor.textContent).toContain('PowerShell bloqueado');
    expect(contenedor.textContent).toContain('Los avisos suenan igual');
  });
});
