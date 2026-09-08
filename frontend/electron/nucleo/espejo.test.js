// ============================================
// VELTRONIK - Tests del espejo de socios
// ============================================
// Lo que se prueba acá es lo NUESTRO: que un socio de la API se guarde con los nombres de
// columna de Postgres, que el espejo de un gimnasio no pise el de otro, y que una consulta
// que volvió vacía no borre la lista buena.
//
// Lo que NO se prueba acá es SQLite. No por pereza: el binario de better-sqlite3 se baja
// compilado contra el ABI de Electron y vitest corre sobre el Node de la máquina, así que
// la base de verdad no abre en la suite. Se usa una conexión de mentira que anota qué se le
// pidió. Que una transacción sea atómica es responsabilidad de SQLite, no nuestra; que
// borremos solo las filas del gimnasio correcto, sí.
// ============================================

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { guardar, leer, olvidar, aFila, aVista } = require('./espejo.cjs');

/**
 * Una conexión de mentira con la forma que usa better-sqlite3.
 *
 * Anota cada `prepare` con los argumentos que recibió, y ejecuta las transacciones en el
 * acto — que es justo lo que hace la de verdad cuando se la invoca.
 */
function conexionFalsa(filasQueDevuelve = []) {
    const registro = [];
    return {
        registro,
        prepare(sql) {
            const entrada = { sql: sql.replace(/\s+/g, ' ').trim(), run: [], get: [], all: [] };
            registro.push(entrada);
            return {
                run: (...args) => { entrada.run.push(args); },
                get: (...args) => { entrada.get.push(args); return filasQueDevuelve.estado; },
                all: (...args) => { entrada.all.push(args); return filasQueDevuelve.socios || []; },
            };
        },
        transaction(fn) {
            return (...args) => fn(...args);
        },
    };
}

const GIMNASIO = '11111111-1111-1111-1111-111111111111';
const OTRO_GIMNASIO = '22222222-2222-2222-2222-222222222222';

const SOCIO_API = {
    id: 'aaaaaaaa-0000-0000-0000-000000000001',
    firstName: 'José',
    lastName: 'Pérez',
    document: '24732531',
    phone: '3794123456',
    email: 'jose@ejemplo.com',
    active: true,
    membershipEnd: '2026-10-01T00:00:00',
    situacion: 'AL_DIA',
    diasVencido: 0,
    diasRestantes: 25,
    planId: 'bbbbbbbb-0000-0000-0000-000000000002',
    planNombre: 'Full',
    busqueda: 'jose perez 24732531',
};

describe('el mapeo de columnas', () => {
    it('guarda con los nombres de Postgres, no con los del JSON', () => {
        const fila = aFila(GIMNASIO, SOCIO_API);

        expect(fila.first_name).toBe('José');
        expect(fila.last_name).toBe('Pérez');
        expect(fila.membership_end).toBe('2026-10-01T00:00:00');
        expect(fila.dias_restantes).toBe(25);
        expect(fila.tenant_id).toBe(GIMNASIO);
        // Y NO quedan los nombres de la API sueltos: si alguien agrega un campo y se olvida
        // de traducirlo, esto lo agarra.
        expect(fila.firstName).toBeUndefined();
        expect(fila.membershipEnd).toBeUndefined();
    });

    it('acepta `dni` y `document` como el mismo dato, que es lo que son', () => {
        expect(aFila(GIMNASIO, { id: '1', dni: '30111222' }).document).toBe('30111222');
        expect(aFila(GIMNASIO, { id: '1', document: '30111222' }).document).toBe('30111222');
    });

    it('un socio sin el campo `active` es un socio ACTIVO, no una baja', () => {
        // Importa de verdad: un dato que falta no es lo mismo que una baja, y tratarlo como
        // baja deja afuera a alguien que está al día.
        expect(aFila(GIMNASIO, { id: '1' }).is_active).toBe(1);
        expect(aFila(GIMNASIO, { id: '1', active: false }).is_active).toBe(0);
        expect(aFila(GIMNASIO, { id: '1', isActive: false }).is_active).toBe(0);
    });

    it('no inventa el veredicto: si el servidor no lo mandó, queda vacío', () => {
        // La tentación sería deducir la situación de membership_end. Esa es exactamente la
        // línea que no se cruza: el cálculo vive en MemberAccessPolicy y en ningún otro lado.
        const fila = aFila(GIMNASIO, { id: '1', membershipEnd: '2020-01-01T00:00:00' });
        expect(fila.situacion).toBeNull();
        expect(fila.dias_vencido).toBeNull();
    });

    it('vuelve de la base con la forma que espera la pantalla', () => {
        const vista = aVista(aFila(GIMNASIO, SOCIO_API));

        expect(vista.fullName).toBe('José Pérez');
        expect(vista.dni).toBe('24732531');
        expect(vista.document).toBe('24732531');
        expect(vista.isActive).toBe(true);
        expect(vista.situacion).toBe('AL_DIA');
    });
});

describe('guardar el espejo', () => {
    it('borra SOLO las filas del gimnasio que se está refrescando', () => {
        // Sin esto, un terminal que atendió dos sucursales se borra la lista de la otra cada
        // vez que refresca. Ya pasó una vez con la base del navegador.
        const db = conexionFalsa();
        guardar(GIMNASIO, [SOCIO_API], db);

        const borrado = db.registro.find((e) => e.sql.startsWith('DELETE FROM gym_members'));
        expect(borrado.sql).toContain('WHERE tenant_id = ?');
        expect(borrado.run[0]).toEqual([GIMNASIO]);
        expect(borrado.run[0]).not.toEqual([OTRO_GIMNASIO]);
    });

    it('una lista vacía NO borra la lista buena', () => {
        // Una consulta que falla y devuelve [] no es "el gimnasio se quedó sin socios". Si
        // se guardara, el mostrador quedaría ciego justo cuando más necesita la copia.
        const db = conexionFalsa();
        const r = guardar(GIMNASIO, [], db);

        expect(r.ok).toBe(false);
        expect(r.motivo).toBe('lista vacia');
        expect(db.registro).toHaveLength(0);
    });

    it('sin gimnasio no escribe nada', () => {
        const db = conexionFalsa();
        expect(guardar(null, [SOCIO_API], db).ok).toBe(false);
        expect(db.registro).toHaveLength(0);
    });

    it('inserta un socio por fila y deja anotado de cuándo es el espejo', () => {
        const db = conexionFalsa();
        const r = guardar(GIMNASIO, [SOCIO_API, { ...SOCIO_API, id: 'otro' }], db);

        expect(r.ok).toBe(true);
        expect(r.socios).toBe(2);
        expect(r.actualizado).toBeGreaterThan(0);

        const insert = db.registro.find((e) => e.sql.startsWith('INSERT INTO gym_members'));
        expect(insert.run).toHaveLength(2);

        const marca = db.registro.find((e) => e.sql.includes('espejo_estado'));
        expect(marca.run[0][0].socios).toBe(2);
    });
});

describe('leer el espejo', () => {
    it('devuelve los socios con la forma de la pantalla y de cuándo son', () => {
        const db = conexionFalsa({
            socios: [aFila(GIMNASIO, SOCIO_API)],
            estado: { actualizado: 1757000000000 },
        });

        const { socios, actualizado } = leer(GIMNASIO, db);

        expect(socios).toHaveLength(1);
        expect(socios[0].fullName).toBe('José Pérez');
        expect(actualizado).toBe(1757000000000);
    });

    it('sin gimnasio devuelve vacío en vez de romper', () => {
        expect(leer(null, conexionFalsa())).toEqual({ socios: [], actualizado: null });
    });
});

describe('olvidar el espejo', () => {
    it('borra las filas y la marca del gimnasio, y de ninguno más', () => {
        const db = conexionFalsa();
        olvidar(GIMNASIO, db);

        const sentencias = db.registro.map((e) => e.sql);
        expect(sentencias.some((s) => s.startsWith('DELETE FROM gym_members'))).toBe(true);
        expect(sentencias.some((s) => s.startsWith('DELETE FROM espejo_estado'))).toBe(true);
        for (const entrada of db.registro) {
            for (const args of entrada.run) expect(args).toEqual([GIMNASIO]);
        }
    });
});
