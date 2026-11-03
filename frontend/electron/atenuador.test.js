import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';

const { crearAtenuador, SCRIPT } = await import('./atenuador.cjs');

/** Un proceso de PowerShell de mentira: se le puede hacer decir "LISTO" o morirse. */
function procesoFalso() {
  const p = new EventEmitter();
  p.stdout = new EventEmitter();
  p.stdout.setEncoding = () => {};
  p.stderr = new EventEmitter();
  p.stderr.setEncoding = () => {};
  p.escrito = [];
  p.stdin = { write: (t) => p.escrito.push(t), end: vi.fn() };
  return p;
}

let procesos;
let spawn;
let escribir;

function armar(extra = {}) {
  return crearAtenuador({
    spawn, escribir, carpeta: 'C:/datos', propios: 'Veltronik', plataforma: 'win32', avisar: () => {}, ...extra,
  });
}

beforeEach(() => {
  procesos = [];
  spawn = vi.fn(() => { const p = procesoFalso(); procesos.push(p); return p; });
  escribir = vi.fn();
});

describe('el que baja la música', () => {
  it('levanta PowerShell con el script, sin ventana y sin perfil', () => {
    armar().iniciar();

    const [ruta, contenido] = escribir.mock.calls[0];
    expect(ruta.replace(/\\/g, '/')).toBe('C:/datos/bajar-musica.ps1');
    expect(contenido.startsWith('\uFEFF'), 'con BOM: PowerShell 5.1 lee sin BOM como ANSI').toBe(true);
    const [exe, args, opciones] = spawn.mock.calls[0];
    expect(exe).toBe('powershell.exe');
    expect(args).toEqual(expect.arrayContaining(['-NoProfile', '-NonInteractive', '-File', '-Propios', 'Veltronik']));
    expect(opciones.windowsHide).toBe(true);
  });

  it('no pide nada hasta que el ayudante dice LISTO', async () => {
    const a = armar();
    a.iniciar();

    await expect(a.bajar(900), 'todavía compilando').resolves.toBe(-1);
    expect(procesos[0].escrito).toEqual([]);

    procesos[0].stdout.emit('data', 'LISTO\r\n');
    const pedido = a.bajar(900);
    expect(procesos[0].escrito).toEqual(['BAJAR 0.25 900\n']);
    procesos[0].stdout.emit('data', 'BAJADO 1\r\n');
    await expect(pedido).resolves.toBe(1);
  });

  it('⭐ contesta cuando el ayudante BAJÓ de verdad, con cuántos programas (0 = no había música)', async () => {
    const a = armar();
    a.iniciar();
    procesos[0].stdout.emit('data', 'LISTO\n');

    const primero = a.bajar(900);
    const segundo = a.bajar(900);
    procesos[0].stdout.emit('data', 'BAJADO 2\nBAJADO 0\n');

    await expect(primero).resolves.toBe(2);
    await expect(segundo).resolves.toBe(0);
  });

  it('⭐ si el ayudante no contesta a tiempo, el aviso no se queda esperando', async () => {
    const plazos = [];
    const a = armar({ esperar: (fn) => plazos.push(fn) });
    a.iniciar();
    procesos[0].stdout.emit('data', 'LISTO\n');

    const pedido = a.bajar(900);
    plazos.forEach((fn) => fn());   // se cumplió la espera sin respuesta

    await expect(pedido).resolves.toBe(-1);
    // Y la respuesta tardía no se le atribuye al pedido siguiente.
    const siguiente = a.bajar(900);
    procesos[0].stdout.emit('data', 'BAJADO 3\n');   // la del pedido vencido
    procesos[0].stdout.emit('data', 'BAJADO 1\n');   // la del siguiente
    await expect(siguiente).resolves.toBe(1);
  });

  it('dice cómo está, y el último error, para Ajustes', () => {
    const a = armar();
    expect(a.estado()).toEqual({ disponible: true, listo: false, rendido: false, ultimoError: null });

    a.iniciar();
    procesos[0].stderr.emit('data', 'Add-Type : no se pudo compilar\r\n');
    procesos[0].stdout.emit('data', 'LISTO\n');

    expect(a.estado()).toMatchObject({ listo: true, ultimoError: 'Add-Type : no se pudo compilar' });
    expect(armar({ plataforma: 'darwin' }).estado().disponible).toBe(false);
  });

  it('acota cuánto puede quedar baja la música, por las dudas', () => {
    const a = armar();
    a.iniciar();
    procesos[0].stdout.emit('data', 'LISTO\n');

    a.bajar(60_000);
    a.bajar(-5);

    expect(procesos[0].escrito).toEqual(['BAJAR 0.25 3000\n', 'BAJAR 0.25 100\n']);
  });

  it('⭐ al cerrar la app le pide que devuelva el volumen', () => {
    const a = armar();
    a.iniciar();
    procesos[0].stdout.emit('data', 'LISTO\n');

    a.detener();

    expect(procesos[0].escrito).toContain('SALIR\n');
    expect(procesos[0].stdin.end).toHaveBeenCalled();
  });

  it('si se cae, lo vuelve a levantar; si se cae siempre, se rinde (y la X suena igual)', () => {
    const a = armar();
    for (let i = 0; i < 6; i += 1) {
      a.bajar(900);                                   // lo levanta si no está
      procesos[procesos.length - 1]?.emit('exit', 1);  // y se muere
    }

    expect(spawn.mock.calls.length, 'tres reintentos después del primero').toBe(4);
  });

  it('fuera de Windows no hace nada', async () => {
    const a = armar({ plataforma: 'darwin' });
    a.iniciar();

    await expect(a.bajar(900)).resolves.toBe(-1);
    expect(spawn).not.toHaveBeenCalled();
  });

  it('⭐ el script es C# 5: PowerShell 5.1 no compila nada más nuevo', () => {
    // Lo que el csc de .NET Framework no entiende. Si alguien lo "moderniza", en la PC del
    // gimnasio el ayudante no compila y la música no baja nunca, sin ningún error a la vista.
    const cs = SCRIPT.slice(SCRIPT.indexOf("@'"), SCRIPT.lastIndexOf("'@"));
    expect(cs).not.toMatch(/\$"/);          // interpolación
    expect(cs).not.toMatch(/\?\./);          // operador ?.
    expect(cs).not.toMatch(/out var\b/);     // out var
    expect(cs).not.toMatch(/=>/);            // miembros con =>
  });
});
