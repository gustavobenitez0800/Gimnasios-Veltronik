-- ============================================================================
-- V54 — Accesos registrados sin internet
-- ============================================================================
-- El terminal del mostrador tiene que poder registrar entradas con el cable
-- desenchufado y mandarlas cuando vuelva la conexión. Eso necesita UNA cosa del
-- lado del servidor: poder reconocer un acceso que ya se guardó.
--
-- POR QUÉ LA GARANTÍA VA EN LA BASE Y NO EN EL CÓDIGO
-- El vaciado de la cola puede correr dos veces a la vez —dos pestañas, un
-- reintento que se cruza con el temporizador, la app que se reabre mientras la
-- anterior todavía manda—. Un "buscá si ya existe y si no insertá" tiene una
-- ventana entre las dos mitades donde las dos pasan. El índice único no la
-- tiene: la segunda inserción falla, el servicio la atrapa, devuelve la que ya
-- estaba, y no hay forma de que entren dos.
--
-- El índice es PARCIAL (solo donde client_ref no es null) porque los accesos
-- que se registran online no traen identificador de cliente y no tienen por qué
-- empezar a traerlo: son millones de filas viejas.
--
-- Va por tenant: dos gimnasios pueden generar el mismo UUID sin que uno pise al
-- otro. Es improbable, pero "improbable" no es una garantía de aislamiento.
-- ============================================================================

ALTER TABLE access_log ADD COLUMN IF NOT EXISTS client_ref UUID;

CREATE UNIQUE INDEX IF NOT EXISTS ux_access_log_tenant_client_ref
    ON access_log (tenant_id, client_ref)
    WHERE client_ref IS NOT NULL;

COMMENT ON COLUMN access_log.client_ref IS
    'Identificador que genera el terminal antes de mandar el acceso. Permite reintentar sin duplicar. NULL en los accesos registrados con conexión.';
