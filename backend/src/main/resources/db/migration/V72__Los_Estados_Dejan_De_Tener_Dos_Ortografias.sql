-- ============================================================================
-- V72 — Un estado, una ortografía
-- ============================================================================
-- POR QUÉ. ESTE NO ES UN ARREGLO DE ESTILO: YA COSTÓ PLATA MAL CONTADA.
--
-- `gym_payments.status` y `gym_payments.payment_method` son VARCHAR libres sin
-- ninguna restricción, y con los años juntaron varias formas de escribir lo
-- mismo. El rastro está en el código, que hoy se defiende en SEIS lugares:
--
--   GymPaymentRepository     LOWER(p.status) = 'paid'
--   GymOwnerInsightsService  UPPER(status), con el comentario "conviven 'paid' y
--                            'PAID' en datos viejos"
--   CajaService (x2)         "PAID".equalsIgnoreCase(...)
--   usePaymentController     (dto.paymentMethod || 'CASH').toLowerCase()
--   MembersPage / ReportsPage "el backend manda status/method en MAYÚSCULAS.
--                            Normalizamos para mostrar."
--
-- Y ya se rompió de verdad dos veces:
--
--   1. LA SUMA DE COBROS ESTABA MAL. La entidad nacía con "PAID" y el frontend
--      guardaba "paid": la consulta que sumaba con `=` exacto contaba la mitad.
--      Está escrito en el javadoc de GymPaymentRepository.
--
--   2. MERCADO PAGO DESAPARECÍA DEL ARQUEO. `payment_method` acepta tres formas
--      del mismo medio —'MERCADOPAGO', 'MERCADO_PAGO', 'MP'— y el `switch` de
--      CajaService solo miraba una. Las otras dos caían en el `default -> otros`
--      junto con los métodos raros: el gimnasio que cobraba por MP no encontraba
--      esa plata en ninguna parte del cierre.
--
-- Los dos se arreglaron donde se leía. Nunca se arregló el DATO, así que la
-- causa sigue entera: cada consulta nueva que alguien escriba sobre estas dos
-- columnas vuelve a empezar con la misma trampa, y la que se olvide de
-- normalizar va a dar un número que parece bien y está mal. Un dato que se lee
-- de seis formas distintas no está guardado: está adivinado.
--
-- ── LO QUE HACE ────────────────────────────────────────────────────────────
-- Deja UNA ortografía por estado, y la escribe también en la definición de la
-- columna (default + COMMENT) para que la próxima fila nazca bien.
--
--   status          minúscula    paid | pending | cancelled
--   payment_method  MAYÚSCULA    CASH | TRANSFER | CARD | MERCADOPAGO
--
-- Sí, una en minúscula y la otra en mayúscula. Es lo que ya escriben hoy el
-- backend y el frontend respectivamente; cambiar EL CRITERIO además del dato
-- sería romper clientes 2.6.31 que están instalados y no se pueden actualizar
-- de prepo. Primero se unifica el dato; el criterio se puede unificar después,
-- en una versión que viaje con su cliente.
-- ============================================================================


-- ============================================================================
-- PARTE 1 — El dato queda con una sola forma
-- ============================================================================

-- ── status: todo a minúscula ───────────────────────────────────────────────
-- Seguro para TODOS los que leen: el backend ya compara con LOWER()/UPPER()/
-- equalsIgnoreCase, y el frontend normaliza antes de mostrar. Ninguno lee con
-- `=` exacto — eso fue justamente lo que se arregló.
UPDATE gym_payments
   SET status = LOWER(TRIM(status))
 WHERE status IS NOT NULL
   AND status <> LOWER(TRIM(status));

-- ── payment_method: todo a MAYÚSCULA, y un solo Mercado Pago ───────────────
UPDATE gym_payments
   SET payment_method = UPPER(TRIM(payment_method))
 WHERE payment_method IS NOT NULL
   AND payment_method <> UPPER(TRIM(payment_method));

UPDATE gym_payments
   SET payment_method = 'MERCADOPAGO'
 WHERE payment_method IN ('MP', 'MERCADO_PAGO', 'MERCADO PAGO');

-- ── caja_movimiento.metodo: mismo criterio que payment_method ──────────────
-- Comparte el vocabulario con los cobros (CajaService los suma juntos en el
-- mismo arqueo), así que tiene que escribirse igual.
UPDATE caja_movimiento
   SET metodo = UPPER(TRIM(metodo))
 WHERE metodo IS NOT NULL
   AND metodo <> UPPER(TRIM(metodo));

UPDATE caja_movimiento
   SET metodo = 'MERCADOPAGO'
 WHERE metodo IN ('MP', 'MERCADO_PAGO', 'MERCADO PAGO');


-- ============================================================================
-- PARTE 2 — El default de la base deja de contradecir a la aplicación
-- ============================================================================
-- `gym_payments.status` tiene DEFAULT 'PAID' desde la V10, y la entidad nace
-- con "paid" desde que se arregló el bug de la suma. O sea que la base y la
-- aplicación escriben distinto el MISMO estado, según quién inserte la fila.
-- Ese default es la fábrica original del problema y sigue enchufada.
ALTER TABLE gym_payments ALTER COLUMN status SET DEFAULT 'paid';


-- ============================================================================
-- PARTE 3 — Las que SÍ se pueden cerrar con un CHECK, y las que no
-- ============================================================================
-- Un CHECK sobre estas columnas es tentador y hay que medirlo: si una fila no
-- cumple, no falla una pantalla — FALLA EL COBRO EN EL MOSTRADOR. Y hay
-- clientes con la 2.6.31 instalada que no se pueden actualizar de prepo.
--
-- Así que se cierran SOLO las columnas cuyo único escritor posible es un enum
-- de Java (`@Enumerated(EnumType.STRING)`). Ahí el conjunto de valores no es
-- una convención que alguien puede violar: es el compilador. El CHECK no puede
-- descubrir un valor inesperado porque no existe forma de escribirlo.
ALTER TABLE tenant DROP CONSTRAINT IF EXISTS ck_tenant_business_type;
ALTER TABLE tenant ADD CONSTRAINT ck_tenant_business_type
    CHECK (business_type = 'GYM');

ALTER TABLE tenant_membership DROP CONSTRAINT IF EXISTS ck_tenant_membership_role;
ALTER TABLE tenant_membership ADD CONSTRAINT ck_tenant_membership_role
    CHECK (role IN ('OWNER', 'ADMIN', 'STAFF', 'RECEPTION'));

ALTER TABLE device_registry DROP CONSTRAINT IF EXISTS ck_device_registry_role;
ALTER TABLE device_registry ADD CONSTRAINT ck_device_registry_role
    CHECK (role IS NULL OR role IN ('CAJA', 'ENCARGADO'));

ALTER TABLE device_registry DROP CONSTRAINT IF EXISTS ck_device_registry_status;
ALTER TABLE device_registry ADD CONSTRAINT ck_device_registry_status
    CHECK (status IS NULL OR status IN ('ACTIVE', 'REVOKED'));

-- `access_denied.reason` la escribe solo el backend, desde las constantes de
-- AccessDenied.Reason. No pasa por el cliente.
ALTER TABLE access_denied DROP CONSTRAINT IF EXISTS ck_access_denied_reason;
ALTER TABLE access_denied ADD CONSTRAINT ck_access_denied_reason
    CHECK (reason IN ('FUERA_DE_HORARIO', 'SIN_PERMISO'));

-- `gym_payment_ajuste.tipo` igual: constantes EDICION / BORRADO del servicio.
ALTER TABLE gym_payment_ajuste DROP CONSTRAINT IF EXISTS ck_gym_payment_ajuste_tipo;
ALTER TABLE gym_payment_ajuste ADD CONSTRAINT ck_gym_payment_ajuste_tipo
    CHECK (tipo IN ('EDICION', 'BORRADO'));

-- ── Las que quedan abiertas, y qué falta para poder cerrarlas ──────────────
-- `gym_payments.status`, `gym_payments.payment_method` y `caja_movimiento.metodo`
-- las escribe, en última instancia, un cliente instalado. Esta migración les
-- deja el dato limpio y el vocabulario escrito; el CHECK va en la migración que
-- viaje CON el cliente que ya no pueda mandar otra cosa. Cerrarlo antes es
-- cambiar un número mal contado por un cobro que no entra.
COMMENT ON COLUMN gym_payments.status IS
    'paid | pending | cancelled, SIEMPRE en minúscula. Sin CHECK todavía: lo escribe un '
    'cliente instalado (2.6.31) — el CHECK va con la versión que lo garantice. Ver V72.';

COMMENT ON COLUMN gym_payments.payment_method IS
    'CASH | TRANSFER | CARD | MERCADOPAGO, SIEMPRE en MAYÚSCULA. Mismo vocabulario que '
    'caja_movimiento.metodo: CajaService los suma juntos en el arqueo. Sin CHECK todavía: '
    'lo escribe un cliente instalado (2.6.31). Ver V72.';

COMMENT ON COLUMN caja_movimiento.metodo IS
    'CASH | TRANSFER | CARD | MERCADOPAGO, SIEMPRE en MAYÚSCULA. Mismo vocabulario que '
    'gym_payments.payment_method. Ver V72.';
