/**
 * ============================================
 * VELTRONIK - PREFERENCIAS DEL TERMINAL (Fase 5)
 * ============================================
 *
 * Un JSON en la carpeta de datos del usuario. Guarda lo que es de ESTA MÁQUINA y no de
 * la cuenta: si arranca con Windows, si al cerrar se va a la bandeja, dónde estaba la
 * ventana. Nada de esto tiene sentido en la nube — el mismo dueño puede querer que el
 * terminal del mostrador arranque solo y su notebook no.
 *
 * Sin dependencias nuevas: `electron-store` haría exactamente esto y son 40 líneas.
 *
 * <b>Nunca rompe la app.</b> Un archivo corrupto, un disco lleno o una carpeta sin
 * permisos devuelven los valores por defecto y siguen de largo: una preferencia de
 * ventana no puede impedir que un gimnasio abra su caja.
 */

const { app } = require('electron');
const fs = require('fs');
const path = require('path');

const FILE_NAME = 'veltronik-terminal.json';

/** Valores por defecto, pensados para un terminal de mostrador. */
const DEFAULTS = Object.freeze({
    /** ¿Arrancar Veltronik al iniciar sesión en Windows? Lo decide el dueño. */
    openAtLogin: false,
    /**
     * ¿Cerrar la ventana esconde a la bandeja en vez de salir?
     *
     * Por defecto SÍ: en un mostrador, la X de la ventana la toca cualquiera sin querer,
     * y cerrar la app deja al gimnasio sin sistema hasta que alguien la vuelva a abrir.
     * Para salir de verdad está "Salir de Veltronik", en el menú y en la bandeja.
     */
    closeToTray: true,
    /** Última posición y tamaño de la ventana (null = decidir solo). */
    windowBounds: null,
    /** ¿La ventana estaba maximizada? */
    windowMaximized: false,
});

function filePath() {
    return path.join(app.getPath('userData'), FILE_NAME);
}

/** Lee todas las preferencias. Ante cualquier problema, los defaults. */
function readAll() {
    try {
        const raw = fs.readFileSync(filePath(), 'utf8');
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return { ...DEFAULTS };
        return { ...DEFAULTS, ...parsed };
    } catch {
        // No existe todavía (primer arranque), está corrupto, o no hay permisos.
        return { ...DEFAULTS };
    }
}

/**
 * Escribe las preferencias. Primero a un archivo temporal y después rename: si se corta
 * la luz en el medio —cosa nada rara en el local de un cliente— el archivo bueno queda
 * intacto en vez de quedar a medio escribir.
 */
function writeAll(values) {
    const target = filePath();
    const temp = `${target}.tmp`;
    try {
        fs.writeFileSync(temp, JSON.stringify(values, null, 2), 'utf8');
        fs.renameSync(temp, target);
        return true;
    } catch (e) {
        console.warn('[Veltronik] No se pudieron guardar las preferencias del terminal:', e.message);
        try { fs.unlinkSync(temp); } catch { /* nada que limpiar */ }
        return false;
    }
}

/** Lee una preferencia. */
function get(key) {
    return readAll()[key];
}

/** Escribe una preferencia (lee-modifica-escribe: el archivo es chico). */
function set(key, value) {
    const values = readAll();
    values[key] = value;
    return writeAll(values);
}

module.exports = { get, set, readAll, writeAll, DEFAULTS, FILE_NAME };
