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
const { ipcMain, Notification, dialog, app, nativeImage } = require('electron');
const log = require('electron-log');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');

// Logo de Veltronik para las notificaciones nativas (aparece a la izquierda del texto).
// Se carga con nativeImage (bytes en memoria) y NO como ruta: el toast nativo de Windows
// no puede leer un archivo que vive dentro del app.asar; el NativeImage sí resuelve.
function loadVeltronikIcon() {
    // 1) Adentro del asar (dev y prod): nativeImage sabe leer dentro del asar.
    let img = nativeImage.createFromPath(path.join(__dirname, '../assets/LogoPrincipalVeltronik.png'));
    // 2) Fallback a la copia real en resources/assets (extraResources del builder) por si fallara.
    if ((!img || img.isEmpty()) && process.resourcesPath) {
        img = nativeImage.createFromPath(path.join(process.resourcesPath, 'assets', 'LogoPrincipalVeltronik.png'));
    }
    return img;
}
const VELTRONIK_ICON = loadVeltronikIcon();

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

    // Rollout escalonado (ladrillo 7, ADR-007): NO descargamos automáticamente. En
    // 'update-available' decidimos según el anillo del equipo (ver decideAndDownload).
    // Un equipo no enrolado / sin freno publicado sigue tomando la última (fail-open).
    autoUpdater.autoDownload = false;
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
    // Rollout escalonado: decidir si este equipo puede tomar esta versión (según su anillo).
    decideAndDownload(info.version);

    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-available', {
            version: info.version,
            releaseDate: info.releaseDate
        });
    }
});

// ============================================
// ROLLOUT ESCALONADO POR ANILLOS (ladrillo 7, ADR-007)
// ============================================

/** Identidad del equipo (la escribe el enrolamiento); null si no está enrolado. */
function readSyncIdentity() {
    try {
        const base = process.env.LOCALAPPDATA || require('os').homedir();
        const file = path.join(base, 'Veltronik', 'sync-identity.json');
        if (!fs.existsSync(file)) return null;
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
        return null;
    }
}

/** Compara versiones "x.y.z" numéricamente. <0 si a<b, 0 si igual, >0 si a>b. */
function cmpVersion(a, b) {
    const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
    const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const d = (pa[i] || 0) - (pb[i] || 0);
        if (d !== 0) return d < 0 ? -1 : 1;
    }
    return 0;
}

/** Pregunta a la nube la versión objetivo del anillo de ESTE equipo. null = sin freno. */
function fetchRingTarget(identity) {
    return new Promise((resolve) => {
        try {
            let base = String(identity.cloudUrl || '').trim().replace(/\/+$/, '').replace(/\/api$/, '');
            const url = `${base}/api/updates/target`;
            const lib = url.startsWith('https') ? https : http;
            const req = lib.get(url, {
                headers: { 'X-Device-Id': identity.deviceId, 'X-Device-Key': identity.deviceKey },
                timeout: 8000,
            }, (res) => {
                let body = '';
                res.on('data', (c) => { body += c; });
                res.on('end', () => {
                    try { resolve(JSON.parse(body)?.targetVersion || null); }
                    catch { resolve(null); }
                });
            });
            req.on('error', () => resolve(null));
            req.on('timeout', () => { req.destroy(); resolve(null); });
        } catch {
            resolve(null);
        }
    });
}

/**
 * Decide si descargar la versión disponible. FAIL-OPEN: si el equipo no está enrolado,
 * la nube no responde, o no hay objetivo publicado → descarga (comportamiento de siempre).
 * Solo FRENA si hay un objetivo y la versión disponible lo supera (su anillo aún no llegó).
 */
async function decideAndDownload(availableVersion) {
    let allow = true;
    try {
        const identity = readSyncIdentity();
        if (identity && identity.cloudUrl && identity.deviceId && identity.deviceKey) {
            const target = await fetchRingTarget(identity);
            if (target && cmpVersion(availableVersion, target) > 0) {
                allow = false;
                log.info(`Rollout: ${availableVersion} disponible, pero mi anillo va hasta ${target}. Espero.`);
            }
        }
    } catch (e) {
        log.warn('Rollout: no se pudo evaluar el anillo, sigo (fail-open):', e.message);
    }

    if (!allow) return;

    try {
        const notification = new Notification({
            title: 'Veltronik — Actualización disponible',
            body: `Descargando la versión ${availableVersion} en segundo plano...`,
            icon: VELTRONIK_ICON,
            silent: true,
        });
        notification.show();
    } catch (e) {
        log.warn('No se pudo mostrar notificación:', e.message);
    }
    autoUpdater.downloadUpdate();
}

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
            icon: VELTRONIK_ICON,
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
