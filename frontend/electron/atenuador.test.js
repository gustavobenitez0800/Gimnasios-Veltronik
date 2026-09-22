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

  it('no pide nada hasta que el ayudante dice LISTO', () => {
    const a = armar();
    a.iniciar();

    expect(a.bajar(900), 'todavía compilando').toBe(false);
    expect(procesos[0].escrito).toEqual([]);

    procesos[0].stdout.emit('data', 'LISTO\r\n');
    expect(a.bajar(900)).toBe(true);
    expect(procesos[0].escrito).toEqual(['BAJAR 0.3 900\n']);
  });

  it('acota cuánto puede quedar baja la música, por las dudas', () => {
    const a = armar();
    a.iniciar();
    procesos[0].stdout.emit('data', 'LISTO\n');

    a.bajar(60_000);
    a.bajar(-5);

    expect(procesos[0].escrito).toEqual(['BAJAR 0.3 3000\n', 'BAJAR 0.3 100\n']);
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

  it('fuera de Windows no hace nada', () => {
    const a = armar({ plataforma: 'darwin' });
    a.iniciar();

    expect(a.bajar(900)).toBe(false);
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
