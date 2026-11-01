// ============================================
// LA CAJITA DEL MOLINETE (lib/cajitaMolinete)
// ============================================
// Con una placa de mentira: se presenta como la Pico de la cajita (o como otra cosa), contesta
// el PING y anota todo lo que le llega. Lo que se prueba es lo que va a pasar en la puerta:
// cuándo se abre y cuándo no.
// ============================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  conectarCajita, ordenarALaCajita, abrirSiPasa, fijarHabilitacion, estadoDeLaCajita,
  suscribirseALaCajita, _reiniciarCajita, APERTURA_MS,
} from './cajitaMolinete';

const texto = (bytes) => new TextDecoder().decode(bytes);

/** Una placa enchufada. `contesta: false` = otra cosa adentro, o el programa viejo. */
function placa({ vendorId = 0x2e8a, productId = 0x0005, contesta = true } = {}) {
  let salida;
  const enviados = [];
  return {
    enviados,
    getInfo: () => ({ usbVendorId: vendorId, usbProductId: productId }),
    open: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    readable: new ReadableStream({ start(c) { salida = c; } }),
    writable: new WritableStream({
      write(chunk) {
        const linea = texto(chunk);
        enviados.push(linea);
        if (contesta && linea === 'PING\n') salida.enqueue(new TextEncoder().encode('PONG veltronik-molinete 1\r\n'));
      },
    }),
  };
}

function enchufar(...placas) {
  const serial = {
    getPorts: vi.fn(async () => placas),
    requestPort: vi.fn(async () => { throw new Error('nadie eligió'); }),
    addEventListener: vi.fn(),
  };
  vi.stubGlobal('navigator', { serial });
  return serial;
}

beforeEach(() => _reiniciarCajita());
afterEach(() => vi.unstubAllGlobals());

describe('conectarse a la cajita', () => {
  it('⭐ encuentra la Pico, le pregunta PING y queda conectada', async () => {
    const pico = placa();
    enchufar(pico);
    await expect(conectarCajita()).resolves.toBe(true);
    expect(estadoDeLaCajita()).toMatchObject({ fase: 'conectada', version: 'veltronik-molinete 1' });
    expect(pico.enviados).toEqual(['PING\n']);
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

  it('una Pico que no contesta queda «muda» y se suelta el puerto', async () => {
    const callada = placa({ contesta: false });
    enchufar(callada);
    await expect(conectarCajita()).resolves.toBe(false);
    expect(estadoDeLaCajita().fase).toBe('muda');
    expect(callada.close).toHaveBeenCalled();
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
    expect(serial.requestPort).toHaveBeenCalledWith({ filters: [{ usbVendorId: 0x2e8a, usbProductId: 0x0005 }] });
  });

  it('avisa a las pantallas cada cambio de estado', async () => {
    enchufar(placa());
    const fases = [];
    suscribirseALaCajita((e) => fases.push(e.fase));
    await conectarCajita();
    expect(fases).toEqual(['buscando', 'conectada']);
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

  it('⭐ con el plan y un socio que pasa, manda ABRIR por el tiempo de una entrada', async () => {
    fijarHabilitacion(true);
    expect(abrirSiPasa({ pasa: true })).toBe(true);
    await vi.waitFor(() => expect(pico.enviados).toEqual([`ABRIR ${APERTURA_MS}\n`]));
  });

  it('⭐ a un socio que no pasa (vencido, sin fecha) no le abre', async () => {
    fijarHabilitacion(true);
    expect(abrirSiPasa({ pasa: false })).toBe(false);
    await new Promise((r) => setTimeout(r, 10));
    expect(pico.enviados).toEqual([]);
  });

  it('sin el control de acceso en el plan, el DNI no abre', async () => {
    fijarHabilitacion(false);
    expect(abrirSiPasa({ pasa: true })).toBe(false);
    await new Promise((r) => setTimeout(r, 10));
    expect(pico.enviados).toEqual([]);
  });

  it('el botón de quien atiende anda aunque el plan no lo incluya', async () => {
    fijarHabilitacion(false);
    await expect(ordenarALaCajita('ABRIR')).resolves.toBe(true);
    await expect(ordenarALaCajita('LIBRE')).resolves.toBe(true);
    await expect(ordenarALaCajita('TRABAR')).resolves.toBe(true);
    expect(pico.enviados).toEqual([`ABRIR ${APERTURA_MS}\n`, 'LIBRE\n', 'TRABAR\n']);
  });
});

describe('sin cajita conectada', () => {
  it('ni el DNI ni el botón hacen nada (y no rompen el mostrador)', async () => {
    fijarHabilitacion(true);
    expect(abrirSiPasa({ pasa: true })).toBe(false);
    await expect(ordenarALaCajita('ABRIR')).resolves.toBe(false);
  });
});
