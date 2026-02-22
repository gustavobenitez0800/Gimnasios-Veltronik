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
    // BIOMÉTRICOS
    // ============================================

    biometrics: {
        /**
         * Obtener dispositivos biométricos disponibles
         * @returns {Promise<Array>}
         */
        getDevices: () => ipcRenderer.invoke('biometrics:get-devices'),

        /**
         * Iniciar captura biométrica
         * @param {Object} options - { mode: 'keyboard' | 'hid' | 'serial' }
         * @returns {Promise<{success: boolean, mode?: string, error?: string}>}
         */
        startCapture: (options) => ipcRenderer.invoke('biometrics:start-capture', options),

        /**
         * Detener captura biométrica
         * @returns {Promise<{success: boolean}>}
         */
        stopCapture: () => ipcRenderer.invoke('biometrics:stop-capture'),

        /**
         * Obtener estado del módulo biométrico
         * @returns {Promise<{isCapturing: boolean, captureMode: string, devices: Array}>}
         */
        getStatus: () => ipcRenderer.invoke('biometrics:get-status'),

        /**
         * Verificar si biométricos está disponible
         * @returns {Promise<boolean>}
         */
        isAvailable: () => ipcRenderer.invoke('biometrics:is-available'),

        /**
         * Enviar input de teclado (para modo RFID keyboard)
         * @param {string} key
         */
        sendKeyInput: (key) => ipcRenderer.send('biometrics:key-input', key),

        // ============================================
        // LISTENERS DE EVENTOS
        // ============================================

        /**
         * Evento cuando se captura un dato biométrico
         * @param {function} callback - Recibe { type, code, hash, timestamp, mode }
         */
        onDataCaptured: (callback) => {
            ipcRenderer.on('biometrics:data-captured', (event, data) => callback(data));
        },

        /**
         * Evento cuando se actualizan los dispositivos
         * @param {function} callback - Recibe array de dispositivos
         */
        onDevicesUpdated: (callback) => {
            ipcRenderer.on('biometrics:devices-updated', (event, devices) => callback(devices));
        },

        /**
         * Evento cuando inicia la captura
         * @param {function} callback - Recibe { mode }
         */
        onCaptureStarted: (callback) => {
            ipcRenderer.on('biometrics:capture-started', (event, info) => callback(info));
        },

        /**
         * Evento cuando se detiene la captura
         * @param {function} callback
         */
        onCaptureStopped: (callback) => {
            ipcRenderer.on('biometrics:capture-stopped', () => callback());
        },

        /**
         * Evento cuando se detecta un código inválido
         * @param {function} callback - Recibe { code }
         */
        onInvalidCode: (callback) => {
            ipcRenderer.on('biometrics:invalid-code', (event, data) => callback(data));
        }
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

