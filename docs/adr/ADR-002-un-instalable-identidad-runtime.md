# ADR-002: Un solo instalable universal; identidad en runtime

- **Estado:** ✅ Aceptada
- **Fecha:** 2026-07-01

## Contexto

Con la V3 el instalable deja de ser "una pantalla de la nube" y pasa a operar sucursales concretas con roles concretos (caja o encargado). Surge la pregunta: ¿cómo sabe cada instalación quién es? Si la respuesta fuera "se compila un build por cliente/sucursal", el proyecto no escala: cada alta sería trabajo de build y cada update habría que repetirlo por variante.

## Decisión

**Un único instalable universal, sin identidad de fábrica.** La identidad completa —tenant, sucursal, rol (caja/encargado), vertical activa— se asigna **al enrolar, en runtime, jamás al compilar**.

El enrolamiento es el único paso online obligatorio:
1. El dueño (logueado con Google en la web) elige de su lista real: *"esta instalación es para → Sucursal Centro"*. No tipea identificadores: elige, con confirmación explícita que muestra nombre y dirección.
2. La nube emite una **credencial de equipo** de larga vida (con renovación silenciosa) atada a esa sucursal.
3. La config inicial (catálogo, usuarios y PINs de cajeros) baja y queda cacheada. Desde ahí, el día a día es 100% offline.

Cada instalación lleva además un **DNI de equipo**: un identificador físico inmutable, generado en la máquina, que se estampa en **cada registro operativo**. La sucursal asignada es una *etiqueta reasignable*; el DNI *nunca miente*.

**Integridad:** rige "un encargado activo por sucursal". Los encargados emiten señal de vida; si un segundo equipo intenta enrolarse como encargado de una sucursal que ya tiene uno vivo, la nube frena y pregunta (¿reemplazo o error?).

## Alternativas descartadas

- **Build por cliente/sucursal:** N builds, N canales de update, soporte imposible. Es la diferencia entre un service y un SaaS.
- **Identidad tipeada a mano en el equipo ("soy la sucursal 2"):** invita al error humano y no hay autoridad que lo detecte.

## Consecuencias

- Onboarding self-service: registro en la web → descarga del mismo instalable de siempre → enrolamiento. Cero intervención del equipo Veltronik.
- Un solo canal de updates para toda la flota (ADR-007).
- **Todo error de enrolamiento es recuperable sin pérdida de datos:** si un equipo operó días con la sucursal equivocada, la nube re-etiqueta su historial usando el DNI de equipo ("la máquina X era en realidad la Sucursal 2").
- Conviven tres identidades: dueño (Google, online, supervisa), cajero (PIN local, offline, opera), equipo (DNI + credencial, sincroniza).

## Cuándo reconsiderar

No hay escenario previsto que justifique identidad en build. Un artefacto distinto solo se justifica **por plataforma** (ej.: tablet Android), nunca por cliente/rol/sucursal.
