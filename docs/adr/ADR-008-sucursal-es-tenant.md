# ADR-008: La Sucursal de la V3 es el Tenant existente — no se crea entidad nueva

- **Estado:** ✅ Aceptada
- **Fecha:** 2026-07-01

## Contexto

El diseño V3 habla de "Dueño (tenant) → N sucursales", y el plan de Fase 0 incluía "modelar
la entidad sucursal bajo el tenant". Al bajar al código real, la investigación mostró que **ese
modelo ya existe en producción con otros nombres**:

- Cada sucursal **ya es un `Tenant`**: `SetupController` los crea hablando literalmente de
  "primera sucursal" (con mes de prueba) y "sucursal adicional" (sin prueba), tal como manda
  el CODEX ($80.000/mes **por sucursal**).
- El "dueño con varias sucursales" **ya existe** vía `AppUser` + `TenantMembership` (un usuario
  es OWNER de N tenants) y `TenantGroup` (agrupación visual del lobby, por `owner_user_id`).
- La suscripción y el kill switch **ya son por sucursal** (por tenant) — exactamente la unidad
  de facturación que el negocio quiere.

Crear una entidad `Branch` bajo `Tenant` habría duplicado un concepto vivo, obligando a migrar
facturación, memberships, aislamiento multi-tenant y a todos los clientes en producción.

## Decisión

**No se crea ninguna entidad nueva.** Se fija el mapeo de vocabulario V3 → modelo existente:

| Concepto V3 | En el código | Notas |
|---|---|---|
| **Sucursal** | `Tenant` | Unidad de facturación, aislamiento (`tenant_id`) y **enrolamiento** (un equipo se enrola a un tenant) |
| **Dueño** | `AppUser` + `TenantMembership(OWNER)` | Sus sucursales = sus memberships activas |
| **Grupo de sucursales** | `TenantGroup` | Agrupación visual del lobby; también la base natural del dashboard consolidado |
| **Vista consolidada** | consulta cross-tenant por memberships del dueño | La nube puede; un local no (su DB solo tiene su tenant) |

Consecuencia directa para el sync engine: **el enrolamiento ata `device_id → tenant_id`**, y la
DB local de una sucursal contiene los datos de UN solo tenant. El aislamiento multi-tenant
existente se convierte, gratis, en el particionado natural de la sincronización.

## Alternativas descartadas

- **Entidad `Branch` bajo `Tenant`:** re-modelar facturación/memberships/aislamiento en
  producción con clientes vivos, para llegar al mismo lugar con más riesgo. Sin beneficio.
- **Renombrar `Tenant` → `Sucursal` en el código:** cosmético, tocaría todo el codebase y las
  tablas. El mapeo documentado cumple lo mismo sin riesgo.

## Consecuencias

- La Fase 2 (multi-sucursal) es más chica de lo planeado: el modelo ya está; falta el dashboard
  consolidado (apoyándose en `TenantGroup`/memberships) y la integridad de enrolamiento.
- El vocabulario de los docs V3 queda mapeado: cuando ARCHITECTURE.md dice "sucursal", en el
  código es `Tenant`. El glosario lo refleja.
- Regla para juniors: **antes de crear una entidad nueva, verificar si el concepto ya existe con
  otro nombre.** Este ADR existe porque el plan original iba a duplicar uno.

## Cuándo reconsiderar

Si el negocio cambiara a "una suscripción cubre N sucursales" (facturación por dueño, no por
sucursal), habría que introducir una entidad paraguas real. Hoy el CODEX manda lo contrario.
