# ADR-001: Arquitectura local-first de tres capas

- **Estado:** ✅ Aceptada
- **Fecha:** 2026-07-01

## Contexto

Veltronik V2 es cloud-céntrico: toda operación pega contra la API en Railway. Sin internet, el local no opera. Para el vertical kiosco eso es inaceptable (no se puede dejar de vender porque se cortó el WiFi), y en LATAM la conectividad intermitente no es el caso raro sino el común: hay locales con internet malo o directamente sin internet fijo.

## Decisión

Invertir el modelo: **el dispositivo es el cerebro, la nube es el punto de encuentro.** Tres capas:

1. **Nube** — agregador multi-tenant de lectura (dashboards del dueño) y fuente de verdad de la configuración. Habla solo con encargados.
2. **Encargado ("Caja Madre")** — uno por sucursal: el monolito Spring corriendo en modo local con DB local. Cerebro del local, árbitro de stock, único interlocutor con la nube.
3. **Cajas** — el frontend de siempre, apuntando al encargado por la LAN del local.

Hay **dos redes que fallan por separado**: la LAN (confiable, WiFi sirve) y el uplink a internet (intermitente). La sincronización encargado↔nube es **oportunista**: no requiere internet constante, requiere internet cada tanto.

## Alternativas descartadas

- **Seguir cloud-céntrico con "modo offline" parcial en el frontend:** cachear en la SPA no soporta operaciones reales (stock, caja, fiado) ni multi-caja; es un parche, no una arquitectura.
- **Cajas hablando directo con la nube (sin encargado):** cada caja sincronizando por su cuenta multiplica los conflictos de stock y la carga de la nube crece con las cajas, no con los locales.

## Consecuencias

- El local opera 100% offline por tiempo indefinido; "tu kiosco sigue vendiendo aunque se caiga internet" pasa a ser argumento de venta.
- La nube pasa a ser mayormente de lectura → más barata y fácil de escalar; agregar cajas no le suma carga.
- Aparece una pieza nueva a construir y mantener: el motor de sincronización (ADR-003).
- "Tiempo real" pasa a tener asterisco: el dueño ve la última foto sincronizada; la UI muestra "última sync hace X".
- Nos convertimos en distribuidores de una flota de cerebros locales → el pipeline de updates se vuelve crítico (ADR-007).

## Cuándo reconsiderar

Si el producto pivoteara a verticales 100% online (sin operación física de mostrador), el costo del local-first dejaría de justificarse.
