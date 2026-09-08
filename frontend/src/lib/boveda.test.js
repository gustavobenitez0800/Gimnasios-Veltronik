// @vitest-environment happy-dom
//
// ============================================
// VELTRONIK - Tests de la bóveda de sesión
// ============================================
// Lo que se prueba acá es LA MUDANZA, que es la parte que puede salir muy mal en silencio.
//
// Los clientes que ya están adentro tienen su token en `localStorage`. Si el almacén nuevo
// mirara solo la bóveda, el lunes a la mañana TODOS los gimnasios se encontrarían con la
// pantalla de login sin haber hecho nada, y con la contraseña en manos de alguien que no
// está en el mostrador. Y si la mudanza borrara el original antes de confirmar que el
// destino quedó escrito, un disco lleno en el medio dejaría al gimnasio sin sesión y sin
// forma de recuperarla.
//
// Las dos cosas se prueban acá porque las dos son invisibles hasta que le pasan a un cliente.
// ============================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { almacenDeSesion, sesionGuardada } from './boveda';

const CLAVE = 'sb-proyecto-auth-token';

/** Una bóveda de mentira, con un interruptor para simular que el disco no deja escribir. */
function bovedaFalsa({ puedeEscribir = true, contenido = {} } = {}) {
    const datos = { ...contenido };
    return {
        datos,
        disponible: vi.fn(async () => true),
        leer: vi.fn(async (clave) => (clave in datos ? datos[clave] : null)),
        escribir: vi.fn(async (clave, valor) => {
            if (!puedeEscribir) return false;
            datos[clave] = valor;
            return true;
        }),
        borrar: vi.fn(async (clave) => { delete datos[clave]; return true; }),
    };
}

function montarEscritorio(boveda) {
    window.electronAPI = { nucleo: { boveda } };
}

beforeEach(() => {
    delete window.electronAPI;
    window.localStorage.clear();
});

describe('elegir el almacén', () => {
    it('en la web no se mete: devuelve undefined y Supabase usa el suyo', () => {
        expect(almacenDeSesion()).toBeUndefined();
    });

    it('en el escritorio devuelve la bóveda', () => {
        montarEscritorio(bovedaFalsa());
        expect(almacenDeSesion()).toBeDefined();
    });
});

describe('la mudanza desde localStorage', () => {
    it('un cliente que ya estaba adentro NO se desloguea al actualizar', async () => {
        // Este es EL test de esta tanda. Sin la mudanza, `getItem` devolvería null y la app
        // mandaría al login a todos los gimnasios que ya tenían sesión.
        window.localStorage.setItem(CLAVE, '{"refresh_token":"rt","user":{"id":"u1"}}');
        const boveda = bovedaFalsa();
        montarEscritorio(boveda);

        const valor = await almacenDeSesion().getItem(CLAVE);

        expect(valor).toContain('"refresh_token":"rt"');
    });

    it('después de mudar, el token queda en la bóveda y NO en el lugar viejo', async () => {
        window.localStorage.setItem(CLAVE, 'la-sesion');
        const boveda = bovedaFalsa();
        montarEscritorio(boveda);

        await almacenDeSesion().getItem(CLAVE);

        expect(boveda.datos[CLAVE]).toBe('la-sesion');
        expect(window.localStorage.getItem(CLAVE)).toBeNull();
    });

    it('si la bóveda NO pudo guardar, el original NO se borra', async () => {
        // El orden importa: escribir, verificar, y recién entonces borrar. Al revés, un
        // disco lleno en el medio deja al gimnasio sin sesión y sin forma de recuperarla.
        window.localStorage.setItem(CLAVE, 'la-sesion');
        const boveda = bovedaFalsa({ puedeEscribir: false });
        montarEscritorio(boveda);

        const valor = await almacenDeSesion().getItem(CLAVE);

        expect(valor).toBe('la-sesion');
        expect(window.localStorage.getItem(CLAVE)).toBe('la-sesion');
    });

    it('mudar ocurre una sola vez: la segunda lectura ya sale de la bóveda', async () => {
        window.localStorage.setItem(CLAVE, 'la-sesion');
        const boveda = bovedaFalsa();
        montarEscritorio(boveda);
        const almacen = almacenDeSesion();

        await almacen.getItem(CLAVE);
        await almacen.getItem(CLAVE);

        expect(boveda.escribir).toHaveBeenCalledTimes(1);
    });

    it('sin nada guardado en ningún lado, no hay sesión y punto', async () => {
        montarEscritorio(bovedaFalsa());
        expect(await almacenDeSesion().getItem(CLAVE)).toBeNull();
    });
});

describe('guardar y borrar', () => {
    it('guarda en la bóveda, no en el lugar viejo', async () => {
        const boveda = bovedaFalsa();
        montarEscritorio(boveda);

        await almacenDeSesion().setItem(CLAVE, 'nueva');

        expect(boveda.datos[CLAVE]).toBe('nueva');
        expect(window.localStorage.getItem(CLAVE)).toBeNull();
    });

    it('si el sistema no puede cifrar, guarda donde se guardaba siempre', async () => {
        // Antes que perder la sesión —y dejar al mostrador sin sistema— se vuelve al
        // comportamiento anterior. Lo que no se hace es fingir que quedó cifrada.
        montarEscritorio(bovedaFalsa({ puedeEscribir: false }));

        await almacenDeSesion().setItem(CLAVE, 'nueva');

        expect(window.localStorage.getItem(CLAVE)).toBe('nueva');
    });

    it('cerrar sesión borra TODAS las copias, no la más nueva', async () => {
        // Si el logout limpiara solo la bóveda, el token de la versión anterior sobreviviría
        // en el lugar viejo y la próxima lectura lo mudaría de vuelta: una sesión que
        // resucita sola después de cerrarla.
        window.localStorage.setItem(CLAVE, 'vieja');
        const boveda = bovedaFalsa({ contenido: { [CLAVE]: 'nueva' } });
        montarEscritorio(boveda);

        await almacenDeSesion().removeItem(CLAVE);

        expect(boveda.datos[CLAVE]).toBeUndefined();
        expect(window.localStorage.getItem(CLAVE)).toBeNull();
    });
});

describe('leer la sesión guardada sin pasar por Supabase', () => {
    it('devuelve la sesión cuando está completa', async () => {
        montarEscritorio(bovedaFalsa({
            contenido: { [CLAVE]: '{"refresh_token":"rt","user":{"id":"u1","email":"a@b.c"}}' },
        }));

        const s = await sesionGuardada(CLAVE);

        expect(s.user.email).toBe('a@b.c');
    });

    it('un resto a medio escribir NO cuenta como sesión', async () => {
        // Sin refresh_token o sin usuario no hay nada que sostener, y tratarlo como sesión
        // abriría el mostrador con un usuario vacío.
        montarEscritorio(bovedaFalsa({ contenido: { [CLAVE]: '{"user":{"id":"u1"}}' } }));
        expect(await sesionGuardada(CLAVE)).toBeNull();

        montarEscritorio(bovedaFalsa({ contenido: { [CLAVE]: '{"refresh_token":"rt"}' } }));
        expect(await sesionGuardada(CLAVE)).toBeNull();
    });

    it('basura en el archivo no rompe el arranque', async () => {
        montarEscritorio(bovedaFalsa({ contenido: { [CLAVE]: 'no soy json' } }));
        expect(await sesionGuardada(CLAVE)).toBeNull();
    });

    it('en la web lee del lugar de siempre', async () => {
        window.localStorage.setItem(CLAVE, '{"refresh_token":"rt","user":{"id":"u1"}}');
        expect((await sesionGuardada(CLAVE)).user.id).toBe('u1');
    });
});
