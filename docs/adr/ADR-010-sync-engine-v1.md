# ADR-010: Sync engine v1 — triggers de captura, protocolo genérico a nivel fila, credencial de equipo

- **Estado:** ✅ Aceptada
- **Fecha:** 2026-07-02

## Contexto

El ladrillo 4 (docs/FASE1-PLAN.md) construye el corazón de la V3: los eventos del local
viajan a la nube con idempotencia (ADR-003). Tres bifurcaciones definían el motor, las
tres confirmadas por el fundador.

## Decisión

**1. Captura por TRIGGERS de Postgres (no listeners de JPA).** Las tablas del registro
llevan un trigger `AFTER INSERT` que anota en `sync_outbox` la fila exacta
(`to_jsonb(NEW)`). La base anota TODO lo que se escribe — cualquier camino de código,
presente o futuro — y el payload es la fila física, replicable tal cual porque ambos
lados corren el mismo motor y esquema (el dividendo del ADR-009). Los triggers se crean
SOLO en modo local (callback `afterMigrate` de Flyway, perfil `local`); la tabla outbox
viaja en la cadena única de migraciones (V34) y en la nube queda vacía.

**2. Protocolo GENÉRICO a nivel fila + registro de tablas.** Un solo endpoint
(`POST /api/sync/push`) recibe `{tabla, op, rowId, fila_json}`. El `SyncTableRegistry`
(DATA-CLASSIFICATION.md codificada) es la única fuente de verdad de qué tablas viajan,
en qué orden se aplican (padres antes que hijos, por FKs) y con qué regla:
- **EVENTO** (v1): `INSERT … SELECT jsonb_populate_record(...) ON CONFLICT (id) DO NOTHING`
  — la idempotencia nace del UUID pre-asignado de Fase 0.
- **Guardias:** el nombre de tabla sale SIEMPRE del registro (whitelist = anti SQL
  injection) y el `tenant_id` de cada fila se PISA con el del equipo autenticado
  (`jsonb_set`) — el payload jamás decide a qué tenant escribe.
- Agregar una tabla al sync = una línea en el registro.

**3. Credencial de equipo, emitida en el bautizo.** El sync corre headless (sin humanos
logueados), así que `/api/sync/**` no usa JWT: el enroll genera un secreto de alta
entropía (`vk_` + 256 bits) que viaja EN CLARO una única vez y se guarda hasheado
(SHA-256) en `device_registry.credential_hash`. `DeviceCredentialFilter` (fail-closed,
comparación en tiempo constante) autentica `X-Device-Id` + `X-Device-Key` y deja
tenant + DNI en los ThreadLocals. Re-enrolar rota la credencial; revocar la mata.

**El drenador (`SyncPushJob`, perfil local):** cada 30s intenta empujar un lote (≤200)
y borra del outbox SOLO tras el 2xx (entrega at-least-once + idempotencia del receptor
= exactamente-una-vez efectivo). Offline = silencio y reintento: sincronización
oportunista por definición (ADR-001).

## Alternativas descartadas

- **Listeners de JPA:** portables, pero un camino de código nuevo puede olvidarse de
  anotar, y serializar entidades (lazy, @JsonIgnore) es frágil.
- **Endpoints/DTOs por entidad:** N tablas = N endpoints + N tests; cada tabla nueva un
  PR entero. El protocolo genérico lo hace una línea.
- **JWT del dueño para el sync:** rompe el requisito headless; se rehacía en semanas.

## Consecuencias

- `SyncEngineIntegrationTest` prueba el ciclo completo contra Postgres real: trigger →
  outbox → apply → idempotencia → guardia de tenant → whitelist.
- v1 cubre la familia de la venta (`kiosk_cash_session`, `kiosk_sale`, `kiosk_sale_item`,
  `kiosk_sale_payment`) — sincronizable sin catálogo porque `product_id` es nullable y
  viaja el snapshot. **Próximas tajadas:** upsert de MAESTROS LOCALES (productos,
  clientes — van ANTES de los eventos que los referencian), config ↓ (pull), cableado
  automático de la credencial al cerebro local, y manejo de lotes venenosos (hoy un lote
  con error se reintenta entero; aceptable con lotes chicos, endurecer en Fase 4).
- ArchUnit vigila los límites nuevos: `sync` no conoce verticales; los verticales no
  saben que el sync existe.

## Cuándo reconsiderar

Si el volumen de eventos exigiera streaming (no lotes), el protocolo cambia — no antes
de tener flota real midiendo. El registro y la idempotencia por UUID sobreviven a
cualquier transporte.
