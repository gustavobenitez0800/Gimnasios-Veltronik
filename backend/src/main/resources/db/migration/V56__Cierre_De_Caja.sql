-- ============================================================================
-- V56 — Cierre de caja
-- ============================================================================
-- El dueño necesita saber si la plata que entró al sistema es la plata que hay.
-- Hoy no tiene forma: puede ver cuánto se cobró, pero no cuánto hay en el cajón.
--
-- ─── LAS DECISIONES QUE EXPLICAN ESTA TABLA ───
--
-- LA CAJA ES DEL GIMNASIO, NO DE LA MÁQUINA. Un gimnasio puede tener la web en
-- una notebook y el escritorio en otra PC, pero hay UN cajón. El cierre toma todo
-- lo cobrado en el período, desde donde se haya cobrado. Hacer una caja por
-- máquina sería inventar dos cajones donde hay uno.
--
-- EL PERÍODO LO DEFINEN LOS CIERRES, NO EL CALENDARIO. `desde` es el `hasta` del
-- cierre anterior. Así el dueño cierra todos los días, una vez por semana, o
-- cuando se le da la gana, sin que el sistema le imponga un ritmo.
--
-- SOLO EL EFECTIVO SE DECLARA. Una transferencia no se puede robar: va a la
-- cuenta del gimnasio y quien atiende no la toca. Se guarda lo que el sistema
-- contó de cada método para que el dueño concilie contra el banco, pero lo que
-- se cuenta a ciegas es el efectivo, que es lo único que pasa por una mano.
--
-- `con_arqueo` SEPARA DOS COSAS DISTINTAS: un conteo real de la caja (recepción,
-- obligatorio) y un corte contable sin contar (solo dueño/admin). Sin esta
-- distinción, un cierre sin plata contada se vería igual que uno verificado.
--
-- NO HAY UPDATE. Un cierre se congela al crearse: si se pudiera editar después,
-- no serviría para nada. Corregir es hacer otro cierre, no reescribir el que hubo.
-- ============================================================================

CREATE TABLE IF NOT EXISTS caja_cierre (
    id                        UUID PRIMARY KEY,
    tenant_id                 UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,

    -- El período que cubre. `desde` es el `hasta` del cierre anterior.
    desde                     TIMESTAMP NOT NULL,
    hasta                     TIMESTAMP NOT NULL,

    -- Lo que el SISTEMA contó, por método. Se guarda el número del momento del
    -- cierre y no se recalcula después: si mañana alguien corrige un cobro viejo,
    -- el cierre tiene que seguir diciendo lo que se vio ese día.
    esperado_efectivo         NUMERIC(12,2) NOT NULL DEFAULT 0,
    esperado_transferencia    NUMERIC(12,2) NOT NULL DEFAULT 0,
    esperado_tarjeta          NUMERIC(12,2) NOT NULL DEFAULT 0,
    esperado_otros            NUMERIC(12,2) NOT NULL DEFAULT 0,
    cantidad_cobros           INTEGER NOT NULL DEFAULT 0,

    -- Lo que la PERSONA declaró tener en el cajón, y la diferencia. NULL cuando el
    -- cierre es un corte contable sin conteo.
    declarado_efectivo        NUMERIC(12,2),
    diferencia                NUMERIC(12,2),
    con_arqueo                BOOLEAN NOT NULL DEFAULT TRUE,

    -- Por qué no cuadró. Opcional a propósito: que alguien NUNCA explique sus
    -- diferencias es, en sí mismo, un dato.
    nota                      TEXT,

    -- Quién cerró, con el nombre congelado: si mañana ese empleado se borra, el
    -- cierre tiene que seguir diciendo quién lo hizo.
    cerrado_por_nombre        VARCHAR(160),

    created_at                TIMESTAMP,
    updated_at                TIMESTAMP,
    origin_device_id          UUID,
    performed_by_cashier_id   UUID
);

-- La consulta de siempre es "el último cierre de este gimnasio", para saber desde
-- cuándo cuenta el próximo. Y la del dueño es la lista por fecha.
CREATE INDEX IF NOT EXISTS ix_caja_cierre_tenant_hasta
    ON caja_cierre (tenant_id, hasta DESC);

COMMENT ON TABLE caja_cierre IS
    'Arqueos de caja. Congelados: no se editan, se corrigen con otro cierre.';
