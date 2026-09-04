import { describe, it, expect, vi } from 'vitest';

// `molinete.cjs` corre en el proceso principal de Electron y pide `app` para saber dónde
// guardar el espejo. Acá solo se prueba la parte pura —el plan— así que alcanza con que el
// require no explote.
vi.mock('electron', () => ({ app: { getPath: () => '.' } }));

const { planificar } = await import('./molinete.cjs');

/** Un id de socio como viaja adentro del equipo: UUID sin guiones. */
const id = (n) => String(n).padStart(32, '0');

const socio = (n, nombre, permitido) => ({ id: id(n), nombre, permitido });

const equipoCon = (...ids) => new Map(ids.map((x) => [id(x), { nombre: `Socio ${x}` }]));

/**
 * La sincronización del molinete es de las pocas cosas del sistema que pueden hacer un daño
 * IRREVERSIBLE: borrar a alguien del equipo le borra la cara, y recuperarla exige tener a la
 * persona parada enfrente otra vez. Estos tests cuidan sobre todo eso.
 */
describe('el plan de sincronización', () => {

    it('da de alta al socio que el equipo no tiene, con su horario', () => {
        const { acciones } = planificar([socio(1, 'Juan', true)], new Map(), {});

        expect(acciones).toEqual([{ tipo: 'alta', id: id(1), nombre: 'Juan', permitido: true }]);
    });

    /**
     * Lo que hace que una sincronización normal —donde no pasó nada— sean cero pedidos en vez
     * de 385 contra un aparato de red local.
     */
    it('no toca al socio que ya está igual', () => {
        const espejo = { [id(1)]: { nombre: 'Socio 1', permitido: true } };

        const { acciones } = planificar([socio(1, 'Socio 1', true)], equipoCon(1), espejo);

        expect(acciones).toEqual([]);
    });

    it('le cambia el horario al que pagó, y solo el horario', () => {
        const espejo = { [id(1)]: { nombre: 'Socio 1', permitido: false } };

        const { acciones } = planificar([socio(1, 'Socio 1', true)], equipoCon(1), espejo);

        expect(acciones).toEqual([{ tipo: 'horario', id: id(1), nombre: 'Socio 1', permitido: true }]);
    });

    it('renombra al socio al que le corrigieron el nombre', () => {
        const espejo = { [id(1)]: { nombre: 'Socio 1', permitido: true } };

        const { acciones } = planificar([socio(1, 'Juan Pérez', true)], equipoCon(1), espejo);

        expect(acciones).toEqual([{ tipo: 'renombrar', id: id(1), nombre: 'Juan Pérez' }]);
    });

    it('sin espejo reaplica el horario: es una caché, no la verdad', () => {
        const { acciones } = planificar([socio(1, 'Socio 1', true)], equipoCon(1), {});

        expect(acciones.map((a) => a.tipo)).toEqual(['horario']);
    });

    // ─────────────────────────────────────────────────────────────────────────

    describe('las bajas, que son irreversibles', () => {

        it('borra del equipo al que ya no es socio del gimnasio', () => {
            const padron = [socio(1, 'Socio 1', true), socio(2, 'Socio 2', true),
                socio(3, 'Socio 3', true), socio(4, 'Socio 4', true),
                socio(5, 'Socio 5', true), socio(6, 'Socio 6', true),
                socio(7, 'Socio 7', true), socio(8, 'Socio 8', true),
                socio(9, 'Socio 9', true)];

            const { acciones } = planificar(padron, equipoCon(1, 2, 3, 4, 5, 6, 7, 8, 9, 99), {});

            expect(acciones.filter((a) => a.tipo === 'baja')).toEqual([{ tipo: 'baja', id: id(99) }]);
        });

        /**
         * El escenario que este freno existe para evitar: el padrón llega vacío o cortado por
         * un error, y una sola corrida deja al gimnasio entero teniendo que sacarse la foto de
         * nuevo, uno por uno.
         */
        it('con el padrón vacío NO borra a nadie', () => {
            const { acciones, bajasFrenadas } = planificar([], equipoCon(1, 2, 3, 4, 5), {});

            expect(acciones).toEqual([]);
            expect(bajasFrenadas).toBe(5);
        });

        it('si las bajas son demasiadas de una vez, se frenan todas y se avisa', () => {
            const padron = [socio(1, 'Socio 1', true), socio(2, 'Socio 2', true)];

            const { acciones, bajasFrenadas } = planificar(padron, equipoCon(1, 2, 3, 4, 5), {});

            expect(acciones.filter((a) => a.tipo === 'baja')).toEqual([]);
            expect(bajasFrenadas).toBe(3);
        });

        /**
         * Alguien pudo haber cargado una persona a mano en el equipo —una prueba, el técnico—
         * y esos ids no tienen nuestra forma. Borrarle la cara a alguien que no pusimos
         * nosotros no es nuestro trabajo.
         */
        it('no borra a las personas cargadas a mano en el equipo', () => {
            const equipo = new Map([['PRUEBA1', { nombre: 'Prueba Veltronik' }]]);

            const { acciones, bajasFrenadas } = planificar([socio(1, 'Socio 1', true)], equipo, {});

            expect(acciones.filter((a) => a.tipo === 'baja')).toEqual([]);
            expect(bajasFrenadas).toBe(0);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────

    it('el espejo nuevo refleja lo que se le va a dejar al equipo', () => {
        const { espejoNuevo } = planificar(
            [socio(1, 'Juan', true), socio(2, 'Ana', false)], new Map(), {});

        expect(espejoNuevo).toEqual({
            [id(1)]: { nombre: 'Juan', permitido: true },
            [id(2)]: { nombre: 'Ana', permitido: false },
        });
    });

    it('el nombre se recorta a lo que entra en la pantalla del equipo', () => {
        const largo = 'Maria Esperanza de los Angeles Fernandez';

        const { acciones } = planificar([socio(1, largo, true)], new Map(), {});

        expect(acciones[0].nombre).toHaveLength(32);
    });
});
