# Clasificación del modelo de datos para el sync engine (V3)

> **Fase 0, entregable.** Recorre todas las entidades reales del backend y clasifica cada una
> según cómo viaja en la arquitectura local-first (ADR-001, ADR-003). Este documento **guía el
> diseño del sync engine**: qué sube, qué baja, qué se arbitra y qué no sale de la nube.
>
> Fecha: 2026-07-01 · Basado en el código real de `com.veltronik.v2` (v2.6.3).

## Las categorías (refinan ADR-003)

El diseño original hablaba de **dos ríos** (eventos ↑, config ↓) + stock arbitrado. Al clasificar
las tablas reales apareció una **tercera categoría** que la teoría no cubría:

| Categoría | Quién escribe | Dirección | Conflictos |
|---|---|---|---|
| **EVENTO** | el local, append-only | ↑ sube | Ninguno (nadie edita lo pasado) |
| **MAESTRO LOCAL** ⭐ nueva | el local (mutable) | ↑ sube como upsert | Ninguno *entre* locales (cada sucursal es dueña de los suyos); la web los **lee** |
| **CONFIG PLATAFORMA** | la nube (el dueño, por web) | ↓ baja | Ninguno (la nube es la única fuente de verdad) |
| **ARBITRADO** | el encargado serializa | interno al local, ↑ sube el resultado | Resuelto por orden de llegada |
| **NUBE-ONLY** | la nube | no viaja | N/A (jamás baja al local) |

⭐ **El hallazgo:** socios del gym, clientes del kiosco y el catálogo de productos se crean y
editan **en el mostrador**, no en la web. No son "config que baja": son datos maestros cuya
fuente de verdad es **la sucursal**. El principio de un-solo-escritor se mantiene (cada sucursal
solo escribe los suyos), así que suben sin conflicto — pero implica una regla de producto: **por
ahora la web los muestra en solo-lectura**. Permitir editarlos desde la web = dos escritores =
el problema que juramos evitar. Si algún día hace falta, será una decisión explícita (ADR nuevo).

---

## Clasificación tabla por tabla

### core

| Entidad | Categoría | Notas |
|---|---|---|
| `Tenant` | CONFIG PLATAFORMA ↓ | El local necesita saber quién es; baja al enrolar y en cada sync |
| `TenantGroup` | NUBE-ONLY | Agrupación de sucursales: solo tiene sentido en la vista consolidada |
| `TenantMembership` | CONFIG PLATAFORMA ↓ | Roles del dueño/staff; baja para el admin local |
| `AppUser` | CONFIG PLATAFORMA ↓ | Usuarios de plataforma. Los **cajeros con PIN** (V3) serán una entidad nueva, también ↓ |
| `Subscription` | NUBE-ONLY | Billing del SaaS (MP). El local no la ve; lo que baja es el **veredicto** del kill switch como flag de config |
| `TenantPayment` | NUBE-ONLY | Cobros del SaaS vía webhook MP; puro asunto de la nube |

### gym

| Entidad | Categoría | Notas |
|---|---|---|
| `AccessLog` | EVENTO ↑ | El caso perfecto: asistencias append-only |
| `GymPayment` | EVENTO ↑ | Cobro de cuota hecho en recepción |
| `GymMember` | MAESTRO LOCAL ↑ | Se da de alta/edita en recepción. ✅ El drift de esquema que tenía `gym_members` ya fue reconciliado por `V29__Reconcile_Gym_Members_Drift.sql` (esquema 100% en Flyway) |
| `GymClass` | MAESTRO LOCAL ↑ | La grilla de clases la arma el local |
| `GymBooking` | EVENTO ↑ | Reserva de cupo en clase. (No confundir con `courts`, que se elimina) |

### kiosk

| Entidad | Categoría | Notas |
|---|---|---|
| `KioskSale` / `KioskSaleItem` / `KioskSalePayment` | EVENTO ↑ | El corazón del POS: append-only puro |
| `KioskCashSession` | EVENTO ↑ | Ciclo de vida corto (abre→cierra) pero un solo escritor (su caja): sube sin conflicto |
| `KioskAccountMovement` | EVENTO ↑ | Fiado: movimientos de cuenta corriente, append-only |
| `KioskStockMovement` | EVENTO ↑ | 🏆 **El ledger de stock YA EXISTE**: el stock es una suma de movimientos. El árbitro serializa movimientos; el saldo es derivado |
| `KioskProduct` (campo stock actual) | ARBITRADO | Cache del saldo del ledger; lo escribe solo el encargado |
| `KioskProduct` (datos del producto) / `KioskCategory` / `KioskSupplier` | MAESTRO LOCAL ↑ | El kiosquero carga el catálogo en el mostrador |
| `KioskPurchase` / `KioskPurchaseItem` | EVENTO ↑ | Compras a proveedores |
| `KioskCustomer` | MAESTRO LOCAL ↑ | Clientes de fiado: nacen en el mostrador |
| `KioskSettings` | CONFIG PLATAFORMA ↓ | Configuración de la sucursal |

### fiscal

| Entidad | Categoría | Notas |
|---|---|---|
| `FiscalConfig` / `FiscalPointOfSale` | CONFIG PLATAFORMA ↓ | ⚠️ Contiene el certificado ARCA cifrado. **Decisión pendiente (Fase 4):** ¿el cert baja al local para emitir CAE desde ahí, o la emisión se delega a la nube? Impacta seguridad y contingencia |
| `FiscalVoucher` / `FiscalVoucherItem` | EVENTO ↑ | 🏆 **La cola de contingencia YA EXISTE**: `FiscalVoucherStatus.CONTINGENCY` cuando ARCA no responde. Es la semilla del patrón de Fase 4 |

### courts — fuera del alcance del sync

El vertical se **elimina en Fase 4** (decisión del fundador). No se clasifica ni se migra a
local-first: queda cloud-only hasta su eliminación. Ninguna pieza del sync engine debe
contemplarlo.

---

## Implicancias para el diseño del sync engine

1. **Tres flujos de subida, no uno:** eventos (insert-only, idempotencia por UUID), maestros
   locales (upsert por UUID + watermark de versión), y el saldo arbitrado de stock (snapshot).
2. **La web es solo-lectura sobre maestros locales** hasta decisión en contrario. Los dashboards
   consolidados no se ven afectados (leen el espejo).
3. **Dos semillas ya plantadas en el código:** el ledger de stock (`KioskStockMovement`) y la
   contingencia fiscal (`CONTINGENCY`). El sync engine las generaliza, no las inventa.
4. **Prerrequisito duro para migraciones dual-target:** el esquema de prod debe estar 100% en
   Flyway. ✅ Ya cumplido: el drift de `gym_members` fue reconciliado por V29.
5. **El kill switch en modo local:** el veredicto de acceso baja como config con la sincronización.
   Regla de negocio a definir en Fase 1: cuánto tiempo opera un local sin sincronizar antes de
   exigir contacto con la nube (equilibrio entre "nunca bloquear la venta" y "nadie usa gratis
   el sistema desconectándolo para siempre").

---

## Implementación Fase 0 (hecha el 2026-07-01)

Los cimientos del sync engine ya están en el código:

| Pieza | Dónde | Qué hace |
|---|---|---|
| **UUID pre-asignable** | `AssignableUuidGenerator` + `BaseEntity` | El id lo puede traer el dispositivo (idempotencia de sync); si viene nulo, se genera en el servidor como siempre. Cero cambio de comportamiento para los flujos actuales |
| **DNI de equipo — columna** | `V31__Origin_Device_Id.sql` + `TenantAwareEntity.originDeviceId` | `origin_device_id` (nullable, inmutable post-inserción) en las 32 tablas tenant-aware |
| **DNI de equipo — captura** | `DeviceContextFilter` + `DeviceContextHolder` | Lee el header `X-Device-Id` (laxo: ausente/malformado ⇒ null, jamás rechaza) y `TenantAwareEntity` lo estampa en `@PrePersist` |
| **DNI de equipo — emisión v0** | `frontend/src/lib/deviceId.js` + interceptor de `apiClient` | UUID persistente en localStorage, viaja en cada request. En Fase 1 lo reemplaza la identidad de enrolamiento (un solo módulo a tocar) |
| **CORS** | `SecurityConfig` | `X-Device-Id` en la whitelist. ⚠️ **Orden de deploy: backend primero, frontend después** — si un frontend nuevo habla con un backend viejo, el preflight rechaza todo |

**Qué NO se hizo a propósito (es de Fase 1):** la tabla de equipos enrolados (el FK de
`origin_device_id`), el camino de inserción del sync (persist con detección de duplicados),
y la identidad de máquina real que reemplaza al localStorage.
