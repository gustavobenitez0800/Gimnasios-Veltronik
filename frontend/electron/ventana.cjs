/**
 * Las preferencias de la ventana del mostrador (08/11/2026).
 *
 * Viven aparte para que `tools/sandbox-humo.cjs` pruebe EXACTAMENTE las mismas que usa el programa:
 * un chequeo con su propia copia de las preferencias es un chequeo de otra cosa.
 */
const path = require('path');

function preferenciasDeLaVentana() {
    return {
        nodeIntegration: false,
        contextIsolation: true,
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

module.exports = { preferenciasDeLaVentana };
