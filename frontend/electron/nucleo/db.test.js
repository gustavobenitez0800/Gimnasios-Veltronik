// ============================================
// VELTRONIK - Tests de la base del terminal
// ============================================
// Lo que se prueba acá es que una columna nueva del espejo llegue a los terminales que ya
// estaban instalados: `CREATE TABLE IF NOT EXISTS` no toca una tabla que existe, y sin la columna
// el INSERT del espejo fallaría en cada refresco. Como en espejo.test.js, con una conexión de
// mentira: el binario de better-sqlite3 es el de Electron y no abre en vitest.
// ============================================

import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { agregarColumnasNuevas, ESQUEMA } = require('./db.cjs');

/** Una conexión que contesta PRAGMA table_info con estas columnas y anota cada ALTER. */
function conexionConColumnas(columnas, { alterFalla = false } = {}) {
    const alters = [];
    return {
        alters,
        prepare(sql) {
            return {
                all: () => (sql.startsWith('PRAGMA table_info') ? columnas.map((name) => ({ name })) : []),
                run: () => {
                    if (alterFalla) throw new Error('disco lleno');
                    alters.push(sql);
                },
            };
        },
    };
}

describe('las columnas nuevas del espejo', () => {
    it('⭐ a un terminal viejo, sin la columna de los llaveros, se la agrega', () => {
        const db = conexionConColumnas(['id', 'tenant_id', 'busqueda']);

        expect(agregarColumnasNuevas(db)).toEqual(['gym_members.llaveros']);
        expect(db.alters).toEqual(['ALTER TABLE gym_members ADD COLUMN llaveros TEXT']);
    });

    it('a uno que ya la tiene no le toca nada', () => {
        const db = conexionConColumnas(['id', 'tenant_id', 'busqueda', 'llaveros']);

        expect(agregarColumnasNuevas(db)).toEqual([]);
        expect(db.alters).toEqual([]);
    });

    it('si no se puede, avisa y sigue: la app tiene que abrir igual', () => {
        const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const db = conexionConColumnas(['id'], { alterFalla: true });

        expect(() => agregarColumnasNuevas(db)).not.toThrow();
        expect(aviso).toHaveBeenCalled();
        aviso.mockRestore();
    });

    it('un terminal nuevo ya la trae desde el esquema', () => {
        expect(ESQUEMA).toMatch(/llaveros\s+TEXT/);
    });
});
