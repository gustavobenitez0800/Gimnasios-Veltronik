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
| ✅ 2.4 | `frontend` páginas kiosco | **HECHA (2026-07-27)** | POS + 8 páginas Kiosk* + KioskService. Se resolvió el patrón `fetch-on-mount`. Detalle abajo |
| ✅ 2.5 | `frontend` páginas de plataforma | **HECHA (2026-07-27)** | Lobby, Dashboard, Settings, Team, MissionControl, auth + `useDashboardController`. **Lint del frontend en CERO.** Detalle abajo |
| ✅ 2.6 | `backend/core` | **HECHA (2026-07-27)** | `@Value` en campo migrado a constructor y **regla de ArchUnit encendida**. 178 tests verdes. Detalle abajo |
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

**2026-07-27 (tanda 2.4 — páginas kiosco + su capa de datos):**
- [x] **Resuelta la decisión del `fetch-on-mount`** (ver abajo): la regla se apagó con
      fundamento y el patrón quedó en un solo lugar. Lint del proyecto: 24 → **7**, y los 7
      que quedan son todos de `useDashboardController` (tanda 2.5).
- [x] **`hooks/useLoadOnMount.js` nuevo**: seis páginas tenían el MISMO `useCallback` +
      `try/catch/finally` + `useEffect`, cambiando solo el texto del error. Ahora es una
      línea por página. El hook se queda con el `loading` y el aviso de error; los datos
      siguen siendo de la página (varias piden tres cosas en paralelo y las reparten en tres
      estados). Usa "latest ref" para que la función de carga no necesite `useCallback`:
      así no hay forma de olvidarse y colgar la app en un bucle de fetch.
- [x] **`lib/kioskFormat.js` nuevo**: `fmtMoney` estaba escrita SEIS veces y en **tres
      variantes distintas** (una devolvía `$0` para un valor vacío, otra `—`, otra `—`
      también para string vacío); `fmtQty`, `fmtDateTime` y `fmtDate` estaban dos veces cada
      una. Todo eso es ahora `money`/`qty`/`date`/`dateTime`/`time`.
- [x] **Bug de visualización arreglado**: los medios de pago vivían en dos listas separadas
      —el POS tenía cinco y la Caja un mapa de cuatro—, así que una venta fiada aparecía como
      `CUENTA_CORRIENTE` crudo en la tabla de ventas del día. Ahora salen de `PAYMENT_METHODS`
      + `paymentLabel()`, que es una sola lista.
- [x] **Bug de zona horaria arreglado** (el mismo que ya había mordido en los pagos del
      gimnasio): la fecha por defecto de una compra usaba `toISOString()`, que convierte a UTC
      primero → **una compra registrada después de las 21:00 quedaba fechada mañana**. Ahora
      hay un solo `toLocalDateString()` en `lib/utils` y lo usan las cuatro pantallas que
      necesitan "hoy" (Proveedores, los dos Reportes y Pagos, donde de paso apareció la misma
      falla en "marcar como pagado", que la tanda 2.3 no había visto).
- [x] **`lib/reportExport.js` nuevo**: `downloadExcel` era idéntica en Reportes del gimnasio y
      del kiosco, y `downloadPDF` solo cambiaba el color del encabezado. Una sola copia.
- [x] **Código muerto afuera**: 6 métodos de `KioskService` sin un solo llamador
      (`getActiveCategories`, `updateCategory`, `getCustomersWithDebt`, `getProductMovements`,
      `getActiveSuppliers`, `getSale`). Los invitaba el propio comentario de la clase, que
      prometía "mapear 1:1 los endpoints del backend": se corrigió a "acá vive solo lo que
      alguna pantalla usa; el catálogo de endpoints es el backend".
- [x] `PosPage`: el contador de ventas en cola nace leyendo la cola (estado inicial lazy) en vez
      de setearse desde un efecto — si quedaron ventas sin enviar, el aviso está en el primer
      render. `KioskDashboard`: dos KPIs se llamaban igual ("Ventas del mes", uno con plata y
      otro con la cantidad); el segundo pasó a "Cantidad de ventas".
- [x] Verificado en el navegador: las 9 páginas del kiosco montan sin errores, y el hook nuevo
      probado en sus dos caminos — con datos (2 renders, sin cascada) y con el backend caído
      (libera el spinner y muestra el mensaje del backend por sobre el genérico).

**2026-07-27 (tanda 2.5 — páginas de plataforma):**
- [x] **Lint del frontend: 7 → CERO.** Los 7 eran el mismo problema real en
      `useDashboardController`: `data?.membersData || []` creaba un array NUEVO en cada render
      mientras los datos no estaban, y como los cinco `useMemo` de insights dependen de esas
      listas, ninguno memorizaba: los cinco cálculos se rehacían en cada render. Se arregla con
      una constante `EMPTY` compartida (la regla tenía razón).
- [x] **`services/storageService.js` borrado entero**: subía archivos a ninguna parte —devolvía
      una URL de `dummyimage.com` y avisaba por consola "temporarily disabled during Java
      migration"— y no lo llamaba nadie.
- [x] **Dos secciones de UI inalcanzables en Ajustes**: `payerEmail` y `billingHistory` se
      declaraban, nunca se llenaban y se guardaban en el estado igual, así que el "Email de
      pago" y todo el bloque "Historial de Facturación" (24 líneas) no se dibujaban nunca.
      **Y escondían un bug**: el texto que explica los botones "Cambiar Tarjeta" y "Verificar
      Estado con MP" estaba condicionado a `payerEmail` —siempre vacío—, así que ningún cliente
      con suscripción lo vio jamás. Ahora se muestra con los botones.
- [x] `GroupService`: 4 métodos de escritura sin llamadores afuera. **Hallazgo para decidir**:
      la feature está a medio terminar — el backend la tiene completa (V18 + `TenantGroupController`)
      pero no hay ninguna pantalla para crear un grupo, así que `getMyGroups()` devuelve vacío
      para todo el mundo y el agrupado del Lobby no se dibuja nunca. Queda anotado en el propio
      servicio; construir esa UI es una feature, no limpieza.
- [x] Lobby: un `try/catch` que se asignaba a sí mismo el mismo valor con el comentario
      "Stubbed payerEmail logic"; y la card "Crear Negocio", duplicada, donde **una de las dos
      copias le decía "Registrá un nuevo gimnasio" a un dueño de kiosco**.
- [x] **Barrido global de exports muertos en todo `src`** (no solo el scope de la tanda): 5
      funciones borradas (`logWarn`, `escapeHtml`, `safeJsonParse`, `getLocalTenantId`,
      `getQueuedSales`) y 4 que se usaban solo puertas adentro dejaron de exportarse
      (`VERTICALS`, `DEFAULT_VERTICAL`, `LoadingScreen`, `getLocalToken`). Ojo: la tanda 2.1
      había anotado "scan de exports muertos: cero hallazgos" — **su scan era más flojo que
      este**, que compara cada export contra todos los archivos que no sean el propio.
      Dejar de exportar `VERTICALS` además cierra la puerta a `VERTICALS[type]` suelto, que es
      la línea que rompe cuando llega un tipo inesperado (`getVertical()` nunca devuelve undefined).
- [x] Verificado en el navegador: las 12 páginas de plataforma montan sin errores.

**2026-07-27 (tanda 2.6 — backend/core):**
- [x] **La regla primero, la limpieza después.** El objetivo era migrar los `@Value` en campo a
      constructor y recién ahí endurecer ArchUnit. Salió mejor al revés: al encender la regla
      **encontró dos campos que ningún `grep` había visto**, porque estaban escritos con el nombre
      largo (`@org.springframework.beans.factory.annotation.Value`). Moraleja para las tandas que
      quedan: la regla automática no es el premio por limpiar, es la herramienta para encontrar.
- [x] **El precio del sistema estaba escrito en CUATRO clases**, cada una con su propio valor por
      defecto (`PublicConfigController`, `BillingService`, `MercadoPagoService` y
      `SubscriptionBillingService`), y la URL del frontend en dos. Cambiar el precio obligaba a
      acordarse de los cuatro; el que se olvidara quedaba **cobrando distinto de lo que la app le
      muestra al cliente**. Ahora hay `BillingProperties` y `MercadoPagoProperties`: un bean por
      concepto, el default una sola vez, y todos los demás lo piden por constructor.
- [x] **Bug de cobro encontrado de paso** (el tercero de la serie): la URL a la que Mercado Pago
      devuelve al cliente después de pagar se armaba como `frontendUrl + "/payment-callback"`,
      **sin el `#`** que necesita el HashRouter del frontend — y apuntando a un dominio
      (`veltronik.com`) que no es el de la app, porque la propiedad `cors.frontend-url` **no está
      definida en ningún lado** y caía siempre en el default del código. El cliente pagaba, MP lo
      devolvía a una URL que la app no resuelve, no veía la pantalla de "pago confirmado" y volvía
      a intentar el pago. Ahora la arma `BillingProperties.paymentCallbackUrl()` (con `#`, mismo
      formato que ya usaba el mail de recuperar contraseña) y la base sale de una cadena de
      respaldo: `cors.frontend-url` → `FRONTEND_URL` → la URL pública real. **Tiene un test propio**
      para que no vuelva a romperse en silencio.
- [x] `SecurityConfig` pasó a constructor explícito (Lombok no sabe ponerle `@Value` a los
      parámetros que genera) y se documentó por qué.
- [x] Los tests dejaron de necesitar `ReflectionTestUtils.setField` para armar el `WebhookController`:
      con la config en el constructor, se construye como cualquier objeto.
- [x] **178 tests verdes** (174 + 4 nuevos: la regla de ArchUnit y los 3 de la URL de vuelta).

## Decisiones tomadas

**1. `react-hooks/set-state-in-effect`: APAGADA, con fundamento (tanda 2.4).**
La regla no distingue un `setState` sincrónico de uno que corre DESPUÉS de un `await`.
Comprobado con dos casos mínimos, mismo comportamiento en runtime:

```js
useEffect(() => { load(); }, [load]);          // load async, setState post-await → LA MARCA
useEffect(() => { (async () => { … })(); });   // el mismo código, inline         → no la marca
```

Solo cambia la sintaxis. Antes de apagarla se auditaron **los 15 avisos uno por uno**: 11 eran
de esa forma (falsos positivos) y los 4 sincrónicos de verdad se corrigieron (estado inicial
lazy en el POS) o son deliberados (el spinner del reintento del dashboard, el flujo de
PaymentCallback). Lo que compra el cambio: el patrón vive en `useLoadOnMount` y se revisa en un
solo archivo. Lo que cuesta: si mañana alguien escribe un `setState` sincrónico de verdad, el
lint no lo va a cantar. Se aceptó a cambio de que el patrón esté centralizado. La justificación
completa está en `eslint.config.js`, al lado de la regla.

**2. Verticales fantasma RESTO y SALON → RESUELTA: baja total** (ver abajo).

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
