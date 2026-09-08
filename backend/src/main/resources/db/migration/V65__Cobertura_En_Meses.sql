-- ============================================================================
-- V65 — La cobertura del arancel deja de ser un número de días
-- ============================================================================
-- Ver docs/adr/ADR-013-el-mes-corre-solo.md. Lo dijo el dueño mirando la
-- pantalla de cobro: "lo que hace que el alumno venza es EL MES, simple. Paga
-- el 7 de marzo y vence el 7 de abril. Los aranceles son para saber qué tipo de
-- entrenamiento eligió".
--
-- ⚠️ POR QUÉ NO ALCANZABA CON GUARDAR DÍAS
-- Un mes no son 30 días. 7 de marzo + 30 = 6 de abril; 7 de febrero + 30 = 9 de
-- marzo. En un año son 360 días en vez de 365 —el socio paga doce veces y le
-- faltan cinco— y el "vence el 7" deja de ser cierto, que es justo lo simple que
-- el negocio necesita. Para poder decir "el mismo día del mes que viene" hay que
-- guardar la UNIDAD, no solo el número.
--
-- Dos columnas y no un código único ('MES_1', 'DIA_7'): cantidad + unidad se
-- lee sin diccionario, se ordena, y agregar "4 meses" el día que un cliente lo
-- pida no toca la base.
--
-- ⚠️ duration_days NO SE BORRA. Es lo único que dice qué vendía cada arancel
-- antes de esto: si el mapeo de abajo resultara equivocado en algún caso, sin la
-- columna vieja no habría forma de saberlo. Se saca en otra migración, cuando
-- haya corrido un tiempo en máquinas de verdad.
--
-- ⚠️ EL NÚMERO DE ESTA MIGRACIÓN ES V65 Y NO V64. La V64 es del molinete facial
-- (rama `molinete-facial`, sin mergear). Igual va a haber que renumerarla otra
-- vez al mergearla: con `spring.flyway.out-of-order` en false, CUALQUIER
-- migración que llegue antes la deja sin poder aplicarse. Mientras esa rama siga
-- abierta esto se repite — la salida de fondo es mergearla o habilitar
-- out-of-order, no seguir corriéndole el número.
-- ============================================================================

ALTER TABLE gym_plans ADD COLUMN IF NOT EXISTS cobertura_cantidad INTEGER;
ALTER TABLE gym_plans ADD COLUMN IF NOT EXISTS cobertura_unidad   VARCHAR(10);

-- ── El mapeo, sacado del catálogo REAL de los clientes ──────────────────────
--
-- No se inventó una tabla de conversión: se miró qué venden. Los catorce
-- aranceles que existen caen todos en estas filas.
--
--    1 día      Pase Diario            (HaA)
--    7 días     Pase Semanal           (HaA)
--   30 días     la cuota mensual       (7 aranceles entre los dos gimnasios)
--   60 días     Pase Bimestral         (HaA)
--   90 días     Trimestral             (HaA y Veltronik Gym)
--  360 días     Pase Anual             (HaA, dos aranceles)
--
-- ⚠️ 360 y 365 pasan los dos a "1 año", así que el Pase Anual GANA CINCO DÍAS.
-- Es lo que "anual" debería haber querido decir siempre, y está anotado en el
-- ADR como una consecuencia de plata, no como un detalle.
UPDATE gym_plans SET
    cobertura_cantidad = CASE
        WHEN duration_days = 0                     THEN 0
        WHEN duration_days IN (30)                 THEN 1
        WHEN duration_days IN (60)                 THEN 2
        WHEN duration_days IN (90)                 THEN 3
        WHEN duration_days IN (180)                THEN 6
        WHEN duration_days IN (360, 365, 366)      THEN 12
        ELSE duration_days
    END,
    cobertura_unidad = CASE
        WHEN duration_days IN (30, 60, 90, 180, 360, 365, 366) THEN 'MES'
        ELSE 'DIA'
    END
WHERE cobertura_cantidad IS NULL;

-- ⭐ EL DEFAULT ES UN MES, Y ES EL CORAZÓN DE LA DECISIÓN.
--
-- Antes, `duration_days` arrancaba en 0 y 0 significaba "no corre la fecha": el
-- valor por defecto era el que rompía, en silencio. Un arancel creado sin pensar
-- hacía que los cobros no movieran nada y nadie se enteraba hasta que a un socio
-- no lo dejaban entrar, jurando que pagó.
--
-- Ahora un arancel nuevo cubre un mes salvo que alguien diga lo contrario.
ALTER TABLE gym_plans ALTER COLUMN cobertura_cantidad SET DEFAULT 1;
ALTER TABLE gym_plans ALTER COLUMN cobertura_unidad   SET DEFAULT 'MES';

UPDATE gym_plans SET cobertura_cantidad = 1  WHERE cobertura_cantidad IS NULL;
UPDATE gym_plans SET cobertura_unidad   = 'MES' WHERE cobertura_unidad IS NULL;

ALTER TABLE gym_plans ALTER COLUMN cobertura_cantidad SET NOT NULL;
ALTER TABLE gym_plans ALTER COLUMN cobertura_unidad   SET NOT NULL;

-- La unidad decide una operación de fecha distinta: sumar días o sumar meses.
-- Una tercera mal escrita no daría error, daría un vencimiento que nadie sabría
-- explicar — el mismo motivo por el que caja_movimiento.tipo tiene su CHECK.
ALTER TABLE gym_plans DROP CONSTRAINT IF EXISTS ck_gym_plans_cobertura_unidad;
ALTER TABLE gym_plans ADD CONSTRAINT ck_gym_plans_cobertura_unidad
    CHECK (cobertura_unidad IN ('DIA', 'MES'));

ALTER TABLE gym_plans DROP CONSTRAINT IF EXISTS ck_gym_plans_cobertura_cantidad;
ALTER TABLE gym_plans ADD CONSTRAINT ck_gym_plans_cobertura_cantidad
    CHECK (cobertura_cantidad >= 0);

COMMENT ON COLUMN gym_plans.cobertura_cantidad IS
    'Cuánto tiempo cubre este arancel, junto con cobertura_unidad. 0 = no cubre tiempo (clase suelta: cobra plata pero no corre la fecha).';
COMMENT ON COLUMN gym_plans.cobertura_unidad IS
    'DIA o MES. MES suma meses de calendario: el 7 vence el 7, y si el día no existe (pagó un 31) vence el último que exista.';
COMMENT ON COLUMN gym_plans.duration_days IS
    'OBSOLETA desde la V65: la cobertura la dicen cobertura_cantidad y cobertura_unidad. Se conserva para poder auditar qué vendía cada arancel antes de la migración.';
