-- ============================================================================
-- V63 — Cobros y movimientos de caja registrados sin internet
-- ============================================================================
-- Es la V54 otra vez, ahora para la plata. El mostrador tiene que poder cobrar
-- con el cable desenchufado y mandar cuando vuelva la conexión, y eso necesita
-- UNA cosa del lado del servidor: poder reconocer un cobro que ya se guardó.
--
-- ⚠️ POR QUÉ ACÁ IMPORTA MÁS QUE EN LOS ACCESOS
-- Un acceso repetido no duplica: INVIERTE (el socio queda "afuera" sin haberse
-- ido). Un cobro repetido es peor, y no por la fila de más:
--
--   `aplicarPeriodoDelPlan` arranca el período DONDE TERMINA la cobertura
--   vigente del socio, no en "hoy" —el que paga el 25 teniendo cuota hasta el
--   30 no pierde esos cinco días—. Así que la SEGUNDA copia arranca donde
--   terminó la primera: el socio se lleva 30 días GRATIS, y el ingreso del día
--   queda contado dos veces en el arqueo.
--
-- O sea que el daño real no es el registro duplicado: es el efecto lateral que
-- ese registro dispara al pasar de nuevo por el servicio.
--
-- ⚠️ Y POR ESO EL ID DEL CLIENTE NO ALCANZA
-- `AssignableUuidGenerator` ya permite que la fila nazca con su UUID generado
-- en el terminal, pero `JpaRepository.save()` con id no nulo hace MERGE: no
-- rechaza el duplicado, lo PISA — y de paso vuelve a ejecutar el efecto
-- lateral. La garantía tiene que ser esta: el índice único, más el "antes de
-- tocar nada, si ese client_ref ya está, devolvé el que está" que ya usa
-- `AccessLogService.registerScan`.
--
-- POR QUÉ LA GARANTÍA VA EN LA BASE Y NO EN EL CÓDIGO
-- El vaciado de la cola puede correr dos veces a la vez. Un "buscá si ya existe
-- y si no insertá" tiene una ventana entre las dos mitades donde las dos pasan.
-- El índice único no la tiene: la segunda inserción falla, el servicio la
-- atrapa, devuelve la que ya estaba, y no hay forma de que entren dos.
--
-- Los índices son PARCIALES (solo donde client_ref no es null) porque lo que se
-- cobra con conexión no trae identificador de cliente y no tiene por qué
-- empezar a traerlo: son todas las filas históricas.
--
-- Van por tenant: dos gimnasios pueden generar el mismo UUID sin que uno pise
-- al otro. Es improbable, pero "improbable" no es una garantía de aislamiento.
--
-- ⚠️ SOBRE EL NÚMERO DE ESTA MIGRACIÓN: la V62 existe y es del molinete facial
-- (`V62__Molinete_Facial.sql`, rama `molinete-facial`, sin mergear y sin
-- aplicar en ninguna base). Como `spring.flyway.out-of-order` está en false,
-- si esta V63 se aplica primero, esa V62 YA NO VA A PODER APLICARSE y el
-- backend no arranca. Antes de mergear el molinete hay que RENUMERARLA a V64 o
-- más. Renumerarla es seguro justamente porque nunca se aplicó: la regla que
-- costó un outage es no renumerar una migración YA APLICADA.
-- ============================================================================

-- ── Los cobros ──────────────────────────────────────────────────────────────

ALTER TABLE gym_payments ADD COLUMN IF NOT EXISTS client_ref UUID;

CREATE UNIQUE INDEX IF NOT EXISTS ux_gym_payments_tenant_client_ref
    ON gym_payments (tenant_id, client_ref)
    WHERE client_ref IS NOT NULL;

COMMENT ON COLUMN gym_payments.client_ref IS
    'Identificador que genera el terminal antes de mandar el cobro. Permite reintentar sin duplicar — y sobre todo sin volver a extender la cobertura del socio. NULL en los cobros registrados con conexión.';

-- ── Los movimientos de caja (egresos, ingresos que no son cobros) ────────────

ALTER TABLE caja_movimiento ADD COLUMN IF NOT EXISTS client_ref UUID;

CREATE UNIQUE INDEX IF NOT EXISTS ux_caja_movimiento_tenant_client_ref
    ON caja_movimiento (tenant_id, client_ref)
    WHERE client_ref IS NOT NULL;

COMMENT ON COLUMN caja_movimiento.client_ref IS
    'Identificador que genera el terminal antes de mandar el movimiento. Permite reintentar sin duplicar: un egreso contado dos veces deja el arqueo en falso faltante y acusa a quien atendió. NULL en los movimientos registrados con conexión.';
