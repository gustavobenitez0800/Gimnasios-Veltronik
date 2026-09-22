// @vitest-environment happy-dom
// ============================================
// LA "X" DEL SOCIO VENCIDO
// ============================================
// Lo que se defiende: que suene solo en el escritorio, que baje la música ANTES de sonar, y
// que dos vencidos seguidos no hagan una ametralladora de X.
// ============================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const config = vi.hoisted(() => ({ IS_DESKTOP: true }));
vi.mock('./config', () => ({ default: config }));

const { sonarVencido, _reiniciarParaTests } = await import('./alertaSonora');

/** Un AudioContext de mentira: cuenta osciladores, que es lo único que importa acá. */
function audioFalso() {
  const osciladores = [];
  const param = () => ({ value: 0, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() });
  const nodo = () => ({ connect: vi.fn(), gain: param(), frequency: param(), type: '' });
  class Contexto {
    constructor() { this.state = 'running'; this.currentTime = 0; this.destination = {}; }
    createGain() { return nodo(); }
    createBiquadFilter() { return nodo(); }
    createOscillator() { const o = { ...nodo(), start: vi.fn(), stop: vi.fn() }; osciladores.push(o); return o; }
    resume() { return Promise.resolve(); }
  }
  return { Contexto, osciladores };
}

let audio;
let bajarMusica;

beforeEach(() => {
  vi.useFakeTimers();
  _reiniciarParaTests();
  config.IS_DESKTOP = true;
  audio = audioFalso();
  window.AudioContext = audio.Contexto;
  bajarMusica = vi.fn(() => Promise.resolve(true));
  window.electronAPI = { audio: { bajarMusica } };
});

afterEach(() => {
  vi.useRealTimers();
  delete window.electronAPI;
});

describe('la X del socio vencido', () => {
  it('⭐ baja la música y DESPUÉS suena: si sonara primero, la tapa la música', () => {
    expect(sonarVencido(null, 10_000)).toBe(true);

    expect(bajarMusica).toHaveBeenCalledWith(900);
    expect(audio.osciladores, 'todavía no: espera a que la música baje').toHaveLength(0);

    vi.advanceTimersByTime(150);
    expect(audio.osciladores, 'dos zumbidos: la X').toHaveLength(2);
  });

  it('dos vencidos seguidos suenan una sola vez', () => {
    expect(sonarVencido('a', 10_000)).toBe(true);
    expect(sonarVencido('b', 10_500)).toBe(false);
    expect(sonarVencido('b', 12_000), 'pasado el momento, vuelve a sonar').toBe(true);
    expect(bajarMusica).toHaveBeenCalledTimes(2);
  });

  it('⭐ el mismo socio no suena dos veces seguidas, aunque llegue por dos caminos', () => {
    expect(sonarVencido('socio-1', 10_000)).toBe(true);
    expect(sonarVencido('socio-1', 15_000), 'cinco segundos después: la misma entrada otra vez').toBe(false);
    expect(sonarVencido('socio-1', 60_000), 'un minuto después, tampoco').toBe(false);
    expect(sonarVencido('socio-2', 15_000), 'otro socio sí suena').toBe(true);
    expect(sonarVencido('socio-1', 10_000 + 91_000), 'pasado el minuto y medio, vuelve').toBe(true);
  });

  it('en el portal web no suena: el dueño lo mira desde otro lado', () => {
    config.IS_DESKTOP = false;

    expect(sonarVencido(null, 10_000)).toBe(false);
    vi.advanceTimersByTime(500);
    expect(bajarMusica).not.toHaveBeenCalled();
    expect(audio.osciladores).toHaveLength(0);
  });

  it('⭐ si no se puede bajar la música, la X suena igual', () => {
    window.electronAPI = { audio: { bajarMusica: vi.fn(() => Promise.reject(new Error('sin ayudante'))) } };

    sonarVencido(null, 10_000);
    vi.advanceTimersByTime(150);

    expect(audio.osciladores).toHaveLength(2);
  });

  it('sin el puente del escritorio (una versión vieja) también suena', () => {
    delete window.electronAPI;

    sonarVencido(null, 10_000);
    vi.advanceTimersByTime(150);

    expect(audio.osciladores).toHaveLength(2);
  });

  it('una PC sin audio no rompe nada', () => {
    delete window.AudioContext;

    expect(() => { sonarVencido(null, 10_000); vi.advanceTimersByTime(150); }).not.toThrow();
  });
});
