/**
 * ============================================
 * VELTRONIK - AUTO-UPDATER
 * ============================================
 * 
 * Sistema de actualizaciones automáticas.
 * Usa GitHub Releases como servidor de updates.
 */

const { autoUpdater } = require('electron-updater');
const { ipcMain } = require('electron');
const log = require('electron-log');

// Configurar logging
log.transports.file.level = 'info';
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';

// Referencia a la ventana principal
let mainWindow = null;

/**
 * Inicializar el auto-updater
 * @param {BrowserWindow} window 
 */
function initAutoUpdater(window) {
    mainWindow = window;

    // Configuración
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    // Verificar updates al iniciar
    checkForUpdates();

    // Verificar cada 4 horas
    setInterval(() => {
        checkForUpdates();
    }, 4 * 60 * 60 * 1000);
}

/**
 * Verificar actualizaciones
 */
async function checkForUpdates() {
    try {
        log.info('Verificando actualizaciones...');
        const result = await autoUpdater.checkForUpdatesAndNotify();
        return {
            available: result?.updateInfo?.version !== undefined,
            version: result?.updateInfo?.version
        };
    } catch (error) {
        log.error('Error verificando updates:', error);
        return { available: false, error: error.message };
    }
}

/**
 * Reiniciar e instalar la actualización
 */
function quitAndInstall() {
    autoUpdater.quitAndInstall(false, true);
}

// ============================================
// EVENTOS DEL AUTO-UPDATER
// ============================================

autoUpdater.on('checking-for-update', () => {
    log.info('Buscando actualizaciones...');
});

autoUpdater.on('update-available', (info) => {
    log.info('Actualización disponible:', info.version);
    if (mainWindow) {
        mainWindow.webContents.send('update-available', {
            version: info.version,
            releaseDate: info.releaseDate
        });
    }
});

autoUpdater.on('update-not-available', (info) => {
    log.info('No hay actualizaciones disponibles');
});

autoUpdater.on('error', (error) => {
    log.error('Error en auto-updater:', error);
    if (mainWindow) {
        mainWindow.webContents.send('update-error', error.message);
    }
});

autoUpdater.on('download-progress', (progress) => {
    log.info(`Descargando: ${progress.percent.toFixed(1)}%`);
    if (mainWindow) {
        mainWindow.webContents.send('download-progress', {
            percent: progress.percent,
            transferred: progress.transferred,
            total: progress.total,
            bytesPerSecond: progress.bytesPerSecond
        });
    }
});

autoUpdater.on('update-downloaded', (info) => {
    log.info('Actualización descargada:', info.version);
    if (mainWindow) {
        mainWindow.webContents.send('update-downloaded', {
            version: info.version,
            releaseNotes: info.releaseNotes
        });
    }
});

module.exports = {
    initAutoUpdater,
    checkForUpdates,
    quitAndInstall
};
