# ADRs — Architecture Decision Records

Un ADR es **una página que explica una decisión de arquitectura**: qué se decidió, por qué, qué alternativas se descartaron y qué señal obligaría a reconsiderarla.

**Reglas:**
- Un ADR **no se edita** una vez aceptado (salvo typos). Si la decisión cambia, se escribe un ADR nuevo que lo **reemplaza** y el viejo se marca `Reemplazada por ADR-XXX`.
- Toda decisión que a un junior le haría preguntar *"¿y esto por qué es así?"* merece un ADR.
- Formato: Estado / Fecha / Contexto / Decisión / Alternativas descartadas / Consecuencias / Cuándo reconsiderar.

## Índice

| ADR | Decisión | Estado |
|---|---|---|
| [ADR-001](ADR-001-local-first-tres-capas.md) | Arquitectura local-first de tres capas (nube / encargado / cajas) | ✅ Aceptada |
| [ADR-002](ADR-002-un-instalable-identidad-runtime.md) | Un solo instalable universal; identidad en runtime (enrolamiento + DNI de equipo) | ✅ Aceptada |
| [ADR-003](ADR-003-dos-rios-y-arbitro-de-stock.md) | Modelo de sincronización: dos ríos de datos + árbitro de stock | ✅ Aceptada |
| [ADR-004](ADR-004-encargado-en-caja.md) | El encargado corre en una caja al lanzar; appliance como upsell futuro | ✅ Aceptada |
| [ADR-005](ADR-005-binario-gordo-unico.md) | Binario gordo único: todas las máquinas traen el backend completo | ✅ Aceptada |
| [ADR-006](ADR-006-plataforma-dueno-solo-web.md) | La plataforma del dueño es solo web | ✅ Aceptada |
| [ADR-007](ADR-007-updates-por-anillos.md) | Auto-update silencioso por anillos + contrato de compatibilidad | ✅ Aceptada |
| [ADR-008](ADR-008-sucursal-es-tenant.md) | La Sucursal de la V3 es el `Tenant` existente — no se crea entidad nueva | ✅ Aceptada |
| [ADR-009](ADR-009-runtime-local-embebido.md) | Runtime local: Postgres embebido + JRE jlink + proceso hijo de Electron | ✅ Aceptada |
| [ADR-010](ADR-010-sync-engine-v1.md) | Sync engine v1: triggers de captura + protocolo genérico a nivel fila + credencial de equipo | ✅ Aceptada |

**Criterio rector de todas las decisiones de la V3:** minimizar variantes hoy sin cerrar puertas mañana — Veltronik lo mantiene un equipo de una persona, y cada variante (binarios, superficies, hardware) multiplica el costo de soporte a escala.
