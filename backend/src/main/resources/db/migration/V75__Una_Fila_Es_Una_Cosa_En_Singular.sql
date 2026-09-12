-- ============================================================================
-- V75 — Todas las tablas en singular
-- ============================================================================
-- POR QUÉ.
-- Conviven dos convenciones, y el reparto es puro accidente histórico: quedó
-- plural lo que creó la ola de migraciones V6-V10, y singular todo lo demás.
--
--   PLURAL     gym_members, gym_payments, gym_plans, subscriptions
--   SINGULAR   tenant, app_user, cashier, gym_class, access_log, access_denied,
--              checkin_point, class_booking, caja_sesion, caja_movimiento,
--              caja_cierre, tenant_payment, tenant_group, tenant_membership,
--              device_registry, gym_payment_ajuste, update_rollout, saas_revenue
--
-- Dieciocho a cuatro. La regla ya existe de hecho; lo que falta es aplicarla a
-- las cuatro que se quedaron afuera.
--
-- Se va a SINGULAR, que es lo que dice la mayoría y además lo que describe la
-- realidad: una tabla define qué ES UNA FILA, y una fila de `gym_members` es UN
-- socio. `SELECT * FROM gym_member WHERE id = ...` se lee como lo que hace.
--
-- El costo de no tener una regla no es estético: es que al escribir una query
-- hay que ACORDARSE de cuál de las dos formas le tocó a cada tabla. Con
-- dieciocho en singular y cuatro en plural, la memoria falla del lado
-- equivocado.
--
-- ⭐ `gym_member` ESTUVO OCUPADO HASTA HACE UNA MIGRACIÓN. El nombre bueno lo
-- tenía la tabla del modelo original, que la V74 acaba de sacar. Por eso este
-- renombre no se pudo hacer antes y por eso va justo acá.
--
-- ── POR QUÉ NO ROMPE A LOS CLIENTES INSTALADOS ─────────────────────────────
-- Este es el punto que hay que tener claro, porque hay dos gimnasios operando
-- con la 2.6.31 y no se los puede actualizar de prepo.
--
-- El nombre de una TABLA no viaja nunca al cliente. Entre la base y el JSON hay
-- dos capas que lo aíslan: la entidad (`@Table(name = ...)`) y el DTO. El
-- espejo local del escritorio guarda DTOs en camelCase, no columnas. Y las
-- URLs de la API NO se tocan: `/api/core/subscriptions` sigue diciendo
-- `subscriptions` aunque la tabla pase a `subscription` — eso sí es contrato y
-- cambiarlo rompería el portal.
--
-- Lo único que nombra estas tablas en SQL son seis consultas nativas del
-- backend, y se actualizan en el mismo commit.
--
-- ── LAS FK Y LOS ÍNDICES NO SE RENOMBRAN SOLOS ─────────────────────────────
-- Postgres renombra la tabla y deja los nombres de sus índices y constraints
-- como estaban: después de esto existe `gym_member` con un índice llamado
-- `idx_gym_members_tenant`. Eso se ordena en la V77, que unifica TODOS los
-- nombres bajo una sola convención — hacerlo acá mezclaría dos cambios.
-- ============================================================================

ALTER TABLE gym_members  RENAME TO gym_member;
ALTER TABLE gym_payments RENAME TO gym_payment;
ALTER TABLE gym_plans    RENAME TO gym_plan;
ALTER TABLE subscriptions RENAME TO subscription;

COMMENT ON TABLE gym_member  IS 'Padrón de socios del gimnasio. Una fila = un socio.';
COMMENT ON TABLE gym_payment IS 'Cobros de cuota. Una fila = un cobro.';
COMMENT ON TABLE gym_plan    IS 'Catálogo de aranceles del gimnasio. Una fila = un arancel.';
COMMENT ON TABLE subscription IS
    'Suscripción del gimnasio a Veltronik (cobranza del SaaS, no del socio). La API sigue '
    'exponiéndola en /api/core/subscriptions: la URL es contrato con clientes instalados.';
