/**
 * ============================================
 * VELTRONIK - DEEP LINKS veltronik:// (Fase 2)
 * ============================================
 *
 * El camino de vuelta del login por navegador. El portal termina en
 * `veltronik://auth?code=...`, el sistema operativo despierta a Veltronik, y el código
 * llega al renderer, que lo canjea por la sesión (ver src/lib/desktopAuth.js).
 *
 * POR QUÉ HACE FALTA EL CANDADO DE INSTANCIA ÚNICA
 * En Windows y Linux, abrir un `veltronik://` NO le avisa a la app que ya está corriendo:
 * **lanza el ejecutable de nuevo**, con la URL entre los argumentos. Sin candado tendrías
 * dos Veltronik abiertos, y el que recibió el código sería el nuevo — el usuario vería su
 * ventana de siempre sin loguear y una segunda ventana recién abierta. Con el candado, la
 * instancia nueva muere al instante y le pasa sus argumentos a la que ya estaba.
 *
 * macOS es distinto: no relanza nada, emite el evento 'open-url'. Se contemplan los dos.
 */

const { app } = require('electron');
const path = require('path');

const PROTOCOL = 'veltronik';
const PROTOCOL_PREFIX = `${PROTOCOL}://`;

/** URL que llegó antes de que la ventana existiera. Se entrega cuando esté lista. */
let pendingUrl = null;

/** A quién avisarle. Lo setea initDeepLinks. */
let deliver = null;

/** Saca la primera URL veltronik:// de una lista de argumentos de línea de comandos. */
function findProtocolUrl(argv) {
    if (!Array.isArray(argv)) return null;
    return argv.find((arg) => typeof arg === 'string' && arg.startsWith(PROTOCOL_PREFIX)) || null;
}

/**
 * Registra a Veltronik como dueño del esquema veltronik://.
 *
 * En producción alcanza con el nombre. En desarrollo la app corre como un argumento de
 * electron.exe, así que hay que decirle al sistema el ejecutable Y el argumento; si no,
 * el deep link abriría Electron pelado sin el proyecto.
 */
function registerProtocol() {
    if (process.defaultApp && process.argv.length >= 2) {
        app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
    } else {
        app.setAsDefaultProtocolClient(PROTOCOL);
    }
}

/**
 * Arranca el manejo de deep links.
 *
 * @param {() => import('electron').BrowserWindow|null} getWindow
 * @param {(url: string) => void} onUrl  qué hacer con la URL (mandarla al renderer)
 * @returns {boolean} false si otra instancia ya tenía el candado — el llamador debe salir
 */
function initDeepLinks(getWindow, onUrl) {
    deliver = onUrl;

    // Si ya hay un Veltronik corriendo, esta instancia no va: le cede lo suyo y se va.
    const gotLock = app.requestSingleInstanceLock();
    if (!gotLock) return false;

    // Windows / Linux: la instancia que ya estaba recibe los argumentos de la nueva.
    app.on('second-instance', (_event, argv) => {
        const win = getWindow();
        if (win) {
            if (win.isMinimized()) win.restore();
            win.focus();
        }
        const url = findProtocolUrl(argv);
        if (url) handleUrl(url);
    });

    // macOS: no relanza, avisa.
    app.on('open-url', (event, url) => {
        event.preventDefault();
        handleUrl(url);
    });

    registerProtocol();

    // Arranque en frío: el usuario tocó el enlace con la app cerrada, y la URL vino en
    // los argumentos de este mismo proceso.
    const initial = findProtocolUrl(process.argv);
    if (initial) handleUrl(initial);

    return true;
}

/**
 * Entrega la URL. Quién decide si se puede entregar ya es `deliver` (lo pone main.cjs):
 * si la ventana está lista la manda, y si no llama a queue() para que espere a
 * flushPending(). Esa decisión vive allá porque es allá donde está la ventana.
 */
function handleUrl(url) {
    if (typeof url !== 'string' || !url.startsWith(PROTOCOL_PREFIX)) return;
    if (deliver) deliver(url);
}

/**
 * Entrega lo que haya quedado esperando. Se llama cuando la ventana ya puede recibir.
 * Es el caso del arranque en frío: la URL llega antes de que exista el renderer.
 */
function flushPending() {
    if (pendingUrl && deliver) {
        const url = pendingUrl;
        pendingUrl = null;
        deliver(url);
    }
}

/** Guarda una URL para entregarla más tarde (la ventana todavía no está). */
function queue(url) {
    pendingUrl = url;
}

module.exports = { initDeepLinks, flushPending, queue, findProtocolUrl, PROTOCOL, PROTOCOL_PREFIX };
