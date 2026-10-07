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

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { almacenDeSesion, sesionGuardada, _reiniciar } from './boveda';

const CLAVE = 'sb-proyecto-auth-token';

/**
 * Una bóveda de mentira, con interruptores para simular que el disco no deja escribir o
 * borrar. Se pueden mover en el medio de un test (`deja.escribir = true`): es lo que pasa
 * cuando el antivirus suelta el archivo.
 */
function bovedaFalsa({ puedeEscribir = true, puedeBorrar = true, contenido = {} } = {}) {
    const datos = { ...contenido };
    const deja = { escribir: puedeEscribir, borrar: puedeBorrar };
    return {
        datos,
        deja,
        disponible: vi.fn(async () => true),
        leer: vi.fn(async (clave) => (clave in datos ? datos[clave] : null)),
        escribir: vi.fn(async (clave, valor) => {
            if (!deja.escribir) return false;
            datos[clave] = valor;
            return true;
        }),
        borrar: vi.fn(async (clave) => {
            if (!deja.borrar) return false;
            delete datos[clave];
            return true;
        }),
    };
}

/** Una sesión como la guarda Supabase. `vence` es su `expires_at`: la más nueva vence más tarde. */
function sesion(vence, refreshToken) {
    return JSON.stringify({
        access_token: `at-${vence}`, refresh_token: refreshToken, expires_at: vence, user: { id: 'u1' },
    });
}

function montarEscritorio(boveda) {
    window.electronAPI = { nucleo: { boveda } };
}

beforeEach(() => {
    delete window.electronAPI;
    window.localStorage.clear();
    _reiniciar();
});

afterEach(() => {
    vi.useRealTimers();
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

// ⚠️ EL CAMINO 2 DE "LA APP ME MANDA AL LOGIN SOLA".
// En Windows, reemplazar un archivo que OTRO proceso tiene abierto falla con EPERM, y el
// antivirus abre la bóveda cada vez que se la escribe (reproducido en la PC del dueño). El
// guardado caía entonces en el lugar viejo, que es lo correcto… pero la lectura miraba primero
// la bóveda, donde seguía el token ANTERIOR. Ese token ya estaba gastado: el refresh token de
// Supabase es de un solo uso, y presentarlo de nuevo revoca la familia entera de sesiones.
describe('⚠️ cuando Windows no deja escribir la bóveda', () => {
    it('⚠️ el token nuevo no se pierde: la lectura siguiente devuelve el nuevo, no el viejo', async () => {
        const boveda = bovedaFalsa({ puedeEscribir: false, contenido: { [CLAVE]: sesion(100, 'rt-gastado') } });
        montarEscritorio(boveda);
        const almacen = almacenDeSesion();

        await almacen.setItem(CLAVE, sesion(200, 'rt-nuevo'));

        expect(await almacen.getItem(CLAVE)).toContain('rt-nuevo');
    });

    it('el arranque sin conexión también abre con la sesión nueva', async () => {
        const boveda = bovedaFalsa({ puedeEscribir: false, contenido: { [CLAVE]: sesion(100, 'rt-gastado') } });
        montarEscritorio(boveda);

        await almacenDeSesion().setItem(CLAVE, sesion(200, 'rt-nuevo'));

        expect((await sesionGuardada(CLAVE)).refresh_token).toBe('rt-nuevo');
    });

    it('cuando vuelve a dejar, el token nuevo se muda a la bóveda y no queda copia en claro', async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        const boveda = bovedaFalsa({ puedeEscribir: false, contenido: { [CLAVE]: sesion(100, 'rt-gastado') } });
        montarEscritorio(boveda);
        const almacen = almacenDeSesion();
        await almacen.setItem(CLAVE, sesion(200, 'rt-nuevo'));

        boveda.deja.escribir = true;
        vi.advanceTimersByTime(61_000);
        const leido = await almacen.getItem(CLAVE);

        expect(leido).toContain('rt-nuevo');
        expect(boveda.datos[CLAVE]).toContain('rt-nuevo');
        expect(window.localStorage.getItem(CLAVE)).toBeNull();
    });

    // Cada intento le cuesta al proceso principal hasta un segundo de reintentos, y Supabase
    // lee la sesión en CADA pedido a la API: insistir en cada lectura sería colgar la app
    // justo cuando el disco anda mal.
    it('mientras no deja, no insiste en cada lectura: prueba una vez por minuto', async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        const boveda = bovedaFalsa({ puedeEscribir: false, contenido: { [CLAVE]: sesion(100, 'rt-gastado') } });
        montarEscritorio(boveda);
        const almacen = almacenDeSesion();
        await almacen.setItem(CLAVE, sesion(200, 'rt-nuevo'));

        await almacen.getItem(CLAVE);
        await almacen.getItem(CLAVE);
        await almacen.getItem(CLAVE);
        expect(boveda.escribir).toHaveBeenCalledTimes(1); // solo el del guardado

        vi.advanceTimersByTime(61_000);
        await almacen.getItem(CLAVE);
        expect(boveda.escribir).toHaveBeenCalledTimes(2);
    });

    it('un guardado que sí entra limpia la copia en claro que dejó uno anterior', async () => {
        window.localStorage.setItem(CLAVE, sesion(150, 'rt-de-un-guardado-que-fallo'));
        const boveda = bovedaFalsa({ contenido: { [CLAVE]: sesion(100, 'rt-gastado') } });
        montarEscritorio(boveda);

        await almacenDeSesion().setItem(CLAVE, sesion(200, 'rt-nuevo'));

        expect(boveda.datos[CLAVE]).toContain('rt-nuevo');
        expect(window.localStorage.getItem(CLAVE)).toBeNull();
    });

    // Las versiones anteriores, cuando un guardado posterior SÍ entraba, dejaban tirada en el
    // lugar viejo la copia del que había fallado. Esas PCs —justo las que sufrieron el
    // problema— llegan a esta versión con un token gastado ahí: no puede ganarle a la bóveda.
    it('⚠️ un resto viejo en el lugar de antes NO le gana a una bóveda más nueva', async () => {
        window.localStorage.setItem(CLAVE, sesion(100, 'rt-gastado'));
        const boveda = bovedaFalsa({ contenido: { [CLAVE]: sesion(200, 'rt-nuevo') } });
        montarEscritorio(boveda);

        const leido = await almacenDeSesion().getItem(CLAVE);

        expect(leido).toContain('rt-nuevo');
        expect(boveda.escribir).not.toHaveBeenCalled();
        expect(boveda.datos[CLAVE]).toContain('rt-nuevo');
        expect(window.localStorage.getItem(CLAVE)).toBeNull();
    });

    it('basura en el lugar viejo tampoco le gana a una sesión buena de la bóveda', async () => {
        window.localStorage.setItem(CLAVE, 'no soy json');
        montarEscritorio(bovedaFalsa({ contenido: { [CLAVE]: sesion(200, 'rt-nuevo') } }));

        expect(await almacenDeSesion().getItem(CLAVE)).toContain('rt-nuevo');
    });

    it('lo que no es una sesión (el verificador del login con Google) también sale del último guardado', async () => {
        const VERIFICADOR = `${CLAVE}-code-verifier`;
        montarEscritorio(bovedaFalsa({ puedeEscribir: false, contenido: { [VERIFICADOR]: 'verificador-viejo' } }));
        const almacen = almacenDeSesion();

        await almacen.setItem(VERIFICADOR, 'verificador-nuevo');

        expect(await almacen.getItem(VERIFICADOR)).toBe('verificador-nuevo');
    });

    // Una lectura nuestra (el arranque sin conexión) puede cruzarse con un guardado de
    // Supabase (la renovación del token). Si la lectura decide mudar el token que vio y el
    // guardado entra en el medio, la mudanza llega última y deja en la bóveda el anterior.
    it('⚠️ una lectura y un guardado a la vez no dejan el token anterior en la bóveda', async () => {
        // Un proceso principal de mentira que atiende de a un pedido, en orden de llegada y
        // tardando un instante cada uno: así contesta el IPC de verdad.
        const datos = { [CLAVE]: sesion(100, 'rt-gastado') };
        let cola = Promise.resolve();
        const atender = (hacer) => {
            const turno = cola.then(() => new Promise((ok) => setTimeout(ok, 0))).then(hacer);
            cola = turno;
            return turno;
        };
        montarEscritorio({
            leer: (clave) => atender(() => (clave in datos ? datos[clave] : null)),
            escribir: (clave, valor) => atender(() => { datos[clave] = valor; return true; }),
            borrar: (clave) => atender(() => { delete datos[clave]; return true; }),
        });
        // Un guardado anterior no pudo entrar a la bóveda y quedó en el lugar viejo.
        window.localStorage.setItem(CLAVE, sesion(200, 'rt-del-medio'));

        const lectura = sesionGuardada(CLAVE);
        const guardado = almacenDeSesion().setItem(CLAVE, sesion(300, 'rt-ultimo'));
        await Promise.all([lectura, guardado]);

        expect(datos[CLAVE]).toContain('rt-ultimo');
        expect(await almacenDeSesion().getItem(CLAVE)).toContain('rt-ultimo');
    });
});

// El espejo del anterior: si lo que no entra a la bóveda es el BORRADO, la sesión cerrada
// queda guardada. Con internet se cae sola (el servidor ya la dio de baja), pero sin
// conexión el mostrador abre con lo guardado: alguien que cerró sesión volvería a estar adentro.
describe('⚠️ cuando Windows no deja borrar de la bóveda', () => {
    it('⚠️ la sesión cerrada NO resucita', async () => {
        const boveda = bovedaFalsa({ puedeBorrar: false, contenido: { [CLAVE]: sesion(100, 'rt-de-quien-salio') } });
        montarEscritorio(boveda);
        const almacen = almacenDeSesion();

        await almacen.removeItem(CLAVE);

        expect(await almacen.getItem(CLAVE)).toBeNull();
        expect(await sesionGuardada(CLAVE)).toBeNull();
    });

    it('apenas deja, la borra de verdad', async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        const boveda = bovedaFalsa({ puedeBorrar: false, contenido: { [CLAVE]: sesion(100, 'rt-de-quien-salio') } });
        montarEscritorio(boveda);
        const almacen = almacenDeSesion();
        await almacen.removeItem(CLAVE);

        boveda.deja.borrar = true;
        vi.advanceTimersByTime(61_000);

        expect(await almacen.getItem(CLAVE)).toBeNull();
        expect(boveda.datos[CLAVE]).toBeUndefined();
    });

    it('el que entra después entra normal, aunque el borrado siga sin poder', async () => {
        const boveda = bovedaFalsa({ puedeBorrar: false, contenido: { [CLAVE]: sesion(100, 'rt-de-quien-salio') } });
        montarEscritorio(boveda);
        const almacen = almacenDeSesion();
        await almacen.removeItem(CLAVE);

        await almacen.setItem(CLAVE, sesion(200, 'rt-del-que-entro'));

        expect(await almacen.getItem(CLAVE)).toContain('rt-del-que-entro');
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
