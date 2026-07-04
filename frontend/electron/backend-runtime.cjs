/**
 * ============================================
 * VELTRONIK - BACKEND RUNTIME (el cerebro embebido)
 * ============================================
 * Ladrillo 3 de la V3 (ADR-009): lanza el monolito Spring local (JRE jlink +
 * fat jar, empaquetados como extraResources) como PROCESO HIJO, le hace health
 * check por localhost y lo apaga PROLIJO al salir (POST /actuator/shutdown →
 * la JVM corre sus shutdown hooks → zonky detiene Postgres; un kill duro en
 * Windows saltea los hooks y deja postgres.exe huérfano bloqueando el pgdata).
 *
 * ESQUELETO CAMINANTE — feature oscura: solo se activa con la variable de
 * entorno VELTRONIK_LOCAL_BRAIN=1. Cero impacto para los clientes actuales.
 * El cableado real (activarse según el rol de enrolamiento y apuntar la UI al
 * backend local) llega con el sync engine (ladrillo 4).
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');

const API_PORT = 47810;
const BASE_URL = `http://127.0.0.1:${API_PORT}`;
const HEALTH_TIMEOUT_MS = 120000; // el primer arranque hace initdb: puede tardar
const MAX_RESTARTS = 3;

let child = null;
let restarts = 0;
let stopping = false;

function isEnabled() {
    return process.env.VELTRONIK_LOCAL_BRAIN === '1';
}

function isRunning() {
    return child !== null;
}

function runtimePaths() {
    const base = path.join(process.resourcesPath, 'backend');
    return {
        java: path.join(base, 'jre', 'bin', 'java.exe'),
        jar: path.join(base, 'veltronik-backend.jar'),
    };
}

function logsDir() {
    const base = process.env.LOCALAPPDATA || require('os').homedir();
    const dir = path.join(base, 'Veltronik', 'logs');
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}

/**
 * Persiste la identidad del sync (el cableado del bautizo): cuando el dueño enrola
 * ESTA máquina desde la app, la credencial aterriza acá y el cerebro local la lee
 * en su próximo tick (SyncIdentity del backend) — sin reinicios ni configuración.
 */
function saveSyncIdentity(identity) {
    const cloudUrl = String(identity?.cloudUrl || '').trim();
    const deviceId = String(identity?.deviceId || '').trim();
    const deviceKey = String(identity?.deviceKey || '').trim();
    if (!cloudUrl || !deviceId || !deviceKey) {
        throw new Error('Identidad de sync incompleta (cloudUrl/deviceId/deviceKey)');
    }
    const base = process.env.LOCALAPPDATA || require('os').homedir();
    const dir = path.join(base, 'Veltronik');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'sync-identity.json');
    const payload = {
        cloudUrl,
        deviceId,
        deviceKey,
        // La sucursal (tenant) enrolada: el login local por PIN la necesita (ladrillo 6).
        tenantId: String(identity?.tenantId || '').trim() || undefined,
        role: String(identity?.role || '').trim() || undefined,
        savedAt: new Date().toISOString(),
    };
    fs.writeFileSync(file, JSON.stringify(payload, null, 2), 'utf8');
    console.log(`[BackendRuntime] Identidad de sync guardada (${file})`);
    return { ok: true };
}

function httpGet(pathname, timeoutMs = 3000) {
    return new Promise((resolve, reject) => {
        const req = http.get({ host: '127.0.0.1', port: API_PORT, path: pathname, timeout: timeoutMs }, (res) => {
            let body = '';
            res.on('data', (c) => { body += c; });
            res.on('end', () => resolve({ status: res.statusCode, body }));
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(new Error('timeout')); });
    });
}

function httpPost(pathname, timeoutMs = 3000) {
    return new Promise((resolve, reject) => {
        const req = http.request(
            { host: '127.0.0.1', port: API_PORT, path: pathname, method: 'POST', timeout: timeoutMs },
            (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); }
        );
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(new Error('timeout')); });
        req.end();
    });
}

async function waitHealthy(timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (!child) throw new Error('el backend local murió durante el arranque (ver logs)');
        try {
            const res = await httpGet('/actuator/health');
            if (res.status === 200 && res.body.includes('"UP"')) return;
        } catch { /* aún no escucha */ }
        await new Promise((r) => setTimeout(r, 2000));
    }
    throw new Error(`el backend local no respondió health en ${timeoutMs / 1000}s`);
}

/**
 * Arranca el cerebro local (si la feature está activa y los artefactos existen).
 * @returns {Promise<string|null>} la URL base local, o null si no corre.
 */
async function start() {
    if (!isEnabled()) return null;

    const { java, jar } = runtimePaths();
    if (!fs.existsSync(java) || !fs.existsSync(jar)) {
        console.warn('[BackendRuntime] VELTRONIK_LOCAL_BRAIN=1 pero faltan los artefactos:', java);
        return null;
    }

    const logPath = path.join(logsDir(), 'backend-local.log');
    const out = fs.openSync(logPath, 'a');
    console.log(`[BackendRuntime] Lanzando el cerebro local (logs: ${logPath})`);

    child = spawn(java, [
        '-Xmx512m',                       // presupuesto de RAM del ADR-009 (PC de 4GB)
        '-jar', jar,
        '--spring.profiles.active=local',
        `--server.port=${API_PORT}`,
    ], { stdio: ['ignore', out, out], windowsHide: true });

    child.on('exit', (code) => {
        child = null;
        if (stopping) return;
        console.warn(`[BackendRuntime] El backend local terminó solo (exit ${code})`);
        // Reinicio con backoff: un crash puntual no deja al local sin cerebro.
        if (restarts < MAX_RESTARTS) {
            restarts += 1;
            const delay = 5000 * restarts;
            console.log(`[BackendRuntime] Reintento ${restarts}/${MAX_RESTARTS} en ${delay / 1000}s`);
            setTimeout(() => { start().catch((e) => console.error('[BackendRuntime]', e.message)); }, delay);
        } else {
            console.error('[BackendRuntime] Demasiados reinicios: el cerebro local queda apagado');
        }
    });

    await waitHealthy(HEALTH_TIMEOUT_MS);
    restarts = 0; // arrancó sano: resetear el contador
    console.log(`[BackendRuntime] Cerebro local UP en ${BASE_URL}`);
    return BASE_URL;
}

/** Apagado prolijo: actuator/shutdown → esperar salida → kill de último recurso. */
async function stop() {
    if (!child) return;
    stopping = true;
    const proc = child;

    const exited = new Promise((resolve) => proc.once('exit', resolve));
    try {
        await httpPost('/actuator/shutdown');
    } catch { /* no escuchaba: cae al kill */ }

    const result = await Promise.race([
        exited.then(() => 'graceful'),
        new Promise((r) => setTimeout(() => r('timeout'), 15000)),
    ]);
    if (result === 'timeout' && child) {
        console.warn('[BackendRuntime] Shutdown prolijo agotado: kill de último recurso');
        proc.kill();
        await Promise.race([exited, new Promise((r) => setTimeout(r, 5000))]);
    }
    child = null;
    console.log(`[BackendRuntime] Cerebro local detenido (${result})`);
}

module.exports = { start, stop, isRunning, isEnabled, saveSyncIdentity, BASE_URL };
