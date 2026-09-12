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
-- cumple, no falla una pantalla — FALLA EL ARRANQUE DEL BACKEND, porque Flyway
-- corre antes de que el servidor escuche.
--
-- Se cierran SOLO las columnas cuyo único escritor posible es un enum de Java
-- (`@Enumerated(EnumType.STRING)`).
--
-- ⚠️ PERO TODAS VAN `NOT VALID`, Y ESA PALABRA ES LO IMPORTANTE.
--
-- La versión anterior de esta migración las agregaba a secas, con este
-- razonamiento: "el único escritor es un enum de Java, así que no puede haber
-- un valor inesperado". El razonamiento está MAL, y conviene dejarlo escrito
-- para no repetirlo: **el enum restringe lo que se escribe de ahora en más, no
-- lo que ya está guardado**. Las filas viejas son de cuando el enum era otro.
--
-- El caso concreto que lo delata es `tenant.business_type`. Hoy `BusinessType`
-- tiene un solo valor, GYM. Pero este proyecto tuvo cuatro verticales —SALON,
-- KIOSCO, COURTS— y recién en 2026-07-27 se decidió quedarse solo con gimnasios
-- (V40-V42 borraron sus tablas, no sus `tenant`). Un negocio viejo con
-- `business_type = 'KIOSCO'` es invisible para la aplicación —Hibernate ni
-- siquiera puede leerlo— pero está en la tabla, y un CHECK a secas lo encuentra
-- y voltea el deploy.
--
-- `NOT VALID` hace exactamente lo que hace falta: Postgres **aplica la regla a
-- toda fila nueva o modificada** y **no revisa las que ya están**. El futuro
-- queda cerrado y el pasado no puede tirar el arranque. Es el mismo
-- expand/contract que se usa para todo lo demás acá.
ALTER TABLE tenant DROP CONSTRAINT IF EXISTS ck_tenant_business_type;
ALTER TABLE tenant ADD CONSTRAINT ck_tenant_business_type
    CHECK (business_type = 'GYM') NOT VALID;

ALTER TABLE tenant_membership DROP CONSTRAINT IF EXISTS ck_tenant_membership_role;
ALTER TABLE tenant_membership ADD CONSTRAINT ck_tenant_membership_role
    CHECK (role IN ('OWNER', 'ADMIN', 'STAFF', 'RECEPTION')) NOT VALID;

ALTER TABLE device_registry DROP CONSTRAINT IF EXISTS ck_device_registry_role;
ALTER TABLE device_registry ADD CONSTRAINT ck_device_registry_role
    CHECK (role IS NULL OR role IN ('CAJA', 'ENCARGADO')) NOT VALID;

ALTER TABLE device_registry DROP CONSTRAINT IF EXISTS ck_device_registry_status;
ALTER TABLE device_registry ADD CONSTRAINT ck_device_registry_status
    CHECK (status IS NULL OR status IN ('ACTIVE', 'REVOKED')) NOT VALID;

-- `access_denied.reason` la escribe solo el backend, desde las constantes de
-- AccessDenied.Reason. No pasa por el cliente.
ALTER TABLE access_denied DROP CONSTRAINT IF EXISTS ck_access_denied_reason;
ALTER TABLE access_denied ADD CONSTRAINT ck_access_denied_reason
    CHECK (reason IN ('FUERA_DE_HORARIO', 'SIN_PERMISO')) NOT VALID;

-- `gym_payment_ajuste.tipo` igual: constantes EDICION / BORRADO del servicio.
ALTER TABLE gym_payment_ajuste DROP CONSTRAINT IF EXISTS ck_gym_payment_ajuste_tipo;
ALTER TABLE gym_payment_ajuste ADD CONSTRAINT ck_gym_payment_ajuste_tipo
    CHECK (tipo IN ('EDICION', 'BORRADO')) NOT VALID;


-- ── Y que el log del deploy diga si el pasado estaba limpio ────────────────
-- `NOT VALID` evita que una fila vieja voltee el arranque, pero no queremos que
-- eso se convierta en no enterarse nunca. Esto NO cambia nada: solo cuenta y
-- deja el número en el log del deploy.
--
-- Si todas dan 0, las seis se pueden promover a validadas cuando se quiera:
--     ALTER TABLE <tabla> VALIDATE CONSTRAINT <constraint>;
-- Si alguna da distinto de 0, ahí está la fila vieja que hay que mirar — y nos
-- enteramos por el log, no por un deploy caído.
DO $$
DECLARE
    n_business  bigint;
    n_rol       bigint;
    n_dev_rol   bigint;
    n_dev_est   bigint;
    n_reason    bigint;
    n_ajuste    bigint;
BEGIN
    SELECT count(*) INTO n_business FROM tenant             WHERE business_type <> 'GYM';
    SELECT count(*) INTO n_rol      FROM tenant_membership  WHERE role NOT IN ('OWNER','ADMIN','STAFF','RECEPTION');
    SELECT count(*) INTO n_dev_rol  FROM device_registry    WHERE role   IS NOT NULL AND role   NOT IN ('CAJA','ENCARGADO');
    SELECT count(*) INTO n_dev_est  FROM device_registry    WHERE status IS NOT NULL AND status NOT IN ('ACTIVE','REVOKED');
    SELECT count(*) INTO n_reason   FROM access_denied      WHERE reason NOT IN ('FUERA_DE_HORARIO','SIN_PERMISO');
    SELECT count(*) INTO n_ajuste   FROM gym_payment_ajuste WHERE tipo   NOT IN ('EDICION','BORRADO');

    IF n_business + n_rol + n_dev_rol + n_dev_est + n_reason + n_ajuste = 0 THEN
        RAISE NOTICE 'V72: el pasado esta limpio — las 6 restricciones se pueden promover con VALIDATE CONSTRAINT.';
    ELSE
        RAISE WARNING 'V72: filas viejas que la restriccion nueva NO acepta (no frenan nada, quedan NOT VALID): tenant.business_type=% | tenant_membership.role=% | device_registry.role=% | device_registry.status=% | access_denied.reason=% | gym_payment_ajuste.tipo=%',
            n_business, n_rol, n_dev_rol, n_dev_est, n_reason, n_ajuste;
    END IF;
END $$;

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
