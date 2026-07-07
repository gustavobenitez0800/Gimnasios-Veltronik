-- V39: fiscal_config debe aceptar la fila INICIAL vacía (onboarding de ARCA).
--
-- BUG que corrige: FiscalConfigService.getOrCreateForCurrentTenant() crea la config
-- del tenant en blanco la primera vez que el dueño abre la pantalla de facturación
-- (cuit y condición IVA se cargan DESPUÉS, desde la UI). Con cuit/condicion_iva
-- NOT NULL, esa INSERT inicial violaba la constraint → GET /api/fiscal/config
-- devolvía 500 y el dueño nunca podía ni EMPEZAR a configurar ARCA.
--
-- "Sin configurar" es un estado legítimo del dominio: la emisión ya está protegida
-- por enabled=false (default) + requireComplete() (exige cuit, condición, punto de
-- venta y certificado antes de emitir). La constraint NOT NULL no protegía nada:
-- solo rompía el onboarding.
ALTER TABLE fiscal_config ALTER COLUMN cuit DROP NOT NULL;
ALTER TABLE fiscal_config ALTER COLUMN condicion_iva DROP NOT NULL;
