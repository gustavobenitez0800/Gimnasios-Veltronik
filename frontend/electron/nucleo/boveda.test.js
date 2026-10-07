// ============================================
// VELTRONIK - Tests de la bóveda (el archivo, del lado del proceso principal)
// ============================================
// EL CAMINO 2 DE "LA APP ME MANDA AL LOGIN SOLA", en su origen.
//
// En Windows, reemplazar un archivo que OTRO proceso tiene abierto falla con EPERM, y el
// antivirus abre la bóveda cada vez que se la escribe. La bóveda se rendía al primer intento:
// el token nuevo no entraba y en el disco quedaba el anterior, que ya estaba gastado.
//
// Acá el disco es de verdad (una carpeta temporal) y lo que se finge es el otro proceso: el
// error que da Windows mientras alguien tiene el archivo abierto. Que ese error es EPERM en el
// reemplazo y EBUSY en la lectura se midió contra un bloqueo real el 06/10/2026.
// ============================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'node:module';
import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);

// Electron no se puede mockear acá (ver la nota de respaldo.test.js): la bóveda acepta la
// ruta y el cifrado inyectados, y el `require('electron')` de verdad no llega a correr.
const { crearBoveda, ESPERAS_MS } = require('./boveda.cjs');

const CLAVE = 'sb-proyecto-auth-token';

/** Un cifrado de mentira con la forma de `safeStorage`: lo que importa es que NO quede en claro. */
function cifradoFalso({ disponible = true } = {}) {
    return {
        isEncryptionAvailable: () => disponible,
        encryptString: (texto) => Buffer.from(texto, 'utf8').reverse(),
        decryptString: (bytes) => Buffer.from(bytes).reverse().toString('utf8'),
    };
}

/** El error que da Windows mientras otro proceso tiene abierto el archivo. */
function tomado(codigo, operacion) {
    return Object.assign(new Error(`${codigo}: operation not permitted, ${operacion}`), { code: codigo });
}

let carpeta;
let archivo;
let esperar;
let avisar;
let boveda;

beforeEach(() => {
    carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'veltronik-boveda-'));
    archivo = path.join(carpeta, 'nucleo', 'boveda.json');
    // Espera de verdad, pero un instante: lo que se afirma es cuánto PIDIÓ esperar la bóveda.
    // No es un doble vacío porque el disco es real: si el antivirus de la máquina que corre
    // los tests toma el archivo justo ahí, hay que darle tiempo a soltarlo.
    esperar = vi.fn(() => { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 3); });
    avisar = vi.fn();
    boveda = crearBoveda({ ruta: () => archivo, cifrado: cifradoFalso(), esperar, avisar });
});

afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(carpeta, { recursive: true, force: true });
});

/** Solo el archivo de la bóveda queda "tomado"; el resto del disco anda normal. */
function tomarElReemplazo({ veces = Infinity } = {}) {
    const deVerdad = fs.renameSync;
    let faltan = veces;
    return vi.spyOn(fs, 'renameSync').mockImplementation((desde, hasta) => {
        if (hasta === archivo && faltan > 0) {
            faltan -= 1;
            throw tomado('EPERM', 'rename');
        }
        return deVerdad(desde, hasta);
    });
}

function tomarLaLectura({ veces = Infinity } = {}) {
    const deVerdad = fs.readFileSync;
    let faltan = veces;
    return vi.spyOn(fs, 'readFileSync').mockImplementation((ruta, ...resto) => {
        if (ruta === archivo && faltan > 0) {
            faltan -= 1;
            throw tomado('EBUSY', 'open');
        }
        return deVerdad(ruta, ...resto);
    });
}

describe('guardar y leer', () => {
    it('devuelve lo que guardó, y en el disco NO queda en claro', () => {
        expect(boveda.escribir(CLAVE, 'rt-secreto')).toBe(true);

        expect(boveda.leer(CLAVE)).toBe('rt-secreto');
        expect(fs.readFileSync(archivo, 'utf8')).not.toContain('rt-secreto');
    });

    it('guardar una clave no toca las otras', () => {
        boveda.escribir('una', 'valor-uno');
        boveda.escribir('otra', 'valor-otro');

        expect(boveda.leer('una')).toBe('valor-uno');
        expect(boveda.leer('otra')).toBe('valor-otro');
    });

    it('sin nada guardado, o con el archivo corrupto, no hay nada y se puede escribir', () => {
        expect(boveda.leer(CLAVE)).toBeNull();

        fs.mkdirSync(path.dirname(archivo), { recursive: true });
        fs.writeFileSync(archivo, 'esto no es json');
        expect(boveda.leer(CLAVE)).toBeNull();
        expect(boveda.escribir(CLAVE, 'rt-nuevo')).toBe(true);
        expect(boveda.leer(CLAVE)).toBe('rt-nuevo');
    });

    it('si el sistema no puede cifrar, no guarda ni finge', () => {
        const sinCifrado = crearBoveda({ ruta: () => archivo, cifrado: cifradoFalso({ disponible: false }), esperar, avisar });

        expect(sinCifrado.escribir(CLAVE, 'rt')).toBe(false);
        expect(sinCifrado.leer(CLAVE)).toBeNull();
        expect(fs.existsSync(archivo)).toBe(false);
    });

    it('borrar saca la clave y deja las otras', () => {
        boveda.escribir(CLAVE, 'rt');
        boveda.escribir('otra', 'valor-otro');

        expect(boveda.borrar(CLAVE)).toBe(true);

        expect(boveda.leer(CLAVE)).toBeNull();
        expect(boveda.leer('otra')).toBe('valor-otro');
    });
});

describe('⚠️ cuando otro proceso tiene abierto el archivo (EPERM)', () => {
    // ⚠️ ESTE ES EL BUG. Antes se rendía acá: `escribir` devolvía false al primer EPERM.
    it('⚠️ espera a que lo suelten y guarda el token nuevo', () => {
        boveda.escribir(CLAVE, 'rt-anterior');
        const reemplazo = tomarElReemplazo({ veces: 2 });

        expect(boveda.escribir(CLAVE, 'rt-nuevo')).toBe(true);

        expect(boveda.leer(CLAVE)).toBe('rt-nuevo');
        expect(reemplazo).toHaveBeenCalledTimes(3);
        expect(esperar.mock.calls.map(([ms]) => ms)).toEqual(ESPERAS_MS.slice(0, 2));
    });

    it('si no lo sueltan nunca, dice que NO guardó: el anterior queda intacto y sin temporales tirados', () => {
        boveda.escribir(CLAVE, 'rt-anterior');
        tomarElReemplazo();

        expect(boveda.escribir(CLAVE, 'rt-nuevo')).toBe(false);

        vi.restoreAllMocks();
        expect(boveda.leer(CLAVE)).toBe('rt-anterior');
        expect(fs.readdirSync(path.dirname(archivo))).toEqual(['boveda.json']);
        expect(avisar).toHaveBeenCalled();
    });

    it('la espera tiene tope: un segundo en total, no para siempre', () => {
        boveda.escribir(CLAVE, 'rt-anterior');
        tomarElReemplazo();

        boveda.escribir(CLAVE, 'rt-nuevo');

        const esperado = esperar.mock.calls.reduce((suma, [ms]) => suma + ms, 0);
        expect(esperar).toHaveBeenCalledTimes(ESPERAS_MS.length);
        expect(esperado).toBe(1000);
    });

    it('el cierre de sesión también espera: borrar no se rinde al primer EPERM', () => {
        boveda.escribir(CLAVE, 'rt-de-quien-sale');
        tomarElReemplazo({ veces: 1 });

        expect(boveda.borrar(CLAVE)).toBe(true);
        expect(boveda.leer(CLAVE)).toBeNull();
    });

    it('y si no puede, dice que NO borró', () => {
        boveda.escribir(CLAVE, 'rt-de-quien-sale');
        tomarElReemplazo();

        expect(boveda.borrar(CLAVE)).toBe(false);
    });

    it('un error que no se va solo (disco lleno) no se reintenta', () => {
        vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {
            throw Object.assign(new Error('ENOSPC: no space left on device, write'), { code: 'ENOSPC' });
        });

        expect(boveda.escribir(CLAVE, 'rt-nuevo')).toBe(false);
        expect(esperar).not.toHaveBeenCalled();
    });
});

describe('⚠️ cuando el archivo está pero no se deja leer (EBUSY)', () => {
    it('una lectura tomada un instante se espera, y se lee', () => {
        boveda.escribir(CLAVE, 'rt-guardado');
        tomarLaLectura({ veces: 2 });

        expect(boveda.leer(CLAVE)).toBe('rt-guardado');
    });

    // El archivo se escribe entero. Antes, una lectura fallida se tomaba por "no hay nada" y
    // el guardado siguiente dejaba el archivo con UNA clave: se llevaba todas las demás.
    it('⚠️ sin poder leerlo NO se escribe encima: las otras claves no se pierden', () => {
        boveda.escribir(CLAVE, 'rt-anterior');
        boveda.escribir('otra', 'valor-otro');
        tomarLaLectura();
        const reemplazo = vi.spyOn(fs, 'renameSync');

        expect(boveda.escribir(CLAVE, 'rt-nuevo')).toBe(false);

        expect(reemplazo).not.toHaveBeenCalled();
        vi.restoreAllMocks();
        expect(boveda.leer('otra')).toBe('valor-otro');
        expect(boveda.leer(CLAVE)).toBe('rt-anterior');
    });

    it('sin poder leerlo, borrar no dice que borró', () => {
        boveda.escribir(CLAVE, 'rt-de-quien-sale');
        tomarLaLectura();

        expect(boveda.borrar(CLAVE)).toBe(false);
    });
});
