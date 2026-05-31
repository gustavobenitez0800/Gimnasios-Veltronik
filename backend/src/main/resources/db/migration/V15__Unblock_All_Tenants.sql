-- V15__Unblock_All_Tenants.sql

-- Liberar sistema de clientes (Activar todos los tenants y extender periodo de prueba si aplica)
UPDATE tenant 
SET is_active = TRUE;
