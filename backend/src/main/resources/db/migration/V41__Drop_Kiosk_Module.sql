-- V41__Drop_Kiosk_Module.sql
-- ============================================================================
-- BAJA TOTAL del vertical Kiosco / Almacén (decisión de producto, 2026-07-27).
-- Veltronik pasa a ser un ecosistema SOLO para gimnasios.
--
-- No hay clientes reales KIOSCO (confirmado por el dueño): solo negocios de
-- prueba. Mismo procedimiento que la V40 (Fútbol 5):
--
--   (1) Se dropean las tablas del módulo kiosk. Las migraciones V25–V28 quedan
--       como HISTORIA de Flyway: la regla del proyecto prohíbe tocar una
--       migración ya aplicada. Solo se va hacia adelante.
--   (2) Se purgan los negocios KIOSCO con TODOS sus datos. Es OBLIGATORIO en
--       esta misma migración: el enum BusinessType.KIOSCO ya no existe en el
--       código, y una fila superviviente rompería el arranque del lobby al
--       deserializar el tipo.
--
-- Lo que NO se toca: el módulo `fiscal` (facturación ARCA) y sus tablas. Es un
-- módulo COMPARTIDO, no del kiosco: hoy queda sin consumidor, esperando que el
-- gimnasio facture. Los comprobantes ya emitidos se conservan (obligación legal).
--
-- Idempotente: re-ejecutarla sobre una base ya purgada es un no-op.
-- ============================================================================

-- ─── (1) Tablas del módulo kiosk: afuera (hijas → padres) ───
DROP TABLE IF EXISTS kiosk_sale_payment CASCADE;
DROP TABLE IF EXISTS kiosk_sale_item CASCADE;
DROP TABLE IF EXISTS kiosk_sale CASCADE;
DROP TABLE IF EXISTS kiosk_purchase_item CASCADE;
DROP TABLE IF EXISTS kiosk_purchase CASCADE;
DROP TABLE IF EXISTS kiosk_account_movement CASCADE;
DROP TABLE IF EXISTS kiosk_stock_movement CASCADE;
DROP TABLE IF EXISTS kiosk_cash_session CASCADE;
DROP TABLE IF EXISTS kiosk_customer CASCADE;
DROP TABLE IF EXISTS kiosk_supplier CASCADE;
DROP TABLE IF EXISTS kiosk_product CASCADE;
DROP TABLE IF EXISTS kiosk_category CASCADE;
DROP TABLE IF EXISTS kiosk_settings CASCADE;

-- ─── (2) Purga de los negocios KIOSCO ───
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
    SELECT array_agg(id) INTO doomed FROM tenant WHERE business_type = 'KIOSCO';
    IF doomed IS NULL THEN
        RETURN; -- no hay negocios KIOSCO: nada que purgar
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
        RAISE EXCEPTION 'Purga KIOSCO incompleta: una FK impide borrar el tenant';
    END IF;
END $$;
