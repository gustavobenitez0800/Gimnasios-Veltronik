import { describe, it, expect } from 'vitest';

const { planificar } = await import('./molinete.cjs');

/** Un id de socio como viaja adentro del equipo: UUID sin guiones. */
const id = (n) => String(n).padStart(32, '0');

const socio = (n, nombre, permitido) => ({ id: id(n), nombre, permitido });

/** Una ficha como la devuelve el equipo. `tag` es el sello de lo que ya le aplicamos. */
const ficha = (n, nombre, tag) => [id(n), { id: id(n), name: nombre, tag, facePermission: 2 }];

const equipo = (...fichas) => new Map(fichas);

const tipos = (r) => r.acciones.map((a) => a.tipo);

/**
 * La sincronización del molinete es de las pocas cosas del sistema que pueden hacer un daño
 * IRREVERSIBLE (borrar a alguien le borra la cara) y de las pocas que pueden fallar en
 * SILENCIO: si concluye "no hay nada que hacer" cuando sí lo había, el socio pagó y la puerta
 * no se abre, y nadie se entera hasta que hay alguien parado en la puerta.
 */
describe('el plan de sincronización', () => {

    it('da de alta al socio que el equipo no tiene', () => {
        const r = planificar([socio(1, 'Juan', true)], new Map());

        expect(r.acciones).toEqual([
            { tipo: 'alta', id: id(1), nombre: 'Juan', permitido: true, etiqueta: 'VT-OK' },
        ]);
    });

    it('no toca al socio que el equipo ya tiene en el estado correcto', () => {
        const r = planificar([socio(1, 'Juan', true)], equipo(ficha(1, 'Juan', 'VT-OK')));

        expect(r.acciones).toEqual([]);
    });

    it('le abre la puerta al que pagó', () => {
        const r = planificar([socio(1, 'Juan', true)], equipo(ficha(1, 'Juan', 'VT-NO')));

        expect(tipos(r)).toEqual(['permiso']);
        expect(r.acciones[0].permitido).toBe(true);
    });

    it('se la cierra al que se venció', () => {
        const r = planificar([socio(1, 'Juan', false)], equipo(ficha(1, 'Juan', 'VT-OK')));

        expect(tipos(r)).toEqual(['permiso']);
        expect(r.acciones[0].permitido).toBe(false);
    });

    /**
     * EL CASO QUE FALLÓ DE VERDAD. Con el espejo local, si la copia decía "permitido" y el
     * padrón decía "permitido", la sincronización concluía que no había nada que hacer — aunque
     * el equipo tuviera la puerta cerrada, porque algo lo había cambiado por fuera. El socio
     * había pagado y la puerta seguía diciéndole que no.
     *
     * Preguntándole al equipo esto no puede pasar: si el equipo dice que está bloqueado, se lo
     * desbloquea, sin importar lo que crea nadie más.
     */
    it('reaplica cuando el equipo quedó en otro estado por algo de afuera', () => {
        const r = planificar([socio(1, 'Juan', true)], equipo(ficha(1, 'Juan', 'VT-NO')));

        expect(tipos(r)).toEqual(['permiso']);
    });

    it('a un socio sin sellar se lo sella, aunque ya esté cargado', () => {
        const r = planificar([socio(1, 'Juan', true)], equipo(ficha(1, 'Juan', '')));

        expect(tipos(r)).toEqual(['permiso']);
    });

    it('renombra sin tocar el permiso cuando lo único que cambió es el nombre', () => {
        const r = planificar([socio(1, 'Juan Pérez', true)], equipo(ficha(1, 'Juan', 'VT-OK')));

        expect(tipos(r)).toEqual(['renombrar']);
        expect(r.acciones[0].nombre).toBe('Juan Pérez');
    });

    /** El renombre viaja con la ficha del equipo porque el update REEMPLAZA la persona entera. */
    it('la acción lleva la ficha del equipo, para no borrarle los otros campos', () => {
        const r = planificar([socio(1, 'Juan Pérez', true)], equipo(ficha(1, 'Juan', 'VT-OK')));

        expect(r.acciones[0].ficha).toMatchObject({ id: id(1), facePermission: 2 });
    });

    it('el nombre se recorta a lo que entra en la pantalla del equipo', () => {
        const r = planificar([socio(1, 'Maria Esperanza de los Angeles Fernandez', true)], new Map());

        expect(r.acciones[0].nombre).toHaveLength(32);
    });

    // ─────────────────────────────────────────────────────────────────────────

    describe('las bajas, que son irreversibles', () => {

        it('borra del equipo al que ya no es socio del gimnasio', () => {
            const padron = Array.from({ length: 9 }, (_, i) => socio(i + 1, 'Socio ' + (i + 1), true));
            const enEquipo = equipo(
                ...padron.map((p, i) => ficha(i + 1, 'Socio ' + (i + 1), 'VT-OK')),
                ficha(99, 'Ex socio', 'VT-OK'));

            const r = planificar(padron, enEquipo);

            expect(r.acciones.filter((a) => a.tipo === 'baja')).toEqual([{ tipo: 'baja', id: id(99) }]);
        });

        it('con el padrón vacío NO borra a nadie', () => {
            const r = planificar([], equipo(...[1, 2, 3, 4, 5].map((n) => ficha(n, 'S' + n, 'VT-OK'))));

            expect(r.acciones).toEqual([]);
            expect(r.bajasFrenadas).toBe(5);
        });

        it('si las bajas son demasiadas de una vez, se frenan todas y se avisa', () => {
            const padron = [socio(1, 'S1', true), socio(2, 'S2', true)];
            const enEquipo = equipo(...[1, 2, 3, 4, 5].map((n) => ficha(n, 'S' + n, 'VT-OK')));

            const r = planificar(padron, enEquipo);

            expect(r.acciones.filter((a) => a.tipo === 'baja')).toEqual([]);
            expect(r.bajasFrenadas).toBe(3);
        });

        it('no borra a las personas cargadas a mano en el equipo', () => {
            const enEquipo = new Map([['PRUEBA1', { id: 'PRUEBA1', name: 'Prueba', tag: '' }]]);

            const r = planificar([socio(1, 'Juan', true)], enEquipo);

            expect(r.acciones.filter((a) => a.tipo === 'baja')).toEqual([]);
            expect(r.bajasFrenadas).toBe(0);
        });
    });
});
