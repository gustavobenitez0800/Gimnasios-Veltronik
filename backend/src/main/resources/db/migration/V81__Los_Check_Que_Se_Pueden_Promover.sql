-- ============================================================================
-- V81 — Los CHECK de la V72 pasan a validados (los que puedan)
-- ============================================================================
-- POR QUÉ.
-- La V72 agregó seis restricciones sobre columnas cuyo único escritor es un enum
-- de Java, y las dejó `NOT VALID`. Eso NO es "a medias": una restricción NOT
-- VALID **aplica a toda fila nueva o modificada**; lo único que no hace es
-- revisar las viejas. Se hizo así porque una fila vieja fuera del conjunto
-- —perfectamente posible: el proyecto tuvo cuatro verticales y las V40-V42
-- borraron sus TABLAS, no sus filas de `tenant`— habría volteado el ARRANQUE
-- del backend, que es cuando corre Flyway.
--
-- Para terminar de cerrarlas hay que saber si el pasado está limpio. Eso lo
-- dice el log del deploy de la V72... que rota. Y un paso manual que depende de
-- que alguien se acuerde de mirar un log es un paso que no se hace nunca.
--
-- ── ENTONCES ESTA MIGRACIÓN LO AVERIGUA Y DECIDE SOLA ──────────────────────
-- Intenta promover cada restricción por separado. Si el pasado de esa tabla
-- está limpio, queda VALIDADA. Si no, **se la deja NOT VALID y se avisa por el
-- log con el nombre**, sin tirar el deploy.
--
-- Acá el try/catch se justifica —y en una migración hay que justificarlo— porque
-- los dos resultados posibles son seguros y el comportamiento es el MISMO para
-- todo lo que se escriba de ahora en más. La diferencia entre VALID y NOT VALID
-- es si Postgres ya revisó las filas viejas: un flag del catálogo, no una regla
-- distinta. La alternativa era un paso manual que no se iba a hacer, o un deploy
-- que se cae por un dato de 2025.
--
-- ⚠️ Correrla de nuevo no molesta: validar algo ya validado es un no-op.
-- ============================================================================

DO $$
DECLARE
    objetivo   record;
    promovidas int := 0;
    pendientes text[] := ARRAY[]::text[];
BEGIN
    FOR objetivo IN
        SELECT * FROM (VALUES
            ('tenant',             'ck_tenant_business_type'),
            ('tenant_membership',  'ck_tenant_membership_role'),
            ('device_registry',    'ck_device_registry_role'),
            ('device_registry',    'ck_device_registry_status'),
            ('access_denied',      'ck_access_denied_reason'),
            ('gym_payment_ajuste', 'ck_gym_payment_ajuste_tipo')
        ) AS t(tabla, restriccion)
    LOOP
        -- Si no está (alguien la borró a mano, o esta base no pasó por la V72),
        -- no es un error: no hay nada que promover.
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint c
            JOIN pg_class r ON r.oid = c.conrelid
            JOIN pg_namespace n ON n.oid = r.relnamespace
            WHERE n.nspname = 'public'
              AND r.relname = objetivo.tabla
              AND c.conname = objetivo.restriccion
        ) THEN
            CONTINUE;
        END IF;

        BEGIN
            EXECUTE format('ALTER TABLE %I VALIDATE CONSTRAINT %I',
                           objetivo.tabla, objetivo.restriccion);
            promovidas := promovidas + 1;
        EXCEPTION WHEN check_violation THEN
            -- Hay filas viejas que no cumplen. Queda NOT VALID, que ya protege
            -- todo lo nuevo, y el nombre va al log para poder mirarlas.
            pendientes := pendientes || (objetivo.tabla || '.' || objetivo.restriccion);
        END;
    END LOOP;

    RAISE NOTICE 'V81: % restricciones promovidas a validadas.', promovidas;

    IF array_length(pendientes, 1) IS NULL THEN
        RAISE NOTICE 'V81: no quedo ninguna pendiente — el pasado estaba limpio.';
    ELSE
        RAISE WARNING 'V81: estas quedan NOT VALID porque hay filas viejas que no cumplen (siguen aplicando a todo lo nuevo): %',
            array_to_string(pendientes, ', ');
    END IF;
END $$;
