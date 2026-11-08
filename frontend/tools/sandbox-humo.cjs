/**
 * ¿La ventana del mostrador arranca bien con el sandbox prendido? (08/11/2026)
 *
 *   pnpm run humo:sandbox
 *
 * Abre una ventana invisible con las MISMAS preferencias del programa (ventana.cjs), le carga
 * una página vacía y mira cinco cosas:
 *   1. el preload no tiró error (con el sandbox, un `require` de algo que no sea 'electron'
 *      revienta acá y la app quedaría sin puente: sin cola, sin molinete, sin bóveda);
 *   2. el puente `window.electronAPI` llegó entero a la página;
 *   3. la página NO ve Node (`require` y `process` tienen que ser undefined);
 *   4. el proceso de la página corre de verdad dentro del sandbox (lo dice Electron);
 *   5. sin consola (como en el programa instalado), la consola no se abre ni pidiéndola.
 *
 * No toca nada de la PC: no abre la base local ni la bóveda, no habla con el servidor.
 */
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { preferenciasDeLaVentana } = require('../electron/ventana.cjs');

const TOPE_MS = 30_000;
const erroresDelPreload = [];

function terminar(ok, detalle) {
    console.log(`${ok ? 'OK' : 'FALLÓ'} sandbox: ${JSON.stringify(detalle)}`);
    app.exit(ok ? 0 : 1);
}

setTimeout(() => terminar(false, { motivo: `no terminó en ${TOPE_MS / 1000} s` }), TOPE_MS).unref();

app.whenReady().then(async () => {
    const pagina = path.join(os.tmpdir(), `veltronik-sandbox-${process.pid}.html`);
    fs.writeFileSync(pagina, '<!doctype html><meta charset="utf-8"><title>sandbox</title>');

    const ventana = new BrowserWindow({ show: false, webPreferences: preferenciasDeLaVentana() });
    ventana.webContents.on('preload-error', (_e, archivo, error) => {
        erroresDelPreload.push(`${path.basename(archivo)}: ${error?.message || error}`);
    });

    try {
        await ventana.loadFile(pagina);
        const pagina_ve = await ventana.webContents.executeJavaScript(`({
            puente: typeof window.electronAPI,
            funciones: window.electronAPI ? Object.keys(window.electronAPI).length : 0,
            require: typeof window.require,
            process: typeof window.process,
        })`);

        const pid = ventana.webContents.getOSProcessId();
        const metrica = app.getAppMetrics().find((m) => m.pid === pid);
        // `sandboxed` lo informa Electron en Windows y macOS; en Linux no existe y no se exige.
        const enSandbox = metrica?.sandboxed ?? (process.platform === 'linux' ? true : undefined);

        // 5. Como en el programa instalado (sin consola): ni pidiéndola se abre.
        const cerrada = new BrowserWindow({ show: false, webPreferences: preferenciasDeLaVentana({ consola: false }) });
        await cerrada.loadFile(pagina);
        cerrada.webContents.openDevTools({ mode: 'detach' });
        await new Promise((r) => setTimeout(r, 800));
        const consolaSeAbrio = cerrada.webContents.isDevToolsOpened();

        const detalle = { ...pagina_ve, enSandbox, consolaSeAbrio, erroresDelPreload };
        const ok = erroresDelPreload.length === 0
            && pagina_ve.puente === 'object'
            && pagina_ve.funciones >= 10
            && pagina_ve.require === 'undefined'
            && pagina_ve.process === 'undefined'
            && enSandbox === true
            && consolaSeAbrio === false;
        terminar(ok, detalle);
    } catch (e) {
        terminar(false, { motivo: e.message, erroresDelPreload });
    } finally {
        fs.rm(pagina, { force: true }, () => {});
    }
});
