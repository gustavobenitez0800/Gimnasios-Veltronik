import { describe, it, expect, vi, beforeEach } from 'vitest';

const { crearInstaladorSolo, convieneInstalar, AL_ABRIR_S, SIN_USAR_S, MAX_INTENTOS } = await import('./instalarSola.cjs');

let reloj;
let sinUsar;
let disco;
let instalar;
let programado;

function armar(extra = {}) {
  return crearInstaladorSolo({
    powerMonitor: { getSystemIdleTime: () => sinUsar },
    instalar,
    carpeta: 'C:/datos',
    arrancoEn: 0,
    ahora: () => reloj,
    programar: (fn) => { programado = fn; return 1; },
    cancelar: () => { programado = null; },
    leer: () => { if (disco == null) throw new Error('no existe'); return disco; },
    escribir: (_ruta, contenido) => { disco = contenido; },
    ...extra,
  });
}

beforeEach(() => {
  reloj = 0;
  sinUsar = 0;
  disco = null;
  instalar = vi.fn();
  programado = null;
});

describe('la versión nueva se instala sola', () => {
  it('la regla: al abrir, o con la PC un rato sin usar', () => {
    expect(convieneInstalar({ segundosAbierta: 30, segundosSinUsar: 0 })).toBe('al-abrir');
    expect(convieneInstalar({ segundosAbierta: AL_ABRIR_S + 1, segundosSinUsar: 10 })).toBeNull();
    expect(convieneInstalar({ segundosAbierta: 3600, segundosSinUsar: SIN_USAR_S })).toBe('sin-usar');
  });

  it('⭐ lo que ya estaba bajado se instala apenas abre la app (la mañana siguiente)', () => {
    reloj = 20_000; // 20 segundos después de abrir
    armar().listo('2.6.39');
    expect(instalar).toHaveBeenCalledTimes(1);
  });

  it('⭐ con alguien atendiendo NO se instala; cuando la PC queda sin usar, sí', () => {
    reloj = 2 * 3600 * 1000; // la app lleva dos horas abierta
    sinUsar = 30;             // y alguien la tocó hace medio minuto
    armar().listo('2.6.39');
    expect(instalar).not.toHaveBeenCalled();

    sinUsar = SIN_USAR_S + 5;
    programado();
    expect(instalar).toHaveBeenCalledTimes(1);
  });

  it('⚠️ si ya se intentó y la app sigue vieja (un antivirus la frena), no insiste en cada arranque', () => {
    disco = JSON.stringify({ version: '2.6.39', intentos: MAX_INTENTOS });
    reloj = 10_000;
    armar().listo('2.6.39');
    expect(instalar, 'queda el botón para hacerlo a mano').not.toHaveBeenCalled();
    expect(programado, 'y no queda mirando').toBeNull();
  });

  it('anota el intento antes de instalar, por versión', () => {
    reloj = 10_000;
    armar().listo('2.6.39');
    expect(JSON.parse(disco)).toMatchObject({ version: '2.6.39', intentos: 1 });
  });

  it('una versión más nueva vuelve a tener sus intentos', () => {
    disco = JSON.stringify({ version: '2.6.38', intentos: MAX_INTENTOS });
    reloj = 10_000;
    armar().listo('2.6.39');
    expect(instalar).toHaveBeenCalledTimes(1);
  });

  it('sin poder leer si la PC está sin usar, no se arriesga a reiniciar a mitad de un cobro', () => {
    reloj = 2 * 3600 * 1000;
    armar({ powerMonitor: { getSystemIdleTime: () => { throw new Error('sin powerMonitor'); } } }).listo('2.6.39');
    programado?.();
    expect(instalar).not.toHaveBeenCalled();
  });
});
