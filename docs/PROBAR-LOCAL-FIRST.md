# Probar el circuito local-first en tu máquina (runbook)

> El objetivo: teclear un PIN en una "caja local", vender **sin internet** contra el cerebro
> embebido, y ver esa venta subir a la nube. Es la prueba de fuego de toda la V3.
>
> No hace falta empaquetar el instalable: corremos el cerebro a mano y el frontend en modo
> Electron-dev. Todo en Windows / PowerShell.

## Lo que vas a tener corriendo al final

| Terminal | Qué corre | Para qué |
|---|---|---|
| 1 | `npm run dev` (Vite, :5173) | el frontend |
| 2 | el cerebro local (`java -jar`, :47810) | el backend embebido |
| 3 | `npm run electron:dev` | la app de escritorio que se conecta al cerebro |

---

## Paso 0 — Preparar datos en la nube (una sola vez)

1. Abrí la web (`https://veltronik-v2.vercel.app`) y logueate como **dueño de un negocio KIOSCO**.
   (Si no tenés uno, creá un negocio tipo Kiosco.)
2. **Ajustes → Cajeros → Agregar cajero**: poné un nombre y un **PIN** (ej: `4321`). Anotá el PIN.
3. **Ajustes → Equipos → Enrolar esta computadora** (rol *Caja*). Confirmá.
4. Abrí la **consola del navegador** (F12 → Console) y copiá estos tres valores:
   ```js
   localStorage.getItem('current_org_id')       // el tenant (sucursal)
   localStorage.getItem('veltronik_device_id')  // el DNI del equipo
   localStorage.getItem('veltronik_device_key')  // la credencial (empieza con vk_)
   ```
   Guardalos: los necesitás en el Paso 2.

## Paso 1 — Construir el cerebro local (una sola vez; la primera descarga ~180MB)

```powershell
cd "C:\Users\gusta\OneDrive\Desktop\Veltronik V2\frontend"
powershell -ExecutionPolicy Bypass -File build-tools\build-backend.ps1
```
Al terminar tenés `frontend\resources\backend\jre\` (la **JRE firmada de Microsoft**,
ADR-011 — Smart App Control la acepta) y `frontend\resources\backend\veltronik-backend.jar`
(el monolito). El zip del JDK queda cacheado: las próximas corridas no re-descargan.

## Paso 2 — Arrancar el cerebro local (Terminal 2)

Reemplazá los tres valores con los que copiaste en el Paso 0:

```powershell
cd "C:\Users\gusta\OneDrive\Desktop\Veltronik V2\frontend\resources\backend"
$env:VELTRONIK_SYNC_CLOUD_URL = "https://gimnasios-veltronik-production.up.railway.app"
$env:VELTRONIK_SYNC_TENANT_ID = "<current_org_id>"
$env:VELTRONIK_SYNC_DEVICE_ID = "<veltronik_device_id>"
$env:VELTRONIK_SYNC_DEVICE_KEY = "<veltronik_device_key>"
.\jre\bin\java.exe -jar veltronik-backend.jar --spring.profiles.active=local
```

Vas a ver el arranque: Postgres embebido → migraciones V1→Vn → `Started VeltronikApplication`.
La primera vez la base local está vacía; el **job de pull** (a los ~60s) baja tu negocio y tu
cajero desde la nube. Esperá ese minuto.

**Verificá que bajó el cajero** (en otra terminal):
```powershell
Invoke-RestMethod http://127.0.0.1:47810/api/local/status   # ready debe ser True
```

> ¿Data dir? El cerebro guarda su base en `%LOCALAPPDATA%\Veltronik\pgdata` y sobrevive
> reinicios. Para empezar de cero, cerrá el cerebro y borrá esa carpeta.

## Paso 3 — Arrancar el frontend (Terminal 1)

```powershell
cd "C:\Users\gusta\OneDrive\Desktop\Veltronik V2\frontend"
npm run dev
```

## Paso 4 — Abrir la caja (Terminal 3)

```powershell
cd "C:\Users\gusta\OneDrive\Desktop\Veltronik V2\frontend"
npm run electron:dev
```

La app detecta el cerebro local (probe a `127.0.0.1:47810`) y arranca en **modo caja**:
la **pantalla de PIN**. Tecleá el PIN del cajero → entrás al **POS**.

## Paso 5 — La prueba de fuego

1. Si te pide abrir caja, abrí un turno (botón que lleva a la caja).
2. **Cortá el WiFi de la máquina.** (El corazón del asunto: sin internet.)
3. Cargá productos al carrito y **cobrá una venta en efectivo**. Debe funcionar igual.
4. **Volvé a prender el WiFi.** Esperá ~30-60s (el job de push oportunista).
5. Abrí la web como dueño → los reportes/ventas del kiosco → **la venta que hiciste offline
   ahora aparece en la nube.** 🎉

Si viste ese último paso, la V3 local-first funciona de punta a punta.

---

## Si algo no anda

- **La app arranca en modo nube (login normal, no PIN):** el cerebro no está respondiendo en
  `127.0.0.1:47810`. Revisá la Terminal 2 (¿arrancó? ¿`status` da ready?).
- **PIN incorrecto siempre:** el cajero todavía no bajó por sync. Esperá el minuto del pull, o
  revisá que los tres valores de env estén bien (sobre todo `VELTRONIK_SYNC_DEVICE_KEY`).
- **La venta no sube:** revisá los logs del cerebro (Terminal 2) buscando `Sync:`; y que el
  WiFi haya vuelto. El push reintenta solo cada 30s.
- **Java no arranca:** usá la JRE del build (`.\jre\bin\java.exe`), no el Java del sistema.
- **"Una directiva de Control de aplicaciones bloqueó este archivo":** tu build es viejo
  (JRE de jlink, sin firma). Re-corré el Paso 1 — desde el ADR-011 la JRE que viaja es la
  firmada de Microsoft y Smart App Control la acepta.

> Nota: esto simula lo que en producción hará Electron solo (spawnea el cerebro con
> `VELTRONIK_LOCAL_BRAIN=1` y le pasa la identidad tras el enrolamiento). Acá lo hacemos a
> mano para probar sin empaquetar el instalable.
