// ============================================
// LA CAJITA DEL MOLINETE (lib/cajitaMolinete)
// ============================================
// Con una placa de mentira que se porta como la de verdad: contesta el PING con su versión,
// guarda el modo y el tiempo, y tiene la consola de MicroPython (Ctrl-C, Ctrl-A, Ctrl-D) por la
// que se le instala el programa. Lo que se prueba es lo que va a pasar en la puerta y lo que
// hace quien instala una cajita nueva.
// ============================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import PROGRAMA from '../../firmware/cajita-molinete/main.py?raw';
import {
  conectarCajita, ordenarALaCajita, abrirSiPasa, fijarHabilitacion, fijarAbrirEnLaSalida,
  configurarCajita, programarCajita, estadoDeLaCajita, suscribirseALaCajita, _reiniciarCajita,
  VERSION_DEL_PROGRAMA, FILTRO_CAJITA,
} from './cajitaMolinete';

const texto = (bytes) => new TextDecoder().decode(bytes);

/**
 * Una placa enchufada.
 *   version: el programa que tiene adentro (1 = el primero, 2 = el de ahora, 0 = ninguno: solo
 *            MicroPython, como una cajita recién armada).
 *   micropython: false = otra cosa con el mismo chip, que no tiene consola.
 */
function placa({ vendorId = 0x2e8a, productId = 0x0005, version = 2, micropython = true } = {}) {
  let salida;
  const decir = (t) => salida.enqueue(new TextEncoder().encode(t));
  const p = {
    enviados: [],
    programa: null,
    config: { modo: 'SOSTENER', abrirMs: 5000 },
    version,
    // null = corriendo el programa; 'consola' = la de MicroPython (>>>); 'cruda' = Ctrl-A
    repl: version === 0 ? 'consola' : null,
    getInfo: () => ({ usbVendorId: vendorId, usbProductId: productId }),
    // Como un puerto de verdad: cada open() trae lectura y escritura nuevas.
    open: vi.fn(async () => { abrirFlujos(); }),
    close: vi.fn(async () => {}),
  };
  let renglon = '';
  let cruda = '';
  const atender = (l) => {
    const [orden, arg] = l.trim().split(/\s+/);
    if (orden === 'PING') decir(`PONG veltronik-molinete ${p.version}\r\n`);
    else if (orden === 'ESTADO' && p.version >= 2) {
      decir(`ESTADO TRABADO MODO=${p.config.modo} ABRIR_MS=${p.config.abrirMs} veltronik-molinete ${p.version}\r\n`);
    } else if (orden === 'MODO' && p.version >= 2) { p.config.modo = arg; decir(`OK MODO ${arg}\r\n`); }
    else if (orden === 'TIEMPO' && p.version >= 2) { p.config.abrirMs = Number(arg); decir(`OK TIEMPO ${arg}\r\n`); }
    else if (['ABRIR', 'TRABAR', 'LIBRE'].includes(orden)) decir('OK\r\n');
  };
  const escribir = {
    write(chunk) {
      const t = texto(chunk);
      p.enviados.push(t);
      if (!micropython) return;
      for (const ch of t) {
        if (ch === '\x03') { p.repl = 'consola'; decir('\r\nKeyboardInterrupt\r\n>>> '); continue; }
        if (p.repl === 'consola') {
          if (ch === '\x01') { p.repl = 'cruda'; cruda = ''; decir('raw REPL; CTRL-B to exit\r\n>'); }
          if (ch === '\x04') {
            // Reinicio suave: arranca main.py, si hay uno nuestro.
            if (p.programa) p.version = Number(/veltronik-molinete (\d+)/.exec(p.programa)[1]);
            p.repl = p.version ? null : 'consola';
            decir('MPY: soft reboot\r\n');
          }
          continue;
        }
        if (p.repl === 'cruda') {
          if (ch === '\x04') {
            const m = /f\.write\(("(?:[^"\\]|\\.)*")\)/s.exec(cruda);
            if (m) p.programa = JSON.parse(m[1]);
            decir(`OK${m ? 'GUARDADO\r\n' : ''}\x04\x04>`);
            cruda = '';
          } else if (ch === '\x02') { p.repl = 'consola'; decir('\r\n>>> '); } else cruda += ch;
          continue;
        }
        if (ch === '\n' || ch === '\r') { if (renglon) atender(renglon); renglon = ''; } else renglon += ch;
      }
    },
  };
  function abrirFlujos() {
    p.readable = new ReadableStream({ start(c) { salida = c; } });
    p.writable = new WritableStream(escribir);
  }
  abrirFlujos();
  return p;
}

function enchufar(...placas) {
  const oyentes = {};
  const serial = {
    getPorts: vi.fn(async () => placas),
    requestPort: vi.fn(async () => { throw new Error('nadie eligió'); }),
    addEventListener: vi.fn((tipo, fn) => { oyentes[tipo] = fn; }),
    oyentes,
  };
  vi.stubGlobal('navigator', { serial });
  return serial;
}

beforeEach(() => {
  try { localStorage.removeItem('cajita_abrir_en_salida'); } catch { /* sin almacenamiento */ }
  _reiniciarCajita();
});
afterEach(() => vi.unstubAllGlobals());

describe('el programa que trae la app', () => {
  it('es la versión 2, y la app lo sabe leyendo el mismo archivo', () => {
    expect(VERSION_DEL_PROGRAMA).toBe(2);
    expect(PROGRAMA).toMatch(/VERSION = 'veltronik-molinete 2'/);
    expect(PROGRAMA).toMatch(/PIN_RELE = 28/);
  });
});

describe('conectarse a la cajita', () => {
  it('⭐ encuentra la Pico, le pregunta PING y su configuración, y queda conectada', async () => {
    const pico = placa();
    enchufar(pico);
    await expect(conectarCajita()).resolves.toBe(true);
    expect(estadoDeLaCajita()).toMatchObject({
      fase: 'conectada', version: 'veltronik-molinete 2', versionNumero: 2,
      modo: 'SOSTENER', abrirMs: 5000, desactualizada: false,
    });
  });

  it('una cajita con el primer programa (la del primer gimnasio) anda, y queda marcada para actualizar', async () => {
    const vieja = placa({ version: 1 });
    enchufar(vieja);
    await expect(conectarCajita()).resolves.toBe(true);
    expect(estadoDeLaCajita()).toMatchObject({ fase: 'conectada', versionNumero: 1, modo: null, desactualizada: true });
    // A la versión 1 no se le pregunta lo que no sabe contestar.
    expect(vieja.enviados.some((t) => t.startsWith('ESTADO'))).toBe(false);
  });

  it('🔴 abre el puerto a 115200: a 1200 baudios la Pico se reinicia en modo cargador', async () => {
    const pico = placa();
    enchufar(pico);
    await conectarCajita();
    expect(pico.open).toHaveBeenCalledWith({ baudRate: 115200 });
  });

  it('otra placa enchufada (un Arduino, un lector) no es la cajita', async () => {
    const arduino = placa({ vendorId: 0x2341, productId: 0x005e });
    enchufar(arduino);
    await expect(conectarCajita()).resolves.toBe(false);
    expect(estadoDeLaCajita().fase).toBe('sin-cajita');
    expect(arduino.open).not.toHaveBeenCalled();
  });

  it('una Pico con MicroPython pero sin el programa queda «muda», y suelta el puerto entero', async () => {
    const nueva = placa({ version: 0 });
    enchufar(nueva);
    await expect(conectarCajita()).resolves.toBe(false);
    expect(estadoDeLaCajita().fase).toBe('muda');
    expect(nueva.close).toHaveBeenCalled();
    // Chromium no cierra un puerto con la lectura tomada: hay que soltarla antes.
    expect(nueva.readable.locked).toBe(false);
  });

  it('sin la API serie (el portal en un navegador sin ella) no hace nada', async () => {
    vi.stubGlobal('navigator', {});
    await expect(conectarCajita()).resolves.toBe(false);
    expect(estadoDeLaCajita().fase).toBe('no-soportado');
  });

  it('una cajita nueva solo se pide con un clic (requestPort), nunca al arrancar', async () => {
    const serial = enchufar();
    await conectarCajita();
    expect(serial.requestPort).not.toHaveBeenCalled();
    await conectarCajita({ conGesto: true });
    expect(serial.requestPort).toHaveBeenCalledWith({ filters: [FILTRO_CAJITA] });
  });

  it('avisa a las pantallas cada cambio de estado', async () => {
    enchufar(placa());
    const fases = [];
    suscribirseALaCajita((e) => fases.push(e.fase));
    await conectarCajita();
    expect(fases).toEqual(['buscando', 'conectada']);
  });

  it('si la desenchufan, lo dice', async () => {
    const pico = placa();
    const serial = enchufar(pico);
    await conectarCajita();
    serial.oyentes.disconnect({ target: pico });
    expect(estadoDeLaCajita().fase).toBe('sin-cajita');
  });
});

describe('abrir el molinete', () => {
  let pico;
  beforeEach(async () => {
    pico = placa();
    enchufar(pico);
    await conectarCajita();
    pico.enviados.length = 0;
  });

  it('⭐ con el plan y alguien que puede pasar, manda ABRIR (el tiempo lo pone la cajita)', async () => {
    fijarHabilitacion(true);
    expect(abrirSiPasa({ pasa: true })).toBe(true);
    await vi.waitFor(() => expect(pico.enviados).toEqual(['ABRIR\n']));
  });

  it('⭐ a alguien que no puede pasar (vencido, dado de baja) no le abre', async () => {
    fijarHabilitacion(true);
    expect(abrirSiPasa({ pasa: false })).toBe(false);
    await new Promise((r) => setTimeout(r, 10));
    expect(pico.enviados).toEqual([]);
  });

  it('sin el control de acceso en el plan, no abre solo', async () => {
    fijarHabilitacion(false);
    expect(abrirSiPasa({ pasa: true })).toBe(false);
    await new Promise((r) => setTimeout(r, 10));
    expect(pico.enviados).toEqual([]);
  });

  it('la salida abre solo si esta PC tiene «abrir también en la salida»', async () => {
    fijarHabilitacion(true);
    expect(abrirSiPasa({ salida: true })).toBe(false);
    fijarAbrirEnLaSalida(true);
    expect(estadoDeLaCajita().abrirEnLaSalida).toBe(true);
    expect(abrirSiPasa({ salida: true })).toBe(true);
    await vi.waitFor(() => expect(pico.enviados).toEqual(['ABRIR\n']));
  });

  it('el botón de quien atiende anda aunque el plan no lo incluya', async () => {
    fijarHabilitacion(false);
    await expect(ordenarALaCajita('ABRIR')).resolves.toBe(true);
    await expect(ordenarALaCajita('LIBRE')).resolves.toBe(true);
    await expect(ordenarALaCajita('TRABAR')).resolves.toBe(true);
    expect(pico.enviados).toEqual(['ABRIR\n', 'LIBRE\n', 'TRABAR\n']);
  });
});

describe('configurar la cajita (queda guardado adentro de ella)', () => {
  it('⭐ el modo y el tiempo se guardan en la cajita, y la pantalla se entera', async () => {
    const pico = placa();
    enchufar(pico);
    await conectarCajita();
    await expect(configurarCajita({ modo: 'PULSO', abrirMs: 500 })).resolves.toBe(true);
    expect(pico.config).toEqual({ modo: 'PULSO', abrirMs: 500 });
    expect(estadoDeLaCajita()).toMatchObject({ modo: 'PULSO', abrirMs: 500 });
  });

  it('a una cajita del primer programa no se le puede configurar: hay que actualizarla', async () => {
    enchufar(placa({ version: 1 }));
    await conectarCajita();
    await expect(configurarCajita({ modo: 'PULSO' })).resolves.toBe(false);
  });
});

describe('⭐ instalarle el programa a una cajita (así se prepara la de cada gimnasio nuevo)', () => {
  it('a una Pico recién armada (solo MicroPython): le escribe main.py, la reinicia y queda conectada', async () => {
    const nueva = placa({ version: 0 });
    enchufar(nueva);
    await expect(programarCajita({ conGesto: true })).resolves.toEqual({ ok: true });
    expect(nueva.programa).toBe(PROGRAMA);
    expect(estadoDeLaCajita()).toMatchObject({ fase: 'conectada', versionNumero: 2, desactualizada: false });
  });

  it('a la del primer programa: la actualiza sin perder cómo estaba configurada', async () => {
    const vieja = placa({ version: 1 });
    enchufar(vieja);
    await conectarCajita();
    await expect(programarCajita()).resolves.toEqual({ ok: true });
    expect(vieja.programa).toBe(PROGRAMA);
    expect(estadoDeLaCajita()).toMatchObject({ versionNumero: 2, modo: 'SOSTENER', abrirMs: 5000 });
  });

  it('si la placa no es MicroPython, lo dice y no queda a medias', async () => {
    enchufar(placa({ version: 0, micropython: false }));
    const r = await programarCajita({ conGesto: true });
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/MicroPython/);
    expect(estadoDeLaCajita().fase).toBe('muda');
  });

  it('sin cajita enchufada, lo dice', async () => {
    enchufar();
    const r = await programarCajita({ conGesto: true });
    expect(r).toEqual({ ok: false, motivo: 'No hay ninguna cajita enchufada a esta computadora.' });
  });
});

describe('sin cajita conectada', () => {
  it('ni el DNI ni el botón hacen nada (y no rompen el mostrador)', async () => {
    fijarHabilitacion(true);
    expect(abrirSiPasa({ pasa: true })).toBe(false);
    await expect(ordenarALaCajita('ABRIR')).resolves.toBe(false);
  });
});
