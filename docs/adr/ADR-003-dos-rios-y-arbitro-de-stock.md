# ADR-003: Modelo de sincronización — dos ríos de datos + árbitro de stock

- **Estado:** ✅ Aceptada
- **Fecha:** 2026-07-01

## Contexto

El 80% de la dificultad de cualquier sistema offline-first son los **conflictos**: dos lugares cambian lo mismo estando desconectados y después sincronizan. Resolver conflictos genéricos (CRDTs, merge de estado arbitrario) es de una complejidad inviable para un equipo de una persona con clientes en producción.

## Decisión

No resolver el problema general: **clasificar los datos para que el conflicto casi no pueda existir.**

1. **Río de eventos (local → nube):** ventas, cobros, asistencias, movimientos de caja. Son *append-only* — nadie edita una venta vieja, solo se agregan nuevas. Se mergean sin conflicto por definición.
2. **Río de config (nube → local):** catálogo, precios, usuarios, configuración. La nube es la **única fuente de verdad**; baja hacia los locales. Sin conflicto porque hay un solo dueño del dato.
3. **El stock** — único dato compartido y mutable — lo serializa el **encargado como árbitro**: todas las cajas le mandan sus operaciones por LAN y él las procesa en orden. Restaura el principio "un solo escritor por local".

Mecánica del motor: **outbox local** (todo cambio se escribe local y en una bandeja de salida), **UUIDs generados en el dispositivo** (idempotencia: un reintento jamás duplica), **watermarks** (reanudar desde donde se quedó), sincronización **oportunista**.

**Modo degradado:** si una caja pierde al encargado, cobra igual en modo optimista, encola y reconcilia al reconectar. Regla de negocio explícita: **nunca perder una venta > nunca vender de más.** El stock negativo se marca en rojo y se informa; el cobro no se bloquea jamás. (Rechazarle la plata a un cliente parado en el mostrador es peor negocio que vender de más un chicle.)

Lo inherentemente online (CAE de ARCA, pagos tarjeta/QR de MP) va a **colas de contingencia** y se completa al volver la conexión; el efectivo es 100% offline.

## Alternativas descartadas

- **Merge genérico de estado (CRDTs / sync frameworks):** potencia que no necesitamos, complejidad que no podemos pagar. Nuestros datos, bien clasificados, casi no conflictúan.
- **Bloquear la venta sin confirmación de stock:** prioriza la exactitud del inventario sobre la venta. Es la prioridad invertida para un kiosco.
- **P2P entre cajas sin árbitro:** ver ADR-004.

## Consecuencias

- La complejidad de sincronización queda acotada a una pieza (`sync/`) con reglas simples y testeables.
- El esquema de datos debe clasificarse explícitamente (evento vs config) — trabajo de Fase 0.
- El stock que ve el dueño en la web es un número reconciliado, no al milisegundo.

## Cuándo reconsiderar

Si apareciera un vertical donde los datos editables tuvieran múltiples escritores legítimos y simultáneos (ej.: edición colaborativa), este modelo no alcanza — ese vertical necesitaría su propio análisis.
