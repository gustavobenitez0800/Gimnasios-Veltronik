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

    // Notificación en español
    try {
        const notification = new Notification({
            title: '✅ Actualización lista',
            body: `La versión ${info.version} está lista. Se reiniciará para instalar.`,
            silent: false
        });
        notification.show();
    } catch (e) {
        log.warn('No se pudo mostrar notificación:', e.message);
    }

    // Enviar al renderer
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-downloaded', {
            version: info.version,
            releaseNotes: info.releaseNotes
        });
    }

    // AGRESIVO: Después de 2 minutos, mostrar diálogo nativo BLOQUEANTE
    // Si el usuario no hizo nada, forzar la instalación
    setTimeout(async () => {
        if (!updateDownloaded) return; // Ya se instaló

        try {
            if (mainWindow && !mainWindow.isDestroyed()) {
                const result = await dialog.showMessageBox(mainWindow, {
                    type: 'info',
                    title: 'Actualización Lista',
                    message: `La versión ${info.version} está lista para instalar.`,
                    detail: 'La aplicación se reiniciará para aplicar la actualización. Esto solo tomará unos segundos.',
                    buttons: ['Reiniciar Ahora', 'Reiniciar en 5 minutos'],
                    defaultId: 0,
                    cancelId: 1,
                    noLink: true
                });

                if (result.response === 0) {
                    // Reiniciar ahora
                    autoUpdater.quitAndInstall(false, true);
                } else {
                    // Esperar 5 minutos e intentar de nuevo (loop hasta que acepte)
                    setTimeout(() => {
                        forceInstallLoop(info.version);
                    }, 5 * 60 * 1000);
                }
            }
        } catch (e) {
            log.error('Error mostrando diálogo de update:', e);
        }
    }, 2 * 60 * 1000);
});

/**
 * Loop insistente para forzar la instalación
 */
async function forceInstallLoop(version) {
    if (!updateDownloaded) return;
    if (!mainWindow || mainWindow.isDestroyed()) return;

    try {
        const result = await dialog.showMessageBox(mainWindow, {
            type: 'warning',
            title: 'Actualización Pendiente',
            message: `Es necesario instalar la versión ${version}.`,
            detail: 'Esta actualización contiene mejoras importantes y correcciones. La aplicación se reiniciará.',
            buttons: ['Reiniciar Ahora'],
            defaultId: 0,
            noLink: true
        });

        // Solo hay un botón, siempre reinicia
        autoUpdater.quitAndInstall(false, true);
    } catch (e) {
        log.error('Error en force install loop:', e);
        // Reiniciar de todas formas después de un error
        setTimeout(() => {
            autoUpdater.quitAndInstall(false, true);
        }, 60 * 1000);
    }
}

module.exports = {
    initAutoUpdater,
    checkForUpdates,
    quitAndInstall
};
