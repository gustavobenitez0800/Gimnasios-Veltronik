# ⚽ VERTICAL FÚTBOL 5 — Especificación Técnica Pulida
**Veltronik V2 — v1.0 (validada contra el código real, 2026-06-10)**

> **ESTADO (2026-06-10): FASE 1 IMPLEMENTADA** ✅ — módulo `courts` completo en backend
> (entities/repos/services/controllers + migración V20 + cron expiración + materialización
> de turnos fijos) y frontend (grilla drag & drop, canchas+precios, clientes, turnos fijos,
> onboarding/sidebar/tema). Compila, 50/50 tests verdes, build OK. La V20 se aplica sola
> (Flyway) en el próximo deploy. Siguiente: **Fase 1.5 — Señas MP** (§4).

> Complementa al [VELTRONIK_CODEX.md](VELTRONIK_CODEX.md). Esta spec parte de la propuesta
> original de Fútbol 5 y la ajusta a lo que el código de producción realmente tiene hoy
> (core + gym, V19 de Flyway, MP solo con Preapproval, clientes EN VIVO).

---

## ✅ 1. Decisiones de Arquitectura (validadas y pulidas)

### 1.1 Tenant separado por deporte — CONFIRMADO
La decisión original es correcta y encaja sin fricción con el sistema actual:
- El Lobby ya soporta N tenants por usuario (`TenantMembership`).
- `TenantGroup` (V18) ya existe para agrupar "Complejo Norte - Fútbol" + "Complejo Norte - Pádel".
- La sucursal adicional ya nace sin trial y bloqueada hasta pagar (`SetupController`): la doble
  facturación funciona sola.

### 1.2 Módulo Java: `courts` (genérico), NO `futbol5` — AJUSTE CLAVE
La propuesta decía "se agrega `BusinessType.FUTBOL_5`". Correcto, pero el **paquete** debe ser
genérico. La diferencia entre Fútbol 5 y Pádel es **configuración, no código**: duración del
slot, jerga del bot, inventario. Precedente en el propio repo: el módulo `gym` ya sirve a
GYM / PILATES / CLUB / ACADEMY con solo cambiar labels en el front (`Sidebar.jsx → getGymNav`).

```text
com.veltronik.v2.courts        ← UN solo módulo de código
├── entities/    Court, CourtBooking, CourtCustomer, CourtPriceRule, CourtSettings
├── repositories/
├── services/
└── controllers/
```

- Tablas con prefijo `court_*`. Migración **V20**.
- `BusinessType.FUTBOL_5` hoy; `PADEL` mañana → mismo módulo, otro tenant, otra config.
- La separación de tenants por deporte se mantiene al 100%: es separación de **datos y UX**,
  no de código. Cumple el Mandamiento #2 ("¿Qué pasa si mañana conecto una Ferretería?").

### 1.3 Duración de slot configurable por tenant — AJUSTE
`CourtSettings.slot_duration_minutes` (default **60** para F5). Costo marginal cero hoy;
Pádel (90 min) sale gratis después. La grilla React renderiza según esta config.

---

## 🗄️ 2. Modelo de Datos (Migración V20)

Todas las entidades heredan de `TenantAwareEntity` (aislamiento paranoico automático).

| Entidad | Campos clave | Notas |
|---|---|---|
| `Court` | name, surface (SINTETICO/CESPED/CEMENTO), covered (bool), active, display_order | "Cancha 1 techada" |
| `CourtCustomer` | full_name, **phone (normalizado E.164)**, notes, no_show_count | El teléfono es LA identidad: en Fase 3 el bot de WhatsApp matchea por teléfono. Capturarlo desde el día 1 |
| `CourtBooking` | court_id, customer_id, start_at, end_at, status, total_price, deposit_amount, deposit_paid_at, mp_payment_id, expires_at, recurring_id, notes | Ver máquina de estados §3 |
| `CourtRecurringBooking` | court_id, customer_id, day_of_week, start_time, active, valid_from/until | **Turno fijo** ("los lunes 21hs la tiene Juan"). Un job materializa las próximas N semanas |
| `CourtPriceRule` | court_id (null = todas), day_of_week (null = todos), time_from, time_to, price | Franja nocturna ≠ tarde, finde ≠ semana |
| `CourtSettings` | slot_duration_minutes (60), opening_time, closing_time, deposit_amount, deposit_timeout_minutes (15) | 1 fila por tenant |

### 🔒 Regla anti doble-reserva (OBLIGATORIA en V20, día 1)
La defensa contra dos clientes pidiendo el mismo slot a la vez (crítico cuando llegue el bot)
es de **base de datos**, no de código:

```sql
CREATE UNIQUE INDEX ux_court_booking_slot
  ON court_booking (court_id, start_at)
  WHERE status NOT IN ('CANCELLED', 'EXPIRED');
```

Si dos requests compiten, uno recibe constraint violation → el service lo traduce a
"Ese horario se acaba de ocupar" (409). Sin race conditions posibles.

---

## 🚦 3. Máquina de Estados del Turno (desde Fase 1)

```text
PENDING_DEPOSIT ──pago MP (webhook)──► CONFIRMED ──jugaron──► COMPLETED
      │                                    │
      │ expires_at vencido (cron)          ├──► CANCELLED (devolución manual de seña, criterio del dueño)
      ▼                                    └──► NO_SHOW   (incrementa no_show_count del cliente)
   EXPIRED (slot liberado)

MAINTENANCE: bloqueo del dueño (lluvia, arreglos, escuelita). Puede ser recurrente.
```

- `PENDING_DEPOSIT` nace con `expires_at = now + deposit_timeout_minutes`.
- **El cron de expiración va en Fase 1, no en Fase 3**: el patrón ya existe
  (`TenantSubscriptionJob`, `@Scheduled` con `zone = "America/Argentina/Buenos_Aires"`).
  Un `CourtBookingExpirationJob` cada 60s marca EXPIRED y libera el slot. El bot de la
  Fase 3 solo le agrega el mensaje de WhatsApp; el motor de urgencia ya estará vivo.
- Reserva manual del dueño en mostrador: puede nacer directo `CONFIRMED` (sin seña).

### Colores de grilla
🟩 Libre · 🟨 Esperando seña · 🟥 Señado/Confirmado · ⬛ Mantenimiento/Bloqueada
(como la propuesta original; en el rubro "rojo = ocupado" es la convención).

---

## 💰 4. Señas con Mercado Pago — ⚠️ DOS MINAS TÉCNICAS DETECTADAS

### Mina 1: lo que existe hoy NO sirve para señas
`MercadoPagoService` solo crea **Preapproval** (suscripción recurrente B2B de la plataforma).
La seña es un **pago único** → hay que agregar **Checkout Pro Preference** (código nuevo).
La integración MP genérica vive en `core`; la lógica de señas en `courts` (regla del Codex:
fachadas, nunca repos cruzados).

### Mina 2: colisión en el Webhook
`WebhookController.parseTenant()` asume que `external_reference` **es el UUID del tenant**
(suscripciones B2B). Las señas llegan por el MISMO endpoint con evento `payment`.
Sin cambio, cada seña loguearía "sin external_reference de tenant válido" y se perdería.

**Solución — namespace en external_reference:**
```text
Suscripción B2B (hoy):  external_reference = "<tenantId>"            (sin tocar)
Seña de turno (nuevo):  external_reference = "booking:<bookingId>"
```
En el webhook, ANTES de `parseTenant()`: si empieza con `booking:` → derivar a
`CourtDepositService.confirmDeposit(bookingId, mpPaymentId)` (idempotente por `mp_payment_id`,
mismo patrón que el billing actual).

### Flujo Fase 1.5 (sin bot — valor adelantado)
1. Dueño crea reserva → estado `PENDING_DEPOSIT`, botón **"Generar link de seña"**.
2. Backend crea Preference (monto = `deposit_amount`, `expires` = 15 min, external_reference
   namespaced) → dueño copia el link y lo pega en SU WhatsApp.
3. Cliente paga → webhook → `CONFIRMED` (grilla pasa a rojo en vivo).
4. No paga en 15 min → cron → `EXPIRED` → slot verde de nuevo.

El bot de Fase 3 **automatiza exactamente este flujo**, no lo inventa.

### Saldo del turno
La seña es pago parcial. `CourtBooking` lleva `total_price`, `deposit_amount` y los cobros de
mostrador (efectivo/transferencia) se registran al cerrar el turno. Sin esto, la "División de
Gastos" de la Fase 2 no tiene de dónde calcular:
`Total cancha − Seña + Cantina = Restan $X`.

---

## 🖥️ 5. Frontend — cambios exactos

| Archivo | Cambio |
|---|---|
| `BusinessType.java` | + `FUTBOL_5` (el mapper/SetupController lo aceptan solos al estar en el enum) |
| `frontend/src/lib/config.js` | + `ORG_TYPES.FUTBOL_5`, + `PRICES_BY_TYPE.FUTBOL_5: 80000`, + rutas `COURT_GRID`, `COURT_COURTS`, `COURT_CUSTOMERS`, `COURT_CANTINA` |
| `App.jsx` | Bloque `<OrgTypeGuard allowedTypes={['FUTBOL_5']}>` con las rutas nuevas (las rutas gym ya quedan excluidas automáticamente) |
| `Sidebar.jsx` | `FUTBOL_NAV`: Grilla · Clientes · Canchas · Cantina (F2) · Reportes · Equipo · Ajustes |
| `OnboardingPage.jsx` | Card "⚽ Cancha de Fútbol" con `enabled: true` |
| Tema `[data-vertical]` | FUTBOL: verde césped (el Codex define GYM azul, SALON rosa, RESTO naranja) |

**Páginas nuevas:** `CourtGridPage` (la grilla: columnas = canchas, filas = slots según
`slot_duration_minutes`, drag & drop entre canchas/horarios con validación server-side 409),
`CourtCustomersPage`, `CourtsPage` (CRUD + precios), `CantinaPage` (Fase 2).
Patrón existente: page + service + controller-hook + componentes `ui/`.

> Nota de higiene detectada: `Sidebar.jsx` tiene navs RESTO/SALON que referencian rutas
> inexistentes en `config.js` (`CONFIG.ROUTES.TABLES`, etc. → `undefined`). Son verticales
> fantasma; no bloquean, pero no copiarlos como referencia.

---

## 👦 6. Escuelitas — SIMPLIFICACIÓN (cero desarrollo)

La propuesta pedía `AcademyMember` + cuota mensual + check-in. **Eso ya existe**: es el
vertical gym con org type `ACADEMY` (alumnos, cuotas, acceso — todo operativo hoy).

Decisión pulida, coherente con el propio modelo "separados":
- **Fase 1:** la escuelita ocupa la grilla como bloqueo recurrente (`MAINTENANCE` con nota
  "Escuelita", lunes a viernes 17–19). Listo.
- Si el canchero quiere gestionar alumnos y cuotas: abre un **tenant ACADEMY** ($80k extra,
  refuerza el modelo de doble facturación). Cero código nuevo.

`AcademyMember` dentro de `courts` queda **descartado** (duplicaría al módulo gym).

---

## 🍻 7. Cantina / Tercer Tiempo (Fase 2 — sin cambios de fondo)

- `CourtProduct` (nombre, precio, stock, `is_loanable` para pecheras/pelotas).
- `CourtSale` asociada a un `CourtBooking` (o venta suelta).
- Préstamos: al cerrar el turno, alerta si hay items prestados sin devolver.
- Pantalla de cierre: total gigante con la división
  `Cancha − Seña + Cantina = Restan $X`.

---

## 🤖 8. Bot Futbolero (Fase 3 — sobre la API ya construida)

- WhatsApp Meta Cloud API + OpenAI con **function calling** contra endpoints que ya existirán:
  `getAvailability(date)`, `holdSlot(courtId, startAt, phone)` (crea `PENDING_DEPOSIT` —
  el unique index de §2 garantiza que dos chats no reserven lo mismo),
  `getDepositLink(bookingId)`.
- El cliente se identifica por **teléfono** → matchea/crea `CourtCustomer` (por eso el
  teléfono normalizado es obligatorio desde Fase 1).
- El timeout de 15 min ya corre desde Fase 1.5; el bot solo agrega el mensaje de liberación.
- System prompt con jerga F5 por tenant; cuando exista PADEL, otro prompt — misma infraestructura.

---

## 🗺️ 9. Fases Revisadas

| Fase | Contenido | Entregable |
|---|---|---|
| **1 — Motor + Grilla** | Enum `FUTBOL_5` · Migración V20 (con unique index parcial) · CRUD canchas/clientes/precios · Máquina de estados · **Turnos fijos recurrentes** · Bloqueos recurrentes · Cron expiración · Grilla React drag & drop · Onboarding/Sidebar/Guard/tema | El dueño opera la grilla manualmente |
| **1.5 — Señas MP** | Preference (pago único) · namespace `booking:` en webhook · botón "Generar link de seña" · registro de saldo en mostrador | El dueño cobra señas reales por WhatsApp manual |
| **2 — Cantina** | Productos + stock + préstamos + venta por turno + pantalla de división | Tercer tiempo facturado |
| **3 — Bot** | WhatsApp Cloud API + OpenAI function calling + prompt F5 | Reserva 100% autónoma 24/7 |

### Cambios vs. propuesta original
1. Módulo Java genérico `courts` (Pádel reutiliza todo) — la separación por tenant se mantiene.
2. **Turnos fijos** y **precios por franja** agregados a Fase 1 (faltaban; son lo primero que
   pide un canchero).
3. `CourtCustomer` con teléfono desde Fase 1 (sin esto el bot de Fase 3 nace sin identidad).
4. Máquina de estados + cron de expiración adelantados de Fase 3 → Fase 1.
5. Señas MP adelantadas a Fase 1.5 (link manual) — el bot después solo automatiza.
6. Webhook: namespace `booking:` obligatorio (mina detectada en `WebhookController`).
7. Unique index parcial anti doble-reserva desde la migración V20.
8. Escuelitas: descartado `AcademyMember`; se resuelve con bloqueos + tenant ACADEMY existente.
