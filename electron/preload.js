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
    }
});

// Indicador de que estamos en Electron (legacy support)
window.isElectronApp = true;
