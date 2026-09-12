-- ============================================================================
-- V70 — `created_at` y `updated_at` dejan de poder venir vacías
-- ============================================================================
-- POR QUÉ.
-- `BaseEntity` —de la que heredan TODAS las entidades— declara las dos columnas
-- así:
--
--     @Column(name = "created_at", nullable = false, updatable = false)
--     @Column(name = "updated_at", nullable = false)
--
-- Y en la base, ocho tablas las tienen NULLABLE: gym_members, gym_payments,
-- gym_class, class_booking, caja_cierre, caja_movimiento, gym_payment_ajuste y
-- subscriptions. El modelo dice una cosa y la base permite otra.
--
-- ── POR QUÉ EL BUILD NO LO DELATA ──────────────────────────────────────────
-- Porque `ddl-auto=validate` compara TIPOS, no nulabilidad. `ApplicationBootTest`
-- —que es una buena red y atajó cosas peores— pasa igual. Esta mentira podía
-- quedarse para siempre sin que nada se pusiera rojo, que es exactamente el tipo
-- de deriva que hay que cerrar en la base y no en un comentario.
--
-- ── POR QUÉ IMPORTA, MÁS ALLÁ DE LA PROLIJIDAD ─────────────────────────────
-- Hibernate estampa las dos en `@PrePersist`, así que todo lo que entra por JPA
-- viene completo. El problema es lo que NO entra por JPA:
--
--   · los INSERT ... SELECT de las propias migraciones (la V6 y la V10 copiaron
--     `created_at` tal cual venía, y lo que venía nulo quedó nulo),
--   · las consultas nativas,
--   · cualquier carga hecha a mano contra la base.
--
-- Y `created_at` no es decoración: es la línea de tiempo con la que se ordena.
-- Hay un índice montado sobre ella —`ix_pago_ajuste_tenant_fecha (tenant_id,
-- created_at DESC)`— para leer el historial de ajustes de un cobro. Una fila con
-- `created_at` nulo cae en un lugar indefinido de ese orden: no aparece primera
-- ni última, aparece donde toque. En un historial de quién editó un cobro, eso
-- es una fila que se esconde.
--
-- ── EL RELLENO NO ESTAMPA "AHORA" ──────────────────────────────────────────
-- Lo fácil sería `COALESCE(created_at, NOW())`. Sería mentir de nuevo, más
-- prolijo: dejaría cobros de 2025 diciendo que se crearon hoy, y rompería el
-- mismo orden que esta migración viene a arreglar.
--
-- Así que cada tabla se rellena con SU PROPIA fecha de negocio —la que ya está
-- en la fila y que sí es cierta— y recién si no hay ninguna se usa NOW():
--
--     gym_payments        payment_date       (cuándo se cobró)
--     caja_movimiento     fecha              (cuándo se movió la plata)
--     caja_cierre         hasta              (hasta cuándo cerró la caja)
--     class_booking       booking_date       (para qué día era la reserva)
--     gym_members         membership_start   (cuándo empezó el socio)
--     subscriptions       current_period_start
--
-- `gym_class` y `gym_payment_ajuste` no tienen otra fecha propia: esas sí caen
-- en NOW(), y es lo mejor disponible.
--
-- `updated_at` se rellena con `created_at`, no con NOW(): una fila que nunca se
-- tocó desde que nació tiene esas dos iguales, que es la verdad.
-- ============================================================================

-- ── 1. Rellenar `created_at` con la fecha de negocio de cada fila ──────────
UPDATE gym_payments       SET created_at = payment_date              WHERE created_at IS NULL;
UPDATE caja_movimiento    SET created_at = fecha                     WHERE created_at IS NULL;
UPDATE caja_cierre        SET created_at = hasta                     WHERE created_at IS NULL;
UPDATE class_booking      SET created_at = booking_date::timestamp   WHERE created_at IS NULL;
UPDATE gym_members        SET created_at = membership_start          WHERE created_at IS NULL AND membership_start IS NOT NULL;
UPDATE subscriptions      SET created_at = current_period_start      WHERE created_at IS NULL AND current_period_start IS NOT NULL;

-- Lo que no tenía ninguna fecha de negocio de dónde agarrarse.
UPDATE gym_members        SET created_at = NOW() WHERE created_at IS NULL;
UPDATE subscriptions      SET created_at = NOW() WHERE created_at IS NULL;
UPDATE gym_class          SET created_at = NOW() WHERE created_at IS NULL;
UPDATE gym_payment_ajuste SET created_at = NOW() WHERE created_at IS NULL;

-- ── 2. `updated_at` = `created_at` para la fila que nunca se tocó ──────────
UPDATE gym_members        SET updated_at = created_at WHERE updated_at IS NULL;
UPDATE gym_payments       SET updated_at = created_at WHERE updated_at IS NULL;
UPDATE gym_class          SET updated_at = created_at WHERE updated_at IS NULL;
UPDATE class_booking      SET updated_at = created_at WHERE updated_at IS NULL;
UPDATE caja_cierre        SET updated_at = created_at WHERE updated_at IS NULL;
UPDATE caja_movimiento    SET updated_at = created_at WHERE updated_at IS NULL;
UPDATE gym_payment_ajuste SET updated_at = created_at WHERE updated_at IS NULL;
UPDATE subscriptions      SET updated_at = created_at WHERE updated_at IS NULL;

-- ── 3. Un default, para que lo que no pase por JPA nazca completo ──────────
-- `gym_plans`, `caja_sesion` y `tenant_group` ya lo tenían desde que se
-- crearon. Esto emparejas al resto: la red no depende de que el que escriba la
-- próxima consulta nativa se acuerde de poner las dos columnas.
ALTER TABLE gym_members        ALTER COLUMN created_at SET DEFAULT NOW();
ALTER TABLE gym_members        ALTER COLUMN updated_at SET DEFAULT NOW();
ALTER TABLE gym_payments       ALTER COLUMN created_at SET DEFAULT NOW();
ALTER TABLE gym_payments       ALTER COLUMN updated_at SET DEFAULT NOW();
ALTER TABLE gym_class          ALTER COLUMN created_at SET DEFAULT NOW();
ALTER TABLE gym_class          ALTER COLUMN updated_at SET DEFAULT NOW();
ALTER TABLE class_booking      ALTER COLUMN created_at SET DEFAULT NOW();
ALTER TABLE class_booking      ALTER COLUMN updated_at SET DEFAULT NOW();
ALTER TABLE caja_cierre        ALTER COLUMN created_at SET DEFAULT NOW();
ALTER TABLE caja_cierre        ALTER COLUMN updated_at SET DEFAULT NOW();
ALTER TABLE caja_movimiento    ALTER COLUMN created_at SET DEFAULT NOW();
ALTER TABLE caja_movimiento    ALTER COLUMN updated_at SET DEFAULT NOW();
ALTER TABLE gym_payment_ajuste ALTER COLUMN created_at SET DEFAULT NOW();
ALTER TABLE gym_payment_ajuste ALTER COLUMN updated_at SET DEFAULT NOW();
ALTER TABLE subscriptions      ALTER COLUMN created_at SET DEFAULT NOW();
ALTER TABLE subscriptions      ALTER COLUMN updated_at SET DEFAULT NOW();

-- ── 4. Y ahora sí: la base dice lo mismo que BaseEntity ────────────────────
ALTER TABLE gym_members        ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE gym_members        ALTER COLUMN updated_at SET NOT NULL;
ALTER TABLE gym_payments       ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE gym_payments       ALTER COLUMN updated_at SET NOT NULL;
ALTER TABLE gym_class          ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE gym_class          ALTER COLUMN updated_at SET NOT NULL;
ALTER TABLE class_booking      ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE class_booking      ALTER COLUMN updated_at SET NOT NULL;
ALTER TABLE caja_cierre        ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE caja_cierre        ALTER COLUMN updated_at SET NOT NULL;
ALTER TABLE caja_movimiento    ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE caja_movimiento    ALTER COLUMN updated_at SET NOT NULL;
ALTER TABLE gym_payment_ajuste ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE gym_payment_ajuste ALTER COLUMN updated_at SET NOT NULL;
ALTER TABLE subscriptions      ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE subscriptions      ALTER COLUMN updated_at SET NOT NULL;
