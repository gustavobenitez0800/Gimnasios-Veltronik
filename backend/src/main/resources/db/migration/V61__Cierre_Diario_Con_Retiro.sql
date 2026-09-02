-- ============================================================================
-- V61 — CIERRE DIARIO: LO QUE SE RETIRA Y LO QUE QUEDA EN EL CAJÓN
-- ============================================================================
--
-- El cierre de caja deja de ser un ARQUEO A CIEGAS y pasa a ser un CIERRE DIARIO.
--
-- Antes: quien cerraba contaba la plata, escribía cuánto tenía, y recién ahí el sistema
-- mostraba lo esperado y la diferencia. La idea era que no se pudiera "ajustar" el número
-- al esperado.
--
-- Ahora (decisión del dueño, 2026-09-02): el sistema ya sabe cuánto entró por efectivo y
-- cuánto por transferencia —cada cobro tiene su forma de pago—, así que no tiene sentido
-- que una persona lo vuelva a averiguar y lo tipee. La pantalla lo muestra sumado, y lo
-- único que decide una persona es CUÁNTO SE LLEVA del cajón.
--
-- ⚠️ LO QUE SE PIERDE, dicho en claro: sin conteo declarado no hay diferencia que calcular,
-- así que el sistema ya no puede avisar que falta plata del cajón. Las columnas del arqueo
-- (declarado_efectivo, diferencia, declarado_digital, diferencia_digital, con_arqueo) se
-- DEJAN: los cierres viejos las tienen cargadas y su historial tiene que seguir leyéndose
-- igual. En los cierres nuevos van en NULL, y `con_arqueo` en false.
--
-- LAS DOS COLUMNAS NUEVAS SON UNA CADENA: lo que queda en el cajón hoy es el fondo con el
-- que arranca mañana. Por eso desaparece el paso de "abrir caja" declarando el cambio: ese
-- número ya no lo tiene que recordar nadie, lo dijo el cierre anterior.

ALTER TABLE caja_cierre ADD COLUMN IF NOT EXISTS retiro_efectivo NUMERIC(14,2);
ALTER TABLE caja_cierre ADD COLUMN IF NOT EXISTS queda_en_caja   NUMERIC(14,2);

COMMENT ON COLUMN caja_cierre.retiro_efectivo IS
    'Efectivo que se llevó del cajón al cerrar. NULL en los cierres viejos (era del arqueo a ciegas).';
COMMENT ON COLUMN caja_cierre.queda_en_caja IS
    'Efectivo que quedó en el cajón = esperado - retiro. Es el fondo con el que arranca el día siguiente.';
