/**
 * Las preferencias de la ventana del mostrador (08/11/2026).
 *
 * Viven aparte para que `tools/sandbox-humo.cjs` pruebe EXACTAMENTE las mismas que usa el programa:
 * un chequeo con su propia copia de las preferencias es un chequeo de otra cosa.
 */
const path = require('path');

/**
 * ¿Se puede abrir la consola de desarrollador? (08/11/2026)
 *
 * En el programa INSTALADO, no: estaba en el menú «Herramientas» a la vista de cualquiera en el
 * mostrador, y desde ahí se lee la sesión del dueño (y con ella se entra a la cuenta desde
 * cualquier lado), se saltea la clave para cobrar y se pide la bóveda de la PC. Para soporte
 * queda una puerta que no se abre por accidente: la variable de entorno VELTRONIK_CONSOLA=1 en
 * esa PC (y reiniciar el programa). En desarrollo siempre se puede.
 *
 * @param {boolean} empaquetado  app.isPackaged
 * @param {Record<string,string|undefined>} entorno  process.env
 */
function consolaPermitida(empaquetado, entorno = {}) {
    return !empaquetado || entorno.VELTRONIK_CONSOLA === '1';
}

/** @param {{ consola?: boolean }} [opciones] */
function preferenciasDeLaVentana({ consola = true } = {}) {
    return {
        nodeIntegration: false,
        contextIsolation: true,
        // Sin consola, ni F12 ni Ctrl+Shift+I la abren: la apaga Chromium, no un menú.
        devTools: consola,
        preload: path.join(__dirname, 'preload.cjs'),
        // La página corre aislada del sistema (el sandbox de Chromium). El preload solo usa
        // contextBridge e ipcRenderer, que andan igual adentro del sandbox: todo lo que toca la
        // PC (la base local, la bóveda, el molinete, el audio) vive en el proceso principal y se
        // pide por IPC. Si alguna vez el preload necesita otro `require`, el chequeo lo frena.
        sandbox: true,
        // ⭐ EL MOSTRADOR ESCUCHA AUNQUE LA VENTANA ESTÉ TAPADA. Sin esto, con Veltronik detrás
        // de la música o minimizado, Chromium frena los temporizadores de la página (hasta uno
        // por minuto) y la entrada por QR, su cartel y la X llegaban tarde. El gimnasio no
        // mira esta ventana todo el tiempo: justamente por eso tiene que avisar.
        backgroundThrottling: false,
    };
}

module.exports = { preferenciasDeLaVentana, consolaPermitida };
