-- ============================================
-- VELTRONIK - Lo que entra y sale del cajón sin ser un cobro
-- ============================================
-- El arqueo ya sabía sumar: fondo inicial + lo cobrado en efectivo. Pero del cajón también
-- SALE plata durante el día, y de eso el sistema no sabía nada.
--
-- ⚠️ ESO HACÍA QUE EL ARQUEO MINTIERA TODOS LOS DÍAS, AL REVÉS QUE EL FONDO. Se le paga
-- $15.000 a la chica de la limpieza del cajón. A la noche el sistema espera $15.000 que ya
-- no están, y el cierre dice FALTANTE. La persona que atendió no robó nada y el sistema la
-- acusa; el dueño ve faltantes todos los días, se acostumbra, y el día que falta plata de
-- verdad ya no lo distingue de los otros. Un arqueo que siempre falta es tan inútil como
-- uno que siempre sobra — es el mismo bug del fondo inicial, con el signo cambiado.
--
-- ─── LAS DECISIONES QUE EXPLICAN ESTA TABLA ───
--
-- SOLO EL EFECTIVO MUEVE EL ARQUEO. Se pueden anotar movimientos por transferencia (pagarle
-- al proveedor desde el banco) porque el dueño quiere verlos, pero NO tocan el conteo: lo
-- que se declara al cerrar es cuánto ENTRÓ a la cuenta, y mezclar salidas ahí obligaría a
-- quien cuenta a hacer una resta mental sobre la app del banco. Cada movimiento dice si
-- afecta el cajón, y la cuenta usa solo esos.
--
-- ⚠️ UN EGRESO FALSO ES EL ROBO PERFECTO DE ESTE MÓDULO, y hay que decirlo de frente:
-- escribir "Proveedor $20.000", guardarse los $20.000, y el cajón cuadra exacto. Esta tabla
-- no lo impide — nada en el software puede impedirlo, porque la plata sale igual. Lo que
-- hace es dejarlo A LA VISTA: cada egreso queda firmado con nombre, hora y terminal; el
-- detalle es obligatorio; y el cierre congela cuántos egresos hubo y por cuánto, así el
-- dueño los ve en el historial al lado de la diferencia. El control real es que alguien los
-- mire, y para eso primero tienen que existir.
--
-- NO SE BORRAN: SE ANULAN. Poder borrar un egreso sería poder borrar la prueba. Anular deja
-- el registro, el motivo y quién anuló. Y un movimiento de un período YA CERRADO no se
-- anula: el cierre está congelado y anularlo después dejaría un cierre que dice una cosa y
-- una lista que dice otra. Corregir es cargar el movimiento inverso, igual que en el cierre.
-- ============================================

CREATE TABLE IF NOT EXISTS caja_movimiento (
    id                      uuid PRIMARY KEY,
    tenant_id               uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,

    -- La sesión de caja en la que se cargó, si había una abierta. Sin FK dura: se puede
    -- gastar plata del cajón con la caja sin abrir, y esa plata falta igual.
    sesion_id               uuid,

    -- ⚠️ CHECK en la base y no solo en el código: el tipo decide el SIGNO. Un 'EGRESO' que
    -- entre mal escrito no da error, da una diferencia al revés y nadie sabe por qué.
    tipo                    varchar(10) NOT NULL,

    -- En qué. Texto y no un enum de Postgres a propósito: agregar un rubro nuevo no puede
    -- necesitar una migración, y el dueño va a querer uno que hoy no imaginamos.
    categoria               varchar(30) NOT NULL,

    -- Obligatorio para los egresos. No prueba nada por sí solo, pero un renglón que dice
    -- "Proveedor — agua, factura 4412" se puede verificar y uno que dice "Proveedor" no.
    detalle                 varchar(255),

    monto                   numeric(14,2) NOT NULL,

    -- CASH / TRANSFER / MERCADOPAGO / CARD. Solo CASH mueve el arqueo.
    metodo                  varchar(20) NOT NULL DEFAULT 'CASH',

    -- Cuándo pasó de verdad. La escribe la app en hora argentina, no la base: el servidor
    -- responde en la suya y los movimientos caerían fuera del período.
    fecha                   timestamp NOT NULL,

    -- El nombre congelado: si mañana esa persona no trabaja más acá, el registro tiene que
    -- seguir diciendo quién sacó la plata.
    hecho_por_nombre        varchar(160),

    -- La anulación. NULL = vigente.
    anulado_at              timestamp,
    anulado_por_nombre      varchar(160),
    motivo_anulacion        varchar(255),

    created_at              timestamp,
    updated_at              timestamp,
    -- Las trae TenantAwareEntity: qué terminal y qué persona. Sin ellas el arranque falla en
    -- la validación de esquema, no en tiempo de uso.
    origin_device_id        uuid,
    performed_by_cashier_id uuid,

    CONSTRAINT ck_caja_movimiento_tipo CHECK (tipo IN ('INGRESO', 'EGRESO')),
    -- Un movimiento de $0 no es un movimiento, y uno negativo es un tipo mal puesto
    -- disfrazado. El signo lo pone `tipo`, nunca el monto.
    CONSTRAINT ck_caja_movimiento_monto CHECK (monto > 0)
);

-- La consulta de siempre: los movimientos del período abierto de este gimnasio.
CREATE INDEX IF NOT EXISTS ix_caja_movimiento_tenant_fecha
    ON caja_movimiento (tenant_id, fecha DESC);

COMMENT ON TABLE caja_movimiento IS
    'Plata que entra o sale del cajón sin ser un cobro de socio. No se borra: se anula.';

-- ─── El cierre tiene que poder reconstruirse solo ───
-- Mismo criterio que `fondo_inicial`: si estos números no quedaran congelados en el cierre,
-- el esperado de un martes cambiaría en junio porque alguien anuló un egreso viejo.
ALTER TABLE caja_cierre ADD COLUMN IF NOT EXISTS egresos_efectivo NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE caja_cierre ADD COLUMN IF NOT EXISTS ingresos_efectivo NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE caja_cierre ADD COLUMN IF NOT EXISTS cantidad_movimientos INTEGER NOT NULL DEFAULT 0;
