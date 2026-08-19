/**
 * ============================================
 * VELTRONIK - ELECTRON MAIN PROCESS
 * ============================================
 * 
 * Proceso principal de Electron.
 * Maneja la ventana, auto-updates y ciclo de vida.
 */

const { app, BrowserWindow, ipcMain, dialog, session, Menu, shell } = require('electron');
const path = require('path');
const { initAutoUpdater } = require('./updater.cjs');
const deviceManager = require('./device-manager.cjs');
const { isAllowedUrl } = require('./portal.cjs');
const { initDeepLinks, flushPending, queue } = require('./deep-link.cjs');

// Dev server de Vite (el mismo puerto que usa `pnpm dev`).
const DEV_SERVER_ORIGIN = 'http://localhost:5173';

/**
 * ¿Esta navegación es "dentro de la app"?
 *
 * En producción la app se sirve por file://; en desarrollo, desde el dev server. Moverse
 * ahí adentro es normal (el HashRouter cambia el fragmento, F5 recarga el documento).
 * Cualquier otro destino es salir de la app, y eso no puede pasar en la ventana propia:
 * ver el comentario de will-navigate más abajo.
 */
function isInternalNavigation(targetUrl) {
    try {
        const u = new URL(targetUrl);
        if (u.protocol === 'file:') return true;
        if (isDev() && u.origin === DEV_SERVER_ORIGIN) return true;
        return false;
    } catch {
        return false;
    }
}

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

// ============================================
// DEEP LINKS veltronik:// (Fase 2)
// ============================================
// Se arranca ACÁ, en el cuerpo del módulo y no adentro de whenReady, porque el candado de
// instancia única tiene que pedirse lo antes posible: si esta ejecución es la que abrió un
// veltronik:// mientras Veltronik ya estaba corriendo, lo correcto es morir enseguida —
// antes de crear ventanas, menús o sesiones— y dejar que la instancia viva atienda.

/** Manda la URL al renderer; si la ventana todavía no puede recibir, la deja esperando. */
function deliverDeepLink(url) {
    if (mainWindow && !mainWindow.webContents.isLoading()) {
        mainWindow.webContents.send('deep-link', url);
    } else {
        queue(url); // se entrega en did-finish-load (arranque en frío)
    }
}

// ¿Somos la instancia que manda? Si no, otra ya tenía el candado y acaba de recibir
// nuestros argumentos (con el deep link adentro): nos vamos.
const IS_PRIMARY_INSTANCE = initDeepLinks(() => mainWindow, deliverDeepLink);
if (!IS_PRIMARY_INSTANCE) {
    app.quit();
}

// Configuración de la ventana
const WINDOW_CONFIG = {
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'Veltronik',
    // icon.png = versión CUADRADA del logotipo (1024x1024, padding transparente):
    // Windows deforma iconos no cuadrados en la barra de tareas.
    icon: path.join(__dirname, '../assets/icon.png'),
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

    // Cargar la app — el bundle de ESCRITORIO (Fase 4), no el de la web.
    // `dist-desktop/` lo produce `pnpm run build:desktop` (vite.desktop.config.js) y trae
    // solo las pantallas de operación: sin planes, sin checkout, sin SDK de Mercado Pago.
    // `dist/` es de Vercel y acá no se toca.
    if (isDev()) {
        // En dev el server de Vite sirve las dos entradas; pedimos la del escritorio.
        // ⚠️ Levantalo con `pnpm run dev:desktop`, no con `pnpm dev`: el server común usa
        // vite.config.js y ahí __IS_DESKTOP__ vale false, así que la app cargaría las
        // rutas de escritorio pero creyéndose la web (el muro de cobro navegaría en vez
        // de abrir el navegador, el link de registro apuntaría a una ruta inexistente).
        mainWindow.loadURL(`${DEV_SERVER_ORIGIN}/index.desktop.html`);
    } else {
        mainWindow.loadFile(path.join(__dirname, '..', 'dist-desktop', 'index.desktop.html'));
    }

    // ─── La ventana de la app NUNCA sale de la app ───
    // Red de seguridad estructural, no una lista de casos. El pago roto nacía de un
    // `window.location.href = <url de Mercado Pago>`: la ventana se iba a MP, MP devolvía
    // al cliente a la URL web, y la app jamás se enteraba de que había pagado (por eso
    // reintentaba, y cada reintento sumaba un rechazo). Con esto, aunque se nos escape
    // algún camino en el código, la ventana no puede irse: si el destino es el portal se
    // abre en el navegador del sistema, y si no, no pasa nada.
    mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
        if (isInternalNavigation(targetUrl)) return;
        event.preventDefault();
        if (isAllowedUrl(targetUrl)) shell.openExternal(targetUrl);
    });

    // Lo mismo para target=_blank / window.open: afuera, y nunca una ventana de Electron
    // sin barra de direcciones haciéndose pasar por un navegador.
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (isAllowedUrl(url)) shell.openExternal(url);
        return { action: 'deny' };
    });

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

    // Arranque en frío: el usuario tocó el veltronik:// con la app cerrada, así que la
    // URL llegó antes de que existiera el renderer y quedó esperando. Recién con la
    // página cargada hay quien la reciba.
    mainWindow.webContents.on('did-finish-load', () => {
        flushPending();
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

// Listo para crear ventanas.
//
// El guard de instancia única no es decorativo: `app.quit()` NO corta la ejecución del
// módulo, así que sin este `if` la segunda instancia —la que abrió un veltronik:// con
// Veltronik ya andando— alcanzaría a construir su ventana y el usuario vería un parpadeo
// de una app que se abre y se cierra sola.
if (IS_PRIMARY_INSTANCE) app.whenReady().then(() => {
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

/**
 * Abrir una URL del portal en el NAVEGADOR DEL SISTEMA (Fase 4).
 *
 * Es el único puente de la app hacia afuera: lo usan el muro de cobro, el alta de
 * gimnasio y el registro, que ya no viven adentro del instalador.
 *
 * La URL la propone el renderer, así que acá se valida contra la lista blanca antes de
 * tocar shell.openExternal — sin eso, cualquier código que llegue a ejecutarse en la
 * página podría lanzar protocolos arbitrarios en la máquina del cliente. Falla cerrada:
 * si no está en la lista, devuelve false y el muro muestra la dirección en pantalla para
 * que el dueño la abra a mano.
 */
ipcMain.handle('open-external', async (_event, url) => {
    if (!isAllowedUrl(url)) {
        console.warn('[Veltronik] open-external rechazado (fuera de la lista blanca):', url);
        return false;
    }
    await shell.openExternal(url);
    return true;
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

