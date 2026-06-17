# 🏪 VERTICAL KIOSCO / ALMACÉN — Especificación Técnica

**Veltronik V2 — v2.0 (blueprint con realidad argentina + facturación ARCA, 2026-06-15)**

> **ESTADO (2026-06-15): FASE 1 BACKEND IMPLEMENTADA** ✅ — módulo `kiosk` completo
> (8 entidades + enums, 6 repositorios, DTOs, `KioskMapper` MapStruct, 6 services, 6 controllers
> REST), migración **V23** (`V23__Init_Kiosk_Module.sql`), `BusinessType.KIOSCO`. Compila
> (BUILD SUCCESS) y 10 tests unitarios verdes (motor de ventas + caja). La V23 se aplica sola
> (Flyway) en el próximo deploy — es aditiva (solo CREATE de tablas `kiosk_*`, no toca nada
> existente). **Pendiente:** frontend (POS/productos/inventario/caja + onboarding/sidebar/tema/guard),
> Fase 2 (fiado/proveedores) y Fase 3 (módulo `fiscal` ARCA, V24).

> Complementa al [VELTRONIK_CODEX.md](VELTRONIK_CODEX.md) y replica el patrón probado en
> producción de `courts` ([VERTICAL_FUTBOL5.md](VERTICAL_FUTBOL5.md), v2.5.0). **v2.0** agrega
> dos cosas que faltaban: (1) la **anatomía real del kiosco argentino** (investigada, §1) para
> que el dueño quede plasmado de verdad, y (2) un **módulo fiscal ARCA** (ex-AFIP) completo y
> multi-tenant (§5), diseñado como módulo compartido reutilizable por todas las verticales.

---

## 🇦🇷 1. Anatomía del kiosco argentino (investigado, no inventado)

Antes de modelar nada, miré cómo son los sistemas que ya usan los kiosqueros acá
(SimplaZO, KioscoSoft, Sistar, Wynges, Gestión Comercio, Fácil Virtual). El kiosco argentino
tiene rasgos que NINGUNA otra vertical de Veltronik tiene, y que el sistema tiene que respetar
o el dueño no lo adopta:

| Rasgo real | Qué significa para el diseño |
|---|---|
| **Volumen alto, ticket bajo** | El POS tiene que ser instantáneo: scanner con foco permanente, teclado, atajos. Cada segundo cuenta en la cola. |
| **Fiado / cuenta corriente** ("anotámelo") | *Central en Argentina.* Cliente con saldo, se le anota la deuda y paga después. Sin esto, el kiosquero no migra. |
| **Múltiples medios de pago** | Efectivo, transferencia, **QR Mercado Pago**, **PostNet/tarjeta**, y **cuenta corriente**. A veces una venta es mixta. |
| **Precio efectivo ≠ precio tarjeta** | Recargo por tarjeta/lista. Es estándar en el rubro. |
| **Recarga virtual** (celular + **SUBE**) | Fuente de ingreso real vía redes como Carga Virtual. Es un "producto sin stock" (servicio). |
| **Caja diaria / cierre / arqueo** | El ritual de fin de día: contar la caja, comparar con lo esperado, ver el faltante. |
| **Vencimientos de perecederos** | Fiambres, lácteos, panificados: control de fecha de vencimiento. |
| **Distribuidores / preventistas** | El proveedor pasa, toma pedido, repone. Compras que suben stock y definen el costo. |
| **Margen chico → la rentabilidad importa** | Reportes de margen por producto, productos top, mermas, ventas por hora (horas pico). |
| **Multisucursal** | Ya resuelto por el modelo de tenants de Veltronik ($80k por sucursal). |

**Conclusión:** el modelo de datos de la v1 (producto/venta/stock/caja) es correcto pero
**incompleto** para Argentina. La v2.0 agrega: **cuenta corriente (fiado)**, **medios de pago
ricos**, **recargo tarjeta**, **productos de servicio** (recarga) y **vencimientos**. Todo esto
abajo.

---

## ✅ 2. Decisiones de Arquitectura

### 2.1 Dos módulos nuevos, no uno
```text
com.veltronik.v2.kiosk     ← la vertical retail (POS, stock, caja, fiado)   → migración V23
com.veltronik.v2.fiscal    ← facturación ARCA, COMPARTIDO entre verticales  → migración V24
```

**Por qué `fiscal` va aparte y no dentro de `kiosk`:** facturar a ARCA no es exclusivo del
kiosco. Mañana el gym factura cuotas, el salón factura servicios, la cancha factura el alquiler.
Meter ARCA en `kiosk` violaría el Mandamiento #2 ("¿y si mañana lo necesita otra vertical?") y
la regla de **Fachadas Internas** del Codex (§5). Entonces:

- `fiscal` es un módulo **core-level / compartido**, con una **fachada pública** `FiscalFacade`.
- `kiosk` (y cualquier vertical futura) llama `fiscalFacade.emitirComprobante(request)` y nunca
  toca los repos de `fiscal`. Desacoplado, testeable, reusable.

### 2.2 Módulo `kiosk` genérico
`kiosk` sirve a Kiosco, Maxikiosco, Almacén, Despensa, Drugstore: **misma lógica, otra config**.
`BusinessType.KIOSCO`. Tablas `kiosk_*`. Todas las entidades heredan de `TenantAwareEntity`
(aislamiento paranoico automático, igual que `Court`).

### 2.3 La venta NO bloquea por stock; la caja SÍ es invariante
- **Stock no restrictivo** (decisión de rubro): si el conteo dice 0 pero el producto está, se
  vende igual. Permite stock negativo y lo registra como señal de "ajustá inventario".
- **Caja única**: una sola `KioskCashSession` `OPEN` por tenant (índice único parcial).
- **La venta nunca espera a ARCA** (§5.5): el comprobante fiscal es **asíncrono**. Si ARCA está
  caído, la venta se cierra igual y la factura queda en cola para su CAE. Esto se acopla perfecto
  con el offline-first (§6): una venta puede existir sin CAE y obtenerlo después.

### 2.4 Facturar es opcional por venta (realidad del rubro)
La mayoría de las ventas de kiosco son a consumidor final, ticket chico, **sin factura formal**.
El sistema emite un **ticket interno** siempre, y la **factura electrónica ARCA solo cuando se
pide** (o automática si el dueño lo configura en Ajustes). Esto refleja cómo trabaja el kiosquero
y evita saturar ARCA con millones de microcomprobantes.

---

## 🗄️ 3. Modelo de Datos `kiosk` (Migración V23)

Todas heredan de `TenantAwareEntity`. Mismo estilo que la V20 (courts).

| Entidad | Campos clave | Notas |
|---|---|---|
| `KioskCategory` | name, display_order, active | Bebidas, Cigarrillos, Golosinas, Almacén, **Servicios** |
| `KioskProduct` | category_id, name, **barcode (único parcial)**, cost_price, sale_price, stock_quantity (cache), min_stock, is_weighable, **is_service** (recarga: sin stock), **iva_rate** (21/10.5/0), active | `iva_rate` lo usa el módulo fiscal para Factura A/B |
| `KioskStockMovement` | product_id, type (SALE/PURCHASE/ADJUSTMENT/RETURN/LOSS), quantity (con signo), reason, sale_id, created_at | **Libro mayor del inventario.** Inmutable |
| `KioskCashSession` | status (OPEN/CLOSED), opening_amount, closing_declared, closing_expected, difference, opened_at/by, closed_at/by | Arqueo. Una sola OPEN por tenant |
| `KioskCustomer` | full_name, phone, **dni_cuit**, credit_limit, **balance (cache)**, active | Para **fiado** y para identificar receptor en facturas grandes |
| `KioskAccountMovement` | customer_id, type (DEBT/PAYMENT), amount, sale_id, notes, created_at | **Cuenta corriente.** balance = Σ. La venta a cuenta corriente genera un DEBT |
| `KioskSale` | cash_session_id, **client_uuid (idempotencia)**, total, **subtotal, surcharge** (recargo tarjeta), status (COMPLETED/VOIDED), customer_id (fiado), sold_by, created_at | |
| `KioskSalePayment` | sale_id, method (CASH/CARD/TRANSFER/MP/CUENTA_CORRIENTE), amount | **Pago mixto:** N pagos por venta (mitad efectivo, mitad tarjeta) |
| `KioskSaleItem` | sale_id, product_id, **name_snapshot, price_snapshot**, quantity, iva_rate_snapshot, line_total | Snapshot inmutable |
| `KioskSettings` | card_surcharge_pct, allow_fiado, auto_invoice, low_stock_alert | 1 fila por tenant |

```sql
-- V23__Init_Kiosk_Module.sql  (extracto de las piezas no triviales; el resto sigue el molde V20)

-- Producto: is_service = recarga/SUBE (no descuenta stock); iva_rate para Factura A/B.
CREATE TABLE kiosk_product (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    category_id UUID,
    name VARCHAR(255) NOT NULL,
    barcode VARCHAR(64),
    cost_price NUMERIC(12,2),
    sale_price NUMERIC(12,2) NOT NULL,
    stock_quantity NUMERIC(12,3) NOT NULL DEFAULT 0,
    min_stock NUMERIC(12,3) NOT NULL DEFAULT 0,
    is_weighable BOOLEAN NOT NULL DEFAULT false,
    is_service BOOLEAN NOT NULL DEFAULT false,          -- recarga virtual / SUBE
    iva_rate NUMERIC(4,2) NOT NULL DEFAULT 21.00,       -- 21 / 10.5 / 0
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP, updated_at TIMESTAMP,
    CONSTRAINT fk_kiosk_product_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE CASCADE,
    CONSTRAINT fk_kiosk_product_category FOREIGN KEY (category_id) REFERENCES kiosk_category(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX ux_kiosk_product_barcode ON kiosk_product (tenant_id, barcode) WHERE barcode IS NOT NULL;

-- Cliente con cuenta corriente (fiado). balance es cache; la verdad es Σ kiosk_account_movement.
CREATE TABLE kiosk_customer (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    phone VARCHAR(30),
    dni_cuit VARCHAR(20),                               -- receptor en facturas grandes (§5.4)
    credit_limit NUMERIC(12,2) NOT NULL DEFAULT 0,
    balance NUMERIC(12,2) NOT NULL DEFAULT 0,           -- deuda actual (cache)
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP, updated_at TIMESTAMP,
    CONSTRAINT fk_kiosk_customer_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE CASCADE
);

-- Cuenta corriente: libro mayor de la deuda. DEBT (compró fiado) / PAYMENT (pagó).
CREATE TABLE kiosk_account_movement (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    customer_id UUID NOT NULL,
    type VARCHAR(10) NOT NULL,                          -- DEBT, PAYMENT
    amount NUMERIC(12,2) NOT NULL,
    sale_id UUID,
    notes VARCHAR(255),
    created_at TIMESTAMP,
    CONSTRAINT fk_kiosk_acct_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE CASCADE,
    CONSTRAINT fk_kiosk_acct_customer FOREIGN KEY (customer_id) REFERENCES kiosk_customer(id) ON DELETE CASCADE
);

-- Venta: subtotal + recargo tarjeta = total. client_uuid para idempotencia offline.
CREATE TABLE kiosk_sale (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    cash_session_id UUID NOT NULL,
    client_uuid UUID NOT NULL,
    customer_id UUID,                                   -- solo si va a cuenta corriente
    subtotal NUMERIC(12,2) NOT NULL,
    surcharge NUMERIC(12,2) NOT NULL DEFAULT 0,         -- recargo por tarjeta
    total NUMERIC(12,2) NOT NULL,
    status VARCHAR(10) NOT NULL DEFAULT 'COMPLETED',    -- COMPLETED, VOIDED
    sold_by UUID, notes TEXT,
    created_at TIMESTAMP, updated_at TIMESTAMP,
    CONSTRAINT fk_kiosk_sale_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE CASCADE,
    CONSTRAINT fk_kiosk_sale_session FOREIGN KEY (cash_session_id) REFERENCES kiosk_cash_session(id) ON DELETE CASCADE,
    CONSTRAINT fk_kiosk_sale_customer FOREIGN KEY (customer_id) REFERENCES kiosk_customer(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX ux_kiosk_sale_client_uuid ON kiosk_sale (tenant_id, client_uuid);

-- Pago mixto: una venta puede tener varios pagos (efectivo + tarjeta + fiado).
CREATE TABLE kiosk_sale_payment (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    sale_id UUID NOT NULL,
    method VARCHAR(20) NOT NULL,                        -- CASH, CARD, TRANSFER, MP, CUENTA_CORRIENTE
    amount NUMERIC(12,2) NOT NULL,
    CONSTRAINT fk_kiosk_pay_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE CASCADE,
    CONSTRAINT fk_kiosk_pay_sale FOREIGN KEY (sale_id) REFERENCES kiosk_sale(id) ON DELETE CASCADE
);

-- (kiosk_category, kiosk_stock_movement, kiosk_cash_session, kiosk_sale_item, kiosk_settings,
--  e índices: idénticos en estilo a la V20 — omitidos acá por brevedad, van completos en la migración)
```

**Invariantes duras de la V23:** `ux_kiosk_product_barcode` (barcode único), caja única abierta,
`ux_kiosk_sale_client_uuid` (idempotencia offline). Stock = Σ movimientos. Balance = Σ acct_movements.

---

## 🚦 4. Motor de venta + caja

Venta **atómica** (un `@Transactional`, espejo de `CourtBookingService.create`):
```text
POST /api/kiosk/sales  (idempotente por client_uuid)
  ├─ exige caja OPEN (si no → 409 "Abrí la caja primero")
  ├─ items → KioskSaleItem con snapshot de nombre/precio/iva
  ├─ items NO servicio → KioskStockMovement(SALE, -qty) (puede quedar negativo, no corta)
  ├─ calcula subtotal, surcharge (si hay pago con tarjeta y card_surcharge_pct > 0), total
  ├─ pagos → KioskSalePayment[]; si hay CUENTA_CORRIENTE → KioskAccountMovement(DEBT) + balance++
  ├─ persiste KioskSale (saveAndFlush); si choca client_uuid → devuelve la existente (200)
  └─ si auto_invoice → fiscalFacade.emitirComprobante(...) ASÍNCRONO (§5.5)
```
Anulación (`VOID`): `status=VOIDED`, movimientos `RETURN` que devuelven stock, revierte fiado.
Si tenía factura → Nota de Crédito en ARCA (§5).

**Caja:** `POST /cash/open {opening_amount}` (falla si ya hay una) ·
`POST /cash/close {closing_declared}` → expected = fondo + Σ pagos CASH, difference = declared − expected.

---

## 🧾 5. Módulo FISCAL — Facturación electrónica ARCA (ex-AFIP)

> ARCA = Agencia de Recaudación y Control Aduanero (renombró a AFIP en oct-2024). Los web services
> y la infraestructura de CUIT/certificados siguen iguales, ahora bajo dominio `arca.gob.ar`.

### 5.1 Qué comprobante emite un kiosco
Depende de la condición fiscal del **tenant** (cada kiosco tiene su CUIT y su condición):

| Condición del kiosco (emisor) | Receptor | Comprobante | IVA |
|---|---|---|---|
| **Monotributista** (el caso típico) | cualquiera | **Factura C** | No se discrimina (total = neto) |
| **Responsable Inscripto** | Consumidor final / Monotributo | **Factura B** | Incluido, no discriminado |
| **Responsable Inscripto** | Responsable Inscripto | **Factura A** | Discriminado (neto + IVA) |

La gran mayoría de los kioscos son **monotributistas → Factura C**, que es la más simple (sin
discriminar IVA). El sistema detecta la condición desde `FiscalConfig` y elige el tipo solo.

### 5.2 Identificación del comprador (umbral 2026)
Por **RG 5824/2026** (vigente desde 12-feb-2026): solo hay que identificar al consumidor final
(con CUIT/CUIL/DNI) si el comprobante es **≥ $10.000.000**. Debajo de eso, **sin datos del
comprador**. Para un kiosco (tickets chicos) esto significa: **prácticamente nunca** hay que pedir
DNI. El sistema lo pide solo si el total cruza el umbral (config actualizable, no hardcodear).

### 5.3 Cómo se integra técnicamente (WSAA + WSFEv1)
Dos web services SOAP de ARCA, encadenados:

```text
1) WSAA (autenticación)
   - El tenant tiene un certificado X.509 (.crt) + clave privada (.key), emitidos por ARCA
     y asociados al servicio WSFE en el "Administrador de Relaciones".
   - Se firma un "Login Ticket Request" (CMS/PKCS#7) con la clave privada → se manda a WSAA.
   - WSAA devuelve TOKEN + SIGN, válidos ~12 horas → se cachean por tenant (no re-autenticar
     en cada venta).

2) WSFEv1 (emisión) — método FECAESolicitar
   - FECompUltimoAutorizado(punto_venta, tipo) → último número autorizado → siguiente = +1.
     (ARCA es la fuente de verdad del numerador, NO un contador local: evita rechazos por
      "numeración inconsistente".)
   - FECAESolicitar(FeCabReq{cantidad, punto_venta, tipo}, FeDetReq{concepto, doc_tipo, doc_nro,
     importes, IVA, condición IVA receptor, ...}) → devuelve CAE (14 dígitos) + vto_CAE (~10 días).
   - Se arma el QR obligatorio (payload JSON base64 con cuit/pv/tipo/nro/importe/cae) → URL
     verificable de ARCA.

Endpoints:
   - Homologación (testing): https://wswhomo.arca.gob.ar/wsfev1/service.asmx
   - Producción:            https://servicios1.arca.gob.ar/wsfev1/service.asmx
```

### 5.4 Modelo de datos `fiscal` (Migración V24)

| Entidad | Campos clave | Notas |
|---|---|---|
| `FiscalConfig` | tenant_id (único), cuit, razon_social, condicion_iva (MONOTRIBUTO/RESP_INSCRIPTO/EXENTO), **certificate_enc, private_key_enc**, environment (HOMOLOGACION/PRODUCCION), default_pos | 1 por tenant. **Clave privada CIFRADA en reposo** (§5.6) |
| `FiscalPointOfSale` | number, description, active | Punto de venta registrado en ARCA |
| `FiscalVoucher` | sale_id (link a kiosk_sale, nullable), tipo, punto_venta, numero, fecha, doc_tipo, doc_nro, neto, iva, total, **cae, cae_vto**, qr_payload, status (PENDING/AUTHORIZED/REJECTED/CONTINGENCY), arca_obs (errores) | El comprobante. status PENDING → un job pide el CAE |
| `FiscalVoucherItem` | voucher_id, descripcion, cantidad, precio, iva_rate, subtotal | Detalle (para el PDF/ticket; WSFEv1 no lo exige pero lo guardamos) |

```sql
-- ux: una config fiscal por tenant; numeración única por (tenant, pos, tipo, numero)
CREATE UNIQUE INDEX ux_fiscal_config_tenant ON fiscal_config (tenant_id);
CREATE UNIQUE INDEX ux_fiscal_voucher_number
    ON fiscal_voucher (tenant_id, punto_venta, tipo, numero) WHERE status = 'AUTHORIZED';
```

### 5.5 Flujo y contingencia (la venta NUNCA espera a ARCA)
```text
Venta cerrada (COMPLETED) ──┬─ sin factura → solo ticket interno (caso más común)
                            └─ con factura → FiscalVoucher status=PENDING
                                  │
                       FiscalService.solicitarCae(voucher):
                                  ├─ WSAA (token cacheado) + FECAESolicitar
                                  ├─ OK  → status=AUTHORIZED, guarda CAE + QR → imprime
                                  └─ ARCA caído/error de red → status=CONTINGENCY
                                          └─ KioskFiscalJob (@Scheduled, patrón CourtBookingJobs)
                                             reintenta cada N min hasta obtener CAE
```
Así el mostrador no se frena nunca: la factura se autoriza en segundo plano y se reimprime cuando
ARCA responde. Cero margen de error sin bloquear la caja (Mandamiento del Codex).

### 5.6 Seguridad multi-tenant de los certificados (lo más delicado)
Cada kiosco sube SU certificado + SU clave privada. La clave privada es material criptográfico
sensible:
- **Cifrada en reposo** (AES-GCM) con una master key fuera de la DB (env var / KMS; Supabase tiene
  Vault/pgsodium como opción). Nunca en texto plano.
- **Nunca** se devuelve por la API (`@JsonIgnore`), **nunca** se loguea, se descifra solo en memoria
  al firmar el WSAA.
- Token+Sign de WSAA cacheados por tenant con su TTL (12 h). El `FiscalFacade` resuelve siempre el
  certificado del tenant correcto (aislamiento paranoico también acá).

### 5.7 Camino de implementación en Java
- **Recomendado (producción): nativo en Java** detrás del `FiscalFacade` — firma CMS del WSAA con
  **BouncyCastle**, cliente SOAP del WSFEv1, cache de token. Control total, sin terceros tocando los
  certificados de los clientes, sin costo por comprobante. Más trabajo, pero alineado con
  "Confiabilidad Extrema".
- **Atajo (prototipo/homologación):** **Afip SDK** (afipsdk.com, tiene ejemplos en Java) abstrae
  WSAA/WSFE por REST. Útil para validar rápido en homologación; evaluable para producción según
  costo y la política de mandar los certificados a un tercero. Como está detrás de la fachada, se
  puede empezar con el SDK y migrar a nativo sin tocar `kiosk`.

---

## 📴 6. Offline-first (la otra parte difícil)

Un kiosco no puede dejar de vender sin internet. Diseñado desde el día 1, implementado en Fase 1.5:
1. **Idempotencia ya en la V23** (`client_uuid` único) → la cola offline reenvía sin duplicar.
2. **Cache de catálogo en Electron** (IndexedDB/SQLite) → el POS vende leyendo local.
3. **Cola de ventas** con su `client_uuid` → worker que sincroniza al reconectar.
4. **La factura ARCA también es offline-tolerante**: la venta offline genera el comprobante en
   estado CONTINGENCY y obtiene el CAE cuando vuelve la red (§5.5). El mismo mecanismo sirve para
   "internet intermitente" y para "ARCA caído". Una sola solución, dos problemas.

---

## 💳 7. Mercado Pago (cobro al cliente — fase posterior)
Hoy `MercadoPagoService` solo hace Preapproval (suscripción B2B). Cobrar al cliente del kiosco con
**QR dinámico** es código nuevo (no Fase 1). En Fase 1 `KioskSalePayment.method=MP` es una etiqueta
(el dueño usa su QR y lo registra). Cuando se integre: namespace `sale:<saleId>` en
`external_reference` para no chocar con la suscripción en `WebhookController` (mina ya documentada
en courts §4).

---

## 🖥️ 8. Frontend — cambios exactos (calcados de courts)

| Archivo | Cambio |
|---|---|
| `core/entities/BusinessType.java` | + `KIOSCO` |
| `lib/config.js` | + `ORG_TYPES.KIOSCO`, `PRICES_BY_TYPE.KIOSCO: 80000`, rutas `POS`, `KIOSK_PRODUCTS`, `KIOSK_INVENTORY`, `KIOSK_CASH`, `KIOSK_CUSTOMERS`, `KIOSK_SUPPLIERS`, `KIOSK_FISCAL` |
| `App.jsx` | Bloque `<OrgTypeGuard allowedTypes={['KIOSCO']}>` (idéntico al de `FUTBOL_5` en `App.jsx:98`) |
| `components/Sidebar.jsx` | + `KIOSCO_NAV` (POS · Productos · Inventario · Clientes/Fiado · Caja · Proveedores(F2) · Facturación · Reportes · Equipo · Ajustes) + `case 'KIOSCO'`. **Reconciliar:** `Sidebar.jsx:225` ya tiene `KIOSK:'Kiosco'` pero el enum será `KIOSCO` → cambiar la clave |
| `pages/OnboardingPage.jsx` | Card "🏪 Kiosco / Almacén", `desc: 'Punto de venta, stock, fiado y facturación'`, `enabled: true` |
| `styles/layout.css` | Tema `[data-vertical="kiosco"]`: **turquesa/teal** (libre: GYM azul, SALON rosa, RESTO naranja, FUTBOL verde) |
| `styles/kiosk.css` | Nuevo, análogo a `courts.css` (POS + grilla de productos) |

**Páginas nuevas:** `PosPage` (el corazón: scanner con foco permanente, carrito, pago mixto, vuelto),
`KioskProductsPage` (CRUD + margen + barcode + IVA), `KioskInventoryPage` (stock + alertas + ajustes),
`KioskCustomersPage` (clientes + fiado + saldos), `KioskCashPage` (arqueo), `KioskFiscalPage`
(config ARCA: subir certificado, punto de venta, ver comprobantes/CAE/contingencias).

> Higiene (ya visto en courts): `RESTO_NAV`/`SALON_NAV` referencian rutas fantasma inexistentes en
> `config.js`. Definir las rutas KIOSK reales antes de usarlas en el nav.

---

## 🗺️ 9. Fases

| Fase | Contenido | Entregable |
|---|---|---|
| **1 — Motor de Venta + Caja** | Enum `KIOSCO` · V23 (índices únicos parciales) · CRUD productos/categorías (con IVA y servicio) · POS (scanner, carrito, pago mixto, recargo tarjeta, vuelto) · Inventario auditado + alertas · Caja apertura/cierre/arqueo · Onboarding/Sidebar/Guard/tema | El kiosquero vende con scanner y cierra caja |
| **1.5 — Offline-first** | Cache de catálogo Electron · Cola de ventas (`client_uuid`) · Sync al reconectar | Vende sin internet, sincroniza solo |
| **2 — Fiado + Compras + Proveedores** | `KioskCustomer` + cuenta corriente · `KioskSupplier` + compras (→ stock + costo) · vencimientos de perecederos | Cuenta corriente y control de costos/márgenes |
| **3 — Facturación ARCA** | Módulo `fiscal` (V24) + `FiscalFacade` · WSAA + WSFEv1 (Factura C/B/A) · certificados multi-tenant cifrados · CAE + QR · contingencia con job · `KioskFiscalPage` | El kiosco factura legal a ARCA |
| **4 — MP QR + Recarga + Bot + Reportes** | QR dinámico MP (namespace `sale:`) · recarga virtual/SUBE (red Carga Virtual) · reportes (rentabilidad, top, mermas, horas pico) · bot de stock/pedidos | Cobro digital, servicios y analítica |

> **Nota de orden:** ARCA es Fase 3 a propósito — primero el motor que vende y se adopta, después
> el cumplimiento fiscal. Pero el **modelo ya nace fiscal-ready** (`iva_rate` en productos,
> `dni_cuit` en clientes) para no migrar dos veces. Si tu prioridad comercial es vender el sistema
> *con* factura desde el arranque, ARCA puede adelantarse a Fase 2 sin reescribir nada.

---

## 📚 Fuentes de la investigación
- Software de kioscos AR: [SimplaZO](https://www.simplazo.com/), [KioscoSoft](https://www.kioscosoft.com.ar/), [Sistar](https://www.sistar.com.ar/sistema-de-gestion-para-kioscos-y-maxikioscos-en-argentina/), [Wynges](https://wynges.com/software-para-kioscos-maxikioscos-drugstores-argentina/), [Gestión Comercio](https://gestioncomercio.com.ar/), [Carga Virtual](https://www.cargavirtual.info/)
- ARCA web services: [Doc oficial WS Factura Electrónica](https://www.afip.gob.ar/ws/documentacion/ws-factura-electronica.asp), [Manual del desarrollador](https://www.afip.gob.ar/ws/documentacion/manuales/manual-desarrollador-ARCA-COMPG-v4-0.pdf), [Guía técnica 2025 (Develop Argentina)](https://developargentina.com/blog/facturacion-electronica-arca-guia-completa-2025), [Afip SDK Java](https://afipsdk.com/blog/crear-factura-electronica-de-afip-en-java/)
- Monotributo / Factura C: [ARCA Monotributo facturación](https://www.afip.gob.ar/monotributo/ayuda/facturacion.asp)
- Umbral consumidor final 2026: [RG 5824/2026 — $10M (Fececo)](https://fececo.org.ar/arca-elevo-a-10-millones-el-monto-para-identificar-en-las-facturas-a-consumidores-finales/), [Contadores en Red](https://contadoresenred.com/facturacion-a-partir-de-que-monto-se-debe-identificar-al-consumidor-final-en-2026/)
