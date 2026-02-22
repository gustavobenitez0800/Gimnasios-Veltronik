/**
 * ============================================
 * VELTRONIK - CONTROLADOR TCP/IP
 * ============================================
 * 
 * Gestiona conexiones TCP/IP con controladoras
 * de acceso, molinetes y dispositivos de red.
 * 
 * Protocolos soportados:
 * - ZKTeco UDP Push Protocol
 * - Hikvision ISAPI
 * - Protocolo genérico TCP
 */

const net = require('net');
const dgram = require('dgram');
const EventEmitter = require('events');

class TCPController extends EventEmitter {
    constructor() {
        super();
        this.deviceManager = null;
        this.connections = new Map(); // deviceId -> socket
        this.listeners = new Map();   // port -> server
    }

    async init(deviceManager) {
        this.deviceManager = deviceManager;
        console.log('[TCPController] Módulo TCP/IP inicializado');
    }

    /**
     * Crear un listener TCP en un puerto para recibir eventos push
     */
    async startListener(port, callback) {
        if (this.listeners.has(port)) {
            return; // Ya escuchando
        }

        const server = net.createServer((socket) => {
            const remoteAddr = `${socket.remoteAddress}:${socket.remotePort}`;
            console.log(`[TCPController] Conexión entrante desde ${remoteAddr}`);

            let buffer = '';

            socket.on('data', (data) => {
                buffer += data.toString();

                // Procesar líneas completas
                const lines = buffer.split('\n');
                buffer = lines.pop(); // Mantener el último fragmento incompleto

                lines.forEach(line => {
                    const trimmed = line.trim();
                    if (trimmed) {
                        this.processIncomingData(trimmed, remoteAddr, callback);
                    }
                });
            });

            socket.on('error', (err) => {
                console.log(`[TCPController] Error socket ${remoteAddr}:`, err.message);
            });

            socket.on('close', () => {
                console.log(`[TCPController] Desconexión de ${remoteAddr}`);
            });
        });

        return new Promise((resolve, reject) => {
            server.listen(port, '0.0.0.0', () => {
                this.listeners.set(port, server);
                console.log(`[TCPController] Escuchando en puerto TCP ${port}`);
                resolve();
            });

            server.on('error', (err) => {
                console.error(`[TCPController] Error en puerto ${port}:`, err.message);
                reject(err);
            });
        });
    }

    /**
     * Conectar a un dispositivo TCP remoto
     */
    async connect(deviceId, host, port, options = {}) {
        return new Promise((resolve, reject) => {
            const socket = new net.Socket();
            const timeout = options.timeout || 5000;

            socket.setTimeout(timeout);

            socket.connect(port, host, () => {
                console.log(`[TCPController] Conectado a ${host}:${port}`);

                this.connections.set(deviceId, {
                    socket,
                    host,
                    port,
                    connectedAt: new Date()
                });

                socket.setTimeout(0); // Quitar timeout después de conectar
                resolve(socket);
            });

            socket.on('data', (data) => {
                const msg = data.toString().trim();
                if (msg && this.deviceManager) {
                    this.deviceManager.handleIncomingData(deviceId, msg, 'tcp');
                }
            });

            socket.on('close', () => {
                this.connections.delete(deviceId);
                this.emit('disconnected', { deviceId, host, port });
            });

            socket.on('error', (err) => {
                this.connections.delete(deviceId);
                reject(err);
            });

            socket.on('timeout', () => {
                socket.destroy();
                reject(new Error(`Timeout conectando a ${host}:${port}`));
            });
        });
    }

    /**
     * Enviar comando a un dispositivo TCP
     */
    async send(deviceId, command) {
        const conn = this.connections.get(deviceId);
        if (!conn || !conn.socket || conn.socket.destroyed) {
            throw new Error('Dispositivo no conectado');
        }

        const data = Array.isArray(command) ? Buffer.from(command) : Buffer.from(command);

        return new Promise((resolve, reject) => {
            conn.socket.write(data, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    /**
     * Desconectar un dispositivo
     */
    disconnect(deviceId) {
        const conn = this.connections.get(deviceId);
        if (conn && conn.socket) {
            conn.socket.destroy();
        }
        this.connections.delete(deviceId);
    }

    /**
     * Procesar datos entrantes
     */
    processIncomingData(data, source, callback) {
        // Intentar parsear como JSON
        try {
            const json = JSON.parse(data);
            if (callback) callback(json, source);
            return;
        } catch { /* No es JSON */ }

        // Intentar parsear como evento de controladora ZKTeco
        if (this.isZKTecoEvent(data)) {
            const event = this.parseZKTecoEvent(data);
            if (event && callback) callback(event, source);
            return;
        }

        // Dato genérico (ej: código RFID raw)
        if (callback) {
            callback({ type: 'raw', code: data }, source);
        }
    }

    /**
     * Detectar formato ZKTeco
     */
    isZKTecoEvent(data) {
        // ZKTeco envía eventos en formato: "PIN\tCardNo\tVerifyMode\tInOutState\tTime"
        return data.includes('\t') && data.split('\t').length >= 3;
    }

    /**
     * Parsear evento ZKTeco
     */
    parseZKTecoEvent(data) {
        try {
            const parts = data.split('\t');
            return {
                type: 'access_event',
                brand: 'zkteco',
                pin: parts[0],
                cardNo: parts[1],
                verifyMode: parts[2],
                inOutState: parts[3] || '0',
                time: parts[4] || new Date().toISOString(),
                code: parts[1] || parts[0] // Usar card number o PIN como código
            };
        } catch {
            return null;
        }
    }

    /**
     * Detener todos los listeners
     */
    stop() {
        for (const [port, server] of this.listeners) {
            server.close();
            console.log(`[TCPController] Listener TCP en puerto ${port} cerrado`);
        }
        this.listeners.clear();

        for (const [deviceId] of this.connections) {
            this.disconnect(deviceId);
        }
    }
}

module.exports = new TCPController();
