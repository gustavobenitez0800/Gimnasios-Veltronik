-- ============================================================================
-- V77 — Índices y constraints: una sola convención
-- ============================================================================
-- POR QUÉ.
-- Hasta acá convivían cuatro prefijos para dos tipos de índice (`idx_`, `ix_`,
-- `ux_`, `uq_`) y dos formas de nombrar un constraint: la explícita
-- (`fk_gym_payments_tenant`) y la que inventa Postgres cuando uno no le pone
-- nombre (`access_log_tenant_id_fkey`). Mitad y mitad, sin criterio.
--
-- Y después de la V75 hay algo peor que inconsistente: hay nombres que MIENTEN.
-- El padrón se llama `gym_member` y su índice se sigue llamando
-- `idx_gym_members_tenant`; su clave primaria, `gym_members_pkey`. Nombran una
-- tabla que ya no existe. Eso no es una molestia estética: es lo que aparece en
-- un `EXPLAIN`, en un error de constraint violado y en el panel de Supabase —
-- justo cuando uno está buscando algo y necesita que los nombres digan la
-- verdad.
--
-- ── LA CONVENCIÓN, DE ACÁ EN ADELANTE ──────────────────────────────────────
--
--     pk_<tabla>                     clave primaria
--     fk_<tabla>_<columna>           clave foránea
--     ux_<tabla>_<columnas>          índice o constraint ÚNICO
--     ix_<tabla>_<qué resuelve>      índice común
--     ck_<tabla>_<qué valida>        check
--
-- El prefijo dice QUÉ ES, y lo que sigue empieza SIEMPRE por la tabla. Así todo
-- lo de una tabla queda junto al ordenar alfabéticamente, que es como se lee
-- una lista de índices cuando se la mira en serio.
--
-- ── ESTO NO CAMBIA NADA DE CÓMO FUNCIONA LA BASE ───────────────────────────
-- Renombrar un índice o un constraint no lo reconstruye, no toma un lock largo
-- y no cambia un solo plan de consulta. Tampoco lo nota el código: Hibernate
-- nombra tablas y columnas, nunca índices. Es exactamente el tipo de cambio que
-- conviene hacer de una sola vez y no de a pedacitos.
-- ============================================================================


-- ============================================================================
-- PARTE 1 — Un índice duplicado que se estaba pagando en cada cobro
-- ============================================================================
-- `tenant_payment` tenía DOS índices sobre la misma columna: el que crea solo
-- el constraint UNIQUE (`tenant_payment_mp_payment_id_key`) y uno suelto que
-- agregó a mano la V9 (`idx_tenant_payment_mp_payment_id`). No es que uno sea
-- más angosto o parcial: son la misma columna, el mismo orden, la misma
-- estructura.
--
-- Un índice de más no hace las lecturas más rápidas —el planificador usa uno
-- solo— pero se escribe en CADA alta de cobro y ocupa lugar. Es costo puro.
DROP INDEX IF EXISTS idx_tenant_payment_mp_payment_id;


-- ============================================================================
-- PARTE 2 — Claves primarias: pk_<tabla>
-- ============================================================================
ALTER TABLE access_denied      RENAME CONSTRAINT access_denied_pkey      TO pk_access_denied;
ALTER TABLE access_log         RENAME CONSTRAINT access_log_pkey         TO pk_access_log;
ALTER TABLE app_user           RENAME CONSTRAINT app_user_pkey           TO pk_app_user;
ALTER TABLE caja_cierre        RENAME CONSTRAINT caja_cierre_pkey        TO pk_caja_cierre;
ALTER TABLE caja_movimiento    RENAME CONSTRAINT caja_movimiento_pkey    TO pk_caja_movimiento;
ALTER TABLE caja_sesion        RENAME CONSTRAINT caja_sesion_pkey        TO pk_caja_sesion;
ALTER TABLE cashier            RENAME CONSTRAINT cashier_pkey            TO pk_cashier;
ALTER TABLE checkin_point      RENAME CONSTRAINT checkin_point_pkey      TO pk_checkin_point;
ALTER TABLE class_booking      RENAME CONSTRAINT class_booking_pkey      TO pk_class_booking;
ALTER TABLE device_registry    RENAME CONSTRAINT device_registry_pkey    TO pk_device_registry;
ALTER TABLE gym_class          RENAME CONSTRAINT gym_class_pkey          TO pk_gym_class;
ALTER TABLE gym_member         RENAME CONSTRAINT gym_members_pkey        TO pk_gym_member;
ALTER TABLE gym_payment        RENAME CONSTRAINT gym_payments_pkey       TO pk_gym_payment;
ALTER TABLE gym_payment_ajuste RENAME CONSTRAINT gym_payment_ajuste_pkey TO pk_gym_payment_ajuste;
ALTER TABLE gym_plan           RENAME CONSTRAINT gym_plans_pkey          TO pk_gym_plan;
ALTER TABLE saas_revenue       RENAME CONSTRAINT saas_revenue_pkey       TO pk_saas_revenue;
ALTER TABLE subscription       RENAME CONSTRAINT subscriptions_pkey      TO pk_subscription;
ALTER TABLE tenant             RENAME CONSTRAINT tenant_pkey             TO pk_tenant;
ALTER TABLE tenant_group       RENAME CONSTRAINT tenant_group_pkey       TO pk_tenant_group;
ALTER TABLE tenant_membership  RENAME CONSTRAINT tenant_membership_pkey  TO pk_tenant_membership;
ALTER TABLE tenant_payment     RENAME CONSTRAINT tenant_payment_pkey     TO pk_tenant_payment;
ALTER TABLE update_rollout     RENAME CONSTRAINT update_rollout_pkey     TO pk_update_rollout;


-- ============================================================================
-- PARTE 3 — Claves foráneas: fk_<tabla>_<columna>
-- ============================================================================
ALTER TABLE access_denied      RENAME CONSTRAINT access_denied_checkin_point_id_fkey TO fk_access_denied_checkin_point;
ALTER TABLE access_denied      RENAME CONSTRAINT access_denied_member_id_fkey        TO fk_access_denied_member;
ALTER TABLE access_denied      RENAME CONSTRAINT access_denied_tenant_id_fkey        TO fk_access_denied_tenant;
ALTER TABLE access_log         RENAME CONSTRAINT access_log_checkin_point_id_fkey    TO fk_access_log_checkin_point;
ALTER TABLE access_log         RENAME CONSTRAINT access_log_member_id_fkey           TO fk_access_log_member;
ALTER TABLE access_log         RENAME CONSTRAINT access_log_tenant_id_fkey           TO fk_access_log_tenant;
ALTER TABLE caja_cierre        RENAME CONSTRAINT caja_cierre_tenant_id_fkey          TO fk_caja_cierre_tenant;
ALTER TABLE caja_movimiento    RENAME CONSTRAINT caja_movimiento_tenant_id_fkey      TO fk_caja_movimiento_tenant;
ALTER TABLE caja_sesion        RENAME CONSTRAINT caja_sesion_tenant_id_fkey          TO fk_caja_sesion_tenant;
ALTER TABLE cashier            RENAME CONSTRAINT cashier_tenant_id_fkey              TO fk_cashier_tenant;
ALTER TABLE checkin_point      RENAME CONSTRAINT checkin_point_tenant_id_fkey        TO fk_checkin_point_tenant;
ALTER TABLE gym_member         RENAME CONSTRAINT fk_gym_members_tenant               TO fk_gym_member_tenant;
ALTER TABLE gym_member         RENAME CONSTRAINT gym_members_plan_id_fkey            TO fk_gym_member_plan;
ALTER TABLE gym_payment        RENAME CONSTRAINT fk_gym_payments_member              TO fk_gym_payment_member;
ALTER TABLE gym_payment        RENAME CONSTRAINT fk_gym_payments_tenant              TO fk_gym_payment_tenant;
ALTER TABLE gym_payment        RENAME CONSTRAINT gym_payments_plan_id_fkey           TO fk_gym_payment_plan;
ALTER TABLE gym_payment_ajuste RENAME CONSTRAINT gym_payment_ajuste_tenant_id_fkey   TO fk_gym_payment_ajuste_tenant;
ALTER TABLE gym_plan           RENAME CONSTRAINT gym_plans_tenant_id_fkey            TO fk_gym_plan_tenant;
ALTER TABLE subscription       RENAME CONSTRAINT fk_subscriptions_tenant             TO fk_subscription_tenant;
-- `fk_tenant_group_id` y no `fk_tenant_group`: la columna es `tenant.group_id`
-- y existe además una TABLA llamada `tenant_group`. Dejar el `_id` es lo que
-- evita leer este nombre como "la FK de tenant_group".
ALTER TABLE tenant             RENAME CONSTRAINT tenant_group_id_fkey                TO fk_tenant_group_id;
ALTER TABLE tenant_group       RENAME CONSTRAINT tenant_group_owner_user_id_fkey     TO fk_tenant_group_owner_user;
ALTER TABLE tenant_membership  RENAME CONSTRAINT tenant_membership_tenant_id_fkey    TO fk_tenant_membership_tenant;
ALTER TABLE tenant_membership  RENAME CONSTRAINT tenant_membership_user_id_fkey      TO fk_tenant_membership_user;
ALTER TABLE tenant_payment     RENAME CONSTRAINT tenant_payment_tenant_id_fkey       TO fk_tenant_payment_tenant;
-- Las de class_booking y gym_class ya venían con el criterio bueno; solo les
-- falta que el nombre no diga "class" cuando la columna es class_id.
ALTER TABLE class_booking      RENAME CONSTRAINT fk_class_booking_class              TO fk_class_booking_gym_class;


-- ============================================================================
-- PARTE 4 — Constraints únicos: ux_<tabla>_<columnas>
-- ============================================================================
ALTER TABLE app_user          RENAME CONSTRAINT app_user_email_key                                TO ux_app_user_email;
ALTER TABLE class_booking     RENAME CONSTRAINT class_booking_class_id_member_id_booking_date_key TO ux_class_booking_class_member_date;
ALTER TABLE tenant_membership RENAME CONSTRAINT tenant_membership_user_id_tenant_id_key           TO ux_tenant_membership_user_tenant;
ALTER TABLE tenant_payment    RENAME CONSTRAINT tenant_payment_mp_payment_id_key                  TO ux_tenant_payment_mp_payment;


-- ============================================================================
-- PARTE 5 — Índices comunes: idx_ → ix_, y los nombres que mentían
-- ============================================================================
ALTER INDEX idx_access_denied_pendientes        RENAME TO ix_access_denied_pendientes;
ALTER INDEX idx_access_denied_socio             RENAME TO ix_access_denied_tenant_member_fecha;
ALTER INDEX idx_access_log_abiertas             RENAME TO ix_access_log_abiertas;
ALTER INDEX idx_access_log_avisos               RENAME TO ix_access_log_avisos;
ALTER INDEX idx_access_log_checkin              RENAME TO ix_access_log_tenant_check_in;
ALTER INDEX idx_access_log_member               RENAME TO ix_access_log_member;
ALTER INDEX idx_access_log_scanner              RENAME TO ix_access_log_scanner;
ALTER INDEX idx_access_log_tenant               RENAME TO ix_access_log_tenant;
ALTER INDEX idx_app_user_deletion               RENAME TO ix_app_user_deletion;
ALTER INDEX idx_checkin_point_tenant            RENAME TO ix_checkin_point_tenant;
ALTER INDEX idx_class_booking_class             RENAME TO ix_class_booking_gym_class;
ALTER INDEX idx_class_booking_date              RENAME TO ix_class_booking_fecha;
ALTER INDEX idx_class_booking_member            RENAME TO ix_class_booking_member;
ALTER INDEX idx_class_booking_tenant            RENAME TO ix_class_booking_tenant;
ALTER INDEX idx_device_registry_enrolled_tenant RENAME TO ix_device_registry_enrolled_tenant;
ALTER INDEX idx_device_registry_last_tenant     RENAME TO ix_device_registry_last_tenant;
ALTER INDEX idx_gym_class_tenant                RENAME TO ix_gym_class_tenant;
ALTER INDEX idx_saas_revenue_paid_at            RENAME TO ix_saas_revenue_paid_at;
ALTER INDEX idx_tenant_is_active                RENAME TO ix_tenant_is_active;
ALTER INDEX idx_tenant_membership_tenant_id     RENAME TO ix_tenant_membership_tenant;
ALTER INDEX idx_tenant_membership_user_id       RENAME TO ix_tenant_membership_user;

-- Los que nombraban una tabla que la V75 renombró.
ALTER INDEX idx_gym_members_tenant              RENAME TO ix_gym_member_tenant;
ALTER INDEX ix_gym_members_plan                 RENAME TO ix_gym_member_tenant_plan;
ALTER INDEX ix_gym_members_plan_fk              RENAME TO ix_gym_member_plan;
ALTER INDEX idx_gym_payments_member             RENAME TO ix_gym_payment_member;
ALTER INDEX idx_gym_payments_plan               RENAME TO ix_gym_payment_plan;
ALTER INDEX idx_gym_payments_tenant             RENAME TO ix_gym_payment_tenant;
ALTER INDEX ix_gym_payments_cashier             RENAME TO ix_gym_payment_tenant_cashier;
ALTER INDEX ux_gym_payments_tenant_client_ref   RENAME TO ux_gym_payment_tenant_client_ref;
ALTER INDEX idx_gym_plans_tenant                RENAME TO ix_gym_plan_tenant;
ALTER INDEX ux_gym_plans_tenant_nombre          RENAME TO ux_gym_plan_tenant_nombre;
ALTER INDEX idx_subscriptions_plan_code         RENAME TO ix_subscription_plan_code;
ALTER INDEX idx_subscriptions_status            RENAME TO ix_subscription_status;
ALTER INDEX idx_subscriptions_tenant_id         RENAME TO ix_subscription_tenant;

-- Este no nombraba mal la tabla: directamente la nombraba en otro idioma.
-- La tabla es `gym_payment_ajuste`, el índice decía `pago_ajuste`.
ALTER INDEX ix_pago_ajuste_tenant_fecha         RENAME TO ix_gym_payment_ajuste_tenant_fecha;

-- `uq_` → `ux_`, que es el prefijo que usa el resto.
ALTER INDEX uq_checkin_point_device_serial      RENAME TO ux_checkin_point_device_serial;
ALTER INDEX uq_checkin_point_token              RENAME TO ux_checkin_point_token;
ALTER INDEX uq_saas_revenue_mp_payment          RENAME TO ux_saas_revenue_mp_payment;

-- `ix_tenant_group_id` (sobre `tenant.group_id`) y `ix_tenant_group_owner`
-- (sobre `tenant_group.owner_user_id`) ya cumplen la convención y se dejan como
-- están. Se parecen y no son lo mismo: el primero es de la tabla `tenant`, el
-- segundo de la tabla `tenant_group`. Es justamente por eso que al primero hay
-- que dejarle el `_id`.
