/**
 * ============================================
 * VELTRONIK - GESTOR UNIVERSAL DE DISPOSITIVOS
 * ============================================
 * 
 * Orquesta todos los dispositivos de acceso conectados.
 * Soporta múltiples dispositivos simultáneos con
 * detección automática y configuración plug & play.
 * 
 * Tipos soportados:
 * - TCP/IP (controladoras de red)
 * - Serial/COM (relays, molinetes antiguos)
 * - USB HID (relays USB)
 * - API REST / Webhooks (controladoras externas)
 * - SDK (ZKTeco, Hikvision, etc.)
 * - Simulación (desarrollo/demo)
 */

const { ipcMain } = require('electron');
const EventEmitter = require('events');
const path = require('path');
const fs = require('fs');

// ============================================
// CLASE PRINCIPAL
// ============================================

class DeviceManager extends EventEmitter {
    constructor() {
        super();
        this.devices = new Map();       // deviceId -> DeviceInstance
        this.configs = new Map();       // deviceId -> config
        this.mainWindow = null;
        this.tcpController = null;
        this.webhookServer = null;
        this.isInitialized = false;
    }

    // ============================================
    // INICIALIZACIÓN
    // ============================================

    async init(mainWindow) {
        this.mainWindow = mainWindow;

        console.log('[DeviceManager] Inicializando gestor universal de dispositivos...');

        // Cargar configuraciones guardadas
        this.loadConfigs();

        // Inicializar sub-módulos
        try {
            this.tcpController = require('./tcp-controller');
            await this.tcpController.init(this);
        } catch (e) {
            console.log('[DeviceManager] TCP controller no disponible:', e.message);
        }

        try {
            this.webhookServer = require('./webhook-server');
            await this.webhookServer.init(this);
        } catch (e) {
            console.log('[DeviceManager] Webhook server no disponible:', e.message);
        }

        // Registrar IPC handlers
        this.registerIPCHandlers();

        // Auto-conectar dispositivos guardados
        await this.autoConnectDevices();

        this.isInitialized = true;
        console.log('[DeviceManager] Gestor inicializado con', this.devices.size, 'dispositivos');
    }

    // ============================================
    // IPC HANDLERS
    // ============================================

    registerIPCHandlers() {
        // Detectar dispositivos disponibles
        ipcMain.handle('devices:detect', async () => {
            return await this.detectAllDevices();
        });

        // Obtener dispositivos registrados
        ipcMain.handle('devices:list', () => {
            return this.getRegisteredDevices();
        });

        // Registrar nuevo dispositivo
        ipcMain.handle('devices:register', async (event, config) => {
            return await this.registerDevice(config);
        });

        // Actualizar dispositivo
        ipcMain.handle('devices:update', async (event, { deviceId, config }) => {
            return await this.updateDevice(deviceId, config);
        });

        // Eliminar dispositivo
        ipcMain.handle('devices:remove', async (event, deviceId) => {
            return await this.removeDevice(deviceId);
        });

        // Probar conexión
        ipcMain.handle('devices:test', async (event, deviceId) => {
            return await this.testDevice(deviceId);
        });

        // Obtener estado de un dispositivo
        ipcMain.handle('devices:status', (event, deviceId) => {
            return this.getDeviceStatus(deviceId);
        });

        // Obtener estado de todos los dispositivos
        ipcMain.handle('devices:all-status', () => {
            return this.getAllDeviceStatus();
        });

        // Activar acceso en un dispositivo
        ipcMain.handle('devices:grant-access', async (event, { deviceId, options }) => {
            return await this.grantAccess(deviceId, options);
        });

        // Denegar acceso en un dispositivo
        ipcMain.handle('devices:deny-access', async (event, { deviceId, options }) => {
            return await this.denyAccess(deviceId, options);
        });

        // Obtener dispositivos seriales disponibles
        ipcMain.handle('devices:list-serial', async () => {
            return await this.listSerialPorts();
        });

        // Obtener dispositivos USB HID disponibles
        ipcMain.handle('devices:list-hid', async () => {
            return await this.listHIDDevices();
        });

        // Presets de dispositivos
        ipcMain.handle('devices:get-presets', () => {
            return this.getDevicePresets();
        });
    }

    // ============================================
    // DETECCIÓN DE DISPOSITIVOS
    // ============================================

    async detectAllDevices() {
        const detected = [];

        // 1. Modo simulación (siempre disponible)
        detected.push({
            id: 'simulation',
            name: 'Modo Simulación',
            type: 'simulation',
            connection: 'simulation',
            status: 'available',
            description: 'Simula apertura sin hardware real. Ideal para pruebas.'
        });

        // 2. Puertos seriales
        const serialPorts = await this.listSerialPorts();
        serialPorts.forEach(port => {
            detected.push({
                id: `serial:${port.path}`,
                name: `Serial: ${port.path}`,
                type: 'serial',
                connection: 'serial',
                port: port.path,
                manufacturer: port.manufacturer,
                status: 'available',
                description: port.manufacturer || `Puerto serial ${port.path}`
            });
        });

        // 3. USB HID (relays)
        const hidDevices = await this.listHIDDevices();
        hidDevices.forEach(device => {
            detected.push({
                id: `hid:${device.vendorId}:${device.productId}`,
                name: device.product || `USB Relay ${device.vendorId}:${device.productId}`,
                type: 'usb_hid',
                connection: 'usb_hid',
                vendorId: device.vendorId,
                productId: device.productId,
                status: 'available',
                description: device.manufacturer || 'Relay USB HID'
            });
        });

        // 4. Scaneo de red (TCP controllers conocidos, puertos comunes)
        const tcpDevices = await this.scanNetworkDevices();
        detected.push(...tcpDevices);

        return detected;
    }

    async listSerialPorts() {
        try {
            const SerialPort = require('serialport');
            const ports = await SerialPort.list();
            return ports;
        } catch {
            return [];
        }
    }

    async listHIDDevices() {
        try {
            const HID = require('node-hid');
            const devices = HID.devices();
            // Filtrar dispositivos que probablemente sean relays
            return devices.filter(d => this.isLikelyAccessDevice(d));
        } catch {
            return [];
        }
    }

    isLikelyAccessDevice(device) {
        const knownVendors = [
            0x16c0, // VOTI
            0x5131, // ITEAD
            0x0416, // LCUS
            0x1a86, // CH340
            0x0403, // FTDI
        ];

        return knownVendors.includes(device.vendorId) ||
            (device.product && (
                device.product.toLowerCase().includes('relay') ||
                device.product.toLowerCase().includes('access') ||
                device.product.toLowerCase().includes('turnstile')
            ));
    }

    async scanNetworkDevices() {
        const tcpDevices = [];
        // Intentar puertos comunes de controladoras de acceso
        const commonPorts = [
            { port: 4370, brand: 'ZKTeco' },
            { port: 8000, brand: 'Hikvision' },
            { port: 5005, brand: 'Dahua' },
        ];

        const net = require('net');

        for (const target of commonPorts) {
            try {
                // Escaneo rápido del gateway de red local
                const gateway = await this.getLocalGateway();
                if (!gateway) continue;

                const subnet = gateway.split('.').slice(0, 3).join('.');
                // Escanear solo un rango limitado para no bloquear
                const scanPromises = [];
                for (let i = 1; i <= 254; i++) {
                    const ip = `${subnet}.${i}`;
                    scanPromises.push(this.quickTCPScan(ip, target.port, 200));
                }

                const results = await Promise.allSettled(scanPromises);
                results.forEach((result, i) => {
                    if (result.status === 'fulfilled' && result.value) {
                        const ip = `${subnet}.${i + 1}`;
                        tcpDevices.push({
                            id: `tcp:${ip}:${target.port}`,
                            name: `${target.brand} @ ${ip}`,
                            type: 'external_controller',
                            connection: 'tcp_ip',
                            host: ip,
                            port: target.port,
                            brand: target.brand,
                            status: 'available',
                            description: `Controladora ${target.brand} detectada en ${ip}:${target.port}`
                        });
                    }
                });
            } catch {
                // Ignorar errores de scan de red
            }
        }

        return tcpDevices;
    }

    async getLocalGateway() {
        try {
            const os = require('os');
            const interfaces = os.networkInterfaces();
            for (const name of Object.keys(interfaces)) {
                for (const iface of interfaces[name]) {
                    if (iface.family === 'IPv4' && !iface.internal) {
                        // Asumir gateway es .1
                        const parts = iface.address.split('.');
                        parts[3] = '1';
                        return parts.join('.');
                    }
                }
            }
        } catch {
            return null;
        }
        return null;
    }

    quickTCPScan(host, port, timeout = 200) {
        const net = require('net');
        return new Promise((resolve) => {
            const socket = new net.Socket();
            socket.setTimeout(timeout);

            socket.on('connect', () => {
                socket.destroy();
                resolve(true);
            });

            socket.on('timeout', () => {
                socket.destroy();
                resolve(false);
            });

            socket.on('error', () => {
                socket.destroy();
                resolve(false);
            });

            socket.connect(port, host);
        });
    }

    // ============================================
    // GESTIÓN DE DISPOSITIVOS
    // ============================================

    async registerDevice(config) {
        try {
            const deviceId = config.id || `dev_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

            const deviceConfig = {
                id: deviceId,
                name: config.name || 'Dispositivo sin nombre',
                type: config.type || 'relay',
                connection: config.connection || 'simulation',
                enabled: config.enabled !== false,

                // Conexión
                host: config.host || null,
                port: config.port || null,
                serialPath: config.serialPath || null,
                baudRate: config.baudRate || 9600,
                vendorId: config.vendorId || null,
                productId: config.productId || null,
                sdkType: config.sdkType || null,
                webhookPath: config.webhookPath || null,

                // Comportamiento
                openDuration: config.openDuration || 3000,
                autoClose: config.autoClose !== false,
                feedbackEnabled: config.feedbackEnabled !== false,
                invertedLogic: config.invertedLogic || false,

                // Comandos custom
                openCommand: config.openCommand || null,
                closeCommand: config.closeCommand || null,

                // Reglas
                antipassbackEnabled: config.antipassbackEnabled || false,
                antipassbackMinutes: config.antipassbackMinutes || 30,
                maxCapacity: config.maxCapacity || null,
                schedule: config.schedule || null,

                // Credenciales soportadas
                supportedCredentials: config.supportedCredentials || ['rfid', 'qr'],

                // Estado
                status: 'disconnected',
                lastHeartbeat: null,

                createdAt: new Date().toISOString()
            };

            this.configs.set(deviceId, deviceConfig);
            this.saveConfigs();

            // Intentar conectar
            if (deviceConfig.enabled) {
                await this.connectDevice(deviceId);
            }

            console.log(`[DeviceManager] Dispositivo registrado: ${deviceConfig.name} (${deviceId})`);

            return { success: true, deviceId, config: deviceConfig };

        } catch (error) {
            console.error('[DeviceManager] Error registrando dispositivo:', error);
            return { success: false, error: error.message };
        }
    }

    async updateDevice(deviceId, newConfig) {
        try {
            const existingConfig = this.configs.get(deviceId);
            if (!existingConfig) {
                return { success: false, error: 'Dispositivo no encontrado' };
            }

            // Desconectar si estaba conectado
            await this.disconnectDevice(deviceId);

            // Actualizar config
            const updatedConfig = { ...existingConfig, ...newConfig, id: deviceId };
            this.configs.set(deviceId, updatedConfig);
            this.saveConfigs();

            // Reconectar si está habilitado
            if (updatedConfig.enabled) {
                await this.connectDevice(deviceId);
            }

            return { success: true, config: updatedConfig };

        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async removeDevice(deviceId) {
        try {
            await this.disconnectDevice(deviceId);
            this.configs.delete(deviceId);
            this.devices.delete(deviceId);
            this.saveConfigs();

            console.log(`[DeviceManager] Dispositivo eliminado: ${deviceId}`);
            return { success: true };

        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // ============================================
    // CONEXIÓN DE DISPOSITIVOS
    // ============================================

    async connectDevice(deviceId) {
        const config = this.configs.get(deviceId);
        if (!config) throw new Error('Dispositivo no encontrado');

        try {
            let device = null;

            switch (config.connection) {
                case 'serial':
                    device = await this.connectSerial(config);
                    break;
                case 'usb_hid':
                    device = await this.connectUSB(config);
                    break;
                case 'tcp_ip':
                    device = await this.connectTCP(config);
                    break;
                case 'api_rest':
                    device = this.createAPIDevice(config);
                    break;
                case 'sdk':
                    device = await this.connectSDK(config);
                    break;
                case 'simulation':
                    device = this.createSimulationDevice(config);
                    break;
                default:
                    throw new Error(`Tipo de conexión no soportado: ${config.connection}`);
            }

            device.id = deviceId;
            device.config = config;
            this.devices.set(deviceId, device);

            config.status = 'connected';
            config.lastHeartbeat = new Date().toISOString();

            this.emit('device:connected', { deviceId, config });
            this.sendToRenderer('device:status-changed', { deviceId, status: 'connected' });

            console.log(`[DeviceManager] ${config.name} conectado (${config.connection})`);

        } catch (error) {
            config.status = 'error';
            config.lastError = error.message;
            this.sendToRenderer('device:status-changed', { deviceId, status: 'error', error: error.message });
            throw error;
        }
    }

    async disconnectDevice(deviceId) {
        const device = this.devices.get(deviceId);
        if (!device) return;

        try {
            if (device.disconnect) {
                await device.disconnect();
            }
            if (device.serialPort && device.serialPort.isOpen) {
                device.serialPort.close();
            }
            if (device.hidDevice) {
                device.hidDevice.close();
            }
            if (device.tcpSocket) {
                device.tcpSocket.destroy();
            }
        } catch (e) {
            console.log('[DeviceManager] Error desconectando:', e.message);
        }

        const config = this.configs.get(deviceId);
        if (config) config.status = 'disconnected';

        this.devices.delete(deviceId);
        this.emit('device:disconnected', { deviceId });
        this.sendToRenderer('device:status-changed', { deviceId, status: 'disconnected' });
    }

    // ============================================
    // CONECTORES POR TIPO
    // ============================================

    async connectSerial(config) {
        const { SerialPort } = require('serialport');

        const serialPort = new SerialPort({
            path: config.serialPath,
            baudRate: config.baudRate || 9600,
            autoOpen: true
        });

        await new Promise((resolve, reject) => {
            serialPort.on('open', resolve);
            serialPort.on('error', reject);
            setTimeout(() => reject(new Error('Timeout conectando serial')), 5000);
        });

        // Escuchar datos entrantes (para lectores seriales)
        serialPort.on('data', (data) => {
            this.handleIncomingData(config.id, data.toString().trim(), 'serial');
        });

        return {
            type: 'serial',
            serialPort,
            grantAccess: async (options) => {
                const cmd = config.openCommand || 'RELAY1_ON\r\n';
                const cmdData = Array.isArray(cmd) ? Buffer.from(cmd) : cmd;
                serialPort.write(cmdData);

                if (config.autoClose) {
                    setTimeout(() => {
                        const closeCmd = config.closeCommand || 'RELAY1_OFF\r\n';
                        const closeCmdData = Array.isArray(closeCmd) ? Buffer.from(closeCmd) : closeCmd;
                        serialPort.write(closeCmdData);
                    }, options.duration || config.openDuration);
                }
            },
            denyAccess: async () => { /* Serial devices: no-op for deny */ },
            disconnect: async () => {
                if (serialPort.isOpen) serialPort.close();
            }
        };
    }

    async connectUSB(config) {
        const HID = require('node-hid');
        const hidDevice = new HID.HID(config.vendorId, config.productId);

        return {
            type: 'usb_hid',
            hidDevice,
            grantAccess: async (options) => {
                const cmd = config.openCommand || [0x00, 0xFF, 0x01, 0x00];
                hidDevice.write(cmd);

                if (config.autoClose) {
                    setTimeout(() => {
                        const closeCmd = config.closeCommand || [0x00, 0xFE, 0x01, 0x00];
                        hidDevice.write(closeCmd);
                    }, options.duration || config.openDuration);
                }
            },
            denyAccess: async () => { /* USB: no-op for deny */ },
            disconnect: async () => {
                hidDevice.close();
            }
        };
    }

    async connectTCP(config) {
        const net = require('net');
        const socket = new net.Socket();

        await new Promise((resolve, reject) => {
            socket.connect(config.port, config.host, resolve);
            socket.on('error', reject);
            setTimeout(() => reject(new Error('Timeout conectando TCP')), 5000);
        });

        // Escuchar datos entrantes
        socket.on('data', (data) => {
            this.handleIncomingData(config.id, data.toString().trim(), 'tcp');
        });

        socket.on('close', () => {
            const cfg = this.configs.get(config.id);
            if (cfg) cfg.status = 'disconnected';
            this.sendToRenderer('device:status-changed', { deviceId: config.id, status: 'disconnected' });

            // Auto-reconexión
            setTimeout(() => {
                if (this.configs.has(config.id) && this.configs.get(config.id).enabled) {
                    this.connectDevice(config.id).catch(() => { });
                }
            }, 5000);
        });

        return {
            type: 'tcp_ip',
            tcpSocket: socket,
            grantAccess: async (options) => {
                const cmd = config.openCommand || 'OPEN\r\n';
                const cmdData = Array.isArray(cmd) ? Buffer.from(cmd) : Buffer.from(cmd);
                socket.write(cmdData);

                if (config.autoClose) {
                    setTimeout(() => {
                        const closeCmd = config.closeCommand || 'CLOSE\r\n';
                        socket.write(Buffer.from(closeCmd));
                    }, options.duration || config.openDuration);
                }
            },
            denyAccess: async () => {
                // Enviar comando de denegación si existe
                if (config.denyCommand) {
                    socket.write(Buffer.from(config.denyCommand));
                }
            },
            disconnect: async () => {
                socket.destroy();
            }
        };
    }

    createAPIDevice(config) {
        return {
            type: 'api_rest',
            grantAccess: async () => {
                // El dispositivo se controla via webhooks entrantes
                // Aquí respondemos al webhook con la autorización
                console.log(`[DeviceManager] API device ${config.name}: acceso autorizado`);
            },
            denyAccess: async () => {
                console.log(`[DeviceManager] API device ${config.name}: acceso denegado`);
            },
            disconnect: async () => { }
        };
    }

    async connectSDK(config) {
        // Stub para integración con SDKs de fabricantes
        // Cada SDK tiene su propia lógica de conexión
        console.log(`[DeviceManager] SDK ${config.sdkType}: conectando...`);

        return {
            type: 'sdk',
            grantAccess: async (options) => {
                console.log(`[DeviceManager] SDK ${config.sdkType}: grant access`);
            },
            denyAccess: async () => {
                console.log(`[DeviceManager] SDK ${config.sdkType}: deny access`);
            },
            disconnect: async () => {
                console.log(`[DeviceManager] SDK ${config.sdkType}: desconectado`);
            }
        };
    }

    createSimulationDevice(config) {
        return {
            type: 'simulation',
            grantAccess: async (options) => {
                console.log(`[DeviceManager] [SIMULACIÓN] ${config.name}: ✅ ACCESO ABIERTO (${options.duration || config.openDuration}ms)`);
                this.sendToRenderer('device:simulation-event', {
                    deviceId: config.id,
                    event: 'grant',
                    duration: options.duration || config.openDuration
                });
            },
            denyAccess: async (options) => {
                console.log(`[DeviceManager] [SIMULACIÓN] ${config.name}: ❌ ACCESO DENEGADO`);
                this.sendToRenderer('device:simulation-event', {
                    deviceId: config.id,
                    event: 'deny',
                    reason: options.reason
                });
            },
            disconnect: async () => { }
        };
    }

    // ============================================
    // CONTROL DE ACCESO
    // ============================================

    async grantAccess(deviceId, options = {}) {
        const device = this.devices.get(deviceId);
        if (!device) {
            // Si no hay dispositivo específico, buscar el primero disponible
            const firstDevice = this.getFirstConnectedDevice();
            if (firstDevice) {
                return this.grantAccess(firstDevice.config.id, options);
            }
            return { success: false, error: 'No hay dispositivos conectados' };
        }

        try {
            await device.grantAccess(options);

            this.sendToRenderer('access:opened', {
                deviceId,
                timestamp: new Date().toISOString(),
                duration: options.duration || device.config.openDuration
            });

            return { success: true };

        } catch (error) {
            console.error(`[DeviceManager] Error grant access ${deviceId}:`, error);
            return { success: false, error: error.message };
        }
    }

    async denyAccess(deviceId, options = {}) {
        const device = this.devices.get(deviceId);
        if (!device) {
            const firstDevice = this.getFirstConnectedDevice();
            if (firstDevice) {
                return this.denyAccess(firstDevice.config.id, options);
            }
            return { success: true }; // No error if no device, just software deny
        }

        try {
            await device.denyAccess(options);

            this.sendToRenderer('access:denied', {
                deviceId,
                reason: options.reason,
                timestamp: new Date().toISOString()
            });

            return { success: true };

        } catch (error) {
            console.error(`[DeviceManager] Error deny access ${deviceId}:`, error);
            return { success: false, error: error.message };
        }
    }

    // ============================================
    // DATOS ENTRANTES (lectores)
    // ============================================

    handleIncomingData(deviceId, data, source) {
        console.log(`[DeviceManager] Dato recibido de ${deviceId} (${source}): ${data}`);

        // Emitir evento para que el renderer procese la credencial
        this.emit('credential:received', { deviceId, data, source });
        this.sendToRenderer('credential:received', { deviceId, data, source, timestamp: new Date().toISOString() });
    }

    // Método público para recibir webhooks
    handleWebhookEvent(deviceId, eventData) {
        console.log(`[DeviceManager] Webhook recibido para ${deviceId}:`, eventData);

        this.emit('webhook:received', { deviceId, ...eventData });
        this.sendToRenderer('credential:received', {
            deviceId,
            data: eventData.credential || eventData.code || eventData.card_code,
            source: 'webhook',
            eventType: eventData.event_type,
            timestamp: new Date().toISOString()
        });
    }

    // ============================================
    // CONSULTAS
    // ============================================

    getRegisteredDevices() {
        const list = [];
        this.configs.forEach((config, id) => {
            list.push({
                ...config,
                isConnected: this.devices.has(id)
            });
        });
        return list;
    }

    getDeviceStatus(deviceId) {
        const config = this.configs.get(deviceId);
        const device = this.devices.get(deviceId);

        if (!config) return null;

        return {
            ...config,
            isConnected: !!device,
            deviceType: device ? device.type : null
        };
    }

    getAllDeviceStatus() {
        const statuses = [];
        this.configs.forEach((config, id) => {
            statuses.push(this.getDeviceStatus(id));
        });
        return statuses;
    }

    getFirstConnectedDevice() {
        for (const [id, device] of this.devices) {
            return device;
        }
        return null;
    }

    getDevicePresets() {
        return [
            {
                id: 'relay_usb_generic',
                name: 'Relay USB Genérico',
                description: 'Relay USB HID estándar (LCUS, ITEAD, etc.)',
                connection: 'usb_hid',
                type: 'relay',
                openCommand: [0x00, 0xFF, 0x01, 0x00],
                closeCommand: [0x00, 0xFE, 0x01, 0x00]
            },
            {
                id: 'relay_serial',
                name: 'Relay Puerto Serial',
                description: 'Relay conectado por puerto COM/Serial',
                connection: 'serial',
                type: 'relay',
                baudRate: 9600,
                openCommand: 'RELAY1_ON\r\n',
                closeCommand: 'RELAY1_OFF\r\n'
            },
            {
                id: 'turnstile_tcp',
                name: 'Molinete TCP/IP',
                description: 'Molinete con controladora de red',
                connection: 'tcp_ip',
                type: 'turnstile',
                port: 4370,
                openCommand: [0x02, 0x01, 0x01, 0x03],
                closeCommand: null
            },
            {
                id: 'zkteco_controller',
                name: 'Controladora ZKTeco',
                description: 'Controladora de acceso ZKTeco (InBio, C3, etc.)',
                connection: 'tcp_ip',
                type: 'external_controller',
                port: 4370,
                supportedCredentials: ['rfid', 'fingerprint', 'facial']
            },
            {
                id: 'electromagnetic_lock',
                name: 'Cerradura Electromagnética',
                description: 'Cerradura electromagnética con relay',
                connection: 'serial',
                type: 'electric_door',
                invertedLogic: true,
                openDuration: 5000
            },
            {
                id: 'external_api',
                name: 'Controladora Externa (API)',
                description: 'Dispositivo que envía eventos por API REST o Webhooks',
                connection: 'api_rest',
                type: 'external_controller',
                supportedCredentials: ['rfid', 'qr', 'fingerprint', 'facial']
            },
            {
                id: 'simulation',
                name: 'Simulación',
                description: 'Sin hardware: simula apertura para pruebas',
                connection: 'simulation',
                type: 'relay'
            }
        ];
    }

    async testDevice(deviceId) {
        const device = this.devices.get(deviceId);
        const config = this.configs.get(deviceId);

        if (!config) {
            return { success: false, error: 'Dispositivo no encontrado' };
        }

        if (!device) {
            // Intentar conectar
            try {
                await this.connectDevice(deviceId);
            } catch (error) {
                return { success: false, error: `No se pudo conectar: ${error.message}` };
            }
        }

        try {
            // Prueba de apertura rápida (1 segundo)
            await this.grantAccess(deviceId, { duration: 1000 });
            return {
                success: true,
                message: `${config.name}: Conexión exitosa. Apertura de prueba ejecutada.`
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // ============================================
    // AUTO-CONEXIÓN
    // ============================================

    async autoConnectDevices() {
        for (const [deviceId, config] of this.configs) {
            if (config.enabled && config.status !== 'disabled') {
                try {
                    await this.connectDevice(deviceId);
                } catch (error) {
                    console.log(`[DeviceManager] Auto-conexión fallida para ${config.name}: ${error.message}`);
                }
            }
        }
    }

    // ============================================
    // PERSISTENCIA
    // ============================================

    saveConfigs() {
        try {
            const { app } = require('electron');
            const configDir = app.getPath('userData');
            const configPath = path.join(configDir, 'access-devices.json');

            const data = {};
            this.configs.forEach((config, id) => {
                data[id] = config;
            });

            fs.writeFileSync(configPath, JSON.stringify(data, null, 2));

        } catch (error) {
            console.error('[DeviceManager] Error guardando configs:', error);
        }
    }

    loadConfigs() {
        try {
            const { app } = require('electron');
            const configPath = path.join(app.getPath('userData'), 'access-devices.json');

            if (fs.existsSync(configPath)) {
                const data = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                Object.entries(data).forEach(([id, config]) => {
                    config.status = 'disconnected'; // Reset status on load
                    this.configs.set(id, config);
                });
                console.log(`[DeviceManager] ${this.configs.size} configuraciones cargadas`);
            }
        } catch (error) {
            console.error('[DeviceManager] Error cargando configs:', error);
        }
    }

    // ============================================
    // UTILIDADES
    // ============================================

    sendToRenderer(channel, data) {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send(channel, data);
        }
    }

    destroy() {
        // Desconectar todos los dispositivos
        for (const [deviceId] of this.devices) {
            this.disconnectDevice(deviceId).catch(() => { });
        }

        if (this.webhookServer) {
            this.webhookServer.stop();
        }
    }
}

// Singleton
const deviceManager = new DeviceManager();

module.exports = deviceManager;
