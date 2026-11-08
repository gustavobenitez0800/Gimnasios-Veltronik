// ============================================
// VELTRONIK - La ventana del mostrador (08/11/2026)
// ============================================
// La consola de desarrollador no se abre en el programa instalado: desde ahí se lee la sesión
// del dueño, se saltea la clave para cobrar y se pide la bóveda de la PC.
// ============================================

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { preferenciasDeLaVentana, consolaPermitida } = require('./ventana.cjs');

describe('la consola de desarrollador', () => {
  it('🔴 en el programa instalado, no', () => {
    expect(consolaPermitida(true, {})).toBe(false);
    expect(consolaPermitida(true, { VELTRONIK_CONSOLA: '0' })).toBe(false);
    expect(consolaPermitida(true, { VELTRONIK_CONSOLA: 'si' })).toBe(false);
  });

  it('para soporte, solo con VELTRONIK_CONSOLA=1 en esa PC', () => {
    expect(consolaPermitida(true, { VELTRONIK_CONSOLA: '1' })).toBe(true);
  });

  it('en desarrollo, siempre', () => {
    expect(consolaPermitida(false, {})).toBe(true);
  });

  it('sin consola, Chromium la apaga (no alcanza con sacarla del menú)', () => {
    expect(preferenciasDeLaVentana({ consola: false }).devTools).toBe(false);
    expect(preferenciasDeLaVentana({ consola: true }).devTools).toBe(true);
  });
});

describe('lo que no se negocia de la ventana', () => {
  it('aislada: sin Node en la página, con contexto separado y sandbox', () => {
    const p = preferenciasDeLaVentana({ consola: false });
    expect(p.nodeIntegration).toBe(false);
    expect(p.contextIsolation).toBe(true);
    expect(p.sandbox).toBe(true);
  });
});
