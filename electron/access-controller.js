/**
 * ============================================
 * VELTRONIK - CONTROLADOR DE ACCESO FÍSICO
 * ============================================
 * 
 * Módulo para controlar dispositivos de acceso físico:
 * - Molinetes (turnstiles)
 * - Cerraduras electromagnéticas
 * - Barreras vehiculares
 * - Relays USB/COM
 * 
 * Soporta múltiples tipos de conexión:
 * - USB Relay (HID)
 * - Puerto Serial/COM
 * - GPIO (para Raspberry Pi)
 */

const { ipcMain, BrowserWindow } = require('electron');

// ============================================
// ESTADO DEL MÓDULO
// ============================================

let config = {
    enabled: false,
    deviceType: 'none', // 'relay_usb', 'relay_serial', 'turnstile', 'door'
    connectionType: 'none', // 'usb', 'serial', 'gpio'
    port: null, // Puerto COM o path USB
    openDuration: 3000, // Duración de apertura en ms
    feedbackEnabled: true,
    autoClose: true
};

let mainWindow = null;
let serialPort = null;
let usbRelay = null;
let isOpen = false;

// ============================================
// CONFIGURACIONES PREDEFINIDAS POR DISPOSITIVO
// ============================================

const DEVICE_PRESETS = {
    // Relay USB genérico (la mayoría de relays USB HID)
    relay_usb_generic: {
        type: 'relay_usb',
        openCommand: [0x00, 0xFF, 0x01, 0x00], // Activar relay 1
        closeCommand: [0x00, 0xFE, 0x01, 0x00], // Desactivar relay 1
        vendorId: null, // Detectar automáticamente
        productId: null
    },

    // Relay por puerto serie
    relay_serial: {
        type: 'relay_serial',
        openCommand: 'RELAY1_ON\r\n',
        closeCommand: 'RELAY1_OFF\r\n',
        baudRate: 9600
    },

    // Molinete con protocolo estándar
    turnstile_standard: {
        type: 'turnstile',
        openCommand: [0x02, 0x01, 0x01, 0x03], // STX + CMD + DATA + ETX
        closeCommand: null, // Cierre automático por sensor
        baudRate: 9600
    },

    // Cerradura electromagnética
    electromagnetic_lock: {
        type: 'door',
        invertedLogic: true, // Relay normalmente cerrado
        openDuration: 5000
    }
};

// ============================================
// INICIALIZACIÓN
// ============================================

/**
 * Inicializar el controlador de acceso
 * @param {BrowserWindow} window - Ventana principal
 */
function initAccessController(window) {
    mainWindow = window;

    console.log('[AccessController] Módulo inicializado');

    // Registrar IPC handlers
    registerIPCHandlers();

    // Cargar configuración guardada
    loadSavedConfig();
}

/**
 * Registrar handlers IPC
 */
function registerIPCHandlers() {
    // Obtener dispositivos disponibles
    ipcMain.handle('access:get-devices', async () => {
        return await detectDevices();
    });

    // Configurar dispositivo
    ipcMain.handle('access:configure', async (event, newConfig) => {
        return await configure(newConfig);
    });

    // Activar apertura (grant access)
    ipcMain.handle('access:grant', async (event, options = {}) => {
        return await grantAccess(options);
    });

    // Denegar acceso (feedback visual/sonoro)
    ipcMain.handle('access:deny', async (event, options = {}) => {
        return await denyAccess(options);
    });

    // Probar conexión
    ipcMain.handle('access:test', async () => {
        return await testConnection();
    });

    // Obtener estado
    ipcMain.handle('access:status', () => {
        return getStatus();
    });

    // Obtener configuración actual
    ipcMain.handle('access:get-config', () => {
        return config;
    });

    // Obtener presets disponibles
    ipcMain.handle('access:get-presets', () => {
        return Object.keys(DEVICE_PRESETS).map(key => ({
            id: key,
            ...DEVICE_PRESETS[key]
        }));
    });
}

// ============================================
// DETECCIÓN DE DISPOSITIVOS
// ============================================

/**
 * Detectar dispositivos de control de acceso disponibles
 * @returns {Array} Lista de dispositivos detectados
 */
async function detectDevices() {
    const devices = [];

    // Siempre disponible: modo simulación
    devices.push({
        id: 'simulation',
        name: 'Modo Simulación (sin hardware)',
        type: 'simulation',
        status: 'ready',
        description: 'Simula la apertura sin controlar hardware real'
    });

    // Detectar puertos seriales disponibles
    try {
        const serialports = await listSerialPorts();
        serialports.forEach(port => {
            devices.push({
                id: `serial:${port.path}`,
                name: `Puerto Serial: ${port.path}`,
                type: 'serial',
                port: port.path,
                status: 'available',
                description: port.manufacturer || 'Dispositivo serial'
            });
        });
    } catch (error) {
        console.log('[AccessController] SerialPort no disponible:', error.message);
    }

    // Detectar dispositivos USB HID (relays)
    try {
        const hidDevices = await listHIDDevices();
        hidDevices.forEach(device => {
            if (isLikelyRelay(device)) {
                devices.push({
                    id: `hid:${device.vendorId}:${device.productId}`,
                    name: device.product || `USB Relay (${device.vendorId}:${device.productId})`,
                    type: 'usb_relay',
                    vendorId: device.vendorId,
                    productId: device.productId,
                    status: 'available',
                    description: device.manufacturer || 'Relay USB HID'
                });
            }
        });
    } catch (error) {
        console.log('[AccessController] node-hid no disponible:', error.message);
    }

    return devices;
}

/**
 * Listar puertos seriales
 */
async function listSerialPorts() {
    try {
        const SerialPort = require('serialport');
        return await SerialPort.list();
    } catch {
        return [];
    }
}

/**
 * Listar dispositivos HID
 */
async function listHIDDevices() {
    try {
        const HID = require('node-hid');
        return HID.devices();
    } catch {
        return [];
    }
}

/**
 * Verificar si un dispositivo HID es probablemente un relay
 */
function isLikelyRelay(device) {
    // Los relays USB suelen tener ciertos VendorIDs conocidos
    const knownRelayVendors = [
        0x16c0, // VOTI
        0x5131, // ITEAD
        0x0416, // LCUS
        0x1a86  // CH340
    ];

    return knownRelayVendors.includes(device.vendorId) ||
        (device.product && device.product.toLowerCase().includes('relay'));
}

// ============================================
// CONFIGURACIÓN
// ============================================

/**
 * Configurar el controlador
 * @param {Object} newConfig - Nueva configuración
 */
async function configure(newConfig) {
    try {
        // Cerrar conexiones existentes
        await closeConnections();

        // Actualizar configuración
        config = { ...config, ...newConfig };

        // Guardar configuración
        saveConfig();

        // Intentar conectar si está habilitado
        if (config.enabled && config.deviceType !== 'none') {
            await connect();
        }

        console.log('[AccessController] Configuración actualizada:', config);

        return { success: true, config };
    } catch (error) {
        console.error('[AccessController] Error configurando:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Conectar al dispositivo configurado
 */
async function connect() {
    switch (config.connectionType) {
        case 'serial':
            await connectSerial();
            break;
        case 'usb':
            await connectUSB();
            break;
        case 'simulation':
            console.log('[AccessController] Modo simulación activo');
            break;
    }
}

/**
 * Conectar a puerto serial
 */
async function connectSerial() {
    if (!config.port) {
        throw new Error('Puerto serial no configurado');
    }

    try {
        const { SerialPort } = require('serialport');

        serialPort = new SerialPort({
            path: config.port,
            baudRate: config.baudRate || 9600,
            autoOpen: true
        });

        serialPort.on('open', () => {
            console.log(`[AccessController] Puerto serial abierto: ${config.port}`);
        });

        serialPort.on('error', (err) => {
            console.error('[AccessController] Error serial:', err.message);
        });

    } catch (error) {
        throw new Error(`No se pudo conectar al puerto ${config.port}: ${error.message}`);
    }
}

/**
 * Conectar a relay USB HID
 */
async function connectUSB() {
    if (!config.vendorId || !config.productId) {
        throw new Error('Dispositivo USB no configurado');
    }

    try {
        const HID = require('node-hid');

        usbRelay = new HID.HID(config.vendorId, config.productId);

        console.log(`[AccessController] Relay USB conectado: ${config.vendorId}:${config.productId}`);

    } catch (error) {
        throw new Error(`No se pudo conectar al relay USB: ${error.message}`);
    }
}

/**
 * Cerrar todas las conexiones
 */
async function closeConnections() {
    if (serialPort && serialPort.isOpen) {
        serialPort.close();
        serialPort = null;
    }

    if (usbRelay) {
        usbRelay.close();
        usbRelay = null;
    }
}

// ============================================
// CONTROL DE ACCESO
// ============================================

/**
 * Otorgar acceso (abrir molinete/puerta)
 * @param {Object} options - Opciones adicionales
 */
async function grantAccess(options = {}) {
    if (isOpen) {
        return { success: true, message: 'Ya está abierto' };
    }

    try {
        console.log('[AccessController] Otorgando acceso...');

        isOpen = true;

        // Enviar comando de apertura según tipo de conexión
        switch (config.connectionType) {
            case 'serial':
                await sendSerialCommand('open');
                break;
            case 'usb':
                await sendUSBCommand('open');
                break;
            case 'simulation':
                console.log('[AccessController] [SIMULACIÓN] Puerta/molinete abierto');
                break;
        }

        // Notificar al renderer
        sendToRenderer('access:opened', {
            timestamp: new Date().toISOString(),
            duration: config.openDuration
        });

        // Programar cierre automático
        if (config.autoClose) {
            setTimeout(async () => {
                await closeAccess();
            }, options.duration || config.openDuration);
        }

        // Feedback sonoro (si está habilitado y hay speaker)
        if (config.feedbackEnabled) {
            playFeedback('success');
        }

        return { success: true };

    } catch (error) {
        console.error('[AccessController] Error otorgando acceso:', error);
        isOpen = false;
        return { success: false, error: error.message };
    }
}

/**
 * Denegar acceso (feedback visual/sonoro)
 * @param {Object} options - Opciones adicionales
 */
async function denyAccess(options = {}) {
    console.log('[AccessController] Acceso denegado:', options.reason || 'Sin autorización');

    // Notificar al renderer
    sendToRenderer('access:denied', {
        reason: options.reason,
        timestamp: new Date().toISOString()
    });

    // Feedback sonoro de error
    if (config.feedbackEnabled) {
        playFeedback('error');
    }

    return { success: true };
}

/**
 * Cerrar acceso (después del tiempo configurado)
 */
async function closeAccess() {
    if (!isOpen) return;

    try {
        console.log('[AccessController] Cerrando acceso...');

        switch (config.connectionType) {
            case 'serial':
                await sendSerialCommand('close');
                break;
            case 'usb':
                await sendUSBCommand('close');
                break;
            case 'simulation':
                console.log('[AccessController] [SIMULACIÓN] Puerta/molinete cerrado');
                break;
        }

        isOpen = false;

        sendToRenderer('access:closed', {
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('[AccessController] Error cerrando acceso:', error);
    }
}

/**
 * Enviar comando por puerto serial
 */
async function sendSerialCommand(action) {
    if (!serialPort || !serialPort.isOpen) {
        throw new Error('Puerto serial no conectado');
    }

    const preset = DEVICE_PRESETS[config.preset] || DEVICE_PRESETS.relay_serial;
    const command = action === 'open' ? preset.openCommand : preset.closeCommand;

    if (command) {
        return new Promise((resolve, reject) => {
            serialPort.write(command, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }
}

/**
 * Enviar comando a relay USB
 */
async function sendUSBCommand(action) {
    if (!usbRelay) {
        throw new Error('Relay USB no conectado');
    }

    const preset = DEVICE_PRESETS[config.preset] || DEVICE_PRESETS.relay_usb_generic;
    const command = action === 'open' ? preset.openCommand : preset.closeCommand;

    if (command) {
        usbRelay.write(command);
    }
}

// ============================================
// UTILIDADES
// ============================================

/**
 * Probar conexión con el dispositivo
 */
async function testConnection() {
    try {
        if (config.connectionType === 'simulation') {
            return {
                success: true,
                message: 'Modo simulación activo - No hay hardware conectado'
            };
        }

        if (config.connectionType === 'serial' && serialPort && serialPort.isOpen) {
            return { success: true, message: 'Puerto serial conectado' };
        }

        if (config.connectionType === 'usb' && usbRelay) {
            return { success: true, message: 'Relay USB conectado' };
        }

        // Intentar conectar
        await connect();

        // Hacer prueba de apertura rápida
        await grantAccess({ duration: 1000 });

        return { success: true, message: 'Dispositivo respondió correctamente' };

    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Obtener estado actual
 */
function getStatus() {
    return {
        enabled: config.enabled,
        deviceType: config.deviceType,
        connectionType: config.connectionType,
        isConnected: isConnected(),
        isOpen: isOpen,
        config: {
            openDuration: config.openDuration,
            feedbackEnabled: config.feedbackEnabled,
            autoClose: config.autoClose
        }
    };
}

/**
 * Verificar si está conectado
 */
function isConnected() {
    if (config.connectionType === 'simulation') return true;
    if (config.connectionType === 'serial') return serialPort && serialPort.isOpen;
    if (config.connectionType === 'usb') return usbRelay !== null;
    return false;
}

/**
 * Enviar evento al renderer
 */
function sendToRenderer(channel, data) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(channel, data);
    }
}

/**
 * Reproducir feedback sonoro en el renderer
 */
function playFeedback(type) {
    sendToRenderer('access:feedback', { type });
}

/**
 * Guardar configuración
 */
function saveConfig() {
    try {
        const { app } = require('electron');
        const fs = require('fs');
        const path = require('path');

        const configPath = path.join(app.getPath('userData'), 'access-config.json');
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    } catch (error) {
        console.error('[AccessController] Error guardando config:', error);
    }
}

/**
 * Cargar configuración guardada
 */
function loadSavedConfig() {
    try {
        const { app } = require('electron');
        const fs = require('fs');
        const path = require('path');

        const configPath = path.join(app.getPath('userData'), 'access-config.json');

        if (fs.existsSync(configPath)) {
            const savedConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            config = { ...config, ...savedConfig };
            console.log('[AccessController] Configuración cargada');
        }

    } catch (error) {
        console.error('[AccessController] Error cargando config:', error);
    }
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
    initAccessController,
    grantAccess,
    denyAccess,
    closeAccess,
    configure,
    detectDevices,
    testConnection,
    getStatus
};
