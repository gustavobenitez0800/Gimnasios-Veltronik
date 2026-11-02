// ============================================
// VELTRONIK - ¿Fue un lector o una persona? (ADR-016 §3)
// ============================================
// Con tiempos falsos: el lector escribe cada 4–15 ms; una persona rápida, cada 80–150.
// ============================================

import { describe, it, expect } from 'vitest';
import { crearDetectorDeRafagas, MAX_INTERVALO_MS } from './rafagaDelLector';

/** Escribe `texto` empezando en `desde`, una tecla cada `cada` ms, y devuelve lo que dijo el Enter. */
function escribir(detector, texto, { desde = 1000, cada = 5, enterDespues = cada } = {}) {
  let t = desde;
  for (const c of texto) {
    expect(detector.tecla(c, t)).toBeNull();
    t += cada;
  }
  return detector.tecla('Enter', t - cada + enterDespues);
}

describe('la ráfaga del lector', () => {
  it('⭐ diez dígitos a ritmo de lector y un Enter: es un llavero, con los ceros', () => {
    expect(escribir(crearDetectorDeRafagas(), '0012345678')).toEqual({ codigo: '0012345678' });
  });

  it('⭐ una persona tecleando su DNI rápido sigue siendo una persona', () => {
    expect(escribir(crearDetectorDeRafagas(), '24732531', { cada: 90 })).toBeNull();
  });

  it('con el USB cargado (30 ms entre teclas) todavía es un lector', () => {
    expect(escribir(crearDetectorDeRafagas(), '0012345678', { cada: 30 })).toEqual({ codigo: '0012345678' });
  });

  it('el lector que espera un poco antes del Enter también cuenta', () => {
    expect(escribir(crearDetectorDeRafagas(), '0012345678', { enterDespues: 120 })).toEqual({ codigo: '0012345678' });
  });

  it('⭐ lo que alguien escribió antes no se pega al llavero', () => {
    const d = crearDetectorDeRafagas();
    // La recepcionista escribió "pe" y se distrajo; dos segundos después pasa un socio.
    d.tecla('p', 0);
    d.tecla('e', 150);
    expect(escribir(d, '0012345678', { desde: 2000 })).toEqual({ codigo: '0012345678' });
  });

  it('pocos caracteres, por rápidos que sean, no son un llavero', () => {
    expect(escribir(crearDetectorDeRafagas(), '12345')).toBeNull();
  });

  it('un Enter que llega mucho después ya no es del lector', () => {
    expect(escribir(crearDetectorDeRafagas(), '0012345678', { enterDespues: 800 })).toBeNull();
  });

  it('las teclas que no escriben (Shift, flechas) no arman ni rompen la ráfaga', () => {
    const d = crearDetectorDeRafagas();
    let t = 0;
    for (const c of '00123') { d.tecla(c, t); t += 5; }
    expect(d.tecla('Shift', t)).toBeNull();
    for (const c of '45678') { d.tecla(c, t); t += 5; }
    expect(d.tecla('Enter', t)).toEqual({ codigo: '0012345678' });
  });

  it('después de un Enter arranca de cero', () => {
    const d = crearDetectorDeRafagas();
    expect(escribir(d, '0012345678')).toEqual({ codigo: '0012345678' });
    expect(d.tecla('Enter', 2000)).toBeNull();
    expect(escribir(d, '0087654321', { desde: 3000 })).toEqual({ codigo: '0087654321' });
  });

  it('reiniciar descarta la ráfaga a medias', () => {
    const d = crearDetectorDeRafagas();
    for (const [i, c] of [...'0012345678'].entries()) d.tecla(c, i * 5);
    d.reiniciar();
    expect(d.tecla('Enter', 60)).toBeNull();
  });

  it('el límite entre lector y persona está escrito una sola vez', () => {
    expect(MAX_INTERVALO_MS).toBeLessThan(80);
  });
});
