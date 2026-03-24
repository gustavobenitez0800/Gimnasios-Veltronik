/**
 * ============================================
 * VELTRONIK - ELECTRON MAIN PROCESS
 * ============================================
 * 
 * Proceso principal de Electron.
 * Maneja la ventana, auto-updates y ciclo de vida.
 */

const { app, BrowserWindow, ipcMain, dialog, session } = require('electron');
const path = require('path');
const { initAutoUpdater } = require('./updater.cjs');
const deviceManager = require('./device-manager.cjs');

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

    createWindow();

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

// ============================================
// IPC HANDLERS
// ============================================

// Obtener versión de la app
ipcMain.handle('get-app-version', () => {
    return app.getVersion();
});

// Verificar updates manualmente
ipcMain.handle('check-for-updates', async () => {
    const { checkForUpdates } = require('./updater');
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
    const { quitAndInstall } = require('./updater');
    quitAndInstall();
});
