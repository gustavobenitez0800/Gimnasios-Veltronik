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
 */

const { app, safeStorage } = require('electron');
const fs = require('fs');
const path = require('path');

const CARPETA = 'nucleo';
const ARCHIVO = 'boveda.json';

function ruta() {
    return path.join(app.getPath('userData'), CARPETA, ARCHIVO);
}

/**
 * ¿Este sistema puede cifrar?
 *
 * Se pregunta cada vez y no se cachea: en Linux el llavero puede aparecer después de que la
 * app arrancó, y una respuesta guardada de más dejaría la bóveda apagada toda la sesión.
 */
function disponible() {
    try {
        return safeStorage.isEncryptionAvailable();
    } catch {
        return false;
    }
}

/** Todo el contenido del archivo. Ante cualquier problema, vacío. */
function leerArchivo() {
    try {
        const crudo = fs.readFileSync(ruta(), 'utf8');
        const datos = JSON.parse(crudo);
        return datos && typeof datos === 'object' ? datos : {};
    } catch {
        // No existe todavía (primer arranque), está corrupto, o no hay permisos.
        return {};
    }
}

/**
 * Escribe el archivo entero.
 *
 * Primero a un temporal y después rename, igual que las preferencias del terminal: si se
 * corta la luz en el medio —cosa nada rara en el local de un cliente— el archivo bueno queda
 * intacto en vez de quedar a medio escribir. Un token a medio escribir es un logout.
 */
function escribirArchivo(datos) {
    const destino = ruta();
    const temporal = `${destino}.tmp`;
    try {
        fs.mkdirSync(path.dirname(destino), { recursive: true });
        fs.writeFileSync(temporal, JSON.stringify(datos), 'utf8');
        fs.renameSync(temporal, destino);
        return true;
    } catch (e) {
        console.warn('[Veltronik] No se pudo escribir la bóveda:', e.message);
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
    const guardado = leerArchivo()[clave];
    if (typeof guardado !== 'string') return null;
    try {
        return safeStorage.decryptString(Buffer.from(guardado, 'base64'));
    } catch {
        return null;
    }
}

/** Guarda un valor cifrado. Devuelve false si no se pudo (y entonces NO se guardó nada). */
function escribir(clave, valor) {
    if (!disponible() || !clave || typeof valor !== 'string') return false;
    try {
        const datos = leerArchivo();
        datos[clave] = safeStorage.encryptString(valor).toString('base64');
        return escribirArchivo(datos);
    } catch (e) {
        console.warn('[Veltronik] No se pudo guardar en la bóveda:', e.message);
        return false;
    }
}

/** Borra una clave. Es el camino del logout. */
function borrar(clave) {
    if (!clave) return false;
    const datos = leerArchivo();
    if (!(clave in datos)) return true;
    delete datos[clave];
    return escribirArchivo(datos);
}

module.exports = { disponible, leer, escribir, borrar, ruta };
