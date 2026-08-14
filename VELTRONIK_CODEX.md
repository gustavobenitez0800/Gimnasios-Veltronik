# 📖 EL CODEX DE VELTRONIK V2
**Documento Maestro Definitivo — v1.1 (Pulido)**

> Este documento es la **única fuente de verdad** del proyecto.
> Consolida la visión de negocio, la arquitectura técnica, el plan de ejecución
> y las reglas de trabajo. Cualquier IA o desarrollador **debe leer este CODEX
> completo** antes de escribir una sola línea de código.

---

## 📌 1. Visión del Producto y Modelo de Negocio

**Veltronik** es un **SaaS B2B multiplataforma** diseñado para digitalizar, administrar y automatizar PyMEs en LATAM. Nació enfocado en Gimnasios, pero su ADN es ser el sistema operativo para múltiples verticales: hoy están **en producción Gimnasio (y su familia: Pilates, Club, Academia) y Kiosco/Almacén**, y la arquitectura está hecha para sumar rubros nuevos sin tocar los que ya andan.

> **Regla de honestidad de este documento:** acá solo se describen verticales que EXISTEN en el código. Un rubro que "se va a hacer algún día" va al roadmap, no al plano. Ya pasó al revés: Fútbol 5, Salón y Restaurante quedaron a medio construir en el registry, el CSS y los menús durante meses, y uno de esos restos (`RestaurantReportsPage`) era una pantalla en blanco esperando a un cliente.

### 1.1 Omnicanalidad
*   **Desktop (Electron):** Para la recepción física del local (control de acceso, caja registradora).
*   **Web / Móvil (React Responsive):** Para que el dueño administre desde cualquier navegador o celular.

### 1.2 Monetización
*   **Suscripción mensual automatizada** vía **Mercado Pago API**.
*   **Kill Switch:** Si el negocio no paga, el sistema se bloquea automáticamente. Cuando paga, un Webhook lo rehabilita al instante sin intervención humana.
*   **Tarifa Única (Flat Fee):** $80.000 ARS/mes por sistema/sucursal.
    *   No existen planes "Básicos" ni "Premium". El producto se entrega con todas sus capacidades.
    *   **Multisucursal:** Un dueño puede agregar tantas sucursales como quiera. Cada sucursal es independiente y requiere el pago de $80.000 ARS mensuales.
    *   **Regla del mes gratis:** Solo aplica a la *primera* sucursal del cliente. Si el cliente ya agotó su mes de prueba en su primera sucursal y está abonando, cualquier sucursal adicional que dé de alta debe pagarla de entrada, sin período de prueba.
*   **Confiabilidad Extrema (Cero Margen de Error):** Por el valor del producto ($80k/mes), el sistema tiene prohibido fallar, especialmente en la integración de pagos, facturación y procesamiento de datos. Debe responder siempre con un 100% de precisión.

### 1.3 Killer Feature: Veltronik AI
*   Integración nativa de **OpenAI (Assistants API)** + **WhatsApp (Meta)**.
*   El bot ejecuta acciones reales en la base de datos (**Function Calling**): reservas, consultas de horarios, cobros.
*   **Motor de crecimiento viral (B2B2C):** Los clientes finales interactúan con el bot, ven la firma de Veltronik y lo quieren para su propio negocio.

---

## 🏗️ 2. Arquitectura de Software (Backend)

Abandonamos el modelo BaaS (Frontend → Supabase directo) y volvemos a una ingeniería empresarial sólida inspirada en **Java EE 7**, modernizada con Spring Boot.

### 2.1 Stack Tecnológico
| Capa | Tecnología |
|---|---|
| Lenguaje | Java 17 |
| Framework | Spring Boot 3.x |
| ORM | Hibernate (Spring Data JPA) |
| Base de Datos | **PostgreSQL alojado en Supabase** |
| Seguridad | Spring Security + JWT (jjwt) |
| Validación | Spring Validation (`@Valid`) |
| Mapping | MapStruct (Entity → DTO) |
| Testing | JUnit 5 + ArchUnit |

### 2.2 Patrón: Monolito Modular
Organizamos el código por **Módulos de Negocio** (corte vertical), no por capas técnicas.

```text
com.veltronik.v2
├── core/          ← Autenticación, Tenants, Facturación, Usuarios
│   ├── entities/
│   ├── repositories/
│   ├── services/
│   └── controllers/
├── gym/           ← Socios, Clases, Pagos, Control de Acceso
├── kiosk/         ← POS, Stock, Caja, Fiado, Proveedores
├── fiscal/        ← Facturación ARCA (compartido entre verticales)
└── security/      ← Filtros JWT, Configuración Spring Security
```

Dentro de cada módulo se respetan las capas clásicas:
`entities/` → `repositories/` → `services/` → `controllers/`

### 2.3 Evolución del CRUD (SIG JEE7 → V2)
Analizando el sistema `sistema-sig-jee7` (`PaisFacade`, `@SessionScoped`, `AbstractFacade<T>`):

| Capa | SIG JEE7 (Antiguo) | Veltronik V2 (Moderno) |
|---|---|---|
| Datos | `@Entity` + Getters/Setters manuales | `@Entity` + **Lombok** (`@Data`) |
| Acceso | `AbstractFacade<T>` con `EntityManager` manual | **`JpaRepository<T, UUID>`** (auto-generado) |
| Lógica | `@Stateless` EJBs | `@Service` + `@Transactional` |
| Vista | `@SessionScoped` + JSF/PrimeFaces | `@RestController` (Stateless) → JSON puro |

### 2.4 Aislamiento Multitenant
*   Cada entidad de negocio llevará un `tenant_id` obligatorio.
*   Un filtro de Hibernate (`@FilterDef`) inyectará `WHERE tenant_id = ?` automáticamente en todas las consultas, activado por un `OncePerRequestFilter` que lee el JWT.
*   **Resultado:** Es físicamente imposible que un Gimnasio vea datos de un Kiosco (ni de otra sucursal del mismo dueño).

---

## 🎨 3. Arquitectura de Diseño (Frontend)

El Frontend (React + Vite) actúa como un **consumidor independiente** de la API REST (Patrón Headless).

### 3.1 Sistema de Diseño
*   CSS Vanilla modularizado con variables CSS (`variables.css`). Cero dependencia de Bootstrap.
*   Tipografía: Inter (única cargada en `index.html`; los verticales que pidan otra fuente tienen que agregarla ahí, o el `font-family` no aplica).
*   Glassmorphism, animaciones con curvas de resorte (`cubic-bezier`), modo oscuro premium.

### 3.2 Temas Multi-Verticales
El diseño muta dinámicamente con el atributo `[data-vertical]` (= `org.type` en minúscula):
*   **GYM:** Azul eléctrico, glassmorphism, gradientes. Es el default de `:root`.
*   **PILATES / CLUB / ACADEMY:** Familia fitness — teal, indigo y violeta sobre el mismo layout.
*   **KIOSCO:** Turquesa, layout de mostrador/punto de venta.
*   La paleta completa vive en `variables.css`; el `accent` para usos en JS, en `lib/verticals.js`.
    **Los dos tienen que moverse juntos** (el registry es la fuente única de los metadatos).

---

## 🏗️ 4. Diseño Detallado (Planos Micro)

### 4.1 Modelo de Dominio Core (ERD)
La base es la entidad `Tenant` (con su `business_type`: ver el enum `BusinessType`). De ella cuelgan:
*   `AppUser` (usuario del sistema).
*   `UserRole` (OWNER, ADMIN, STAFF).
*   `Subscription` (estado de pago con MercadoPago).

**Regla:** Nada existe fuera de un Tenant.

### 4.2 Patrón DTO
Está **terminantemente prohibido** devolver entidades `@Entity` al frontend. Se usarán clases `...DTO` mapeadas con **MapStruct**.

### 4.3 Seguridad (Flujo JWT completo)
1. Usuario hace Login desde React.
2. Java verifica credenciales y emite un JWT con: `sub`, `tenant_id`, `role`, `vertical`.
3. Cada petición pasa por un `OncePerRequestFilter` que activa el filtro de Hibernate.

### 4.4 Excepciones Globales
`@ControllerAdvice` atrapa cualquier error y lo devuelve como JSON estandarizado (RFC 7807). React nunca recibe HTML roto.

---

## 🛡️ 5. Arquitectura "A Prueba de Juniors" (Escalabilidad)

Para garantizar que añadir un módulo nuevo sea tan sencillo que un Junior pueda hacerlo sin romper nada:

1.  **ArchUnit (Tests de Arquitectura):** Reglas compiladas que impiden que `gym` importe clases de `kiosk` (y al revés). Si alguien lo intenta, **el proyecto no compila**.
2.  **Spring Events (Desacoplamiento):** Los módulos no se llaman entre sí directamente. Emiten eventos (`MemberJoinedEvent`) y los interesados los escuchan. Si un módulo falla, los demás sobreviven.
3.  **Fachadas Internas:** Si un módulo necesita datos de otro, lo hace a través de una interfaz pública (`CoreFacade`), nunca accediendo a sus repositorios directamente.

---

## 🗺️ 6. Plan Maestro de Implementación

**Estrategia: Greenfield + ETL.** Construimos desde cero y al final inyectamos los datos de los clientes actuales.

| Fase | Semanas | Objetivo |
|---|---|---|
| **1. Preparación** | 1 | Entorno listo: Spring Boot, React (Vite), Supabase en blanco. |
| **2. El Cerebro** | 2–4 | Entidades Core (`Tenant`, `AppUser`), Spring Security, API REST Core. |
| **3. La Nueva Cara** | 5–8 | Frontend React Premium conectado a la API de Java. |
| **4. Verticales** | 9–11 | Módulos aislados: Gym y Kiosco (+ `fiscal` compartido). |
| **5. ETL + Staging** | 12 | Script Java que migra datos de Supabase V1 → Supabase V2. Pruebas. |
| **6. Lanzamiento** | 13 | DNS apunta al sistema nuevo. Se apaga el viejo. |

---

## 🧠 7. Mandamientos del Arquitecto (Gustavo)

1.  **Piensa, luego programa.** La planificación importa más que la velocidad de escritura.
2.  **Escalabilidad a prueba de balas.** Siempre programar pensando: *"¿Qué pasa si mañana conecto una Ferretería?"*.
3.  **Aislamiento Paranoico.** Un Tenant jamás debe rozar los datos de otro Tenant.
4.  **Separación de Responsabilidades.** Backend computa y valida. Frontend dibuja y gestiona estado visual. Nunca mezclar.
5.  **Base de Datos en Supabase.** PostgreSQL alojado en Supabase (no local, no pgAdmin). Supabase se usa exclusivamente como proveedor de PostgreSQL en la nube.
