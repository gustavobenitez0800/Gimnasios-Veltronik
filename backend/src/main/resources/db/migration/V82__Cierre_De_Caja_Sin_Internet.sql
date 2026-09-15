-- ============================================================================
-- V82 — El cierre de caja, hecho sin internet
-- ============================================================================
-- Es el último de los cinco caminos que tocan plata (ver docs/FASE3-CAMINOS.md).
-- Va último a propósito: depende de que todo lo anterior —cobros, altas,
-- egresos— ya viaje con SU momento real, porque el cierre los cuenta.
--
-- ⚠️ POR QUÉ UN CIERRE REPETIDO ES DE LOS PEORES DUPLICADOS
--
-- El período de un cierre arranca donde terminó el anterior (`desde` = el
-- `hasta` del último). Y el fondo de mañana sale de `queda_en_caja`. O sea que
-- un cierre que entra dos veces no deja "una fila de más":
--
--   · el segundo cuenta un período VACÍO (desde = hasta del primero), así que
--     su esperado es cero;
--   · su `queda_en_caja` se calcula sobre ese cero, y ese número pasa a ser el
--     FONDO de mañana;
--   · a partir de ahí todos los cierres siguientes arrastran el error.
--
-- Igual que con los cobros, el daño real no es el registro duplicado: es el
-- efecto lateral que dispara al pasar de nuevo por el servicio.
--
-- POR QUÉ LA GARANTÍA VA EN LA BASE
-- El vaciado de la cola puede correr dos veces a la vez. Un "fijate si ya está
-- y si no insertá" tiene una ventana entre las dos mitades donde las dos pasan.
-- El índice único no la tiene. Es la misma decisión de la V54 y la V63.
--
-- El índice es PARCIAL (solo donde client_ref no es null): los cierres hechos
-- con conexión no traen identificador de terminal, y son todos los históricos.
-- Va por tenant porque dos gimnasios pueden generar el mismo UUID.
-- ============================================================================

ALTER TABLE caja_cierre ADD COLUMN IF NOT EXISTS client_ref UUID;

CREATE UNIQUE INDEX IF NOT EXISTS ux_caja_cierre_tenant_client_ref
    ON caja_cierre (tenant_id, client_ref)
    WHERE client_ref IS NOT NULL;

COMMENT ON COLUMN caja_cierre.client_ref IS
    'Identificador que genera el terminal antes de mandar el cierre. Permite reintentar sin duplicar: un cierre repetido cuenta un período vacío y ese cero se convierte en el fondo de mañana. NULL en los cierres hechos con conexión.';

-- ── Las dos cuentas de la misma plata ───────────────────────────────────────
--
-- Para que alguien pueda cerrar sin internet, la pantalla tiene que mostrarle el
-- número — y eso obliga a calcularlo también en el terminal. Son DOS cuentas de
-- lo mismo, que es justo el patrón que en este proyecto salió mal todas las
-- veces (toda cuenta de fechas duplicada terminó diciendo números distintos).
--
-- La mitigación es la misma que ya funcionó con los días del socio: el terminal
-- manda lo que MOSTRÓ, el servidor calcula lo SUYO, y si difieren queda
-- registrado. No se corrige solo: se hace ruido. Un cierre donde las dos cuentas
-- no coinciden es exactamente lo que el dueño tiene que poder mirar.
--
-- Nulos en todo lo hecho con conexión: ahí hay una sola cuenta y es la del
-- servidor, así que no hay nada que comparar.

ALTER TABLE caja_cierre ADD COLUMN IF NOT EXISTS esperado_segun_terminal NUMERIC(14,2);
ALTER TABLE caja_cierre ADD COLUMN IF NOT EXISTS cobros_segun_terminal INTEGER;

COMMENT ON COLUMN caja_cierre.esperado_segun_terminal IS
    'El efectivo del período segun la cuenta del TERMINAL, que es la que vio quien cerro. Se compara contra esperado_efectivo (la del servidor). NULL en los cierres hechos con conexion: ahi hay una sola cuenta.';

COMMENT ON COLUMN caja_cierre.cobros_segun_terminal IS
    'Cuantos cobros conto el TERMINAL en el periodo. La otra mitad de la comparacion: dos totales pueden coincidir contando distinta cantidad de cobros, y eso tambien hay que poder verlo.';
