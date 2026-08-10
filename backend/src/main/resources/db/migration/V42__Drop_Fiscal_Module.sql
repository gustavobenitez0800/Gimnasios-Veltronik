-- V42__Drop_Fiscal_Module.sql
-- ============================================================================
-- BAJA TOTAL del módulo fiscal (facturación ARCA) — decisión del dueño, 2026-07-27.
--
-- El módulo se construyó para el kiosco (WSAA + WSFEv1, CAE real probado en
-- homologación). Con el kiosco dado de baja en la V41 y la decisión de que el
-- gimnasio no va a facturar por acá, quedaba sin ningún consumidor.
--
-- SOBRE LA CONSERVACIÓN LEGAL DE COMPROBANTES: no hay comprobantes reales que
-- conservar. El único vertical que emitía era el kiosco, y no llegó a tener
-- clientes: lo emitido fue contra el ambiente de HOMOLOGACIÓN de ARCA (pruebas),
-- que no tiene validez fiscal. Si en algún momento hubiera habido emisiones en
-- PRODUCCIÓN, esta migración NO debería correrse sin exportarlas antes.
--
-- Las migraciones V26 (init) y V39 (nullable) quedan como HISTORIA de Flyway.
-- Idempotente: re-ejecutarla sobre una base ya limpia es un no-op.
-- ============================================================================

DROP TABLE IF EXISTS fiscal_voucher_item CASCADE;
DROP TABLE IF EXISTS fiscal_voucher CASCADE;
DROP TABLE IF EXISTS fiscal_point_of_sale CASCADE;   -- su entidad ya se había ido en la 2.7
DROP TABLE IF EXISTS fiscal_config CASCADE;
