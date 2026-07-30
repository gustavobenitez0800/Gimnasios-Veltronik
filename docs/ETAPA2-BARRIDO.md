# Etapa 2 — Barrido de limpieza módulo por módulo

> **Objetivo:** que cualquier junior entienda el código a nivel arquitectura e ingeniería.
> Bajo acoplamiento, alta cohesión, cero código muerto, comentarios que digan la verdad.
> **Método:** un módulo por sesión, con CI verde al final de cada uno. Nada de big-bang.
>
> Estado al 2026-07-20. La Etapa 1 (baja Fútbol 5 + fixes de clientes) ya está commiteada
> en `feat/etapa1-limpieza-baja-futbol5`.

## Diagnóstico inicial (medido, no intuido)

| Frente | Hallazgo | Gravedad |
|---|---|---|
| ESLint frontend | **42 warnings, 0 errores** en 22 archivos | Media — la mayoría son reglas nuevas de React 19 |
| `console.log` sueltos | **0** (solo el logger sancionado de `lib/utils.js`) | ✅ limpio |
| Dependencias muertas | `mercadopago` (SDK Node, 0 imports) — **ya eliminada** | ✅ resuelto |
| Backend `@Value` en campos | 21 usos en 10 clases (inyección legacy; la regla ArchUnit los tolera "por ahora") | Baja — deuda declarada |
| Backend tests | 174 verdes, ArchUnit vigila los límites de módulos | ✅ sano |

### Los 42 warnings de ESLint, por regla

| Regla | Cant. | Qué significa | Riesgo real |
|---|---|---|---|
| `react-hooks/set-state-in-effect` | 22 | setState sincrónico dentro de un effect → renders en cascada | El más importante: revisar caso por caso (algunos son inicializaciones legítimas, otros son doble-render evitable) |
| `react-hooks/exhaustive-deps` | 9 | dependencias faltantes/sobrantes en hooks | Puede esconder bugs de datos viejos |
| `react-hooks/immutability` | 5 | mutación de valores que React asume inmutables | Revisar |
| `react-hooks/refs` | 2 | escribir `ref.current` durante el render (patrón "latest ref" en `CardCheckout`) | Bajo, pero conviene mover a `useEffect` |
| `react-refresh/only-export-components` | 4 | archivos que exportan componente + otra cosa (rompe HMR fino) | Cosmético |

Archivos afectados (22): `CardCheckout`, `ForceUpdateOverlay`, `UpdateIndicator`,
`AuthContext`, `ThemeContext`, `ToastContext`, `useDashboardController`, `useDataLoader`,
`AccessPage`, `KioskCash/Customers/Dashboard/Fiscal/Inventory/Products/Suppliers`,
`LobbyPage`, `MissionControlPage`, `PaymentsPage`, `PlaceholderPages`, `PosPage`, `SettingsPage`.

> El diagnóstico miró `src/pages`, `src/components`, `src/lib`, `src/hooks` y `src/contexts`,
> pero **se olvidó de `src/controllers`, `src/services` y `src/models`** — donde después
> aparecieron un archivo entero muerto y cinco exports sin llamadores. Cada tanda barre la
> capa de datos de sus páginas, no solo el JSX.

## Plan del barrido (orden y criterio)

Cada módulo se limpia en una sesión propia, con este checklist:
1. **Código muerto afuera** (métodos sin llamadores, imports sin uso, ramas imposibles).
2. **Comentarios que dicen la verdad** (ni fantasmas ni obviedades; el "por qué", no el "qué").
3. **Nombres nivel junior** (si hay que explicarlo en el chat, el nombre está mal).
4. **Tests obsoletos afuera junto con su código**; los vigentes se mantienen verdes.
5. **Warnings de lint del módulo a cero** (caso por caso, sin silenciar a ciegas).

| # | Módulo | Alcance | Notas |
|---|---|---|---|
| ✅ 2.1 | `frontend/src/lib` + `hooks` + `contexts` | **HECHA (2026-07-27)** | 3 archivos muertos afuera (`useDataLoader`, `useFilteredData`, `themeManager`), fix de captura de `logout` en AuthContext, regla react-refresh apagada para contexts (patrón idiomático), lint del scope en 0 |
| ✅ 2.2 | `frontend` componentes compartidos | **HECHA (2026-07-27)** | `ForceUpdateOverlay` estaba importado pero JAMÁS renderizado (mecanismo pre-anillos) → borrado con sus ~234 líneas de CSS; CardCheckout con refs en effect + reset en el handler `retry`; UpdateIndicator con versión web como estado inicial; lint del scope en 0. `ui/` completo verificado vivo |
| ✅ 2.3 | `frontend` páginas gym + su capa de datos | **HECHA (2026-07-27)** | Members/Payments/Classes/Access/Retention/Reports + PaymentCallback, sus 3 controllers, MemberService/PaymentService y `models/`. Detalle abajo |
| 2.4 | `frontend` páginas kiosco | POS + 8 páginas Kiosk* | El grueso de los warnings (7 archivos). **Acá se decide el patrón `fetch-on-mount`** (ver abajo) |
| 2.5 | `frontend` páginas de plataforma | Lobby, Dashboard, Team, Settings, MissionControl, auth (Login/Register/Reset/Onboarding/Blocked/Plans) | **Faltaban en el mapa original.** Settings (40 KB) y Lobby (31 KB) son los dos monstruos |
| 2.6 | `backend/core` | El módulo más grande y crítico | Migrar los 21 `@Value` a constructor donde tenga sentido; después endurecer la regla ArchUnit |
| 2.7 | `backend/gym` + `kiosk` + `fiscal` | Verticales | Ya salieron bastante limpios del diagnóstico |
| 2.8 | Raíz y build | `electron-builder.yml` (excludes muertos: `api/`, `vercel.json`), scripts, docs | Micro |

## Ya hecho

**2026-07-20 (diagnóstico):**
- [x] Diagnóstico completo (lint, console.log, depcheck, @Value).
- [x] `mercadopago` (SDK Node sin uso) desinstalado — build verificado.
- [x] Este mapa.

**2026-07-27 (tanda 2.1 — lib/hooks/contexts):**
- [x] Código muerto: `hooks/useDataLoader.js`, `hooks/useFilteredData.js` (solo el barrel
      los re-exportaba) y `lib/themeManager.js` (white-label sin ningún importador) — afuera.
- [x] `AuthContext`: `logout` declarado antes del effect que lo registra como handler
      (el listener capturaba una referencia sin inicializar del primer render).
- [x] `react-refresh/only-export-components` apagada SOLO para `src/contexts/**` con
      justificación en la config (Provider + hook juntos = patrón idiomático de React).
- [x] Verificado que `lib/api.js` NO es legacy: sus 3 endpoints existen en `BillingController`.
- [x] Scan de exports muertos en lib/hooks: cero hallazgos restantes.
- [x] Lint del scope: 6 warnings → **0**. Build + boot en preview verificados.

**2026-07-27 (tanda 2.2 — components):**
- [x] **`ForceUpdateOverlay.jsx` era código muerto**: App.jsx lo importaba pero nunca lo
      renderizaba (era el force-update pre-anillos que consultaba GitHub directo; lo
      reemplazó electron-updater + rollout por anillos, ADR-007). Borrado el componente,
      el import y ~234 líneas de CSS huérfano en onboarding.css.
- [x] `CardCheckout`: refs "latest" sincronizadas en un effect (no durante el render) y
      reset de estado movido al handler `retry` (donde corresponde) — sin silenciamientos.
- [x] `UpdateIndicator`: la versión web nace como estado inicial lazy (ya se conoce en
      build-time), el effect queda solo para el camino async de Electron.
- [x] `components/ui/` completo verificado vivo (Badge/DataTable/DaySelector/FilterBar/
      FormField/Modal/Pagination/StatCard: 4-51 usos cada uno). ErrorBoundary y Sidebar
      vivos (imports relativos que el primer scan no veía).
- [x] Lint del scope: 6 warnings → **0**. Build + boot en preview verificados.

**2026-07-27 (tanda 2.3 — páginas gym + su capa de datos):**
- [x] **Bug latente: `ReportsPage` renderizaba `<RestaurantReportsPage />`, un componente que
      NO EXISTE** (nadie lo importa ni lo define). Cualquier org con `type === 'RESTO'` se
      comía una pantalla en blanco. No lo cazaba el lint porque `no-undef` no mira dentro del
      JSX sin `eslint-plugin-react`. La rama salió afuera: `BusinessType` (backend) solo tiene
      `GYM` y `KIOSCO`, así que era código inalcanzable además de roto.
- [x] **Código muerto afuera**: `models/Member.js` completo (clase con 4 métodos de negocio
      que nadie llamaba; el controller la usaba de bolsa de datos) → el controller devuelve
      objetos planos y el directorio `models/` desapareció; `currentMember` + `prepareCreate`
      + `prepareEdit` del controller de socios; el estado `error` de los 3 controllers (lo
      seteaban, ninguna página lo leía); `PaymentService.getByFilters` (0 llamadores);
      `memberSearchRef` en Pagos (un ref que solo se asignaba); el import sin usar de
      `StatCard` en Acceso; `.payments-modal` en members.css.
- [x] **`MemberPortalPage` borrada**: era un "próximamente" al que no llegaba ningún link
      (ni sidebar, ni botón); solo se llegaba escribiendo `#/member-portal` a mano. Se fue
      con su ruta, su `CONFIG.ROUTES.MEMBER_PORTAL` y su entrada en `NO_ORG_ROUTES`.
- [x] **`PlaceholderPages.jsx` → `PaymentCallbackPage.jsx`**: el nombre mentía (adentro vivía
      el flujo completo de vuelta de Mercado Pago). Además: los handlers ahora se declaran
      ANTES del efecto que los usa (4 warnings de `immutability` a cero), `cleanup` pasó a
      llamarse `stopProgress` (es lo que hace) y murió `getPostPaymentRedirect()`, una función
      cuyo comentario explicaba que no podía hacer lo que su nombre prometía.
- [x] **Un solo nombre por operación**: `MemberService` tenía `getAll`/`getAllMembers` y
      `update`/`updateMember` — dos nombres para la misma llamada, cada uno usado por páginas
      distintas. Quedan `getAllMembers` y `updateMember`.
- [x] **Fuente única de labels**: el mapa `{GYM:'gimnasio', PILATES:'estudio', …}` estaba
      copiado a mano en Acceso, Ajustes y Planes —**y con la clave `KIOSK` en vez de
      `KIOSCO`, así que un kiosco leía "negocio"**—. Ahora sale de `placeLabel` en
      `lib/verticals.js`. Lo mismo con Socios/Alumnos (`membersLabel`/`memberLabel` nuevo),
      que Dashboard y Socios deducían con un `if` sobre PILATES/ACADEMY.
- [x] **Modales de Clases** al componente `Modal` compartido (los tenía escritos a mano,
      overlay y header incluidos, mientras Socios y Pagos ya usaban el común).
- [x] **`useModal(form, initiallyOpen)`**: el deep-link `?action=new` (atajos del Dashboard y
      el "Cobrar cuota" de Socios) abría el modal desde un efecto, con un `ref` de guardia y
      un `eslint-disable` a ciegas. Ahora se decide en el primer render. En Pagos, además, el
      form inicial se congela al montar: recalcularlo en cada render le cambiaba la identidad
      a los callbacks del hook, que era la razón por la que las deps no podían ser honestas.
- [x] **Bug de carrera arreglado** en la búsqueda de socios del modal de Pagos: una respuesta
      vieja que llegaba tarde pisaba a la búsqueda nueva.
- [x] Encabezados de archivo: `(Refactored)`, `(Optimized & Cached)`, `(Refactored for Scale
      & Cache)` reemplazados por dos líneas que dicen qué hace la página.
- [x] Lint del scope: 8 warnings → **2**, y los 2 que quedan son el patrón compartido de abajo
      (Acceso y PaymentCallback). Ojo con el de PaymentCallback: al declarar los handlers antes
      del efecto, el analizador **pasó a poder rastrearlos** y cambió 4 avisos de `immutability`
      por 1 de `set-state-in-effect`. Es el mismo aviso que el resto, no uno nuevo.
      Build verde y las 6 páginas verificadas renderizando en el navegador (incluidos los
      modales por deep-link y el flujo de pago rechazado).

## Decisiones abiertas (para las tandas que vienen)

**1. `react-hooks/set-state-in-effect` es UN patrón, no 13 bugs.** Los 20 warnings que quedan
salen casi todos de la misma línea repetida: `useEffect(() => { cargarDatos(); }, [cargarDatos])`
(Acceso, las 8 del kiosco, Lobby, MissionControl, POS, Ajustes). No es un error: es "traer
datos al montar". Se decide UNA vez, en 2.4, y se aplica a todos:
  - (a) unificar en `useQueryCache` (ya existe y ya lo usa Retención), o
  - (b) aceptar el patrón y apagar la regla con justificación, como se hizo con
    `react-refresh` en `contexts/**`.
  Arreglarlo página por página garantiza 13 soluciones distintas para el mismo problema.

**2. Verticales fantasma RESTO y SALON → ~~abierta~~ RESUELTA: baja total** (ver abajo).

## Baja de los verticales fantasma RESTO y SALON (2026-07-27)

Decisión del dueño, misma que con Fútbol 5 en la Etapa 1. **No hubo migración Flyway ni riesgo
de datos**: a diferencia de Fútbol 5, estos dos nunca existieron en el enum `BusinessType`, así
que ningún negocio pudo tener ese tipo jamás. Era andamio puro, y andamio *roto*: los dos menús
apuntaban a rutas que no existen en `CONFIG.ROUTES` (`TABLES`, `MENU`, `KITCHEN`, `SALON_*`) →
`<NavLink to={undefined}>`.

- [x] `lib/verticals.js`: entradas `RESTO` y `SALON` + `RESTO_NAV` + `SALON_NAV` (69 líneas de
      navegación inalcanzable). `NAV_BY_ID` queda con `KIOSCO` y un comentario que explica que
      el que no está ahí usa la del gym.
- [x] CSS: `styles/restaurant.css` entero (nunca lo pisó un cliente) y su `@import`; los bloques
      `[data-vertical="salon"|"resto"]` de `variables.css` (paletas + overrides de modo claro),
      `layout.css` (sidebar flotante y layout espejado para zurdos), `pages.css` y `responsive.css`.
      Los verticales que quedan se renumeraron 1..5. **Bundle CSS: 111,75 KB → 102,60 KB (−8%).**
- [x] **Dos fuentes que sí se estaban bajando de Google**: Playfair Display y Quicksand vivían en
      el `@import` de `variables.css` y solo las usaban Salón y Restaurante. Afuera, con un
      comentario que ata cada familia a su `font-family` para que no vuelva a pasar.
- [x] Íconos huérfanos de `Icon.jsx`: `scissors`, `utensils`, `grid`, `clipboard`, `fire` (0 usos
      fuera de los menús borrados). Sobrevivieron `list` y `package`, que usa el kiosco.
- [x] **Tercera aparición del bug `KIOSK`/`KIOSCO`**: `SettingsPage` armaba el nombre del plan con
      `{GYM:…, RESTO:…, KIOSK:…}` → un kiosco leía "Veltronik Business" en vez de "Veltronik
      Kiosco". Corregido junto con la baja de la clave `RESTO`.
- [x] Comentarios que mentían: `Tenant.java` decía `/** Tipo de vertical: GYM, SALON, RESTAURANT,
      OTHER */` (el enum tiene GYM y KIOSCO), `OrgTypeGuard` ponía `['RESTO']` de ejemplo, y el
      `<meta name="description">` de `index.html` le vendía "mesas, pedidos" a Google.
- [x] `VELTRONIK_CODEX.md`: el árbol de paquetes listaba `salon/` y `restaurant/` (que nunca
      existieron) y omitía `kiosk/` y `fiscal/` (que sí); los temas por vertical y el ERD hablaban
      de SALON/RESTO. Se agregó una **regla de honestidad** al documento: solo se describen
      verticales que existen en el código; lo demás va al roadmap.

Lo que **no** se tocó, a propósito: los javadoc de `core` que usan "Gym, Salon, Resto, Ferretería"
como ejemplos de extensibilidad (ilustran el patrón, no prometen un módulo) y los guardas de
ArchUnit sobre `..salon..`/`..restaurant..` (son preventivos para paquetes que no existen y su
propio comentario lo aclara).

## Reglas del juego (no cambian)

- Migraciones Flyway: **jamás** tocar una aplicada. Solo hacia adelante.
- Un vertical nunca importa de otro; `core` no depende de nadie (ArchUnit lo vigila).
- Sin verde en CI no hay merge.
- "Limpio no es el proyecto que se limpia, es el que no se puede ensuciar":
  cada limpieza que se pueda convertir en regla automática (lint/ArchUnit), se convierte.
