-- ============================================================================
-- V69 — La plata se guarda de una sola forma
-- ============================================================================
-- POR QUÉ.
-- Hoy el mismo concepto —un importe en pesos— está declarado de TRES maneras
-- distintas según qué migración creó la columna:
--
--   NUMERIC(10,2)  gym_payments.amount, tenant_payment.amount, saas_revenue.amount
--   NUMERIC(12,2)  gym_plans.price, caja_cierre.esperado_* (los de la V56)
--   NUMERIC(14,2)  caja_movimiento.monto, caja_sesion.fondo_inicial,
--                  caja_cierre.* (los que agregaron la V58 a la V61)
--
-- Y no es solo entre tablas: DENTRO DE `caja_cierre` conviven las dos últimas.
-- `esperado_efectivo` es (12,2) y `egresos_efectivo` es (14,2), en la misma
-- fila, sumando la misma caja. Es el rastro de que cada migración eligió sola,
-- sin una regla escrita en ningún lado.
--
-- ── QUÉ ES ESTO Y QUÉ NO ES ────────────────────────────────────────────────
-- Que quede claro para el que lea esto en un año: ESTO NO ARREGLA UN BUG. La
-- aritmética `numeric` de Postgres no pierde precisión al mezclar escalas, y
-- ningún cliente está cerca de los topes. Nadie está cobrando mal por esto.
--
-- Lo que arregla es que la base deje de tener tres opiniones sobre qué es un
-- importe. Mientras haya tres, cada columna nueva es una decisión a tomar de
-- nuevo, y la que se tome mal no la va a delatar ningún test: va a aparecer el
-- día que un número no entre. Una sola regla —"la plata es NUMERIC(14,2)"— se
-- aplica sin pensar y no se puede aplicar mal.
--
-- ── POR QUÉ (14,2) Y NO (10,2) ─────────────────────────────────────────────
-- Se unifica hacia ARRIBA, al más ancho que ya existe, porque ensanchar nunca
-- pierde un dato y angostar sí. Como referencia de cuánta pista queda: (10,2)
-- tope un importe en 99.999.999,99 — en un país donde los precios se multiplican
-- por diez cada pocos años, ese techo tiene fecha; (14,2) llega a doce cifras
-- enteras y no la tiene.
--
-- Dos decimales en todas: se cobra en pesos, no hay fracciones de centavo.
--
-- ── LO QUE CUESTA CORRERLA ─────────────────────────────────────────────────
-- Cambiar la precisión de un NUMERIC reescribe la tabla y toma un lock
-- exclusivo mientras dura. Las tablas más grandes de un cliente hoy son el
-- padrón (385 socios) y sus cobros: son milisegundos. Vale decirlo igual,
-- porque la misma migración sobre una tabla de millones de filas no sería
-- gratis.
-- ============================================================================

-- ── Cobros del gimnasio ────────────────────────────────────────────────────
ALTER TABLE gym_payments   ALTER COLUMN amount TYPE NUMERIC(14,2);
ALTER TABLE gym_plans      ALTER COLUMN price  TYPE NUMERIC(14,2);

-- ── Cobranza del SaaS (lo que Veltronik le cobra al gimnasio) ──────────────
ALTER TABLE tenant_payment ALTER COLUMN amount TYPE NUMERIC(14,2);
ALTER TABLE saas_revenue   ALTER COLUMN amount TYPE NUMERIC(14,2);

-- ── Caja: las seis que quedaron en (12,2) cuando el resto ya era (14,2) ────
ALTER TABLE caja_cierre ALTER COLUMN esperado_efectivo      TYPE NUMERIC(14,2);
ALTER TABLE caja_cierre ALTER COLUMN esperado_transferencia TYPE NUMERIC(14,2);
ALTER TABLE caja_cierre ALTER COLUMN esperado_tarjeta       TYPE NUMERIC(14,2);
ALTER TABLE caja_cierre ALTER COLUMN esperado_otros         TYPE NUMERIC(14,2);
ALTER TABLE caja_cierre ALTER COLUMN declarado_efectivo     TYPE NUMERIC(14,2);
ALTER TABLE caja_cierre ALTER COLUMN diferencia             TYPE NUMERIC(14,2);

-- La regla, escrita donde se va a leer: en la columna misma. Que el próximo que
-- agregue un importe la encuentre sin tener que buscar esta migración.
COMMENT ON COLUMN gym_payments.amount IS
    'Importe en pesos. Todo dinero en esta base es NUMERIC(14,2) — ver V69.';
COMMENT ON COLUMN caja_movimiento.monto IS
    'Importe en pesos. Todo dinero en esta base es NUMERIC(14,2) — ver V69.';
