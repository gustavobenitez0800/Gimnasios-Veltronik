-- ============================================
-- VELTRONIK - El arqueo también cuenta lo digital
-- ============================================
-- Hasta acá el cierre de caja contaba UNA sola cosa: el efectivo del cajón. Las
-- transferencias se guardaban como referencia, sin que nadie las declarara.
--
-- ⚠️ ESO DEJABA ABIERTO EL AGUJERO MÁS GRANDE DEL MÓDULO. Quien atiende cobra $48.000 en
-- efectivo, se guarda la plata, y registra el cobro como "transferencia". El cajón cuadra
-- perfecto —el sistema no espera ese efectivo— y la transferencia que el sistema da por
-- recibida nunca existió. Sin declarar lo digital, nada lo delata.
--
-- Ahora se declaran las dos cosas y cada una tiene su diferencia.

-- Mercado Pago tenía su propia opción al cobrar, pero el cierre no lo reconocía y lo
-- mandaba a "otros" junto con los métodos raros. Un gimnasio que cobra por MP no veía
-- esa plata en ninguna parte del arqueo.
ALTER TABLE caja_cierre ADD COLUMN IF NOT EXISTS esperado_mercadopago NUMERIC(14,2) NOT NULL DEFAULT 0;

-- Lo declarado y su diferencia. Transferencias y Mercado Pago van juntos: quien cuenta
-- abre la app del banco o de MP y mira cuánto entró. Son un solo gesto, y separarlos
-- sería pedir dos números para la misma revisión.
ALTER TABLE caja_cierre ADD COLUMN IF NOT EXISTS declarado_digital NUMERIC(14,2);
ALTER TABLE caja_cierre ADD COLUMN IF NOT EXISTS diferencia_digital NUMERIC(14,2);

-- Los cierres viejos quedan con NULL a propósito: en esos días nadie contó lo digital, y
-- rellenarlos con cero diría que se contó y dio bien. Un arqueo que no se hizo no es un
-- arqueo que cuadró.
