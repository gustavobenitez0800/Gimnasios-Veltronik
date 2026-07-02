# ADR-007: Auto-update silencioso por anillos + contrato de compatibilidad

- **Estado:** ✅ Aceptada
- **Fecha:** 2026-07-01

## Contexto

Local-first (ADR-001) tiene un precio: Veltronik pasa a distribuir una **flota** de cerebros locales, algunos offline por días o semanas. El dueño no puede ser responsable de actualizar ("tocá acá que salió la 3.2") — no escala y genera fricción. Y una versión rota distribuida a toda la flota sería la peor catástrofe operativa posible. El pipeline de actualización deja de ser un detalle: **es parte de la arquitectura y prerequisito del primer despliegue** (Fase 1).

## Decisión

**El dueño no toca nada, nunca.** Dos superficies con dos mecánicas:

1. **La web se actualiza gratis:** deploy → todos la ven. De ahí la regla: *todo lo que pueda vivir en la web, vive en la web*.
2. **La flota se auto-actualiza en silencio, por anillos:**
   - **Anillo 0** — local piloto propio (lo sufre Veltronik primero) → **Anillo 1** — ~10%, clientes amigos → **Anillo 2** — todos.
   - Entre anillos se observa Mission Control; hay **freno de mano** para pausar un rollout.
   - **Rollback automático:** cada equipo conserva la versión anterior; si la nueva no arranca, vuelve solo.
   - **Momentos seguros:** jamás con turno abierto ni en medio de una venta; el encargado coordina la ventana (cierre de caja, madrugada).
   - **El encargado baja la versión una sola vez** y la reparte a las cajas por LAN (clave en locales con 4G medido).

**Contrato de compatibilidad** — porque nunca se puede asumir que toda la flota corre la última versión:

1. **La nube siempre entiende versiones viejas (mínimo N−2).** El nuevo se adapta al viejo, jamás al revés. Vale también dentro del local: encargado nuevo tolera cajas viejas.
2. **El protocolo de sincronización solo crece:** se agregan campos; nunca se quitan ni cambian de significado.
3. **Migraciones solo hacia adelante, expand/contract** (primero agregar, después quitar), jamás renumerar una migración aplicada. En V3 las migraciones son dual-target (nube + DB local) y corren dentro del instalable al actualizar. *(Lección del outage del 2026-06-18.)*

**Mission Control** (consola interna `web-hq`): versión y last-seen por equipo, salud de sincronización, bandejas trabadas, freno de rollout. Sin tablero, operar una flota distribuida es volar a ciegas.

## Alternativas descartadas

- **Update manual por el dueño:** fricción, flota fragmentada en N versiones, soporte imposible.
- **Rollout directo a toda la flota:** una regresión llega al 100% de los clientes antes de detectarse.
- **Forzar versión mínima agresivamente:** imposible con locales legítimamente offline por semanas; por eso el peso recae en el contrato de compatibilidad y no en obligar a actualizar.

## Consecuencias

- Publicar un release se convierte en: taggear → mirar el tablero → intervenir solo donde está rojo.
- El contrato de compatibilidad restringe cómo se escriben cambios de protocolo y migraciones (disciplina permanente, verificada en CI donde sea posible).
- Mission Control y el pipeline de anillos deben existir **antes** de migrar el primer cliente a V3 (Fase 1).

## Cuándo reconsiderar

El número de anillos y sus porcentajes son ajustables con el tamaño de la flota. El contrato de compatibilidad no se reconsidera: es la condición de existencia de una flota heterogénea.
