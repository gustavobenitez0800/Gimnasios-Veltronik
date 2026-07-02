# ADR-009: Runtime local — Postgres embebido + JRE jlink + proceso hijo de Electron

- **Estado:** ✅ Aceptada
- **Fecha:** 2026-07-02

## Contexto

El ladrillo 3 de la Fase 1 (docs/FASE1-PLAN.md) mete el cerebro dentro del instalable: el
monolito Spring + una base de datos corriendo en la PC del kiosco, offline, auto-actualizable
y en hardware barato. Es el salto técnico más grande de la V3 y sus elecciones condicionan
peso del instalador, updates y failover.

**El dato que ancla todo:** `ApplicationBootTest` ya levanta el monolito real contra una
PostgreSQL embebida (zonky, sin Docker), stubea el esquema `auth` de Supabase, aplica TODAS
las migraciones sobre una base limpia y valida cada entidad — en Windows (dev) y Linux (CI),
todos los días. **El runtime local es ese test convertido en producto.**

## Decisión

Tres piezas, confirmadas por el fundador:

1. **Base local = PostgreSQL embebido** (los binarios viajan en el instalable, ~50MB).
   El mismo motor que la nube ⇒ **una sola cadena de migraciones Flyway** para ambos
   destinos, cero drift de dialecto, y el principio "la misma app en dos lugares" se cumple
   también en los datos.
2. **Java = JRE recortada con jlink** (~70MB), empaquetada junto al jar dentro del
   instalable. La PC del cliente no necesita tener nada instalado.
3. **Procesos: Electron es el padre.** El main lanza el backend como proceso hijo cuando el
   rol del equipo lo requiere, health check por localhost, restart con backoff, apagado
   limpio al salir. Perfil Spring `local`: datasource a localhost, stub del esquema `auth`
   (la receta del boot test), módulos solo-nube apagados.

### Detalles operativos fijados

- **`pgdata` en `%LOCALAPPDATA%\Veltronik`**: fuera del directorio de instalación (sobrevive
  updates y reinstalaciones) y JAMÁS en carpetas sincronizadas (OneDrive corrompe bases por
  file-locking).
- **Puertos fijos por defecto** (altos, ej. 47810 API / 47811 PG) con fallback si están
  ocupados; Electron le pasa la URL efectiva al renderer. No cierra la puerta al
  descubrimiento LAN de Fase 3.
- **RAM**: JVM `-Xmx512m` + PG tuneado chico (shared_buffers ≤128MB) → ~700MB total. Corre
  en una PC de 4GB.
- **Updates**: electron-updater reemplaza app+JRE+PG (blockmap = descargas incrementales);
  `pgdata` no se toca; al arrancar, Flyway migra hacia adelante (expand/contract, ADR-007).
- **Backups v1**: `pg_dump` automático con rotación local; el respaldo de largo plazo es la
  nube vía sync (ladrillo 4).
- **Peso**: el instalador crece ~120-150MB — el precio del binario gordo ya aceptado en ADR-005.

## Alternativas descartadas

- **H2/SQLite embebida en la JVM:** más liviana y sin proceso extra, pero las 33 migraciones
  son Postgres nativo (uuid, índices parciales, plpgsql) ⇒ obligaría a mantener dos cadenas
  de migraciones para siempre, con drift de comportamiento entre local y nube — la versión
  con esteroides del drift que ya mordió una vez (gym_members).
- **GraalVM native-image:** arranque instantáneo y menos RAM, pero el stack (Hibernate,
  MapStruct, BouncyCastle, SDK MP, SOAP ARCA) es campo minado de reflection, los builds son
  larguísimos y el debugging otro deporte. **Optimización futura**, no fundación. Reconsiderar
  solo si arranque/RAM duelen en el campo.
- **Exigir Java/Postgres instalados en la PC:** mata el onboarding self-service. Descartada.
- **Servicio de Windows desde el día 1:** siempre-encendido que hoy nadie necesita (si la app
  de la única caja está cerrada, no hay a quién servir), a cambio de instalación con
  privilegios y debugging más duro. Se agrega como refinamiento en Fase 3 (multi-caja /
  appliance) — ADR-004 garantiza que el software no sabe dónde corre el encargado.

## Consecuencias

- El esqueleto caminante del ladrillo 3: (1) perfil `local` en Spring + stub `auth` como
  callback de Flyway, (2) build que produce JRE jlink + jar dentro de los recursos de
  Electron, (3) spawn + health check + shutdown en main.cjs, (4) smoke test en una máquina
  virgen sin Java ni Postgres.
- El boot test pasa a proteger DOS producciones (Railway y la flota local) con la misma corrida.
- La app corre en dos modos (nube / local) según enrolamiento — la transición de datos entre
  modos es asunto del sync engine (ladrillo 4), no de este ADR.

## Cuándo reconsiderar

native-image cuando el arranque o la RAM duelan con datos reales de la flota. Servicio de
Windows en Fase 3. El motor Postgres no se reconsidera: es la condición del contrato
"una sola cadena de migraciones".
