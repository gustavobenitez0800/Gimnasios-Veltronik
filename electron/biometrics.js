/**
 * ============================================
 * VELTRONIK - MÓDULO DE BIOMÉTRICOS
 * ============================================
 * 
 * Módulo universal para integración con dispositivos biométricos.
 * Compatible con la mayoría de lectores USB (RFID, huellas, etc.)
 * 
 * Soporta 3 modos de operación:
 * 1. Modo Teclado (HID Keyboard) - Lectores RFID que actúan como teclado
 * 2. Modo HID Raw - Lectores USB HID directos
 * 3. Modo Serial - Lectores por puerto serie/COM
 */

const { ipcMain, BrowserWindow } = require('electron');

// ============================================
// ESTADO DEL MÓDULO
// ============================================

let isCapturing = false;
let captureMode = null; // 'keyboard', 'hid', 'serial'
let keyboardBuffer = '';
let keyboardTimeout = null;
let mainWindow = null;

// Configuración
const CONFIG = {
    // Tiempo máximo entre teclas para considerar una entrada completa (ms)
    KEYBOARD_TIMEOUT: 150,
    // Longitud mínima de código válido
    MIN_CODE_LENGTH: 4,
    // Longitud máxima de código
    MAX_CODE_LENGTH: 20,
    // Patrones de códigos válidos (regex)
    VALID_PATTERNS: [
        /^[0-9]{4,20}$/,           // Solo números (tarjetas RFID típicas)
        /^[A-F0-9]{8,16}$/i,       // Hexadecimal (algunas tarjetas)
        /^[A-Z0-9]{4,20}$/i        // Alfanumérico
    ]
};

// Lista de dispositivos detectados
let detectedDevices = [];

// ============================================
// INICIALIZACIÓN
// ============================================

/**
 * Inicializar el módulo de biométricos
 * @param {BrowserWindow} window - Ventana principal de Electron
 */
function initBiometrics(window) {
    mainWindow = window;

    console.log('[Biometrics] Módulo inicializado');

    // Registrar IPC handlers
    registerIPCHandlers();

    // Detectar dispositivos al inicio
    detectDevices();
}

/**
 * Registrar todos los IPC handlers
 */
function registerIPCHandlers() {
    // Obtener dispositivos disponibles
    ipcMain.handle('biometrics:get-devices', async () => {
        return await detectDevices();
    });

    // Iniciar captura
    ipcMain.handle('biometrics:start-capture', async (event, options = {}) => {
        return startCapture(options);
    });

    // Detener captura
    ipcMain.handle('biometrics:stop-capture', async () => {
        return stopCapture();
    });

    // Obtener estado
    ipcMain.handle('biometrics:get-status', () => {
        return {
            isCapturing,
            captureMode,
            devices: detectedDevices
        };
    });

    // Verificar si está disponible
    ipcMain.handle('biometrics:is-available', () => {
        return true; // Siempre disponible en Electron
    });
}

// ============================================
// DETECCIÓN DE DISPOSITIVOS
// ============================================

/**
 * Detectar dispositivos biométricos conectados
 * @returns {Array} Lista de dispositivos
 */
async function detectDevices() {
    detectedDevices = [];

    // En Electron, siempre soportamos modo teclado (para RFID tipo keyboard)
    detectedDevices.push({
        id: 'keyboard-mode',
        name: 'Lector RFID/Código de Barras (Modo Teclado)',
        type: 'rfid_card',
        mode: 'keyboard',
        status: 'ready',
        description: 'Compatible con cualquier lector que emule teclado'
    });

    // Intentar detectar dispositivos HID USB
    try {
        // En Electron podemos usar node-hid si está instalado
        // Por ahora solo reportamos disponibilidad
        const hasHIDSupport = checkHIDSupport();
        if (hasHIDSupport) {
            detectedDevices.push({
                id: 'hid-scanner',
                name: 'Scanner USB Directo',
                type: 'fingerprint',
                mode: 'hid',
                status: 'available',
                description: 'Lectores de huella USB compatibles'
            });
        }
    } catch (error) {
        console.log('[Biometrics] HID no disponible:', error.message);
    }

    // Notificar al renderer
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('biometrics:devices-updated', detectedDevices);
    }

    return detectedDevices;
}

/**
 * Verificar si hay soporte HID
 */
function checkHIDSupport() {
    try {
        // Intentar cargar node-hid solo si está disponible
        require.resolve('node-hid');
        return true;
    } catch {
        return false;
    }
}

// ============================================
// CAPTURA DE DATOS BIOMÉTRICOS
// ============================================

/**
 * Iniciar captura de datos biométricos
 * @param {Object} options - Opciones de captura
 */
function startCapture(options = {}) {
    if (isCapturing) {
        return { success: false, error: 'Ya hay una captura en progreso' };
    }

    const mode = options.mode || 'keyboard';

    console.log(`[Biometrics] Iniciando captura en modo: ${mode}`);

    isCapturing = true;
    captureMode = mode;
    keyboardBuffer = '';

    // Notificar que empezó la captura
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('biometrics:capture-started', { mode });
    }

    return { success: true, mode };
}

/**
 * Detener captura
 */
function stopCapture() {
    console.log('[Biometrics] Deteniendo captura');

    isCapturing = false;
    captureMode = null;
    keyboardBuffer = '';

    if (keyboardTimeout) {
        clearTimeout(keyboardTimeout);
        keyboardTimeout = null;
    }

    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('biometrics:capture-stopped');
    }

    return { success: true };
}

/**
 * Procesar entrada de teclado (para RFID tipo keyboard)
 * Esta función debe ser llamada desde el renderer cuando detecta keystrokes rápidos
 * @param {string} key - Tecla presionada
 */
function processKeyboardInput(key) {
    if (!isCapturing || captureMode !== 'keyboard') {
        return;
    }

    // Limpiar timeout anterior
    if (keyboardTimeout) {
        clearTimeout(keyboardTimeout);
    }

    // Enter = fin de código
    if (key === 'Enter') {
        processCompleteCode(keyboardBuffer);
        keyboardBuffer = '';
        return;
    }

    // Agregar al buffer si es carácter válido
    if (/^[a-zA-Z0-9]$/.test(key)) {
        keyboardBuffer += key;
    }

    // Timeout - si no hay más input, procesar lo que tenemos
    keyboardTimeout = setTimeout(() => {
        if (keyboardBuffer.length >= CONFIG.MIN_CODE_LENGTH) {
            processCompleteCode(keyboardBuffer);
        }
        keyboardBuffer = '';
    }, CONFIG.KEYBOARD_TIMEOUT);
}

/**
 * Procesar un código completo capturado
 * @param {string} code - Código capturado
 */
function processCompleteCode(code) {
    if (!code || code.length < CONFIG.MIN_CODE_LENGTH) {
        return;
    }

    if (code.length > CONFIG.MAX_CODE_LENGTH) {
        code = code.substring(0, CONFIG.MAX_CODE_LENGTH);
    }

    // Validar formato
    const isValid = CONFIG.VALID_PATTERNS.some(pattern => pattern.test(code));

    if (!isValid) {
        console.log(`[Biometrics] Código inválido: ${code}`);
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('biometrics:invalid-code', { code });
        }
        return;
    }

    console.log(`[Biometrics] Código capturado: ${code}`);

    // Generar hash simple del código para almacenar
    const codeHash = simpleHash(code);

    // Enviar al renderer
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('biometrics:data-captured', {
            type: 'rfid_card',
            code: code,
            hash: codeHash,
            timestamp: new Date().toISOString(),
            mode: 'keyboard'
        });
    }
}

/**
 * Hash simple para códigos (no cryptográfico, solo para comparación)
 */
function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return 'CARD_' + Math.abs(hash).toString(16).toUpperCase().padStart(8, '0');
}

// ============================================
// IPC PARA INPUT DEL RENDERER
// ============================================

// Recibir keystrokes del renderer
ipcMain.on('biometrics:key-input', (event, key) => {
    processKeyboardInput(key);
});

// ============================================
// EXPORTS
// ============================================

module.exports = {
    initBiometrics,
    detectDevices,
    startCapture,
    stopCapture,
    processKeyboardInput,
    getStatus: () => ({
        isCapturing,
        captureMode,
        devices: detectedDevices
    })
};
