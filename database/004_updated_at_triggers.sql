-- ============================================
-- VELTRONIK - FIX 004: TRIGGERS updated_at
-- ============================================
-- Auto-actualiza updated_at en todas las tablas que lo tienen.
-- Sin esto, updated_at nunca cambia después del INSERT.
-- ============================================

-- Función genérica de trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplicar a todas las tablas con updated_at
DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOR tbl IN
        SELECT table_name FROM information_schema.columns
        WHERE table_schema = 'public'
        AND column_name = 'updated_at'
        AND table_name NOT IN ('schema_migrations')
    LOOP
        EXECUTE format(
            'DROP TRIGGER IF EXISTS trigger_updated_at ON public.%I; ' ||
            'CREATE TRIGGER trigger_updated_at BEFORE UPDATE ON public.%I ' ||
            'FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();',
            tbl, tbl
        );
    END LOOP;
END $$;
