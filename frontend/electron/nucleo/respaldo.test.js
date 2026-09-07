// ============================================
// VELTRONIK - Tests de la copia legible de la cola
// ============================================
// La cola es lo ÚNICO que hay: una visita que está ahí y se pierde se perdió para siempre.
// Y el diseño la deja acumular —espejo de 30 días, UN terminal, UN disco—, así que en el peor
// caso es un mes de visitas sin ningún respaldo.
//
// Esto no puede ser un respaldo remoto: la premisa es que NO hay internet. Lo que sí hace es
// sacar el dato de adentro del SQLite y ponerlo en texto plano que sobrevive a que esa base se
// corrompa, se puede copiar a un pendrive y, en el peor caso, volver a cargar a mano.
//
// ⚠️ LA REGLA QUE MÁS IMPORTA ACÁ NO ES QUE ESCRIBA: es que NO PUEDA ROMPER NADA. Si el disco
// está lleno o la carpeta es de solo lectura, el acceso tiene que encolarse igual. Perder la
// visita por no poder escribir su respaldo sería exactamente al revés de lo que se busca.
// ============================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);

let base;

// ⚠️ ELECTRON NO SE PUEDE MOCKEAR ACÁ. `createRequire` carga el módulo con el loader de Node,
// fuera del grafo de vitest, así que un `vi.mock('electron')` no lo alcanza — se intentó y el
// módulo seguía viendo el `require` de verdad. Por eso acepta la carpeta inyectada: es la misma
// costura que usa `espejo.cjs` con la conexión, y por el mismo motivo (el binario de Electron
// no existe en la suite).
const { anotar, donde, archivoDeHoy, celda, ENCABEZADO, _reiniciar } = require('./respaldo.cjs');

const UN_ACCESO = {
    ocurridoEn: '2026-09-07T09:17:32',
    memberName: 'gustavo benitez',
    method: 'manual',
    clientRef: '7c537f67-9419-47fa-ab78-aeb29936a682',
    memberId: 'a8712a90-cae6-4a34-a018-8821994e5ffd',
    tenantId: 'b8712a90-cae6-4a34-a018-8821994e5ffd',
};

/** Anota con la carpeta de prueba inyectada. Es como se lo usa en toda esta suite. */
function guardar(item) {
    return anotar(item, { base });
}

function contenido() {
    return fs.readFileSync(archivoDeHoy(donde(base)), 'utf8');
}

beforeEach(() => {
    base = fs.mkdtempSync(path.join(os.tmpdir(), 'veltronik-respaldo-'));
    _reiniciar();
});

afterEach(() => {
    try { fs.rmSync(base, { recursive: true, force: true }); } catch { /* ya no está */ }
});

describe('la copia se escribe donde un humano la encuentra', () => {
    it('va a Documentos, no a una carpeta oculta del sistema', () => {
        // %APPDATA% es donde vive la base, y nadie la encuentra. Esto existe justamente para
        // que alguien lo pueda agarrar el día que la máquina no arranca.
        guardar(UN_ACCESO);
        expect(donde(base)).toBe(path.join(base, 'Veltronik', 'respaldo'));
    });

    it('un archivo por día, con la fecha en el nombre', () => {
        const nombre = path.basename(archivoDeHoy('/x', new Date(2026, 8, 7, 15, 0, 0)));
        expect(nombre).toBe('accesos-sin-internet-2026-09-07.csv');
    });

    it('escribe el acceso completo, con el sello incluido', () => {
        expect(guardar(UN_ACCESO)).toBe(true);

        const texto = contenido();
        expect(texto).toContain('gustavo benitez');
        expect(texto).toContain('2026-09-07T09:17:32');
        // El sello es el mismo que el servidor usa para no duplicar: con él, recargar esto a
        // mano no puede contar dos veces la misma visita.
        expect(texto).toContain(UN_ACCESO.clientRef);
    });

    it('el encabezado va UNA vez, y después solo se agrega', () => {
        guardar(UN_ACCESO);
        guardar({ ...UN_ACCESO, clientRef: 'otro', memberName: 'ana lopez' });

        const lineas = contenido().trim().split('\n');
        expect(lineas).toHaveLength(3);
        expect(lineas[0]).toContain(ENCABEZADO);
        expect(lineas[1]).toContain('gustavo benitez');
        expect(lineas[2], 'el segundo no puede pisar al primero').toContain('ana lopez');
    });

    it('arranca con BOM: sin él Excel muestra los acentos rotos', () => {
        // El día que el dueño necesita leer esto no puede encontrarse con "BenÃ­tez".
        guardar({ ...UN_ACCESO, memberName: 'Benítez' });
        expect(contenido().charCodeAt(0)).toBe(0xFEFF);
    });
});

describe('el CSV no se desarma con los datos de verdad', () => {
    it('un apellido con coma no corre las columnas', () => {
        expect(celda('Benitez, Gustavo')).toBe('"Benitez, Gustavo"');
    });

    it('unas comillas adentro del nombre tampoco', () => {
        expect(celda('El "Flaco"')).toBe('"El ""Flaco"""');
    });

    it('lo que falta queda vacío, no dice "undefined"', () => {
        expect(celda(undefined)).toBe('');
        expect(celda(null)).toBe('');
    });
});

describe('⚠️ y sobre todo: no puede romper nada', () => {
    it('si no puede escribir, avisa que no y no explota', () => {
        // El caso real: disco lleno, carpeta de solo lectura, antivirus en el medio.
        const stub = vi.spyOn(fs, 'appendFileSync').mockImplementation(() => {
            throw new Error('EACCES: permission denied');
        });

        expect(() => guardar(UN_ACCESO)).not.toThrow();
        expect(guardar(UN_ACCESO), 'devuelve false para que quede claro que no se escribió')
            .toBe(false);

        stub.mockRestore();
    });

    it('sin acceso a la carpeta tampoco explota', () => {
        const stub = vi.spyOn(fs, 'mkdirSync').mockImplementation(() => {
            throw new Error('EPERM');
        });
        _reiniciar();

        expect(() => guardar(UN_ACCESO)).not.toThrow();
        expect(guardar(UN_ACCESO)).toBe(false);

        stub.mockRestore();
    });

    it('un acceso vacío no escribe una línea de basura', () => {
        expect(guardar(null)).toBe(false);
    });
});
