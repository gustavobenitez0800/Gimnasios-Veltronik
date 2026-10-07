-- =====================================================================================
-- V89 — POR QUÉ SE CERRÓ CADA SESIÓN
-- =====================================================================================
--
-- "La app me sacó sola" se atacó cinco veces a ciegas. Cada vez hubo que adivinar cuál de
-- los caminos al login había sido, porque lo único que quedaba era un renglón en la consola
-- de una PC que nadie tiene a mano: la del mostrador de un gimnasio.
--
-- Desde acá cada terminal avisa por qué se le cerró la sesión: la cerró alguien, la rechazó
-- el backend con un 401, la dio por terminada Supabase, o al abrir ya no estaba. El aviso se
-- anota en el terminal en el momento y sube en cuanto hay una sesión con la cual subirlo —la
-- misma, si la cerró alguien con un botón; la siguiente, si se cayó sola—.
--
-- Es un registro de diagnóstico, no un dato del negocio:
--   · no cuelga de ninguna tabla (sin claves foráneas): tiene que poder anotarse aunque la
--     sucursal o el usuario que nombra ya no existan, y borrarlos no puede frenarse por esto;
--   · `user_id` es lo que DICE el terminal (de quién era la sesión que se cerró);
--     `reportado_por` es quién estaba adentro cuando llegó, y ese sí sale del token;
--   · `client_ref` lo pone el terminal y es único: el mismo aviso subido dos veces —un
--     reintento— queda una sola vez. Lo garantiza la base, no un `if`.
--
-- Para leerlo, en el SQL Editor:
--   SELECT ocurrido_at, motivo, detalle, plataforma, app_version, tenant_id, device_id
--     FROM sesion_cierre ORDER BY ocurrido_at DESC LIMIT 50;
-- =====================================================================================

CREATE TABLE sesion_cierre (
    id            UUID         NOT NULL,
    created_at    TIMESTAMP    NOT NULL,
    updated_at    TIMESTAMP    NOT NULL,

    client_ref    UUID         NOT NULL,
    ocurrido_at   TIMESTAMP    NOT NULL,
    motivo        VARCHAR(40)  NOT NULL,
    detalle       VARCHAR(500),

    user_id       UUID,
    reportado_por UUID         NOT NULL,
    tenant_id     UUID,
    device_id     UUID,
    app_version   VARCHAR(32),
    plataforma    VARCHAR(20),

    CONSTRAINT pk_sesion_cierre PRIMARY KEY (id),
    CONSTRAINT uq_sesion_cierre_client_ref UNIQUE (client_ref)
);

CREATE INDEX ix_sesion_cierre_ocurrido_at ON sesion_cierre (ocurrido_at);

-- Toda tabla de public nace cerrada (V68): nadie entra por el API de datos de Supabase.
ALTER TABLE sesion_cierre ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE sesion_cierre IS
    'Diagnóstico: por qué se cerró cada sesión de un terminal. Lo avisa el propio terminal.';
COMMENT ON COLUMN sesion_cierre.motivo IS
    'USUARIO, USUARIO_TODOS, RESPUESTA_401, SUPABASE, SE_PERDIO_AL_ABRIR u OTRO.';
COMMENT ON COLUMN sesion_cierre.user_id IS
    'De quién era la sesión que se cerró, según el terminal. No es una clave foránea.';
COMMENT ON COLUMN sesion_cierre.reportado_por IS
    'Quién tenía la sesión iniciada cuando llegó el aviso. Sale del token.';
