-- V47__Checkin_Qr.sql
--
-- ENTRADA Y SALIDA SIN RECEPCIONISTA.
--
-- El gimnasio pega un QR en la puerta; el socio lo escanea con SU teléfono y marca. No hace
-- falta comprar nada: ni lector, ni tablet, ni molinete. Por eso esta función vive en el plan
-- básico — el hardware es lo premium, no el registro de asistencia.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- 1. El punto de acceso: el QR que se pega en la pared
-- ─────────────────────────────────────────────────────────────────────────────
-- El QR lleva un TOKEN opaco, no el id del gimnasio. Dos razones:
--
--   (a) El cartel queda colgado en una pared a la vista de cualquiera, y se le puede sacar una
--       foto. Si el QR expusiera el UUID interno del tenant, estaríamos publicando una llave
--       del sistema en la entrada del local.
--   (b) Un token se puede ROTAR. Si alguien fotografía el cartel y empieza a marcar entradas
--       desde su casa, el dueño genera uno nuevo, imprime, y el viejo muere. Con el id del
--       tenant eso sería imposible: no se puede rotar la identidad del negocio.
CREATE TABLE IF NOT EXISTS checkin_point (
    id                       uuid PRIMARY KEY,
    created_at               timestamp NOT NULL,
    updated_at               timestamp NOT NULL,
    tenant_id                uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    origin_device_id         uuid,
    performed_by_cashier_id  uuid,

    -- Lo que viaja adentro del QR. Único en TODO el sistema, no por gimnasio: es lo que
    -- resuelve a qué sucursal pertenece un escaneo, y esa consulta llega SIN contexto de
    -- tenant (el socio no tiene sesión). Si dos gimnasios pudieran repetir token, un escaneo
    -- sería ambiguo.
    token                    varchar(64) NOT NULL,

    -- Para el dueño con varias puertas: "Puerta principal", "Entrada de atrás".
    name                     varchar(120) NOT NULL DEFAULT 'Puerta principal',

    -- Rotar = crear el nuevo y apagar el viejo, no borrarlo: los accesos ya registrados
    -- apuntan acá y queremos poder decir por qué puerta entró alguien el mes pasado.
    active                   boolean NOT NULL DEFAULT true
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_checkin_point_token ON checkin_point (token);
CREATE INDEX IF NOT EXISTS idx_checkin_point_tenant ON checkin_point (tenant_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. La marca de "se fue sin avisar"
-- ─────────────────────────────────────────────────────────────────────────────
-- El caso más común de todos: el socio entra, marca, y se va sin volver a marcar. Su visita
-- queda abierta para siempre.
--
-- Antes eso era veneno silencioso. `registerAccess` funcionaba como interruptor —si hay visita
-- abierta la cierro, si no abro una— así que el PRÓXIMO escaneo de esa persona se leía como
-- salida: su entrada real nunca se registraba, y a partir de ahí TODAS sus visitas quedaban
-- invertidas. El error no se corregía solo, se alternaba para siempre, y se llevaba puesto el
-- dato con el que el dueño decide a quién llamar ("¿vino este socio este mes?").
--
-- Con esta columna, una visita que el sistema cerró por su cuenta queda marcada: sigue contando
-- como asistencia (el socio VINO, eso es cierto) pero se excluye del promedio de permanencia,
-- que si no se llenaría de visitas de 14 horas.
ALTER TABLE access_log
    ADD COLUMN IF NOT EXISTS auto_closed boolean NOT NULL DEFAULT false;

-- Por qué puerta entró. Nullable: los accesos cargados a mano por el mostrador no tienen QR,
-- y los que ya existen tampoco.
ALTER TABLE access_log
    ADD COLUMN IF NOT EXISTS checkin_point_id uuid REFERENCES checkin_point(id) ON DELETE SET NULL;

-- El cierre nocturno busca "visitas abiertas de este gimnasio", y la pantalla del mostrador
-- pregunta lo mismo cada vez que se refresca.
CREATE INDEX IF NOT EXISTS idx_access_log_abiertas
    ON access_log (tenant_id, check_out_at)
    WHERE check_out_at IS NULL;
