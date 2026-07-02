# Fase 1 — Local-first de una caja: plan por ladrillos

> **Qué es la Fase 1** (ver [ARCHITECTURE.md](ARCHITECTURE.md), Parte 4): el MVP local-first.
> Un kiosco de una caja vende aunque se caiga internet, y el dueño lo ve por web.
> Incluye el pipeline de updates por anillos y un Mission Control mínimo **antes** de migrar
> al primer cliente.
>
> **Cómo se construye:** en ladrillos chicos, cada uno aditivo, shippeable y verificado en
> producción — igual que la Fase 0. Nunca un big-bang.

## Los ladrillos, en orden

| # | Ladrillo | Qué entrega | Estado |
|---|---|---|---|
| 1 | **Registro de equipos + señal de vida** | La nube conoce cada equipo (DNI), cuándo se lo vio por última vez y qué versión corre. Endpoint para listarlos. Semilla de Mission Control y prerequisito del enrolamiento | ✅ En producción (2026-07-02) |
| 2 | **Enrolamiento v1 (el bautizo)** | El equipo deja de ser anónimo: el dueño lo ata a una sucursal con nombre y rol. Sección Equipos en Ajustes + integridad (un encargado activo por sucursal) | ✅ En producción (2026-07-02) |
| 3 | **Runtime local (el cerebro embebido)** | El instalable corre el monolito Spring + Postgres embebido, lanzados por Electron. Diseño decidido en [ADR-009](adr/ADR-009-runtime-local-embebido.md): PG embebido + JRE jlink + proceso hijo | 🟡 Diseño ✅ — implementación pendiente |
| 4 | **Sync engine v1** | Outbox local → nube (eventos, idempotencia por UUID), config nube → local, watermarks, oportunista. Diseño en [ADR-010](adr/ADR-010-sync-engine-v1.md) | 🟡 Primera tajada ✅ (captura por triggers + push idempotente + credencial de equipo, familia de la venta). Faltan: maestros ↑, config ↓, cableado de credencial al cerebro |
| 5 | **PIN local de cajeros** | El login diario deja de necesitar internet | ⚪ |
| 6 | **La web lee el espejo** | Dashboard del dueño sobre datos sincronizados + "última sync hace X" | ⚪ |
| 7 | **Anillos de update + Mission Control mínimo** | Staged rollout de electron-updater + tablero de flota (versión/last-seen/salud de sync) | ⚪ |

**Regla de cierre:** ningún cliente real migra a local-first hasta que el ladrillo 7 esté en
producción (ADR-007: no se despliega un cerebro local que no se pueda actualizar y ver remoto).

**Por qué este orden:** 1 y 2 son pura nube (riesgo bajo, valor inmediato: visibilidad de la
flota actual). 3 es el salto técnico grande y conviene encararlo con 1-2 ya dando telemetría.
4-6 construyen sobre 3. 7 es la condición de salida.

---

## Diseño del enrolamiento (el "bautizo") — para el ladrillo 2

El paso a paso, decidido en la sesión de arquitectura y aterrizado al modelo real (ADR-008:
sucursal = `Tenant`):

1. **El equipo ya existe antes de enrolarse.** Desde la Fase 0, cada instalación genera su
   DNI (`X-Device-Id`) y el ladrillo 1 lo registra en la nube con su señal de vida. Enrolar
   no crea el equipo: lo **reclama**.
2. **El dueño abre el instalable por primera vez** → la app detecta que el equipo no está
   enrolado → pantalla de bautizo: login del dueño (Google, único paso online obligatorio).
3. **El dueño elige de su lista real** (sus tenants activos, vía memberships): *"esta
   instalación es para → Sucursal Centro"*. Nunca tipea identificadores. Elige también el
   **rol** (Caja / Encargado — en Fase 1 de una caja, la caja ES su encargado) y un **nombre
   visible** ("Caja mostrador").
4. **Confirmación explícita y gritona:** *"Vas a configurar esta computadora como CAJA de
   Sucursal Centro — Av. Mitre 123. ¿Correcto?"* — con la dirección, para que el humano note
   el error antes de cometerlo.
5. **La nube valida integridad:** si la sucursal ya tiene un encargado ACTIVO (señal de vida
   reciente, dato del ladrillo 1), frena y pregunta: ¿reemplazo o error?
6. **La nube marca el equipo como enrolado** (tenant, rol, nombre, quién lo enroló, cuándo)
   y **emite la credencial de equipo** (larga vida, renovación silenciosa) — en el ladrillo 2
   la credencial puede ser mínima; su uso pleno llega con el sync (ladrillo 4).
7. **Baja la config inicial** (catálogo, usuarios, PINs cuando existan) y queda cacheada.
8. **Errores siempre reparables:** si se enroló a la sucursal equivocada, se re-etiqueta
   desde la web (la data histórica se corrige por DNI — ADR-002). Desenrolar = revocar
   credencial; el DNI y su historial nunca se borran.

## Decisiones del ladrillo 1 (lo que se construye hoy)

- **`device_registry` es global, no tenant-aware.** Un mismo equipo físico puede tocar varios
  tenants (la notebook del dueño con el Lobby cambia de org). El registro guarda la *última*
  sucursal vista (`last_tenant_id`, telemetría) — la pertenencia fuerte llega con el
  enrolamiento (ladrillo 2, columnas nuevas, aditivas).
- **El id de la fila ES el DNI del equipo** — primer uso real del generador pre-asignable de
  la Fase 0 (`AssignableUuidGenerator`).
- **Señal de vida throttleada:** se persiste como mucho una vez cada 5 minutos por equipo
  (cache en memoria); jamás una escritura por request.
- **Heartbeat en un `HandlerInterceptor` de MVC, no en un filtro:** corre después de toda la
  cadena de filtros (JWT validado, tenant validado, DNI en el ThreadLocal) → sin ruleta de
  orden de filtros y sin escribir tenants no verificados.
- **`X-App-Version` (nuevo header):** el frontend manda su `__APP_VERSION__`; la nube sabe qué
  versión corre cada equipo — la columna vertebral del rollout por anillos (ladrillo 7).
  Mismo protocolo de deploy que el DNI: CORS del backend primero, frontend después.
- **La telemetría nunca rompe una operación:** el heartbeat entero va en try/catch con log;
  un fallo del registro no puede afectar una venta.
