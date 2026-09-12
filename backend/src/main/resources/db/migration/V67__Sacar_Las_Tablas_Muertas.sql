-- ============================================================================
-- V67 — Las tablas muertas salen de la base (tres de las cuatro)
-- ============================================================================
-- POR QUÉ.
-- `member_subscription`, `member_payment` y `membership_plan` son del modelo
-- original (V1/V2). Ese modelo se reemplazó en dos pasos —V6 unificó en
-- `members`/`payments`, V10 separó en `gym_members`/`gym_payments`— y desde
-- entonces NADIE las nombra: cero referencias en el backend, cero en el
-- frontend, cero entidades JPA. Se quedaron porque nunca hubo una migración que
-- las sacara, no porque se decidiera conservarlas.
--
-- Es el mismo movimiento que ya se hizo con canchas (V40), kiosco (V41), fiscal
-- (V42) y el circuito offline viejo (V43): cuando un módulo se da de baja, sus
-- tablas se van.
--
-- ============================================================================
-- ⭐ POR QUÉ `gym_member` NO SE BORRA — Y CÓMO NOS ENTERAMOS
-- ============================================================================
-- La primera versión de esta migración borraba las CUATRO. Antes de borrar,
-- exigía la prueba de que el dato estaba en otro lado. En producción, esa
-- prueba FALLÓ:
--
--     ERROR: V67 ABORTADA: hay datos que solo viven en las tablas viejas.
--     Detail: socios sin equivalente en gym_members: 114 | pagos sin
--             equivalente en gym_payments: 0 | filas en membership_plan: 0 |
--             filas en member_subscription: 0
--
-- Hay 114 socios —con nombre, apellido, DNI, email y teléfono— que están en
-- `gym_member` y NO están en el padrón de hoy. Se los revisó:
--
--     · 114 de 114 pertenecen a negocios QUE SIGUEN EXISTIENDO. Ninguno es de
--       una cuenta dada de baja.
--     · 113 de 114 no aparecen en `gym_members` con el mismo DNI, ni siquiera
--       bajo otro id. No son duplicados.
--     · Se crearon entre el 2026-01-23 y el 2026-05-27, o sea mientras
--       `gym_member` era la tabla VIVA, antes del cutover al modelo unificado.
--
-- No son datos muertos: son 114 personas de clientes activos que se perdieron
-- en algún punto del camino V6 → V10. Qué hacer con ellas —recuperarlas al
-- padrón o darlas por bajas de verdad— es una decisión del negocio, no de una
-- migración de limpieza, y hasta que se tome **esta tabla no se toca**.
--
-- Borrarla habría sido irreversible y silencioso: el padrón seguía andando
-- igual y nadie se enteraba hasta que alguien preguntara por uno de esos 114.
--
-- ⚠️ NO RENUMERAR NI "DESTRABAR" ESTA MIGRACIÓN BORRANDO LA TABLA. Mientras
-- `gym_member` exista, la lleva el RLS de la V68 como a cualquier otra tabla
-- con datos personales, y el borrado de cuenta (V50) la purga junto con el
-- resto porque está en `public` y tiene `tenant_id`. O sea: está protegida y
-- respeta la baja de cuenta. No hay apuro.
--
-- ── LAS TRES QUE SÍ SALEN, Y CON QUÉ PRUEBA ────────────────────────────────
-- La guarda se mantiene, porque es lo que hizo que esto se descubriera en vez
-- de perderse. Para cada tabla exige lo que corresponde:
--
--     member_payment        cada id tiene que estar hoy en `gym_payments`
--                           (en producción dio 0 sin equivalente)
--     membership_plan       tiene que estar vacía  (dio 0 filas)
--     member_subscription   tiene que estar vacía  (dio 0 filas)
--
-- Si algo no cierra, la migración FALLA con el detalle y no se borra nada. Un
-- deploy caído se arregla; un dato borrado, no.
-- ============================================================================

DO $$
DECLARE
    faltan_pagos    bigint := 0;
    quedan_planes   bigint := 0;
    quedan_cuotas   bigint := 0;
BEGIN
    -- Cada pago viejo tiene que estar en los cobros de hoy.
    IF to_regclass('public.member_payment') IS NOT NULL THEN
        SELECT count(*) INTO faltan_pagos
        FROM member_payment vieja
        WHERE NOT EXISTS (SELECT 1 FROM gym_payments hoy WHERE hoy.id = vieja.id);
    END IF;

    -- Las que no tienen destino en ninguna tabla nueva tienen que estar vacías:
    -- el modelo unificado no tuvo aranceles hasta la V52, que creó `gym_plans`
    -- de cero sin migrar nada desde acá.
    IF to_regclass('public.membership_plan') IS NOT NULL THEN
        SELECT count(*) INTO quedan_planes FROM membership_plan;
    END IF;

    IF to_regclass('public.member_subscription') IS NOT NULL THEN
        SELECT count(*) INTO quedan_cuotas FROM member_subscription;
    END IF;

    IF faltan_pagos > 0 OR quedan_planes > 0 OR quedan_cuotas > 0 THEN
        RAISE EXCEPTION USING
            ERRCODE = 'data_exception',
            MESSAGE = 'V67 ABORTADA: hay datos que solo viven en las tablas viejas.',
            DETAIL  = format(
                'pagos sin equivalente en gym_payments: %s | filas en membership_plan: %s | filas en member_subscription: %s',
                faltan_pagos, quedan_planes, quedan_cuotas),
            HINT    = 'No se borró nada. Revisar esas filas y decidir a mano antes de volver a correr la migración.';
    END IF;
END $$;

-- El orden respeta las FK (hijas primero), aunque CASCADE alcanzaría: dejarlo
-- explícito documenta quién dependía de quién, que es justamente lo que se
-- pierde cuando la tabla ya no está.
DROP TABLE IF EXISTS member_subscription CASCADE;
DROP TABLE IF EXISTS member_payment      CASCADE;
DROP TABLE IF EXISTS membership_plan     CASCADE;

-- ── La que se queda, con el motivo escrito donde vive ──────────────────────
COMMENT ON TABLE gym_member IS
    'TABLA DEL MODELO ORIGINAL (V1/V2), sin uso en el código desde el cutover al modelo '
    'unificado (V6 → V10). NO SE BORRA: guarda 114 socios —con DNI, email y teléfono— que '
    'no están en `gym_members`, todos de negocios que siguen existiendo y sin duplicado por '
    'DNI en el padrón actual. Se crearon entre 2026-01-23 y 2026-05-27, mientras esta tabla '
    'era la viva. Decidir si se recuperan al padrón o se dan de baja de verdad es una '
    'decisión del negocio; hasta entonces la tabla queda como está. Ver V67.';
