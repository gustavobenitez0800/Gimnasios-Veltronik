/**
 * ============================================
 * VELTRONIK - AUTO-UPDATER (AGGRESSIVE)
 * ============================================
 * 
 * Actualizaciones automáticas SILENCIOSAS (estilo Discord/Steam).
 * - Verifica cada 30 minutos y descarga en segundo plano (barra de progreso en la app)
 * - Instala en SILENCIO, sin el asistente NSIS: al reiniciar o al cerrar la app
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
            // isSilent=true → instala sin el asistente NSIS; isForceRunAfter=true → reabre la app.
            autoUpdater.quitAndInstall(true, true);
        }
    });

    // IPC: Obtener estado consolidado del update (lo consume el indicador del lobby).
    ipcMain.handle('get-update-status', () => {
        return {
            currentVersion: app.getVersion(),
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
    // Silencioso: sin asistente NSIS (oneClick), reabre la app al terminar.
    autoUpdater.quitAndInstall(true, true);
}

// ============================================
// EVENTOS DEL AUTO-UPDATER
// ============================================

autoUpdater.on('checking-for-update', () => {
    log.info('Buscando actualizaciones...');
});

autoUpdater.on('update-available', (info) => {
    log.info('Actualización disponible:', info.version);

    // Notificación nativa (sin emojis — identidad corporativa Veltronik).
    try {
        const notification = new Notification({
            title: 'Veltronik — Actualización disponible',
            body: `Descargando la versión ${info.version} en segundo plano...`,
            silent: true
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

    // Notificación nativa (sin emojis — identidad corporativa Veltronik).
    try {
        const notification = new Notification({
            title: 'Veltronik — Actualización lista',
            body: `La versión ${info.version} está lista para instalar.`,
            silent: true
        });
        notification.show();
    } catch (e) {
        log.warn('No se pudo mostrar notificación:', e.message);
    }

    // Enviar al renderer para mostrar el banner "Actualizar ahora" en el lobby.
    // El usuario decide cuándo (1 clic) sin tener que cerrar la app manualmente.
    // Si nunca actúa, autoInstallOnAppQuit=true lo aplica igual al cerrar (red de seguridad).
    if (mainWindow && !mainWindow.isDestroyed()) {
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
