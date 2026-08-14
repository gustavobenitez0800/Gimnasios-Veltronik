-- V40__Drop_Courts_Module.sql
-- ============================================================================
-- BAJA TOTAL del vertical Fútbol 5 (decisión de producto, 2026-07-18).
-- No hay clientes reales FUTBOL_5: solo negocios de prueba del fundador.
--
--   (1) Se dropean las tablas del módulo courts (V20–V24 quedan como HISTORIA
--       de Flyway: la regla del proyecto prohíbe tocar una migración aplicada).
--   (2) Se purgan los negocios FUTBOL_5 con TODOS sus datos. Esto es
--       OBLIGATORIO en esta misma migración: el enum BusinessType.FUTBOL_5 ya
--       no existe en el código, y una fila superviviente rompería el arranque
--       del lobby al deserializar el tipo.
--
-- Idempotente: re-ejecutarla sobre una base ya purgada es un no-op.
-- ============================================================================

-- ─── (1) Tablas del módulo courts: afuera (hijas → padres) ───
DROP TABLE IF EXISTS court_conversation_message CASCADE;
DROP TABLE IF EXISTS court_conversation CASCADE;
DROP TABLE IF EXISTS court_booking CASCADE;
DROP TABLE IF EXISTS court_recurring_booking CASCADE;
DROP TABLE IF EXISTS court_price_rule CASCADE;
DROP TABLE IF EXISTS court_customer CASCADE;
DROP TABLE IF EXISTS court CASCADE;
DROP TABLE IF EXISTS court_settings CASCADE;

-- ─── (2) Purga de los negocios FUTBOL_5 ───
-- Barrido DINÁMICO: toda tabla real del esquema con columna tenant_id pierde las
-- filas de esos negocios (mismo criterio que TenantService.delete). El loop "pela
-- la cebolla": si una FK todavía bloquea un DELETE (tabla padre con hijos vivos),
-- se saltea y se reintenta en la próxima pasada, hasta que el tenant sale.
DO $$
DECLARE
    doomed uuid[];
    pass int;
    tbl record;
BEGIN
    SELECT array_agg(id) INTO doomed FROM tenant WHERE business_type = 'FUTBOL_5';
    IF doomed IS NULL THEN
        RETURN; -- no hay negocios FUTBOL_5: nada que purgar
    END IF;

    FOR pass IN 1..10 LOOP
        FOR tbl IN
            SELECT c.table_name
            FROM information_schema.columns c
            JOIN information_schema.tables t
              ON t.table_schema = c.table_schema AND t.table_name = c.table_name
            WHERE c.table_schema = 'public'
              AND c.column_name  = 'tenant_id'
              AND t.table_type   = 'BASE TABLE'
        LOOP
            BEGIN
                EXECUTE format('DELETE FROM %I WHERE tenant_id = ANY($1)', tbl.table_name)
                    USING doomed;
            EXCEPTION WHEN foreign_key_violation THEN
                NULL; -- otra tabla hija la referencia: próxima pasada
            END;
        END LOOP;

        BEGIN
            DELETE FROM tenant WHERE id = ANY(doomed);
            EXIT; -- el tenant salió: purga terminada
        EXCEPTION WHEN foreign_key_violation THEN
            NULL; -- todavía queda alguna hija: otra pasada
        END;
    END LOOP;

    -- Ruido fuerte antes que un lobby roto: si tras 10 pasadas el tenant sigue
    -- vivo, la migración FALLA y el deploy no avanza (se investiga la FK culpable).
    IF EXISTS (SELECT 1 FROM tenant WHERE id = ANY(doomed)) THEN
        RAISE EXCEPTION 'Purga FUTBOL_5 incompleta: una FK impide borrar el tenant';
    END IF;
END $$;
