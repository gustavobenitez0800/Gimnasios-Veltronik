// @vitest-environment happy-dom
// ============================================
// LOS SONIDOS DEL MOSTRADOR
// ============================================
// Lo que se defiende: que suenen solo en el escritorio, que la X espere a que la música BAJE
// (sin quedarse colgada si no baja), que lo que hace una persona suene siempre, y que lo que llega
// solo (QR, molinete) no haga una ametralladora de X.
// ============================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const config = vi.hoisted(() => ({ IS_DESKTOP: true }));
vi.mock('./config', () => ({ default: config }));

const {
  sonarVencido, sonarVencidoDirecto, sonarEntrada, sonarLlaveroDesconocido, probarSonido, prepararSonido,
  volumenDeAvisos, fijarVolumenDeAvisos, queHizoLaMusica, _reiniciarParaTests,
} = await import('./alertaSonora');

/** Un AudioContext de mentira: cuenta osciladores y guarda el volumen de salida. */
function audioFalso() {
  const osciladores = [];
  const salidas = [];
  const param = () => ({ value: 0, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() });
  const nodo = () => ({ connect: vi.fn(), gain: param(), frequency: param(), type: '' });
  class Contexto {
    constructor() { this.state = 'running'; this.currentTime = 0; this.destination = {}; Contexto.creados += 1; }
    createGain() { const g = nodo(); salidas.push(g); return g; }
    createBiquadFilter() { return nodo(); }
    createOscillator() { const o = { ...nodo(), start: vi.fn(), stop: vi.fn() }; osciladores.push(o); return o; }
    resume() { return Promise.resolve(); }
  }
  Contexto.creados = 0;
  return { Contexto, osciladores, salidas };
}

let audio;
let bajarMusica;

/** Deja correr las promesas y los plazos pendientes. */
const avanzar = (ms = 0) => vi.advanceTimersByTimeAsync(ms);

beforeEach(() => {
  vi.useFakeTimers();
  _reiniciarParaTests();
  localStorage.clear();
  config.IS_DESKTOP = true;
  audio = audioFalso();
  window.AudioContext = audio.Contexto;
  bajarMusica = vi.fn(() => Promise.resolve(1));
  window.electronAPI = { audio: { bajarMusica } };
});

afterEach(() => {
  vi.useRealTimers();
  delete window.electronAPI;
});

describe('la X del socio vencido', () => {
  it('⭐ baja la música y suena RECIÉN cuando el escritorio contesta que bajó', async () => {
    let contestar;
    bajarMusica.mockReturnValue(new Promise((r) => { contestar = r; }));

    expect(sonarVencido(null, 10_000)).toBe(true);
    expect(bajarMusica).toHaveBeenCalledWith(950);
    await avanzar(200);
    expect(audio.osciladores, 'la música todavía no bajó').toHaveLength(0);

    contestar(1);
    await avanzar(0);
    expect(audio.osciladores.length, 'la chicharra: dos pulsos de dos voces').toBe(4);
  });

  it('⭐ si la música no contesta, no se queda esperando: suena al medio segundo', async () => {
    bajarMusica.mockReturnValue(new Promise(() => {}));

    sonarVencido(null, 10_000);
    await avanzar(499);
    expect(audio.osciladores).toHaveLength(0);
    await avanzar(1);
    expect(audio.osciladores.length).toBe(4);
  });

  it('dos vencidos casi juntos suenan una sola vez', async () => {
    expect(sonarVencido('a', 10_000)).toBe(true);
    expect(sonarVencido('b', 10_500)).toBe(false);
    expect(sonarVencido('b', 12_000), 'pasado el momento, vuelve a sonar').toBe(true);
  });

  it('⭐ lo que llega solo (QR, molinete) no suena dos veces por el mismo socio en 20 s', () => {
    expect(sonarVencido('socio-1', 10_000)).toBe(true);
    expect(sonarVencido('socio-1', 15_000), 'la misma entrada que llega otra vez').toBe(false);
    expect(sonarVencido('socio-2', 17_000), 'otro socio sí suena').toBe(true);
    expect(sonarVencido('socio-1', 31_000), 'pasados los 20 s, vuelve').toBe(true);
  });

  it('⭐ lo que hace una persona en el mostrador suena SIEMPRE, aunque sea el mismo socio', () => {
    // Era el bug: con la ventana de 90 s, el socio que volvía a entrar (o la prueba en el
    // mostrador) quedaba en silencio, y parecía que el sonido «anda muy rara vez».
    expect(sonarVencido('socio-1', 10_000, { directo: true })).toBe(true);
    expect(sonarVencido('socio-1', 12_000, { directo: true })).toBe(true);
    expect(sonarVencido('socio-1', 14_000, { directo: true })).toBe(true);
  });

  it('el atajo de Accesos para lo que hace una persona usa la hora de ahora y suena siempre', () => {
    vi.setSystemTime(100_000);
    expect(sonarVencidoDirecto('socio-1')).toBe(true);
    vi.setSystemTime(102_000);
    expect(sonarVencidoDirecto('socio-1'), 'el mismo socio, dos segundos después').toBe(true);
  });

  it('en el portal web no suena: el dueño lo mira desde otro lado', async () => {
    config.IS_DESKTOP = false;

    expect(sonarVencido(null, 10_000)).toBe(false);
    expect(sonarEntrada()).toBe(false);
    await avanzar(600);
    expect(bajarMusica).not.toHaveBeenCalled();
    expect(audio.osciladores).toHaveLength(0);
  });

  it('⭐ si no se puede bajar la música, la X suena igual', async () => {
    bajarMusica.mockReturnValue(Promise.reject(new Error('sin ayudante')));

    sonarVencido(null, 10_000);
    await avanzar(0);

    expect(audio.osciladores.length).toBe(4);
  });

  it('sin el puente del escritorio (una versión vieja) también suena', async () => {
    delete window.electronAPI;

    sonarVencido(null, 10_000);
    await avanzar(0);

    expect(audio.osciladores.length).toBe(4);
  });

  it('una PC sin audio no rompe nada', async () => {
    delete window.AudioContext;

    expect(() => sonarVencido(null, 10_000)).not.toThrow();
    await avanzar(600);
  });
});

describe('los otros avisos', () => {
  it('⭐ la entrada con llavero hace «din-din» al instante y no toca la música', async () => {
    expect(sonarEntrada()).toBe(true);
    await avanzar(0);

    expect(audio.osciladores).toHaveLength(2);
    expect(bajarMusica).not.toHaveBeenCalled();
  });

  it('el llavero sin dueño baja la música y pita dos veces', async () => {
    expect(sonarLlaveroDesconocido()).toBe(true);
    await avanzar(0);

    expect(bajarMusica).toHaveBeenCalled();
    expect(audio.osciladores).toHaveLength(2);
  });

  it('⭐ «Probar» dice qué pasó con la música: cuántos programas bajó', async () => {
    bajarMusica.mockResolvedValue(0);
    const resultado = probarSonido('vencido');
    await avanzar(0);

    await expect(resultado).resolves.toBe(0);
    await expect(probarSonido('entrada')).resolves.toBeNull();
  });

  it('lo que pasó con la música, dicho para el mostrador', () => {
    expect(queHizoLaMusica(1).texto).toContain('1 programa ');
    expect(queHizoLaMusica(2).ok).toBe(true);
    expect(queHizoLaMusica(0).texto, 'la música sale de otro aparato').toContain('otro aparato');
    expect(queHizoLaMusica(-1).ok).toBe(false);
    expect(queHizoLaMusica(null), 'el «din-din» no toca la música').toBeNull();
  });

  it('el audio se prepara al abrir Accesos, una sola vez', () => {
    prepararSonido();
    prepararSonido();
    expect(audio.Contexto.creados).toBe(1);
  });
});

describe('el volumen de los avisos', () => {
  it('es de cada PC, entre 20% y 100%, y se usa al sonar', async () => {
    expect(volumenDeAvisos()).toBe(0.8);
    expect(fijarVolumenDeAvisos(5)).toBe(1);
    expect(fijarVolumenDeAvisos(0.05)).toBe(0.2);
    fijarVolumenDeAvisos(0.5);

    sonarEntrada();
    await avanzar(0);

    expect(audio.salidas[0].gain.value).toBeCloseTo(0.5 * 0.55);
  });
});
