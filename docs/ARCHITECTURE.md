# Arquitectura de Veltronik

> **Para quién es este documento:** cualquier persona (o IA) que entre al proyecto y necesite entender cómo funciona Veltronik y hacia dónde va, sin leer el código entero.
>
> **Tiempo de lectura:** ~20 minutos.
>
> **Cómo se relaciona con los otros documentos:**
> - [`VELTRONIK_CODEX.md`](../VELTRONIK_CODEX.md) → la **visión de negocio** (qué vendemos, a quién, a cuánto).
> - Este documento → la **arquitectura técnica**: cómo está construido hoy y cómo va a estar construido mañana.
> - [`docs/adr/`](adr/) → el **porqué** de cada decisión importante, una página por decisión.

---

## Veltronik en una frase

SaaS B2B **multi-tenant** para PyMEs de LATAM (gimnasios, kioscos, canchas), con **verticales activables** sobre un producto único y tarifa plana por sucursal.

## Cómo leer este documento

| Parte | Qué cuenta |
|---|---|
| [Parte 1](#parte-1--la-arquitectura-hoy-v2) | Cómo funciona **HOY** (V2, en producción con clientes vivos) |
| [Parte 2](#parte-2--hacia-dónde-vamos-v3-local-first) | Hacia dónde va (**V3 local-first**, diseño aprobado 2026-07-01, no implementado aún) |
| [Parte 3](#parte-3--reglas-innegociables) | Las reglas que no se negocian |
| [Parte 4](#parte-4--plan-de-fases) | El plan de fases para llegar de V2 a V3 |
| [Glosario](#glosario) | Los términos propios del proyecto |

---

# Parte 1 — La arquitectura HOY (V2)

## El modelo: la nube es el cerebro

Hoy Veltronik es una aplicación **cloud-céntrica**. El dispositivo del cliente es una pantalla; toda la lógica y los datos viven en la nube:

```
  Electron (desktop)  ──┐
                        ├──►  API (Spring Boot en Railway)  ──►  PostgreSQL (Supabase)
  Web (navegador)    ──┘                                          + Supabase Auth (Google)
```

**Consecuencia directa:** sin internet, el local no opera. Esa es la limitación central que motiva la V3.

## Backend: monolito modular (Java 17 + Spring Boot 3)

El código se organiza por **módulos de negocio** (corte vertical), no por capas técnicas:

```
com.veltronik.v2
├── core/      ← lo compartido: auth, tenants, billing (Mercado Pago + kill switch), usuarios
├── gym/       ← vertical gimnasios: socios, asistencias, pagos de cuota
├── kiosk/     ← vertical kioscos: POS, stock, caja, fiado, proveedores, analítica
├── fiscal/    ← facturación ARCA (WSAA + WSFEv1, emisión de CAE)
└── courts/    ← vertical canchas/reservas — ⚠️ MARCADO PARA ELIMINACIÓN (ver Fase 4)
```

Dentro de cada módulo se respetan las capas clásicas: `entities → repositories → services → controllers`.

**Reglas de módulos (hoy por convención, en V3 por build):**
- Un vertical **nunca** importa de otro vertical.
- `core` **nunca** depende de un vertical.
- Los verticales solo dependen de `core`.

**Datos y esquema:**
- PostgreSQL en Supabase, multi-tenant por `tenant_id` en cada tabla de negocio.
- Esquema gobernado 100% por **migraciones Flyway** (`backend/src/main/resources/db/migration`). Ver la regla innegociable sobre migraciones en la Parte 3.
- `ApplicationBootTest` arranca la aplicación real contra un Postgres embebido y corre todas las migraciones + validate. Es la prueba de que el backend **ya sabe correr sin la nube** — la semilla técnica de la V3.

**Identidad y acceso:**
- Login del dueño con Google vía **Supabase Auth**; el backend valida JWT.
- Suscripción por Mercado Pago con **kill switch** (`SubscriptionAccessPolicy` como fuente única): si el tenant no paga, el sistema se bloquea; el webhook de MP lo rehabilita al cobrar.

## Frontend: una SPA, dos envases

React 19 + Vite. La **misma** aplicación se publica de dos formas:
- **Electron** (desktop del local): releases por tag vía GitHub Actions (`release.yml`), con auto-update por `electron-updater`.
- **Web** (navegador, Vercel): para que el dueño administre desde cualquier dispositivo.

Qué vertical ve cada tenant lo decide el **registry de verticales** (`frontend/src/lib/verticals.js`) alimentado por el endpoint `/workspace` del backend.

## Infra y deploy hoy

| Pieza | Dónde | Cómo deploya |
|---|---|---|
| Backend | Railway | Integración GitHub (push a `main`) |
| Base de datos + Auth | Supabase | Migraciones Flyway al arrancar el backend |
| Web | Vercel | Push a `main` |
| Desktop | GitHub Releases | Tag `vX.Y.Z` → `release.yml` → electron-updater |

---

# Parte 2 — Hacia dónde vamos: V3 local-first

> Diseño aprobado el 2026-07-01. Decisiones registradas en [ADR-001](adr/ADR-001-local-first-tres-capas.md) a [ADR-007](adr/ADR-007-updates-por-anillos.md). **Nada de esto está implementado todavía.**

## La idea en una frase

**Invertimos el modelo: el dispositivo es el cerebro, la nube es el punto de encuentro.** Cada local opera 100% solo (incluso sin internet) y sincroniza con la nube cuando puede; la nube agrega todo para que el dueño lo vea por web desde cualquier lado.

## Las tres capas

```
                 NUBE  (oficina central, multi-tenant)
                  ▲   dashboard del dueño · agregador de lectura
                  │   fuente de verdad de config (catálogo, precios, usuarios)
                  │
                  │  internet — intermitente, sincronización OPORTUNISTA
                  │
             ENCARGADO / "Caja Madre"  (uno por sucursal)
              ▲   ▲   el monolito corriendo en modo local, con DB local
              │   │   cerebro del local · árbitro de stock · único que habla con la nube
              │   │
              │   │  LAN del local (WiFi sirve) — casi siempre viva
              │   │
           Caja 1   Caja 2 ...  (el frontend de siempre, apuntando al encargado)
```

Puntos clave:
- Las cajas **nunca** hablan con la nube: hablan con su encargado. La nube habla con N encargados, no con N×cajas — agregar cajas no suma carga a la nube.
- Hay **dos redes distintas** que fallan por separado: la LAN del local (confiable) y el uplink a internet (intermitente). Separarlas es lo que permite locales con internet malo o directamente sin internet.
- El encargado se anuncia en la LAN con un **nombre estable**; las cajas lo descubren solas y se reconectan solas. La LAN va **cifrada y autenticada** aunque sea "interna".

## Los dos ríos de datos + el árbitro

El secreto para que la sincronización no sea un infierno es que **no todos los datos son iguales**:

| Río | Qué lleva | Dirección | Conflictos |
|---|---|---|---|
| **Eventos** | ventas, cobros, asistencias, movimientos de caja | local → nube | Ninguno: son *append-only*, nadie edita una venta vieja, solo se agregan nuevas |
| **Config** | catálogo, precios, usuarios, configuración | nube → local | Ninguno: la nube es la única fuente de verdad y baja hacia los locales |

El único dato **compartido y mutable** es el **stock**. Lo resuelve el encargado actuando de **árbitro**: todas las cajas le mandan sus operaciones y él las procesa en orden (vuelve a existir "un solo escritor por local"). Ver [ADR-003](adr/ADR-003-dos-rios-y-arbitro-de-stock.md).

**Modo degradado** (caja que pierde al encargado por un rato): la caja cobra igual en modo optimista, encola, y reconcilia cuando vuelve la LAN. Regla de negocio: **nunca perder una venta vale más que nunca vender de más** — el stock negativo se marca en rojo, no bloquea el cobro.

## Las tres identidades

| Quién | Cómo entra | Cuándo necesita internet |
|---|---|---|
| **Dueño** | Google (Supabase Auth), en la web | Sí — pero solo configura y supervisa, no opera |
| **Cajero** | PIN local, en la caja | Nunca — vive en la DB local |
| **Equipo** (la máquina) | Credencial emitida al enrolar + **DNI físico inmutable** | Solo al enrolar y al sincronizar |

El **DNI de equipo** se estampa en cada registro operativo. La sucursal asignada es una *etiqueta reasignable*; el DNI *nunca miente*. Por eso cualquier error de enrolamiento (ej.: instalaron "Sucursal 1" en la sucursal 2) se repara re-etiquetando datos, **sin perder nada**. Ver [ADR-002](adr/ADR-002-un-instalable-identidad-runtime.md).

## El motor de sincronización

La única pieza genuinamente nueva de la V3:

- **Outbox local:** cada cambio se escribe en la DB local **y** en una bandeja de salida; cuando hay internet, la bandeja se vacía hacia la nube.
- **UUIDs generados en el dispositivo:** cada evento nace con su ID propio → un reintento jamás duplica una venta (idempotencia).
- **Watermarks:** cada lado recuerda hasta dónde sincronizó; se reanuda desde ahí, nunca se reenvía todo.
- **Oportunista:** no requiere internet constante, requiere internet *cada tanto*. Un local puede estar días offline y no pasa nada.
- **Credencial de equipo de larga vida** con renovación silenciosa: estar semanas offline nunca deja a nadie afuera.

Lo inherentemente online (CAE de ARCA, pagos con tarjeta/QR de MP) se maneja con **colas de contingencia**: la operación queda pendiente y se completa al volver la conexión. La venta en efectivo es 100% offline.

## Un solo instalable

- **Un único .exe universal.** La identidad (rol caja/encargado, vertical, sucursal) se asigna **al enrolar, nunca al compilar**. Sucursal nueva, dueño nuevo o vertical nueva jamás justifican un build nuevo. Ver [ADR-002](adr/ADR-002-un-instalable-identidad-runtime.md).
- **"Todos traen todo" (binario gordo):** cada instalación incluye el backend completo; en las cajas está dormido (ocupa disco, no RAM/CPU). Si el encargado muere, cualquier caja se **promueve a encargado con un clic** — sin descargar nada, que es crítico porque ese momento puede ser justo cuando no hay internet. Ver [ADR-005](adr/ADR-005-binario-gordo-unico.md).
- El encargado corre **en una de las cajas** al lanzar; un mini-PC dedicado ("Caja Madre Veltronik") queda como upsell futuro. El software **nunca sabe en qué fierro corre** — para él, el encargado es una dirección en la LAN. Ver [ADR-004](adr/ADR-004-encargado-en-caja.md).

## Actualizaciones: el dueño no toca nada, nunca

- **La web se actualiza gratis** (deploy → todos la ven). De ahí la regla: *todo lo que pueda vivir en la web, vive en la web*.
- **La flota se actualiza sola, en silencio y por anillos:** anillo 0 (local piloto propio) → anillo 1 (~10%, clientes amigos) → anillo 2 (todos). Entre anillos se mira el tablero; hay freno de mano para pausar un rollout. Si una versión no arranca, el equipo vuelve solo a la anterior.
- **Momentos seguros:** jamás con un turno abierto ni en medio de una venta; el encargado coordina la ventana y **baja la versión una sola vez** para repartirla a las cajas por LAN.
- **Contrato de compatibilidad** (porque hay locales offline por semanas, nunca se puede asumir que todos corren la última versión):
  1. La nube siempre entiende versiones viejas (mínimo N−2). El nuevo se adapta al viejo, jamás al revés.
  2. El protocolo de sincronización **solo crece** (se agregan campos; nunca se quitan ni cambian de significado).
  3. Las migraciones van solo hacia adelante y primero agregan, después quitan (*expand/contract*).

Ver [ADR-007](adr/ADR-007-updates-por-anillos.md).

## Mission Control

Consola interna del equipo Veltronik (no del dueño): qué versión corre cada equipo, última sincronización, bandejas trabadas, stock negativo, choques de enrolamiento, freno de rollout. Es lo que permite operar 200 clientes sin un ejército de soporte. Con flota distribuida, **sin tablero estás ciego**.

## Estructura objetivo del repositorio

```
veltronik/
├── backend/                  ← el monolito (el MISMO corre en la nube y en cada local)
│   └── com.veltronik.v2
│       ├── core/             ← identidad, sucursales, billing — lo compartido
│       ├── kiosk/            ← vertical kiosco
│       ├── gym/              ← vertical gimnasio
│       ├── fiscal/           ← ARCA
│       └── sync/             ← NUEVO: outbox, watermarks, reconciliación
├── desktop/                  ← el instalable único (Electron + backend embebido; rol al enrolar)
├── web-owner/                ← plataforma del dueño (navegador, multi-sucursal)
├── web-hq/                   ← Mission Control (consola interna)
└── docs/
    ├── ARCHITECTURE.md       ← este documento
    └── adr/                  ← una página por decisión
```

(La transición desde el layout actual `backend/` + `frontend/` se hace gradualmente durante las fases; no es un big-bang.)

---

# Parte 3 — Reglas innegociables

1. **La identidad entra por enrolamiento, nunca por compilación.** Un binario por cliente no escala.
2. **Nunca perder una venta > nunca vender de más.** El cobro no se bloquea; el stock negativo se marca.
3. **Migraciones Flyway sagradas:** el esquema de producción vive 100% en migraciones; jamás se renumera una migración aplicada; solo hacia adelante; primero agregar, después quitar. En V3 son **dual-target** (nube + DB local) y corren también dentro del instalable al actualizar. *(Lección del outage del 2026-06-18.)*
4. **El contrato de compatibilidad no se rompe:** nube tolera N−2; el protocolo de sync solo crece.
5. **La LAN no es de fiar por ser interna:** todo tráfico caja↔encargado va autenticado y cifrado.
6. **Los límites de módulos los vigila el build, no la memoria humana:** tests de arquitectura (ArchUnit) hacen fallar el build si un vertical importa de otro o si `core` depende de un vertical.
7. **Prohibido `System.out.println`:** logging solo por logger, y la regla la aplica el linter (build falla), no la buena voluntad.
8. **`scripts/` jamás se commitea** (contiene credenciales y utilidades ad-hoc).
9. **Sin verde en CI no hay merge.** Sin excepciones.

> El principio detrás de 6–9: **limpio no es el proyecto que se limpia, es el que no se puede ensuciar.**

---

# Parte 4 — Plan de fases

| Fase | Nombre | Contenido | Estado |
|---|---|---|---|
| **0** | Cimientos + limpieza | Barrido (printlns, código muerto), gates automáticos (ArchUnit, linter, CI), este documento + ADRs, clasificar datos evento-vs-config ([DATA-CLASSIFICATION.md](DATA-CLASSIFICATION.md)), UUIDs pre-asignables + DNI de equipo (V31), mapeo sucursal=Tenant ([ADR-008](adr/ADR-008-sucursal-es-tenant.md) — la entidad ya existía). Queda: migraciones dual-target (con el empaquetado local, Fase 1) | ✅ Completa (2026-07-01) |
| **1** | Local-first de 1 caja (MVP) | Instalable con monolito local (caja = su propio encargado), sync engine (eventos ↑, config ↓, oportunista), enrolamiento v1, PIN local, web lee lo sincronizado ("última sync hace X"). **Incluye el pipeline de updates por anillos y un Mission Control mínimo ANTES de migrar al primer cliente** | ⚪ Pendiente |
| **2** | Multi-sucursal | Tenant → N sucursales de punta a punta, dashboard consolidado + drill-down, integridad de enrolamiento (choques, re-etiquetado por DNI de equipo) | ⚪ Pendiente |
| **3** | Multi-caja | Roles encargado/caja, descubrimiento por LAN, arbitraje de stock, modo degradado, promoción de caja a encargado (failover), cierre de caja consolidado | ⚪ Pendiente |
| **4** | Endurecimiento | Colas de contingencia ARCA/MP, appliance "Caja Madre" (opcional, upsell), observabilidad completa, **eliminación del vertical `courts`** | ⚪ Pendiente |

**Por qué este orden:** cada fase es aditiva, shippeable y reversible — hay clientes en producción y nada puede romperse. La higiene (Fase 0) va primero porque construir sobre un proyecto sucio es empezar debiendo; el pipeline de updates va antes del primer cliente migrado porque **no se despliega un cerebro local que no se pueda actualizar y ver remotamente**.

**El gym entra solo:** asistencias = eventos append-only, socios/config = río que baja, stock casi no pesa. Viaja en la misma arquitectura sin trabajo extra.

---

# Verdades asumidas (para que nadie se sorprenda)

- **"Tiempo real" tiene asterisco:** el dueño ve tiempo real cuando el local tiene internet; si no, ve la última foto sincronizada. La UI siempre muestra "última sync hace X".
- **El consolidado multi-sucursal es inherentemente online:** la data de otros locales solo llega por internet. El dueño parado en su local sin internet ve *esa* sucursal (admin local), no todas.
- **El encargado es un punto único de falla por local**, mitigado por la promoción de caja (failover) y, a futuro, el appliance.

---

# Glosario

| Término | Significado |
|---|---|
| **Tenant** | En el código, **cada sucursal es un `Tenant`** (aislamiento, facturación y enrolamiento por tenant). El "dueño" es un `AppUser` con memberships en N tenants. Ver [ADR-008](adr/ADR-008-sucursal-es-tenant.md) |
| **Sucursal** | Un local físico. Unidad de facturación ($80k/mes) y de enrolamiento. En el código: `Tenant` |
| **Encargado / Caja Madre** | El equipo del local que corre el monolito en modo local: cerebro, árbitro de stock y único interlocutor con la nube |
| **Caja** | Terminal de venta; frontend que habla con su encargado por LAN |
| **Enrolamiento** | El "bautizo" online de un equipo: el dueño le asigna sucursal y rol desde la web; la nube emite su credencial |
| **DNI de equipo** | Identificador físico inmutable de cada instalación, estampado en cada registro. La sucursal es reasignable; el DNI no |
| **Outbox** | Bandeja de salida local: todo cambio pendiente de subir a la nube |
| **Watermark** | Marcador de "hasta dónde sincronicé", para reanudar sin reenviar |
| **Sincronización oportunista** | Sincronizar cuando hay internet, sin requerir que lo haya siempre |
| **Modo degradado** | Caja operando sin su encargado: cobra optimista, encola, reconcilia después |
| **Anillo (de rollout)** | Grupo de la flota que recibe una actualización antes que el siguiente: piloto → amigos → todos |
| **Contrato de compatibilidad** | Las reglas que permiten que versiones distintas convivan: nube tolera N−2, protocolo solo crece, migraciones solo adelante |
| **Mission Control** | Consola interna de Veltronik para ver la salud de toda la flota |
| **Kill switch** | Bloqueo automático por falta de pago (`SubscriptionAccessPolicy`); se rehabilita solo al cobrar |
