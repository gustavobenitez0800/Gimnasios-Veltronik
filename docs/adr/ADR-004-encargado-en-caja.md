# ADR-004: El encargado corre en una caja al lanzar; appliance como upsell futuro

- **Estado:** ✅ Aceptada
- **Fecha:** 2026-07-01

## Contexto

Cada sucursal necesita un encargado (ADR-001). ¿Dónde corre? La pregunta real no es técnica sino de negocio: **¿quién paga el fierro y quién lo soporta?**

## Decisión

**Al lanzar, el encargado corre en una de las cajas del local** (la instalación toma el rol "encargado" al enrolarse). No se requiere hardware adicional.

**Regla en piedra:** el software **nunca sabe en qué máquina corre el encargado**. Para las cajas, el encargado es un nombre estable que se anuncia en la LAN; para el código, una dirección. Esto deja la puerta abierta a que mañana el encargado sea un mini-PC dedicado sin cambiar una línea del protocolo.

El **appliance dedicado ("Caja Madre Veltronik")** — un mini-PC siempre encendido, idealmente hosteando su propia red WiFi — queda como **producto/upsell futuro** para locales grandes, no como prerequisito para vender.

## Alternativas descartadas

- **Appliance obligatorio desde el día 1:** máxima robustez, pero nos mete en el negocio del hardware (comprar, preparar, enviar, reponer, soporte físico) y mata el onboarding self-service — nadie arranca hasta que le llegue una caja por encomienda. Con 10 clientes es simpático; con 200 es una segunda empresa.
- **P2P sin jefe (todas las cajas pares, replicándose entre sí):** elegante en papel; en la práctica reintroduce toda la complejidad de conflictos que el árbitro elimina (ADR-003). Inviable para un equipo de una persona con clientes en producción.

## Consecuencias

- Onboarding sigue siendo 100% self-service: descarga + enrolamiento, cero logística.
- El kiosco típico (una caja) no nota nada: su única caja es también su encargado.
- Con 2+ cajas, la caja-encargado apagada deja al local en modo degradado → mitigado por el failover de ADR-005 (promover otra caja).
- El appliance queda disponible como fuente de ingreso adicional y factor de retención cuando haya tracción.

## Cuándo reconsiderar

Dos señales: clientes con 3+ cajas por local, o tickets recurrentes de "se apagó la caja madre". Ahí el appliance pasa de upsell opcional a recomendación activa para ese segmento.
