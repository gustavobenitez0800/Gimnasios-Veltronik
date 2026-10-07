# Veltronik

Sistema de gestión para gimnasios: socios, cuotas, caja y control de acceso.
SaaS multi-tenant **en producción**, con gimnasios que lo usan todos los días.

🌐 [veltronik.com.ar](https://veltronik.com.ar)

---

## Qué resuelve

| Para quién | Qué hace |
|---|---|
| **El mostrador** | Alta de socios, cobro de cuotas y aranceles, cierre de caja diario y exportación a Excel para el contador. Cada cobro queda firmado por quien lo hizo (PIN por persona). |
| **La puerta** | Check-in por QR desde el celular del socio, registro de entrada y salida, molinete con reconocimiento facial y lista de quién está adentro. |
| **El dueño** | Tablero de ingresos, retención de socios y resumen de todas sus sedes, desde la web. |
| **El día sin internet** | El mostrador sigue cobrando y dejando pasar gente, y se pone al día solo cuando vuelve la conexión. |
| **El que viene de otro sistema** | Importadores de socios y de historial de caja desde Excel. |

La suscripción del gimnasio se cobra sola todos los meses por Mercado Pago. Si el pago
no entra, el acceso se bloquea; cuando el cobro llega, se rehabilita sin intervención.

## Arquitectura

```
   Escritorio (Electron)                      Web (navegador)
   React + núcleo local en SQLite             React
          │  cola de operaciones sin conexión        │
          └───────────────────┬──────────────────────┘
                              ▼
               API REST · Spring Boot 3 · Java 17
               Docker en Google Cloud Run
                              │
          ┌───────────────────┼────────────────────┐
          ▼                   ▼                    ▼
     PostgreSQL          Supabase Auth        Mercado Pago
     (Supabase)          (JWT)                (suscripciones + webhooks)

   Molinete facial  ◄── API de red local ──  Escritorio
```

**Backend: monolito modular.** El código se corta por módulo de negocio, no por capa
técnica: `core` (identidad, negocios, suscripción, dispositivos) y `gym` (socios, pagos,
caja, accesos, molinete). Las reglas no dependen de la buena voluntad: las verifica el
build.

- `core` no puede depender de ningún vertical.
- Toda entidad de un vertical hereda el aislamiento por negocio (`tenant_id`).
- Inyección y configuración solo por constructor.

Ver [`ArchitectureTest`](backend/src/test/java/com/veltronik/v2/ArchitectureTest.java).

**Base de datos gobernada por migraciones.** Más de 80 migraciones Flyway. Otro grupo de
tests revisa el esquema real en cada build: todas las tablas con seguridad por fila, las
claves foráneas con índice, los importes guardados igual en todos lados. Ver
[`EsquemaInvariantesTest`](backend/src/test/java/com/veltronik/v2/support/EsquemaInvariantesTest.java).

**Funciona sin conexión.** El escritorio guarda un espejo local de los datos que necesita
el mostrador y encola lo que se cobra o registra sin servidor. Al volver la conexión, la
cola se reenvía con una clave por operación, de modo que un reintento nunca duplica un
cobro. El código vive en [`frontend/electron/nucleo`](frontend/electron/nucleo).

**La plata se puede auditar.** Todas las pantallas leen de un solo libro de ingresos, cada
peso pertenece a exactamente un cierre de caja y un cobro se anula, no se borra. Ver
[ADR-015](docs/adr/ADR-015-un-libro-de-ingresos-y-cada-peso-en-un-cierre.md).

## Decisiones de arquitectura

Cada decisión importante tiene su página: contexto, alternativas descartadas y cuándo
reconsiderarla. Están en [`docs/adr`](docs/adr/README.md). Para empezar:

- [ADR-008](docs/adr/ADR-008-sucursal-es-tenant.md): cada sucursal es un negocio aparte.
- [ADR-012](docs/adr/ADR-012-firma-declarada-sin-conexion.md): quién firma un cobro cuando no hay conexión.
- [ADR-013](docs/adr/ADR-013-el-mes-corre-solo.md): cómo se calcula hasta cuándo está al día un socio.
- [ADR-014](docs/adr/ADR-014-el-historial-importado-es-historia.md): qué cuenta y qué no del historial que se migra de otro sistema.

## Stack

| Capa | Tecnología |
|---|---|
| Backend | Java 17, Spring Boot 3 (Web, Data JPA, Security, Validation, Actuator), MapStruct, Flyway |
| Base de datos | PostgreSQL (Supabase), seguridad por fila |
| Frontend | React 19, Vite |
| Escritorio | Electron, SQLite local, actualización automática |
| Sitio público | Astro |
| Pagos | Mercado Pago (suscripciones recurrentes y webhooks) |
| Infraestructura | Docker, Google Cloud Run, Vercel, GitHub Actions |
| Tests | JUnit 5, ArchUnit, PostgreSQL embebido, Vitest |

## Calidad

- **Backend:** tests unitarios y de integración contra un PostgreSQL real embebido. Un test
  arranca la aplicación entera y corre todas las migraciones.
- **Frontend:** tests de componentes, de páginas y del núcleo local con Vitest.
- **Integración continua:** en cada push se corren los tests del backend, el lint, los
  tests y los dos builds del frontend (web y escritorio). Ver [`ci.yml`](.github/workflows/ci.yml).
- **Despliegue:** el backend sale a Cloud Run al llegar a `main`
  ([`deploy-cloudrun.yml`](.github/workflows/deploy-cloudrun.yml)). El instalador de
  escritorio se arma y se publica por versión ([`release.yml`](.github/workflows/release.yml)),
  y los equipos instalados se actualizan solos.

## Estructura del repositorio

```
backend/    API en Spring Boot y migraciones de la base
frontend/   Aplicación React y su envase de escritorio (Electron)
landing/    Sitio público en Astro
docs/       Decisiones de arquitectura (ADR) y guías de operación
scripts/    Herramientas de mantenimiento
```

## Correr los tests

Los tests del backend no necesitan nada instalado aparte de Java 17: levantan su propio
PostgreSQL.

```bash
cd backend
./mvnw verify
```

```bash
cd frontend
corepack pnpm install
corepack pnpm test
```

Levantar la aplicación completa requiere credenciales propias de Supabase y Mercado Pago,
que no están en el repositorio.

## Autor

Diseñado y desarrollado por **Gustavo Benitez**.
[LinkedIn](https://www.linkedin.com/in/gustavo-gabriel-ben%C3%ADtez-aguilera-27002437b)

## Licencia

Código propietario, publicado como muestra de trabajo. Todos los derechos reservados.
