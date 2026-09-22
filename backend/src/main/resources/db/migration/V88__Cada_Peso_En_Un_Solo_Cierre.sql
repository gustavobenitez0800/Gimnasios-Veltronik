-- ============================================================================
-- V88 — CADA PESO EN UN SOLO CIERRE, Y UNA SOLA MANERA DE ESCRIBIR LA PLATA
-- ============================================================================
--
-- ─── EL PROBLEMA ────────────────────────────────────────────────────────────
--
-- Hasta acá, un cierre de caja contaba "los cobros con fecha entre el cierre
-- anterior y este". Esa regla perdía plata en silencio:
--
--   · Un cobro cargado HOY con la fecha de ayer (o con la hora en 00:00, que es
--     lo que guarda el modal de Pagos) caía en un período ya cerrado. No lo
--     contaba ningún cierre, nunca.
--   · Un cobro pendiente que se marcaba pagado días después, lo mismo.
--   · Un cobro de ayer al que hoy se le corregía el monto o se borraba: el
--     cierre de ayer quedaba congelado con el número viejo y la diferencia no
--     aparecía en ningún lado.
--   · Un cobro con la fecha justo en el borde entre dos cierres se contaba en
--     los dos (>= desde y <= hasta).
--
-- ─── LA REGLA NUEVA ─────────────────────────────────────────────────────────
--
-- Cada cobro (y cada movimiento de caja) lleva el SELLO del cierre que lo contó.
-- Un cierre toma lo cobrado que todavía no tiene sello, sin mirar la fecha del
-- período: lo que llegó tarde lo toma el siguiente. Lo que se corrige después
-- de sellado entra en el cierre siguiente como CORRECCIÓN, a la vista, y queda
-- el detalle en caja_cierre_ajuste. Así cada peso entra en exactamente un
-- cierre, y la suma de todos los cierres es la plata que entró.
--
-- Y un cobro ya no se borra: se ANULA (status 'cancelled' + quién, cuándo y por
-- qué). Borrar era borrar la prueba.
--
-- ─── Y DE PASO, LA PLATA SE ESCRIBE DE UNA SOLA MANERA ──────────────────────
--
-- La forma de pago convivía como 'CASH', 'cash', 'Transferencia'. Se normaliza
-- (la entidad lo hace al guardar desde ahora, ver MetodoDePago.java) y la base
-- lo exige con un CHECK. También: monto mayor a cero y estado conocido.
-- ============================================================================


-- ─── 1. La forma de pago, normalizada ───────────────────────────────────────
--
-- La misma tabla de equivalencias que MetodoDePago.reconocer(). Lo que no se
-- entiende se deja como está y el CHECK queda NOT VALID (se avisa abajo): no se
-- inventa un método para una fila vieja.

CREATE FUNCTION pg_temp.metodo_canonico(crudo text) RETURNS text AS $$
DECLARE
    k text := regexp_replace(translate(lower(coalesce(crudo, '')), 'áéíóúüñ', 'aeiouun'), '[^a-z0-9]', '', 'g');
BEGIN
    IF k = '' THEN RETURN 'OTHER'; END IF;
    IF k IN ('cash', 'efectivo', 'contado', 'caja') THEN RETURN 'CASH'; END IF;
    IF k LIKE 'transf%' OR k IN ('deposito', 'cbu', 'alias') THEN RETURN 'TRANSFER'; END IF;
    IF k LIKE 'mercadopago%' OR k IN ('mp', 'qr', 'mercado') THEN RETURN 'MERCADOPAGO'; END IF;
    IF k = 'card' OR k LIKE 'tarjeta%' OR k IN ('debito', 'credito', 'posnet') THEN RETURN 'CARD'; END IF;
    IF k IN ('other', 'otro', 'otros') THEN RETURN 'OTHER'; END IF;
    RETURN crudo;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

UPDATE gym_payment
   SET payment_method = pg_temp.metodo_canonico(payment_method)
 WHERE payment_method IS DISTINCT FROM pg_temp.metodo_canonico(payment_method);

UPDATE caja_movimiento
   SET metodo = pg_temp.metodo_canonico(metodo)
 WHERE metodo IS DISTINCT FROM pg_temp.metodo_canonico(metodo);

-- Vacío = OTHER (así lo contaba la caja: "un método raro cae en otros"). Ya no
-- queda ninguno en NULL.
ALTER TABLE gym_payment ALTER COLUMN payment_method SET DEFAULT 'OTHER';
ALTER TABLE gym_payment ALTER COLUMN payment_method SET NOT NULL;

UPDATE gym_payment SET status = LOWER(TRIM(status)) WHERE status <> LOWER(TRIM(status));


-- ─── 2. El sello del cierre y la anulación ──────────────────────────────────

ALTER TABLE gym_payment ADD COLUMN cierre_id          UUID;
ALTER TABLE gym_payment ADD COLUMN sellado_at         TIMESTAMP;
ALTER TABLE gym_payment ADD COLUMN sellado_monto      NUMERIC(14,2);
ALTER TABLE gym_payment ADD COLUMN sellado_metodo     VARCHAR(20);
ALTER TABLE gym_payment ADD COLUMN anulado_at         TIMESTAMP;
ALTER TABLE gym_payment ADD COLUMN anulado_por_nombre VARCHAR(160);
ALTER TABLE gym_payment ADD COLUMN motivo_anulacion   VARCHAR(255);

ALTER TABLE gym_payment
    ADD CONSTRAINT fk_gym_payment_cierre_id
        FOREIGN KEY (cierre_id) REFERENCES caja_cierre (id) ON DELETE SET NULL;
CREATE INDEX ix_gym_payment_cierre_id ON gym_payment (cierre_id);

-- Lo que el cierre busca cada vez: lo cobrado en Veltronik que no tiene sello.
-- Parcial, así que queda chico: lo sin sellar es el día, no la historia.
CREATE INDEX ix_gym_payment_tenant_sin_sellar
    ON gym_payment (tenant_id, payment_date)
    WHERE sellado_at IS NULL AND import_id IS NULL;

-- El libro de ingresos pregunta por gimnasio y rango de fechas. Solo había un
-- índice por tenant_id: con un año de cobros eso recorre todo el gimnasio.
CREATE INDEX ix_gym_payment_tenant_fecha ON gym_payment (tenant_id, payment_date);

COMMENT ON COLUMN gym_payment.cierre_id IS
    'El cierre de caja que contó este cobro. NULL = sigue en el período abierto, o es una carga histórica que no pasó por ningún cierre (sellado_at dice cuál de las dos).';
COMMENT ON COLUMN gym_payment.sellado_at IS
    'Cuándo lo tomó un cierre. NULL = ningún cierre lo contó todavía. Lo escribe SOLO el cierre.';
COMMENT ON COLUMN gym_payment.sellado_monto IS
    'Lo que contó el cierre. Si después se corrige o se anula el cobro, la diferencia entra como corrección en el cierre siguiente.';
COMMENT ON COLUMN gym_payment.anulado_at IS
    'Los cobros no se borran: se anulan (status cancelled). NULL = no se anuló, o se anuló antes de la V88.';

ALTER TABLE caja_movimiento ADD COLUMN cierre_id  UUID;
ALTER TABLE caja_movimiento ADD COLUMN sellado_at TIMESTAMP;
ALTER TABLE caja_movimiento
    ADD CONSTRAINT fk_caja_movimiento_cierre_id
        FOREIGN KEY (cierre_id) REFERENCES caja_cierre (id) ON DELETE SET NULL;
CREATE INDEX ix_caja_movimiento_cierre_id ON caja_movimiento (cierre_id);

ALTER TABLE caja_cierre ADD COLUMN ingresos_otros_medios NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE caja_cierre ADD COLUMN ajustes_efectivo      NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE caja_cierre ADD COLUMN ajustes_otros_medios  NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE caja_cierre ADD COLUMN cantidad_ajustes      INTEGER       NOT NULL DEFAULT 0;

COMMENT ON COLUMN caja_cierre.ajustes_efectivo IS
    'Correcciones de cobros ya cerrados que mueven el cajón (negativo = salió plata, p. ej. una devolución). Entran en la cuenta del cajón.';


-- ─── 3. El detalle de cada corrección ───────────────────────────────────────
--
-- Sin FK a gym_payment a propósito, como gym_payment_ajuste: si el cobro se
-- borrara (deshacer una importación, la purga de una cuenta), la prueba de la
-- corrección no se tiene que ir con él.

CREATE TABLE caja_cierre_ajuste (
    id                      UUID          NOT NULL,
    tenant_id               UUID          NOT NULL,
    cierre_id               UUID          NOT NULL,
    payment_id              UUID          NOT NULL,
    metodo_antes            VARCHAR(20)   NOT NULL,
    monto_antes             NUMERIC(14,2) NOT NULL,
    metodo_despues          VARCHAR(20)   NOT NULL,
    monto_despues           NUMERIC(14,2) NOT NULL,
    created_at              TIMESTAMP     NOT NULL,
    updated_at              TIMESTAMP     NOT NULL,
    origin_device_id        UUID,
    performed_by_cashier_id UUID,
    CONSTRAINT pk_caja_cierre_ajuste PRIMARY KEY (id),
    CONSTRAINT fk_caja_cierre_ajuste_tenant_id
        FOREIGN KEY (tenant_id) REFERENCES tenant (id) ON DELETE CASCADE,
    CONSTRAINT fk_caja_cierre_ajuste_cierre_id
        FOREIGN KEY (cierre_id) REFERENCES caja_cierre (id) ON DELETE CASCADE
);
CREATE INDEX ix_caja_cierre_ajuste_tenant_id ON caja_cierre_ajuste (tenant_id);
CREATE INDEX ix_caja_cierre_ajuste_cierre_id ON caja_cierre_ajuste (cierre_id);
ALTER TABLE caja_cierre_ajuste ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE caja_cierre_ajuste IS
    'Cada cobro ya cerrado que se corrigió o se anuló, y en qué cierre entró la diferencia (despues - antes).';


-- ─── 4. La anulación queda en el rastro de ajustes ──────────────────────────

ALTER TABLE gym_payment_ajuste DROP CONSTRAINT IF EXISTS ck_gym_payment_ajuste_tipo;
ALTER TABLE gym_payment_ajuste ADD CONSTRAINT ck_gym_payment_ajuste_tipo
    CHECK (tipo IN ('EDICION', 'BORRADO', 'ANULACION')) NOT VALID;


-- ─── 5. Lo que la base exige de ahora en más ────────────────────────────────
--
-- NOT VALID primero: aplican a todo lo que se escriba desde hoy. Después se
-- intenta validarlas contra el pasado, como la V81: si hay una fila vieja que
-- no cumple, la restricción queda NOT VALID (sigue protegiendo lo nuevo) y se
-- avisa por el log en vez de frenar el despliegue.

ALTER TABLE gym_payment ADD CONSTRAINT ck_gym_payment_monto_positivo
    CHECK (amount > 0) NOT VALID;
ALTER TABLE gym_payment ADD CONSTRAINT ck_gym_payment_metodo
    CHECK (payment_method IN ('CASH', 'TRANSFER', 'MERCADOPAGO', 'CARD', 'OTHER')) NOT VALID;
ALTER TABLE gym_payment ADD CONSTRAINT ck_gym_payment_estado
    CHECK (status IN ('paid', 'pending', 'cancelled')) NOT VALID;
ALTER TABLE caja_movimiento ADD CONSTRAINT ck_caja_movimiento_metodo
    CHECK (metodo IN ('CASH', 'TRANSFER', 'MERCADOPAGO', 'CARD', 'OTHER')) NOT VALID;

DO $$
DECLARE
    objetivo   record;
    pendientes text[] := ARRAY[]::text[];
BEGIN
    FOR objetivo IN
        SELECT * FROM (VALUES
            ('gym_payment',        'ck_gym_payment_monto_positivo'),
            ('gym_payment',        'ck_gym_payment_metodo'),
            ('gym_payment',        'ck_gym_payment_estado'),
            ('caja_movimiento',    'ck_caja_movimiento_metodo'),
            ('gym_payment_ajuste', 'ck_gym_payment_ajuste_tipo')
        ) AS t(tabla, restriccion)
    LOOP
        BEGIN
            EXECUTE format('ALTER TABLE %I VALIDATE CONSTRAINT %I', objetivo.tabla, objetivo.restriccion);
        EXCEPTION WHEN check_violation THEN
            pendientes := pendientes || (objetivo.tabla || '.' || objetivo.restriccion);
        END;
    END LOOP;

    IF array_length(pendientes, 1) IS NOT NULL THEN
        RAISE WARNING 'V88: quedan NOT VALID porque hay filas viejas que no cumplen (siguen aplicando a todo lo nuevo): %',
            array_to_string(pendientes, ', ');
    END IF;
END $$;


-- ─── 6. El sellado de lo que ya se cerró ────────────────────────────────────
--
-- ⚠️ Lo prueba CadaPesoEnUnSoloCierreIntegrationTest corriendo ESTE bloque (lo
-- lee entre las dos marcas): si se cambia acá, se prueba lo cambiado.
--
-- La pregunta es qué contó la regla vieja, para no contarlo otra vez. La regla
-- vieja contó un cobro en un cierre si su fecha caía en el período de ese cierre
-- Y el cobro ya existía cuando el cierre se calculó (created_at del cierre). No
-- alcanza con mirar el "hasta": un cierre hecho sin internet a las 22:00 sube a
-- las 09:00 y cuenta los cobros de la noche que subieron a las 08:59.
--
--   · Lo que la regla vieja contó → sello de ese cierre.
--   · Lo anterior al primer cierre → sello sin cierre (carga histórica: ningún
--     arqueo lo va a contar, y así lo decía la regla de los 30 días).
--   · Lo que tiene fecha dentro de un período cerrado pero se cargó DESPUÉS del
--     cierre → SIN sello. Es la plata que la regla vieja perdió: la toma el
--     próximo cierre (si es de los últimos 30 días; si no, carga histórica).
--   · Lo posterior al último cierre → sin sello: es el período abierto.
--
-- <sellado-inicial>
UPDATE gym_payment p
   SET cierre_id      = c.id,
       sellado_at     = (now() AT TIME ZONE 'America/Argentina/Buenos_Aires'),
       sellado_monto  = p.amount,
       sellado_metodo = p.payment_method
  FROM caja_cierre c
 WHERE c.tenant_id = p.tenant_id
   AND p.sellado_at IS NULL
   AND p.import_id IS NULL
   AND p.status = 'paid'
   AND p.payment_date >= c.desde
   AND p.payment_date <= c.hasta
   AND p.created_at <= c.created_at;

UPDATE gym_payment p
   SET sellado_at     = (now() AT TIME ZONE 'America/Argentina/Buenos_Aires'),
       sellado_monto  = p.amount,
       sellado_metodo = p.payment_method
  FROM (SELECT tenant_id, MIN(desde) AS desde FROM caja_cierre GROUP BY tenant_id) primero
 WHERE primero.tenant_id = p.tenant_id
   AND p.sellado_at IS NULL
   AND p.import_id IS NULL
   AND p.status = 'paid'
   AND p.payment_date < primero.desde;

UPDATE caja_movimiento m
   SET cierre_id  = c.id,
       sellado_at = (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')
  FROM caja_cierre c
 WHERE c.tenant_id = m.tenant_id
   AND m.sellado_at IS NULL
   AND m.import_id IS NULL
   AND m.fecha >= c.desde
   AND m.fecha <= c.hasta
   AND m.created_at <= c.created_at;

UPDATE caja_movimiento m
   SET sellado_at = (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')
  FROM (SELECT tenant_id, MIN(desde) AS desde FROM caja_cierre GROUP BY tenant_id) primero
 WHERE primero.tenant_id = m.tenant_id
   AND m.sellado_at IS NULL
   AND m.import_id IS NULL
   AND m.fecha < primero.desde;
-- </sellado-inicial>
