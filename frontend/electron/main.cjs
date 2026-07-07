/**
 * ============================================
 * VELTRONIK - ELECTRON MAIN PROCESS
 * ============================================
 * 
 * Proceso principal de Electron.
 * Maneja la ventana, auto-updates y ciclo de vida.
 */

const { app, BrowserWindow, ipcMain, dialog, session, Menu } = require('electron');
const path = require('path');
const { initAutoUpdater } = require('./updater.cjs');
const deviceManager = require('./device-manager.cjs');
const backendRuntime = require('./backend-runtime.cjs');

// ============================================
// MENÚ DE APLICACIÓN PERSONALIZADO
// ============================================
function createCustomMenu() {
    const isMac = process.platform === 'darwin';

    const template = [
        ...(isMac ? [{
            label: app.name,
            submenu: [
                { role: 'about', label: 'Acerca de Veltronik' },
                { type: 'separator' },
                { role: 'quit', label: 'Salir' }
            ]
        }] : []),
        {
            label: 'Archivo',
            submenu: [
                {
                    label: 'Recargar Sistema',
                    accelerator: 'CmdOrCtrl+R',
                    click: () => { if (mainWindow) mainWindow.reload(); }
                },
                isMac ? { role: 'close', label: 'Cerrar Ventana' } : { role: 'quit', label: 'Salir de Veltronik' }
            ]
        },
        {
            label: 'Ver',
            submenu: [
                { role: 'resetZoom', label: 'Tamaño Normal' },
                { role: 'zoomIn', label: 'Acercar Zoom' },
                { role: 'zoomOut', label: 'Alejar Zoom' },
                { type: 'separator' },
                { role: 'togglefullscreen', label: 'Pantalla Completa' }
            ]
        },
        {
            label: 'Herramientas',
            submenu: [
                {
                    label: 'Buscar Actualizaciones',
                    click: () => {
                        const { checkForUpdates } = require('./updater.cjs');
                        if (mainWindow) {
                            dialog.showMessageBox(mainWindow, {
                                type: 'info',
                                title: 'Actualizaciones',
                                message: 'Buscando actualizaciones de Veltronik...'
                            });
                        }
                        checkForUpdates();
                    }
                },
                { type: 'separator' },
                { role: 'toggleDevTools', label: 'Consola de Desarrollador' }
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}

// Mantener referencia global para evitar garbage collection
let mainWindow = null;

// Configuración de la ventana
const WINDOW_CONFIG = {
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'Veltronik',
    icon: path.join(__dirname, '../assets/LogoPrincipalVeltronik.png'),
    show: false, // Mostrar cuando esté listo
    webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.cjs'),
        // Seguridad
        enableRemoteModule: false,
        sandbox: false
    }
};

/**
 * Crear la ventana principal
 */
function createWindow() {
    mainWindow = new BrowserWindow(WINDOW_CONFIG);

    // Cargar la app - React build output
    if (isDev()) {
        // En dev, cargar desde el servidor Vite
        mainWindow.loadURL('http://localhost:5173');
    } else {
        // En producción, cargar el build de Vite
        mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
    }

    // Mostrar cuando esté lista (evita flash blanco)
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();

        // Iniciar verificación de updates después de mostrar
        if (!isDev()) {
            initAutoUpdater(mainWindow);
        }

        // Inicializar gestor universal de dispositivos de acceso
        deviceManager.init(mainWindow);
    });


    // Manejar cierre
    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    // Abrir DevTools solo en desarrollo
    if (isDev()) {
        mainWindow.webContents.openDevTools();
    }
}

/**
 * Detectar si estamos en desarrollo
 */
function isDev() {
    return !app.isPackaged;
}

// ============================================
// CICLO DE VIDA DE LA APP
// ============================================

// Listo para crear ventanas
app.whenReady().then(() => {
    // Establecer el ID de la aplicación para notificaciones nativas en Windows
    app.setAppUserModelId('Veltronik');

    // Configurar permisos para cámara y micrófono
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
        const allowedPermissions = ['media', 'mediaKeySystem', 'notifications'];
        if (allowedPermissions.includes(permission)) {
            callback(true);
        } else {
            callback(false);
        }
    });

    // Permitir acceso a dispositivos de hardware (torniquetes, lectores de acceso)
    session.defaultSession.setDevicePermissionHandler((details) => {
        if (details.deviceType === 'hid' || details.deviceType === 'serial' || details.deviceType === 'usb') {
            return true;
        }
        return false;
    });

    // Inyectar el nuevo menú personalizado
    createCustomMenu();

    createWindow();

    // El cerebro embebido (ADR-009): se prende solo si el equipo está ENROLADO
    // (sync-identity.json completo); VELTRONIK_LOCAL_BRAIN=1/0 fuerza/apaga (escape hatch).
    // Fire-and-forget: la UI no espera al backend local (arranca contra la nube y el
    // renderer decide a quién hablar según el enrolamiento).
    if (backendRuntime.isEnabled() && !isDev()) {
        backendRuntime.start().catch((e) => {
            console.error('[Main] El cerebro local no arrancó:', e.message);
        });
    }

    // macOS: recrear ventana al hacer clic en el dock
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

// Cerrar cuando todas las ventanas se cierren (excepto macOS)
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// Apagado PROLIJO del cerebro local antes de salir: actuator/shutdown deja que
// la JVM corra sus hooks y zonky detenga Postgres (un kill duro dejaría un
// postgres.exe huérfano bloqueando el pgdata). Patrón preventDefault + exit.
let backendStopped = false;
app.on('will-quit', (event) => {
    if (backendRuntime.isRunning() && !backendStopped) {
        event.preventDefault();
        backendRuntime.stop()
            .catch(() => { /* mejor esfuerzo: el log ya lo cuenta */ })
            .finally(() => { backendStopped = true; app.quit(); });
    }
});

// ============================================
// IPC HANDLERS
// ============================================

// Obtener versión de la app
ipcMain.handle('get-app-version', () => {
    return app.getVersion();
});

// Verificar updates manualmente
ipcMain.handle('check-for-updates', async () => {
    const { checkForUpdates } = require('./updater.cjs');
    return await checkForUpdates();
});

// Mostrar diálogo de error
ipcMain.handle('show-error-dialog', async (event, { title, message }) => {
    await dialog.showMessageBox(mainWindow, {
        type: 'error',
        title: title || 'Error',
        message: message || 'Ha ocurrido un error'
    });
});

// Reiniciar app para instalar update
ipcMain.handle('restart-for-update', () => {
    const { quitAndInstall } = require('./updater.cjs');
    quitAndInstall();
});

// El cableado del bautizo (ladrillo 4): el renderer enrola contra la nube y le pasa
// la credencial al proceso principal, que la persiste para el cerebro local.
ipcMain.handle('local-brain:set-sync-identity', (event, identity) => {
    try {
        return backendRuntime.saveSyncIdentity(identity);
    } catch (e) {
        console.error('[Main] No se pudo guardar la identidad de sync:', e.message);
        return { ok: false, error: e.message };
    }
});

// ¿Este equipo debería tener cerebro local? (enrolado o forzado por env). Lo consulta el
// renderer para saber si vale la pena RE-probar el modo local cuando el probe inicial
// falló (el cerebro tarda en bootear más que la app; sin esto, un arranque sin internet
// quedaba clavado en modo nube hasta reiniciar la app).
ipcMain.handle('local-brain:is-enabled', () => {
    try {
        return backendRuntime.isEnabled();
    } catch {
        return false;
    }
});
