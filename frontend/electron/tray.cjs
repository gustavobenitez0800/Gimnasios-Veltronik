/**
 * ============================================
 * VELTRONIK - ÍCONO DE BANDEJA (Fase 5)
 * ============================================
 *
 * En un mostrador la X de la ventana la toca cualquiera sin querer, y hasta ahora eso
 * cerraba el sistema: el gimnasio se quedaba sin poder cobrar ni registrar accesos hasta
 * que alguien se diera cuenta y volviera a abrir la app. Con la bandeja, cerrar esconde;
 * salir de verdad es una acción aparte y explícita.
 *
 * El ícono queda al lado del reloj, con menú de clic derecho, y un doble clic trae la
 * ventana de vuelta — que es donde la gente busca primero.
 */

const { Tray, Menu, app, nativeImage } = require('electron');
const path = require('path');

let tray = null;

/**
 * Crea el ícono de bandeja.
 *
 * @param {object} deps
 * @param {() => import('electron').BrowserWindow|null} deps.getWindow
 * @param {() => void} deps.onQuit  salir DE VERDAD (marca la bandera y cierra)
 * @param {() => void} deps.onCheckUpdates
 * @returns {import('electron').Tray|null} null si no se pudo (nunca es fatal)
 */
function createTray({ getWindow, onQuit, onCheckUpdates }) {
    if (tray) return tray;

    try {
        // El mismo ícono cuadrado de la app. En Windows la bandeja lo reescala solo.
        const icon = nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'icon.png'));
        tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
    } catch (e) {
        // Sin bandeja se puede vivir; sin app no. Si el sistema no la soporta (algunos
        // entornos de escritorio de Linux), seguimos sin ella — y por eso quien llama
        // debe tratar el null como "cerrar sale", no como un error.
        console.warn('[Veltronik] No se pudo crear el ícono de bandeja:', e.message);
        return null;
    }

    const mostrar = () => {
        const win = getWindow();
        if (!win) return;
        if (win.isMinimized()) win.restore();
        win.show();
        win.focus();
    };

    tray.setToolTip('Veltronik');
    tray.setContextMenu(Menu.buildFromTemplate([
        { label: 'Abrir Veltronik', click: mostrar },
        { type: 'separator' },
        { label: 'Buscar actualizaciones', click: onCheckUpdates },
        { type: 'separator' },
        // Salir DE VERDAD. Con "cerrar → bandeja" activo, esconder y salir son dos cosas
        // distintas: lo que las separa es la bandera `isQuitting` que main.cjs levanta en
        // 'before-quit'. Sin ella, este ítem escondería la ventana y el usuario se
        // quedaría tocando "Salir" sin que la app se vaya nunca.
        { label: 'Salir de Veltronik', click: onQuit },
    ]));

    tray.on('double-click', mostrar);

    return tray;
}

/** Saca el ícono (al salir de verdad). */
function destroyTray() {
    if (tray && !tray.isDestroyed()) tray.destroy();
    tray = null;
}

/**
 * Aviso de una sola vez: la primera vez que cerrar esconde en vez de salir, hay que
 * decirlo. Si no, el cliente cree que cerró la app y no entiende por qué sigue ahí.
 */
function notifyHiddenToTray() {
    if (!tray) return;
    try {
        tray.displayBalloon({
            title: 'Veltronik sigue abierto',
            content: 'Lo dejamos en la bandeja, al lado del reloj. Para cerrarlo del todo, clic derecho → Salir de Veltronik.',
        });
    } catch {
        // displayBalloon es solo de Windows; en el resto no pasa nada.
    }
}

module.exports = { createTray, destroyTray, notifyHiddenToTray, getTray: () => tray };
