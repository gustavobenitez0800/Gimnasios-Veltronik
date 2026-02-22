/**
 * ============================================
 * VELTRONIK - SERVIDOR WEBHOOK LOCAL
 * ============================================
 * 
 * Servidor HTTP local que recibe eventos de
 * controladoras externas y dispositivos API.
 * 
 * Endpoints:
 * POST /api/access/event       - Evento de acceso genérico
 * POST /api/access/webhook/:id - Evento para un dispositivo específico
 * POST /api/access/heartbeat   - Heartbeat de dispositivos
 * GET  /api/access/status      - Estado del sistema
 */

const http = require('http');
const url = require('url');

class WebhookServer {
    constructor() {
        this.deviceManager = null;
        this.server = null;
        this.port = 8089; // Puerto por defecto
        this.isRunning = false;
    }

    async init(deviceManager, port) {
        this.deviceManager = deviceManager;
        this.port = port || 8089;

        await this.start();
    }

    async start() {
        if (this.isRunning) return;

        return new Promise((resolve, reject) => {
            this.server = http.createServer((req, res) => {
                this.handleRequest(req, res);
            });

            this.server.listen(this.port, '0.0.0.0', () => {
                this.isRunning = true;
                console.log(`[WebhookServer] Servidor webhook escuchando en puerto ${this.port}`);
                console.log(`[WebhookServer] Endpoints disponibles:`);
                console.log(`  POST http://localhost:${this.port}/api/access/event`);
                console.log(`  POST http://localhost:${this.port}/api/access/webhook/:deviceId`);
                console.log(`  POST http://localhost:${this.port}/api/access/heartbeat`);
                console.log(`  GET  http://localhost:${this.port}/api/access/status`);
                resolve();
            });

            this.server.on('error', (err) => {
                if (err.code === 'EADDRINUSE') {
                    console.log(`[WebhookServer] Puerto ${this.port} ocupado, probando ${this.port + 1}`);
                    this.port++;
                    this.server.listen(this.port, '0.0.0.0');
                } else {
                    console.error('[WebhookServer] Error:', err);
                    reject(err);
                }
            });
        });
    }

    stop() {
        if (this.server) {
            this.server.close();
            this.isRunning = false;
            console.log('[WebhookServer] Servidor detenido');
        }
    }

    /**
     * Router de peticiones
     */
    handleRequest(req, res) {
        // CORS
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Device-Id');

        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }

        const parsedUrl = url.parse(req.url, true);
        const pathname = parsedUrl.pathname;

        // Rutas
        if (req.method === 'POST' && pathname === '/api/access/event') {
            this.handleAccessEvent(req, res);
        } else if (req.method === 'POST' && pathname.startsWith('/api/access/webhook/')) {
            const deviceId = pathname.split('/').pop();
            this.handleDeviceWebhook(req, res, deviceId);
        } else if (req.method === 'POST' && pathname === '/api/access/heartbeat') {
            this.handleHeartbeat(req, res);
        } else if (req.method === 'GET' && pathname === '/api/access/status') {
            this.handleStatus(req, res);
        } else {
            this.sendJSON(res, 404, { error: 'Endpoint no encontrado' });
        }
    }

    /**
     * POST /api/access/event
     * Recibe evento de acceso genérico
     * 
     * Body: {
     *   device_id: "abc123",
     *   event_type: "card_read" | "fingerprint" | "face" | "qr",
     *   credential: "CARD_CODE_HERE",
     *   timestamp: "2024-01-01T00:00:00Z"
     * }
     */
    async handleAccessEvent(req, res) {
        try {
            const body = await this.readBody(req);
            const data = JSON.parse(body);

            if (!data.credential && !data.code && !data.card_code) {
                this.sendJSON(res, 400, { error: 'Se requiere credential, code o card_code' });
                return;
            }

            const deviceId = data.device_id || req.headers['x-device-id'] || 'webhook_generic';

            // Notificar al device manager
            if (this.deviceManager) {
                this.deviceManager.handleWebhookEvent(deviceId, {
                    event_type: data.event_type || 'card_read',
                    credential: data.credential || data.code || data.card_code,
                    credential_type: data.credential_type || this.inferCredentialType(data.event_type),
                    timestamp: data.timestamp || new Date().toISOString(),
                    raw: data
                });
            }

            this.sendJSON(res, 200, {
                success: true,
                message: 'Evento recibido',
                device_id: deviceId
            });

        } catch (error) {
            console.error('[WebhookServer] Error procesando evento:', error);
            this.sendJSON(res, 500, { error: error.message });
        }
    }

    /**
     * POST /api/access/webhook/:deviceId
     * Webhook específico para un dispositivo
     */
    async handleDeviceWebhook(req, res, deviceId) {
        try {
            const body = await this.readBody(req);
            const data = JSON.parse(body);

            if (this.deviceManager) {
                this.deviceManager.handleWebhookEvent(deviceId, {
                    event_type: data.event_type || 'access',
                    credential: data.credential || data.code || data.card_code || data.user_id,
                    credential_type: data.credential_type || 'rfid',
                    member_name: data.member_name || data.user_name,
                    timestamp: data.timestamp || new Date().toISOString(),
                    raw: data
                });
            }

            this.sendJSON(res, 200, {
                success: true,
                message: `Evento recibido para dispositivo ${deviceId}`
            });

        } catch (error) {
            console.error('[WebhookServer] Error webhook:', error);
            this.sendJSON(res, 500, { error: error.message });
        }
    }

    /**
     * POST /api/access/heartbeat
     * Heartbeat de dispositivos
     */
    async handleHeartbeat(req, res) {
        try {
            const body = await this.readBody(req);
            const data = JSON.parse(body);

            const deviceId = data.device_id || req.headers['x-device-id'];

            if (deviceId && this.deviceManager) {
                const config = this.deviceManager.configs.get(deviceId);
                if (config) {
                    config.lastHeartbeat = new Date().toISOString();
                    config.status = 'connected';
                }
            }

            this.sendJSON(res, 200, {
                success: true,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            this.sendJSON(res, 500, { error: error.message });
        }
    }

    /**
     * GET /api/access/status
     * Estado del sistema
     */
    handleStatus(req, res) {
        const devices = this.deviceManager ? this.deviceManager.getAllDeviceStatus() : [];

        this.sendJSON(res, 200, {
            status: 'running',
            version: '1.0.0',
            server_port: this.port,
            devices_count: devices.length,
            devices: devices.map(d => ({
                id: d.id,
                name: d.name,
                type: d.type,
                status: d.status,
                isConnected: d.isConnected
            })),
            timestamp: new Date().toISOString()
        });
    }

    // ============================================
    // UTILIDADES
    // ============================================

    inferCredentialType(eventType) {
        const map = {
            'card_read': 'rfid',
            'fingerprint': 'fingerprint',
            'face': 'facial',
            'facial': 'facial',
            'qr': 'qr',
            'qr_scan': 'qr',
            'pin': 'pin',
            'nfc': 'nfc'
        };
        return map[eventType] || 'rfid';
    }

    readBody(req) {
        return new Promise((resolve, reject) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => resolve(body));
            req.on('error', reject);
        });
    }

    sendJSON(res, statusCode, data) {
        res.writeHead(statusCode, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
    }
}

module.exports = new WebhookServer();
