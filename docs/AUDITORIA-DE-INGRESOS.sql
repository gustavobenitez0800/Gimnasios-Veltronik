-- ============================================================================
-- AUDITORÍA DE LA PLATA — solo lectura (ningún UPDATE, ningún DELETE)
-- ============================================================================
-- Para correr en el SQL Editor de Supabase, de a una consulta. Sirve antes de la V88
-- (qué va a encontrar) y después (qué hizo). Ver ADR-015.
--
-- ⚠️ Los resultados traen nombres de gimnasios y montos: NO se pegan en el repositorio
-- (es público). Se miran ahí y se anotan conclusiones, no datos.
-- ============================================================================


-- 1. Las formas de pago que hay escritas. Después de la V88 tienen que ser solo
--    CASH, TRANSFER, MERCADOPAGO, CARD y OTHER. Si aparece otra, el CHECK
--    ck_gym_payment_metodo quedó NOT VALID (el log de la migración lo dice).
SELECT payment_method, COUNT(*) AS cobros, SUM(amount) AS plata
  FROM gym_payment GROUP BY 1 ORDER BY 2 DESC;

SELECT metodo, COUNT(*) AS movimientos FROM caja_movimiento GROUP BY 1 ORDER BY 2 DESC;


-- 2. Los estados. Solo paid, pending y cancelled.
SELECT status, COUNT(*) AS cobros, SUM(amount) AS plata FROM gym_payment GROUP BY 1 ORDER BY 2 DESC;


-- 3. Montos en cero o negativos: restan o no dicen nada en todos los totales.
SELECT t.name AS gimnasio, p.payment_date, p.amount, p.payment_method, p.status, p.import_id IS NOT NULL AS importado
  FROM gym_payment p JOIN tenant t ON t.id = p.tenant_id
 WHERE p.amount <= 0
 ORDER BY p.payment_date DESC;


-- 4. Cobros con la fecha en el futuro (un "2027" mal tipeado): el libro los cuenta en ese mes.
SELECT t.name AS gimnasio, p.payment_date, p.amount, p.created_at
  FROM gym_payment p JOIN tenant t ON t.id = p.tenant_id
 WHERE p.status = 'paid'
   AND p.payment_date > (now() AT TIME ZONE 'America/Argentina/Buenos_Aires') + INTERVAL '1 day'
 ORDER BY p.payment_date DESC;


-- 5. ⭐ LA PLATA QUE LA REGLA VIEJA NUNCA CONTÓ: cobros con fecha dentro del período de un
--    cierre, pero cargados DESPUÉS de que ese cierre se calculó. Ningún cierre los tomó.
--    Desde la V88 los toma el próximo cierre (si son de los últimos 30 días).
SELECT t.name AS gimnasio, COUNT(*) AS cobros, SUM(p.amount) AS plata,
       MIN(p.payment_date) AS desde, MAX(p.payment_date) AS hasta
  FROM gym_payment p
  JOIN tenant t ON t.id = p.tenant_id
 WHERE p.status = 'paid' AND p.import_id IS NULL
   AND EXISTS (SELECT 1 FROM caja_cierre c
                WHERE c.tenant_id = p.tenant_id
                  AND p.payment_date >= c.desde AND p.payment_date <= c.hasta
                  AND p.created_at > c.created_at)
   AND NOT EXISTS (SELECT 1 FROM caja_cierre c
                    WHERE c.tenant_id = p.tenant_id
                      AND p.payment_date >= c.desde AND p.payment_date <= c.hasta
                      AND p.created_at <= c.created_at)
 GROUP BY 1 ORDER BY 3 DESC;


-- 6. Cobros justo en el borde entre dos cierres: la regla vieja los contó DOS veces.
SELECT t.name AS gimnasio, p.payment_date, p.amount
  FROM gym_payment p
  JOIN tenant t ON t.id = p.tenant_id
  JOIN caja_cierre c ON c.tenant_id = p.tenant_id AND p.payment_date = c.hasta
 WHERE p.status = 'paid' AND p.import_id IS NULL
   AND EXISTS (SELECT 1 FROM caja_cierre c2 WHERE c2.tenant_id = p.tenant_id AND c2.desde = c.hasta);


-- 7. Cobros BORRADOS antes de la V88 (desde la V88 ya no se borran, se anulan). Su plata salió
--    de los ingresos sin dejar el renglón; el rastro es lo único que queda.
SELECT t.name AS gimnasio, a.created_at AS cuando, a.antes AS cobro, a.hecho_por_nombre AS quien
  FROM gym_payment_ajuste a JOIN tenant t ON t.id = a.tenant_id
 WHERE a.tipo = 'BORRADO'
 ORDER BY a.created_at DESC;


-- 8. Cobros YA CERRADOS que se editaron después de su cierre (el monto o la forma de pago).
--    Antes de la V88 esa diferencia no entraba en ningún cierre.
SELECT t.name AS gimnasio, a.created_at AS cuando, a.campo, a.antes, a.despues, a.hecho_por_nombre AS quien
  FROM gym_payment_ajuste a
  JOIN tenant t ON t.id = a.tenant_id
  JOIN gym_payment p ON p.id = a.payment_id
 WHERE a.tipo = 'EDICION' AND a.campo IN ('monto', 'método', 'estado')
   AND EXISTS (SELECT 1 FROM caja_cierre c
                WHERE c.tenant_id = a.tenant_id
                  AND p.payment_date >= c.desde AND p.payment_date <= c.hasta
                  AND a.created_at > c.created_at)
 ORDER BY a.created_at DESC;


-- 9. Después de la V88: lo que el próximo cierre de cada gimnasio va a tomar, y cuánto de eso
--    tiene fecha de antes del último cierre (lo que la regla vieja había perdido).
SELECT t.name AS gimnasio,
       COUNT(*) AS cobros_sin_sellar,
       SUM(p.amount) AS plata,
       COUNT(*) FILTER (WHERE p.payment_date <= u.hasta) AS con_fecha_de_un_dia_cerrado,
       SUM(p.amount) FILTER (WHERE p.payment_date <= u.hasta) AS plata_de_dias_cerrados
  FROM gym_payment p
  JOIN tenant t ON t.id = p.tenant_id
  JOIN (SELECT tenant_id, MAX(hasta) AS hasta FROM caja_cierre GROUP BY 1) u ON u.tenant_id = p.tenant_id
 WHERE p.sellado_at IS NULL AND p.import_id IS NULL AND p.status = 'paid'
 GROUP BY 1 ORDER BY 3 DESC;


-- 10. Los aportes y retiros del dueño anotados como movimientos: desde la V88 no cuentan como
--     ingreso ni gasto del gimnasio (mueven el cajón igual).
SELECT t.name AS gimnasio, m.tipo, m.categoria, COUNT(*) AS movimientos, SUM(m.monto) AS plata
  FROM caja_movimiento m JOIN tenant t ON t.id = m.tenant_id
 WHERE lower(btrim(m.categoria)) IN ('aporte', 'retiro') AND m.anulado_at IS NULL
 GROUP BY 1, 2, 3 ORDER BY 1;


-- 11. 🔴 MESES REGALADOS AL EDITAR (bug arreglado el 2026-09-22). Editar un cobro CON ARANCEL
--     (aunque fuera solo la nota) le recalculaba el período arrancando donde terminaba la
--     cobertura del socio, que ya incluía ese cobro: cada edición le daba otro mes. La marca que
--     deja: el período del cobro arranca bastante DESPUÉS de la fecha del cobro y justo donde
--     terminaba otro período del mismo socio... o el mismo. Son CANDIDATOS para revisar a mano
--     (un socio que pagó por adelantado también arranca después): no corregir en masa.
SELECT t.name AS gimnasio, s.first_name, s.last_name, p.payment_date, p.period_start, p.period_end,
       s.membership_end AS vence_hoy, p.updated_at AS editado
  FROM gym_payment p
  JOIN tenant t ON t.id = p.tenant_id
  JOIN gym_member s ON s.id = p.member_id
 WHERE p.plan_id IS NOT NULL AND p.status = 'paid' AND p.import_id IS NULL
   AND p.period_start > p.payment_date + INTERVAL '20 days'
   AND p.updated_at > p.created_at + INTERVAL '1 minute'
 ORDER BY p.updated_at DESC;
