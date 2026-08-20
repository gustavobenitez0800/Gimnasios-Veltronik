/**
 * ============================================
 * VELTRONIK - POSICIÓN DE LA VENTANA (Fase 5)
 * ============================================
 *
 * Que la ventana vuelva a abrirse donde el cliente la dejó. Suena a detalle, pero es una
 * de las cosas que separan "una app" de "una página en un marco": nadie reacomoda la
 * ventana todos los días.
 *
 * EL BUG QUE ESTO EVITA, Y QUE ES EL MOTIVO REAL DE QUE EXISTA EL ARCHIVO
 * Guardar la posición a secas rompe el día que cambia el hardware. El terminal estaba en
 * un segundo monitor, lo desenchufan, y al abrir Veltronik la ventana se restaura en
 * coordenadas que ya no existen: la app arranca perfecta, fuera de la pantalla. Para el
 * cliente eso es "no abre", y es de las llamadas más difíciles de diagnosticar por
 * teléfono. Por eso toda posición guardada se valida contra las pantallas que hay AHORA,
 * y ante la duda se descarta y se abre centrada.
 *
 * La lógica de validación es pura (recibe la lista de pantallas) para poder probarla sin
 * levantar Electron.
 */

/** Tamaño mínimo aceptable; por debajo de esto la ventana es inusable. */
const MIN_WIDTH = 1024;
const MIN_HEIGHT = 700;

/** Cuántos píxeles de la ventana tienen que caer dentro de una pantalla para valer. */
const MIN_VISIBLE_PX = 120;

/**
 * ¿Se solapan dos rectángulos en al menos `min` píxeles en ambos ejes?
 * @param {{x:number,y:number,width:number,height:number}} a
 * @param {{x:number,y:number,width:number,height:number}} b
 */
function overlaps(a, b, min) {
    const solapeX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
    const solapeY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
    return solapeX >= min && solapeY >= min;
}

/**
 * ¿Estas coordenadas caen en alguna de las pantallas conectadas?
 *
 * No se exige que entre entera —una ventana un poco salida del borde es normal y el
 * usuario la puso ahí— sino que quede un pedazo agarrable con el mouse.
 *
 * @param {object} bounds
 * @param {Array<{bounds: object}>} displays lo que devuelve screen.getAllDisplays()
 */
function isVisibleOnSomeDisplay(bounds, displays) {
    if (!Array.isArray(displays) || displays.length === 0) return false;
    return displays.some((d) => d && d.bounds && overlaps(bounds, d.bounds, MIN_VISIBLE_PX));
}

/**
 * Valida una posición guardada contra las pantallas actuales.
 *
 * @returns {object|null} los bounds si sirven; null si hay que abrir centrada
 */
function sanitizeBounds(saved, displays) {
    if (!saved || typeof saved !== 'object') return null;

    const { x, y, width, height } = saved;
    const numeros = [x, y, width, height].every((v) => typeof v === 'number' && Number.isFinite(v));
    if (!numeros) return null;

    // Una ventana más chica que el mínimo no se puede usar (pudo quedar de una versión
    // vieja con otro minWidth, o de un archivo editado a mano).
    if (width < MIN_WIDTH || height < MIN_HEIGHT) return null;

    // Absurdos: más grande que cualquier escritorio razonable.
    if (width > 20000 || height > 20000) return null;

    if (!isVisibleOnSomeDisplay({ x, y, width, height }, displays)) return null;

    return { x, y, width, height };
}

/**
 * Opciones de ventana a partir de lo guardado.
 * Si la posición no sirve, se devuelve solo el tamaño por defecto y Electron centra.
 *
 * @param {object} store        electron/store.cjs
 * @param {object} screenApi    el módulo `screen` de Electron
 * @param {{width:number,height:number}} fallbackSize
 */
function restoreOptions(store, screenApi, fallbackSize) {
    let displays = [];
    try {
        displays = screenApi.getAllDisplays();
    } catch {
        displays = []; // sin info de pantallas → centrada, que siempre es seguro
    }

    const bounds = sanitizeBounds(store.get('windowBounds'), displays);
    if (!bounds) return { ...fallbackSize };
    return bounds;
}

/**
 * Empieza a seguir los movimientos de la ventana para guardarlos.
 *
 * Se guarda con retardo (debounce): arrastrar una ventana dispara decenas de eventos por
 * segundo y no vamos a escribir el disco en cada uno.
 */
function track(win, store) {
    let timer = null;

    const guardar = () => {
        if (win.isDestroyed()) return;
        const maximizada = win.isMaximized();
        // Estando maximizada, getBounds() devuelve el tamaño de la pantalla: guardar eso
        // haría que al restaurar "des-maximizada" la ventana ocupe todo igual y el botón
        // de restaurar no haga nada visible. Se conserva la última posición normal.
        if (!maximizada) store.set('windowBounds', win.getBounds());
        store.set('windowMaximized', maximizada);
    };

    const agendar = () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(guardar, 500);
    };

    win.on('resize', agendar);
    win.on('move', agendar);
    win.on('maximize', agendar);
    win.on('unmaximize', agendar);
    // Al cerrar no hay tiempo para el debounce: se guarda ya.
    win.on('close', () => {
        if (timer) clearTimeout(timer);
        guardar();
    });
}

module.exports = {
    restoreOptions,
    track,
    // Exportadas para poder probarlas sin Electron:
    sanitizeBounds,
    isVisibleOnSomeDisplay,
    MIN_WIDTH,
    MIN_HEIGHT,
};
