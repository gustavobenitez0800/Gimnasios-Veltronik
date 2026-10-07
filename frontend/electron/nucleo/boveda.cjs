/**
 * ============================================
 * VELTRONIK - LA BÓVEDA
 * ============================================
 *
 * Donde se guardan los tokens de sesión en el escritorio, cifrados por el sistema operativo.
 *
 * <b>Qué cambia respecto de antes.</b> Hasta acá la sesión vivía en el `localStorage` de
 * Chromium: un archivo en el perfil del usuario, en claro. Cualquiera con acceso a esa
 * carpeta —el sobrino que arregla la PC, un pendrive, un backup mal guardado— se llevaba un
 * token con el que entrar al gimnasio desde otra máquina. Ahora se guarda cifrado con
 * `safeStorage`, que en Windows usa DPAPI: la clave la tiene el sistema operativo y está
 * atada a la cuenta de usuario de ESA máquina. Copiar el archivo a otra PC no sirve de nada.
 *
 * <b>Si el sistema no puede cifrar, no se finge que sí.</b> En algunos Linux sin llavero
 * `safeStorage` no está disponible. Ahí esto responde que no y el renderer se queda con el
 * `localStorage` de siempre. Guardar en un archivo llamado "bóveda" algo que en realidad
 * está en claro sería peor que no tener bóveda: haría creer que el problema está resuelto.
 *
 * <b>Nunca rompe la app.</b> Un archivo corrupto, un disco lleno, una clave que ya no
 * descifra —pasa si se restauró el perfil de otra máquina— devuelven "no hay nada guardado".
 * El peor caso es que haya que iniciar sesión de nuevo, no que la app no abra.
 *
 * <b>⚠️ En Windows el archivo no siempre se deja tocar.</b> Reemplazar un archivo que OTRO
 * proceso tiene abierto falla con EPERM, y el antivirus abre la bóveda cada vez que se la
 * escribe: pasó en la PC del dueño. Sin esperar, el token nuevo no entraba, en el disco
 * quedaba el anterior —ya gastado, porque el refresh token es de un solo uso— y usarlo de
 * nuevo le hacía revocar a Supabase la familia entera de sesiones. Por eso acá se espera a
 * que lo suelten, y lo que no se pudo guardar se dice: el renderer lo guarda en otro lado y
 * sabe que eso es lo más nuevo (ver `src/lib/boveda.js`).
 */

const fs = require('fs');
const path = require('path');

const CARPETA = 'nucleo';
const ARCHIVO = 'boveda.json';

/**
 * Cuánto se espera antes de cada reintento cuando el archivo está tomado: un segundo en total.
 *
 * Medido el 06/10/2026 con otro proceso teniendo abierto el archivo: el reemplazo da EPERM
 * mientras lo tiene —lo abra como lo abra— y anda al primer intento después de que lo suelta.
 * Un antivirus lo tiene milisegundos; el segundo entero es para el disco lento de un mostrador.
 * Son esperas del proceso principal, que mientras tanto no atiende a la ventana: por eso
 * arrancan cortas y por eso hay tope.
 */
const ESPERAS_MS = Object.freeze([10, 20, 40, 80, 150, 300, 400]);

/** Los errores de "otro proceso lo tiene abierto". Se van solos cuando lo suelta. */
const DE_PASO = new Set(['EPERM', 'EBUSY', 'EACCES']);

/** Frena el proceso principal `ms` milisegundos. Sincrónico, como todo lo de este archivo. */
function dormir(ms) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Arma una bóveda sobre un archivo y un cifrado.
 *
 * Las dos cosas llegan de afuera para poder probarla sin Electron: la suite corre sobre el
 * Node de la máquina y el binario de Electron ahí no existe (misma costura que `respaldo.cjs`).
 *
 * @param {object}   deps
 * @param {Function} deps.ruta      devuelve la ruta del archivo
 * @param {object}   deps.cifrado   el `safeStorage` de Electron, o algo con su forma
 * @param {Function} [deps.esperar] frena `ms` milisegundos entre un intento y el siguiente
 * @param {Function} [deps.avisar]  console.warn
 */
function crearBoveda({ ruta, cifrado, esperar = dormir, avisar = console.warn }) {
    /** Insiste con una operación del disco mientras el error sea de los que se van solos. */
    function conPaciencia(operacion) {
        for (let intento = 0; ; intento += 1) {
            try {
                return operacion();
            } catch (e) {
                if (!DE_PASO.has(e.code) || intento >= ESPERAS_MS.length) throw e;
                esperar(ESPERAS_MS[intento]);
            }
        }
    }

    /**
     * ¿Este sistema puede cifrar?
     *
     * Se pregunta cada vez y no se cachea: en Linux el llavero puede aparecer después de que
     * la app arrancó, y una respuesta guardada de más dejaría la bóveda apagada toda la sesión.
     */
    function disponible() {
        try {
            return cifrado.isEncryptionAvailable();
        } catch {
            return false;
        }
    }

    /**
     * Todo el contenido del archivo.
     *
     * Distingue dos cosas que antes se veían igual: que no haya nada guardado, y que haya pero
     * no se haya dejado leer. La segunda (`ilegible`) no autoriza a escribir encima.
     */
    function leerArchivo() {
        let crudo;
        try {
            crudo = conPaciencia(() => fs.readFileSync(ruta(), 'utf8'));
        } catch (e) {
            // No existe todavía: es el primer arranque, y no hay nada que cuidar.
            if (e.code === 'ENOENT') return { datos: {}, ilegible: false };
            // Está, y no se dejó leer ni esperando.
            return { datos: {}, ilegible: true };
        }
        try {
            const datos = JSON.parse(crudo);
            return { datos: datos && typeof datos === 'object' ? datos : {}, ilegible: false };
        } catch {
            // Corrupto: lo que había ya no sirve, y escribir encima es lo que lo arregla.
            return { datos: {}, ilegible: false };
        }
    }

    /**
     * Escribe el archivo entero.
     *
     * Primero a un temporal y después rename, igual que las preferencias del terminal: si se
     * corta la luz en el medio —cosa nada rara en el local de un cliente— el archivo bueno
     * queda intacto en vez de quedar a medio escribir. Un token a medio escribir es un logout.
     */
    function escribirArchivo(datos) {
        const destino = ruta();
        const temporal = `${destino}.tmp`;
        try {
            fs.mkdirSync(path.dirname(destino), { recursive: true });
            conPaciencia(() => fs.writeFileSync(temporal, JSON.stringify(datos), 'utf8'));
            conPaciencia(() => fs.renameSync(temporal, destino));
            return true;
        } catch (e) {
            avisar('[Veltronik] No se pudo escribir la bóveda:', e.message);
            try { fs.unlinkSync(temporal); } catch { /* nada que limpiar */ }
            return false;
        }
    }

    /**
     * Devuelve el valor guardado con esa clave, o null.
     *
     * <p>Una entrada que no descifra se trata como si no estuviera. Pasa cuando el perfil se
     * restauró desde otra máquina: la clave de DPAPI es distinta y esos bytes ya no significan
     * nada. Tirar un error ahí dejaría la app sin arrancar por un dato que igual no sirve.</p>
     */
    function leer(clave) {
        if (!disponible() || !clave) return null;
        const guardado = leerArchivo().datos[clave];
        if (typeof guardado !== 'string') return null;
        try {
            return cifrado.decryptString(Buffer.from(guardado, 'base64'));
        } catch {
            return null;
        }
    }

    /** Guarda un valor cifrado. Devuelve false si no se pudo (y entonces NO se guardó nada). */
    function escribir(clave, valor) {
        if (!disponible() || !clave || typeof valor !== 'string') return false;
        try {
            const { datos, ilegible } = leerArchivo();
            if (ilegible) {
                // El archivo se escribe ENTERO: sin saber qué tiene, guardar esta clave sería
                // borrar todas las demás. Mejor decir que no.
                avisar('[Veltronik] La bóveda no se dejó leer: no se escribe encima.');
                return false;
            }
            datos[clave] = cifrado.encryptString(valor).toString('base64');
            return escribirArchivo(datos);
        } catch (e) {
            avisar('[Veltronik] No se pudo guardar en la bóveda:', e.message);
            return false;
        }
    }

    /** Borra una clave. Es el camino del logout. Devuelve false si no se pudo. */
    function borrar(clave) {
        if (!clave) return false;
        const { datos, ilegible } = leerArchivo();
        // Sin poder leerlo no se sabe si la clave sigue ahí: no se puede decir que se borró.
        if (ilegible) return false;
        if (!(clave in datos)) return true;
        delete datos[clave];
        return escribirArchivo(datos);
    }

    return { disponible, leer, escribir, borrar, ruta };
}

/**
 * La de verdad: la carpeta de datos del usuario y el cifrado del sistema operativo.
 *
 * `electron` se pide recién acá y no arriba del archivo, para que los tests puedan cargar
 * este módulo. La ruta se sigue calculando en cada operación, como antes.
 */
let laDeVerdad = null;

function real() {
    if (!laDeVerdad) {
        const { app, safeStorage } = require('electron');
        laDeVerdad = crearBoveda({
            ruta: () => path.join(app.getPath('userData'), CARPETA, ARCHIVO),
            cifrado: safeStorage,
        });
    }
    return laDeVerdad;
}

module.exports = {
    disponible: () => real().disponible(),
    leer: (clave) => real().leer(clave),
    escribir: (clave, valor) => real().escribir(clave, valor),
    borrar: (clave) => real().borrar(clave),
    ruta: () => real().ruta(),
    crearBoveda,
    ESPERAS_MS,
};
