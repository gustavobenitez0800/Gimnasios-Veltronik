# ADR-006: La plataforma del dueño es solo web

- **Estado:** ✅ Aceptada
- **Fecha:** 2026-07-01

## Contexto

En la V3, la plataforma del dueño (login con Google, gestión de sucursales, dashboards consolidados, alta de cajeros, enrolamiento de equipos) se separa conceptualmente de la operación del local. ¿Necesita ser también una app instalable (escritorio o móvil), o alcanza con la web?

## Decisión

**Solo web.** La plataforma del dueño vive exclusivamente en el navegador (responsive: sirve en celular, tablet y PC). No existe app de escritorio ni app móvil del dueño.

Regla derivada (de ADR-007): **todo lo que pueda vivir en la web, vive en la web** — es la única superficie que se actualiza gratis con cada deploy, sin generar jamás un "actualizá tu app".

## Alternativas descartadas

- **Web + app de escritorio del dueño:** una app solo se justificaría si aportara capacidad offline para la vista consolidada. Pero el consolidado multi-sucursal es **físicamente online** (la data de otros locales solo llega por internet): la app no agregaría capacidad, solo otra superficie que versionar, actualizar y soportar. Puro costo sin beneficio.
- **App móvil nativa (push notifications):** postergada, no descartada para siempre. El camino barato cuando haga falta es PWA/notificaciones web sobre la misma plataforma, mucho antes que una app nativa.

## Consecuencias

- Cero fricción para el dueño: entra desde cualquier dispositivo, siempre a la última versión.
- Una superficie menos que mantener, versionar y soportar.
- Los casos de borde quedan cubiertos sin app:
  - *Dueño en su local sin internet* → entra como admin local en el instalable del local y ve **esa** sucursal.
  - *Alertas en el celular* (caja cerrada, stock crítico) → PWA/notificaciones web cuando se prioricen.

## Cuándo reconsiderar

Prácticamente nunca por necesidad. Una app móvil nativa podría evaluarse a futuro como lujo (push de primera clase, presencia en stores) cuando haya tracción — y aun entonces, primero PWA.
