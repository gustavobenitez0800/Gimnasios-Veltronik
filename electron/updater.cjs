/**
 * ============================================
 * VELTRONIK - AUTO-UPDATER (AGGRESSIVE)
 * ============================================
 * 
 * Sistema de actualizaciones automáticas AGRESIVO.
 * - Verifica cada 30 minutos
 * - Fuerza reinicio tras descargar si el usuario no actúa
 * - Muestra diálogo nativo bloqueante cuando hay update descargado
 * Usa GitHub Releases como servidor de updates.
 */

const { autoUpdater } = require('electron-updater');
const { ipcMain, Notification, dialog, app } = require('electron');
const log = require('electron-log');

// Configurar logging
log.transports.file.level = 'info';
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';

// Referencia a la ventana principal
let mainWindow = null;
let updateDownloaded = false;
let downloadedVersion = null;

/**
 * Inicializar el auto-updater
 * @param {BrowserWindow} window 
 */
function initAutoUpdater(window) {
    mainWindow = window;

    // Configuración AGRESIVA
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowDowngrade = false;

    // Verificar updates al iniciar (con delay para no bloquear el arranque)
    setTimeout(() => {
        checkForUpdates();
    }, 5000);

    // Verificar cada 30 MINUTOS (antes era cada 4 horas - muy lento)
    setInterval(() => {
        checkForUpdates();
    }, 30 * 60 * 1000);

    // IPC: Forzar reinicio desde el renderer
    ipcMain.handle('force-update-restart', () => {
        if (updateDownloaded) {
            autoUpdater.quitAndInstall(false, true);
        }
    });

    // IPC: Obtener estado del update
    ipcMain.handle('get-update-status', () => {
        return {
            updateDownloaded,
            downloadedVersion
        };
    });
}

/**
 * Verificar actualizaciones
 */
async function checkForUpdates() {
    try {
        log.info('Verificando actualizaciones...');
        const result = await autoUpdater.checkForUpdates();
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

    // Notificación en español
    try {
        const notification = new Notification({
            title: '🔄 Actualización disponible',
            body: `Se está descargando la versión ${info.version}...`,
            silent: false
        });
        notification.show();
    } catch (e) {
        log.warn('No se pudo mostrar notificación:', e.message);
    }

    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-available', {
            version: info.version,
            releaseDate: info.releaseDate
        });
    }
});

autoUpdater.on('update-not-available', (info) => {
    log.info('No hay actualizaciones disponibles. Versión actual es la más reciente.');
});

autoUpdater.on('error', (error) => {
    log.error('Error en auto-updater:', error);
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-error', error.message);
    }
});

autoUpdater.on('download-progress', (progress) => {
    log.info(`Descargando: ${progress.percent.toFixed(1)}%`);
    if (mainWindow && !mainWindow.isDestroyed()) {
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
    updateDownloaded = true;
    downloadedVersion = info.version;

    // Notificación nativa de Windows (Silenciosa, no intrusiva)
    try {
        const notification = new Notification({
            title: '✅ Actualización lista',
            body: `La versión ${info.version} se descargó. Se instalará automáticamente al cerrar el sistema.`,
            silent: false
        });
        notification.show();
    } catch (e) {
        log.warn('No se pudo mostrar notificación:', e.message);
    }

    // Enviar al renderer (por si en el futuro queremos mostrar un badge sutil)
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-downloaded', {
            version: info.version,
            releaseNotes: info.releaseNotes
        });
    }

    // NOTA: Eliminado el diálogo bloqueante y el reinicio forzado.
    // Al estar autoInstallOnAppQuit = true, la actualización se aplicará 
    // cuando el usuario cierre la ventana (al terminar su día).
});

module.exports = {
    initAutoUpdater,
    checkForUpdates,
    quitAndInstall
};
