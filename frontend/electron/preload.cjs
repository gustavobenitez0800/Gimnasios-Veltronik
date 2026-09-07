/**
 * ============================================
 * VELTRONIK - ELECTRON PRELOAD SCRIPT
 * ============================================
 * 
 * Bridge seguro entre el proceso principal (Node.js)
 * y el renderer (Chromium/Web).
 * 
 * Expone APIs nativas de forma controlada.
 */

const { contextBridge, ipcRenderer } = require('electron');

/**
 * API expuesta al renderer de forma segura
 */
contextBridge.exposeInMainWorld('electronAPI', {
    // ============================================
    // INFO DE LA APP
    // ============================================

    /**
     * Obtener versión actual de la app
     * @returns {Promise<string>}
     */
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),

    /**
     * Verificar si estamos en Electron
     * @returns {boolean}
     */
    isElectron: () => true,

    /**
     * Abrir una URL del PORTAL WEB en el navegador del sistema (Fase 4).
     *
     * La app de escritorio no trae las pantallas de cuenta ni de cobro: cuando hace falta
     * una, manda al navegador por acá. Nunca navega su propia ventana — hacerlo era lo que
     * rompía el pago (MP devolvía a la web y la app no se enteraba).
     *
     * El proceso principal valida la URL contra una lista blanca de orígenes
     * (electron/portal.cjs) antes de abrir nada.
     *
     * @param {string} url
     * @returns {Promise<boolean>} false si la rechazó la lista blanca
     */
    openExternal: (url) => ipcRenderer.invoke('open-external', url),

    /**
     * Escucha los deep links `veltronik://` que despiertan a la app (Fase 2).
     *
     * Hoy trae uno solo: `veltronik://auth?code=...`, el retorno del login con Google
     * hecho en el navegador del sistema. El renderer canjea ese código por la sesión
     * (src/lib/desktopAuth.js).
     *
     * @param {(url: string) => void} callback
     * @returns {() => void} función para dejar de escuchar
     */
    onDeepLink: (callback) => {
        const handler = (_event, url) => callback(url);
        ipcRenderer.on('deep-link', handler);
        return () => ipcRenderer.removeListener('deep-link', handler);
    },

    // ============================================
    // PREFERENCIAS DEL TERMINAL (Fase 5)
    // ============================================
    // De la MÁQUINA, no de la cuenta: si arranca con Windows.
    // Vive en un JSON local (electron/store.cjs), nunca viaja al servidor.

    terminalSettings: {
        /** @returns {Promise<{openAtLogin: boolean}>} */
        get: () => ipcRenderer.invoke('terminal-settings:get'),

        /**
         * @param {{openAtLogin?: boolean}} changes
         * @returns {Promise<{ok: boolean, error?: string}>}
         */
        set: (changes) => ipcRenderer.invoke('terminal-settings:set', changes),
    },

    // ============================================
    // NÚCLEO LOCAL (fase 1: el espejo)
    // ============================================
    // La copia de los socios que hace que el mostrador funcione sin internet. Vive en un
    // archivo de SQLite en el proceso principal, para que sobreviva a un corte de luz y a
    // que la pantalla se recargue.
    //
    // La pantalla NUNCA busca por acá: se trae la lista entera una vez cada varios minutos
    // y busca contra un array en memoria. Una consulta por tecla serían miles de idas y
    // vueltas por búsqueda, y lo que esto vino a arreglar es justamente la espera.

    nucleo: {
        /**
         * ¿Esta máquina tiene base local?
         *
         * Puede no tenerla —el módulo nativo no cargó, la carpeta no tiene permisos— y eso
         * NO es un error que haya que mostrarle a nadie: la app vuelve a trabajar contra la
         * nube como antes. Sirve para el diagnóstico y para el cartel de estado.
         *
         * @returns {Promise<{disponible: boolean, ruta: string|null, motivo: string|null}>}
         */
        disponible: () => ipcRenderer.invoke('nucleo:disponible'),

        /**
         * Trae el espejo entero de un gimnasio.
         * @param {string} tenantId
         * @returns {Promise<{socios: Array, actualizado: number|null}>}
         */
        leerEspejo: (tenantId) => ipcRenderer.invoke('nucleo:espejo-leer', tenantId),

        /**
         * Reemplaza el espejo de un gimnasio. Cada socio tiene que traer su campo
         * `busqueda` ya normalizado: la regla de normalizar vive del lado de la pantalla,
         * que es la que también la usa para preguntar.
         *
         * Una lista vacía NO se guarda: casi siempre es una consulta que falló, y pisar la
         * lista buena con nada deja al mostrador ciego.
         *
         * @returns {Promise<{ok: boolean, socios?: number, actualizado?: number, motivo?: string}>}
         */
        guardarEspejo: (tenantId, socios) =>
            ipcRenderer.invoke('nucleo:espejo-guardar', { tenantId, socios }),

        /**
         * Cuántos socios hay y de cuándo son, sin traerlos.
         * @returns {Promise<{cantidad: number, actualizado: number|null}>}
         */
        estadoEspejo: (tenantId) => ipcRenderer.invoke('nucleo:espejo-estado', tenantId),

        /**
         * Borra el espejo de un gimnasio. Al CAMBIAR DE SUCURSAL, no al cerrar sesión: la
         * lista es del gimnasio, no de quien atiende, y el próximo turno tiene que
         * encontrar el mostrador listo aunque todavía no haya internet.
         */
        olvidarEspejo: (tenantId) => ipcRenderer.invoke('nucleo:espejo-olvidar', tenantId),

        /**
         * La bóveda: los tokens de sesión, cifrados por el sistema operativo.
         *
         * Hasta acá la sesión vivía en el `localStorage` de Chromium — un archivo del perfil
         * del usuario, en claro—. Con esto la clave la tiene Windows (DPAPI) y está atada a
         * la cuenta de esa máquina: copiar el archivo a otra PC no sirve de nada.
         *
         * `disponible()` puede dar false (algunos Linux sin llavero). Ahí NO se guarda en un
         * archivo que finja estar cifrado: se sigue usando el `localStorage` de siempre.
         */
        boveda: {
            /** @returns {Promise<boolean>} */
            disponible: () => ipcRenderer.invoke('nucleo:boveda-disponible'),
            /** @returns {Promise<string|null>} */
            leer: (clave) => ipcRenderer.invoke('nucleo:boveda-leer', clave),
            /** @returns {Promise<boolean>} false = NO se guardó. */
            escribir: (clave, valor) => ipcRenderer.invoke('nucleo:boveda-escribir', { clave, valor }),
            /** @returns {Promise<boolean>} */
            borrar: (clave) => ipcRenderer.invoke('nucleo:boveda-borrar', clave),
        },

        /**
         * La cola: los accesos que pasaron y el servidor todavía no sabe.
         *
         * ⚠️ A diferencia del espejo, esto NO es copia de nada. Si se pierde, el gimnasio
         * perdió una visita. Nada sale de la cola salvo que el servidor la haya confirmado
         * o rechazado por algo que no se arregla reintentando.
         */
        cola: {
            /** @returns {Promise<{ok: boolean, clientRef?: string, motivo?: string}>} */
            encolar: (item) => ipcRenderer.invoke('nucleo:cola-encolar', item),
            /** Los pendientes de un gimnasio, EN EL ORDEN EN QUE OCURRIERON. */
            pendientes: (tenantId) => ipcRenderer.invoke('nucleo:cola-pendientes', tenantId),
            /** @returns {Promise<number>} */
            contar: (tenantId) => ipcRenderer.invoke('nucleo:cola-contar', tenantId),
            /**
             * Cuántos esperan y DESDE CUÁNDO.
             *
             * "3 pendientes" no dice nada: pueden ser de hace dos minutos o de hace tres
             * semanas. El diseño permite acumular 30 días, y sin la antigüedad esos 30 días
             * pasan en silencio.
             *
             * @returns {Promise<{cuantos: number, masViejo: string|null}>}
             */
            resumen: (tenantId) => ipcRenderer.invoke('nucleo:cola-resumen', tenantId),
            /** Solo cuando el servidor confirmó o rechazó definitivamente. */
            sacar: (clientRef) => ipcRenderer.invoke('nucleo:cola-sacar', clientRef),
            /** Anota el intento fallido. NO saca nada de la cola. */
            anotarFallo: (clientRef, mensaje) =>
                ipcRenderer.invoke('nucleo:cola-anotar-fallo', { clientRef, mensaje }),
            /** ⚠️ NO se llama al cerrar sesión: son visitas reales que el gimnasio no tiene. */
            olvidar: () => ipcRenderer.invoke('nucleo:cola-olvidar'),
        },
    },

    // ============================================
    // AUTO-UPDATES
    // ============================================

    /**
     * Verificar actualizaciones manualmente
     * @returns {Promise<{available: boolean, version?: string}>}
     */
    checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),

    /**
     * Reiniciar para instalar actualización
     */
    restartForUpdate: () => ipcRenderer.invoke('restart-for-update'),

    /**
     * Forzar reinicio para instalar update descargado
     */
    forceUpdateRestart: () => ipcRenderer.invoke('force-update-restart'),

    /**
     * Obtener estado de la actualización
     * @returns {Promise<{updateDownloaded: boolean, downloadedVersion: string|null}>}
     */
    getUpdateStatus: () => ipcRenderer.invoke('get-update-status'),

    /**
     * Listener para eventos de update
     * @param {function} callback
     */
    onUpdateAvailable: (callback) => {
        ipcRenderer.on('update-available', (event, info) => callback(info));
    },

    onUpdateDownloaded: (callback) => {
        ipcRenderer.on('update-downloaded', (event, info) => callback(info));
    },

    onUpdateError: (callback) => {
        ipcRenderer.on('update-error', (event, error) => callback(error));
    },

    onDownloadProgress: (callback) => {
        ipcRenderer.on('download-progress', (event, progress) => callback(progress));
    },

    // ============================================
    // DIÁLOGOS NATIVOS
    // ============================================

    /**
     * Mostrar diálogo de error nativo
     * @param {string} title
     * @param {string} message
     */
    showErrorDialog: (title, message) => {
        ipcRenderer.invoke('show-error-dialog', { title, message });
    },

    // ============================================
    // CONTROL DE ACCESO FÍSICO - GESTOR UNIVERSAL
    // ============================================

    accessControl: {
        // --- Detección y registro ---
        detectDevices: () => ipcRenderer.invoke('devices:detect'),
        listDevices: () => ipcRenderer.invoke('devices:list'),
        registerDevice: (config) => ipcRenderer.invoke('devices:register', config),
        updateDevice: (deviceId, config) => ipcRenderer.invoke('devices:update', { deviceId, config }),
        removeDevice: (deviceId) => ipcRenderer.invoke('devices:remove', deviceId),

        // --- Control ---
        grantAccess: (deviceId, options) => ipcRenderer.invoke('devices:grant-access', { deviceId, options: options || {} }),
        denyAccess: (deviceId, options) => ipcRenderer.invoke('devices:deny-access', { deviceId, options: options || {} }),
        testDevice: (deviceId) => ipcRenderer.invoke('devices:test', deviceId),

        // --- Estado ---
        getDeviceStatus: (deviceId) => ipcRenderer.invoke('devices:status', deviceId),
        getAllStatus: () => ipcRenderer.invoke('devices:all-status'),

        // --- Descubrimiento ---
        listSerialPorts: () => ipcRenderer.invoke('devices:list-serial'),
        listHIDDevices: () => ipcRenderer.invoke('devices:list-hid'),
        getPresets: () => ipcRenderer.invoke('devices:get-presets'),

        // --- Backward compatible (single device) ---
        getDevices: () => ipcRenderer.invoke('devices:detect'),
        configure: (config) => ipcRenderer.invoke('devices:register', config),
        getConfig: () => ipcRenderer.invoke('devices:list'),
        getStatus: () => ipcRenderer.invoke('devices:all-status'),

        // --- Eventos ---
        onOpened: (callback) => {
            ipcRenderer.on('access:opened', (event, data) => callback(data));
        },
        onClosed: (callback) => {
            ipcRenderer.on('access:closed', (event, data) => callback(data));
        },
        onDenied: (callback) => {
            ipcRenderer.on('access:denied', (event, data) => callback(data));
        },
        onFeedback: (callback) => {
            ipcRenderer.on('access:feedback', (event, data) => callback(data));
        },
        onDeviceStatusChanged: (callback) => {
            ipcRenderer.on('device:status-changed', (event, data) => callback(data));
        },
        onCredentialReceived: (callback) => {
            ipcRenderer.on('credential:received', (event, data) => callback(data));
        },
        onSimulationEvent: (callback) => {
            ipcRenderer.on('device:simulation-event', (event, data) => callback(data));
        }
    }
});

// Indicador de que estamos en Electron (legacy support)
window.isElectronApp = true;

