-- ============================================================================
-- V67 — Las cuatro tablas muertas salen de la base
-- ============================================================================
-- POR QUÉ.
-- `gym_member`, `member_payment`, `member_subscription` y `membership_plan` son
-- las tablas del modelo original (V1/V2, 2025). Ese modelo se reemplazó en dos
-- pasos —V6 unificó en `members`/`payments`, V10 separó en `gym_members`/
-- `gym_payments`— y desde entonces NADIE las nombra: cero referencias en el
-- backend, cero en el frontend, cero entidades JPA. Se quedaron porque nunca
-- hubo una migración que las sacara, no porque se decidiera conservarlas.
--
-- Mientras tanto pesan de verdad:
--
--   1. GUARDAN DATOS PERSONALES SIN DUEÑO. `gym_member` tiene nombre, apellido,
--      DNI, email y teléfono de socios reales. Nadie los lee, nadie los
--      actualiza, y no los alcanza ninguna política de retención. Es la peor
--      combinación posible: el riesgo de tenerlos sin el beneficio de usarlos.
--
--   2. ENSUCIAN EL BORRADO DE CUENTA. La purga de un negocio (V50) recorre
--      TODAS las tablas de `public` que tengan `tenant_id`, y estas cuatro
--      entran en esa vuelta aunque no signifiquen nada. Peor: sus FK a `tenant`
--      no tienen ON DELETE CASCADE, así que dependen de que la purga insista
--      diez pasadas para poder salir.
--
--   3. OCUPAN EL NOMBRE BUENO. `gym_member` —singular, que es la convención a
--      la que hay que ir— está tomado por un cadáver. Sacarlo libera el nombre
--      para el día que `gym_members` se renombre.
--
-- Es el mismo movimiento que ya se hizo con canchas (V40), kiosco (V41), fiscal
-- (V42) y el circuito offline viejo (V43): cuando un módulo se da de baja, sus
-- tablas se van. Estas cuatro simplemente se habían salteado el turno.
--
-- ── POR QUÉ SE BORRA Y NO SE ARCHIVA EN OTRO ESQUEMA ────────────────────────
-- La primera idea fue moverlas a un esquema `legacy` en vez de borrarlas. Es
-- peor por dos razones, y las dos importan:
--
--   · La purga de cuenta mira SOLO `public`. Con las tablas en `legacy`, sus FK
--     a `tenant` seguirían vivas pero fuera del alcance de la purga: borrar un
--     negocio pasaría a fallar con un error de FK. Un archivo que rompe el
--     borrado no es un archivo, es una trampa.
--
--   · Borrar la cuenta es una PROMESA al cliente (V50, con 30 días de gracia).
--     Guardarle el padrón de socios en un esquema escondido es incumplirla en
--     silencio.
--
-- ── LA MIGRACIÓN SE NIEGA A BORRAR LO QUE NO PUEDE PROBAR ───────────────────
-- Borrar es irreversible, así que esto no borra "confiando" en que el linaje
-- está completo: lo VERIFICA fila por fila y aborta si no cierra.
--
--   · `gym_member` y `member_payment` tienen destino conocido (V6 → V10). Se
--     exige que cada id esté hoy en `gym_members` / `gym_payments`.
--   · `membership_plan` y `member_subscription` NUNCA se migraron a ningún
--     lado: el modelo unificado no tuvo aranceles hasta la V52, que creó
--     `gym_plans` de cero. Para esas dos la única prueba válida es que estén
--     vacías.
--
-- Si algo no cierra, la migración FALLA con el detalle de qué encontró y no se
-- borra nada. Un deploy caído se arregla; un padrón borrado, no.
-- ============================================================================

DO $$
DECLARE
    faltan_socios   bigint := 0;
    faltan_pagos    bigint := 0;
    quedan_planes   bigint := 0;
    quedan_cuotas   bigint := 0;
BEGIN
    -- ── Prueba 1: cada socio viejo tiene que estar en el padrón de hoy ──────
    IF to_regclass('public.gym_member') IS NOT NULL THEN
        SELECT count(*) INTO faltan_socios
        FROM gym_member vieja
        WHERE NOT EXISTS (SELECT 1 FROM gym_members hoy WHERE hoy.id = vieja.id);
    END IF;

    -- ── Prueba 2: cada pago viejo tiene que estar en los cobros de hoy ──────
    IF to_regclass('public.member_payment') IS NOT NULL THEN
        SELECT count(*) INTO faltan_pagos
        FROM member_payment vieja
        WHERE NOT EXISTS (SELECT 1 FROM gym_payments hoy WHERE hoy.id = vieja.id);
    END IF;

    -- ── Prueba 3 y 4: las que no tienen destino, tienen que estar vacías ────
    IF to_regclass('public.membership_plan') IS NOT NULL THEN
        SELECT count(*) INTO quedan_planes FROM membership_plan;
    END IF;

    IF to_regclass('public.member_subscription') IS NOT NULL THEN
        SELECT count(*) INTO quedan_cuotas FROM member_subscription;
    END IF;

    IF faltan_socios > 0 OR faltan_pagos > 0 OR quedan_planes > 0 OR quedan_cuotas > 0 THEN
        RAISE EXCEPTION USING
            ERRCODE = 'data_exception',
            MESSAGE = 'V67 ABORTADA: hay datos que solo viven en las tablas viejas.',
            DETAIL  = format(
                'socios sin equivalente en gym_members: %s | pagos sin equivalente en gym_payments: %s | filas en membership_plan: %s | filas en member_subscription: %s',
                faltan_socios, faltan_pagos, quedan_planes, quedan_cuotas),
            HINT    = 'No se borró nada. Revisar esas filas y decidir a mano antes de volver a correr la migración.';
    END IF;
END $$;

-- El orden respeta las FK (hijas primero), aunque CASCADE alcanzaría: dejarlo
-- explícito documenta quién dependía de quién, que es justamente lo que se
-- pierde cuando la tabla ya no está.
DROP TABLE IF EXISTS member_subscription CASCADE;
DROP TABLE IF EXISTS member_payment      CASCADE;
DROP TABLE IF EXISTS membership_plan     CASCADE;
DROP TABLE IF EXISTS gym_member          CASCADE;
