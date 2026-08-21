-- V45__Cashiers_And_Authorship.sql
--
-- QUIÉN hizo cada cosa. Hoy el sistema guarda CUÁNDO se creó cada registro y desde QUÉ
-- equipo, pero no qué persona. Si la recepcionista A cobra a las 9 y la B cobra a las 18,
-- los dos pagos quedan idénticos: "vino del terminal Recepción". El día que falte plata en
-- la caja, no hay forma de saber quién cobró qué.
--
-- LA PIEZA QUE FALTABA, Y POR QUÉ ES UN PIN Y NO UNA CUENTA
-- Un mostrador de gimnasio es una caja registradora: máquina compartida, gente que rota,
-- turnos que cambian dos veces por día. Pedir email y contraseña en cada cambio de turno
-- es fricción suficiente para que nadie lo haga — y entonces todos terminan usando la
-- misma cuenta, que es el peor de los mundos. Con 4 dígitos, el cambio de turno cuesta
-- tres segundos y cada movimiento queda firmado.
--
-- NOTA HISTÓRICA: existió una tabla `cashier` (V36) y se dropeó en la V43. El motivo
-- escrito ahí fue "existían SOLO para el login local sin internet". Ese motivo cubría la
-- mitad del valor: el PIN también servía para que la gente del mostrador no tenga cuenta.
-- Se fue por arrastre. Esta tabla NO revive aquella (no hay datos que recuperar): es un
-- diseño nuevo, sin nada del circuito offline.
--
-- Aditiva e idempotente. No borra ni migra nada.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Las personas del mostrador
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cashier (
    id                uuid PRIMARY KEY,
    created_at        timestamp NOT NULL,
    updated_at        timestamp NOT NULL,
    tenant_id         uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    origin_device_id  uuid,
    -- La tabla de cajeros es ella misma tenant-aware, así que lleva las dos columnas de
    -- procedencia como cualquier otra. Y acá tiene sentido propio: dice quién dio de alta
    -- a esta persona en el mostrador.
    performed_by_cashier_id uuid,

    -- Nombre visible: es lo que la persona toca en la pantalla antes de marcar su PIN.
    name              varchar(120) NOT NULL,

    -- BCrypt, nunca el PIN en claro. Cuatro dígitos son 10.000 combinaciones: el hash no
    -- alcanza para hacerlo fuerte, por eso el servicio agrega un bloqueo por intentos
    -- fallidos. El hash protege el caso de que alguien lea la base, no el de adivinar.
    pin_hash          varchar(100) NOT NULL,

    -- Baja lógica: una persona que se fue no se borra, se desactiva. Sus movimientos
    -- históricos siguen apuntando a ella y tienen que seguir diciendo quién fue.
    is_active         boolean NOT NULL DEFAULT true
);

-- Un mismo nombre no se repite dentro de la sucursal: en la pantalla de cambio de turno
-- se elige por nombre, y dos "Mariana" serían una moneda al aire.
CREATE UNIQUE INDEX IF NOT EXISTS ux_cashier_tenant_name
    ON cashier (tenant_id, lower(name));

-- La pantalla de turno lista los activos de la sucursal en cada arranque.
CREATE INDEX IF NOT EXISTS ix_cashier_tenant_active
    ON cashier (tenant_id, is_active);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. La firma en cada registro
-- ─────────────────────────────────────────────────────────────────────────────
-- Mismo criterio que origin_device_id (V31): la columna va en TODAS las tablas
-- tenant-aware porque el campo vive en la clase base y Hibernate valida el esquema al
-- arrancar. Nullable a propósito — los registros históricos, los que crea el dueño desde
-- la web y los que entran por webhook no tienen persona de mostrador detrás.
--
-- Sin FK: igual que con los equipos, es procedencia. Una FK haría que borrar un cajero
-- (algo que no debería pasar, pero) rompa registros históricos, y la regla es que un dato
-- de trazabilidad nunca puede impedir una operación.
ALTER TABLE access_log      ADD COLUMN IF NOT EXISTS performed_by_cashier_id uuid;
ALTER TABLE class_booking   ADD COLUMN IF NOT EXISTS performed_by_cashier_id uuid;
ALTER TABLE gym_class       ADD COLUMN IF NOT EXISTS performed_by_cashier_id uuid;
ALTER TABLE gym_members     ADD COLUMN IF NOT EXISTS performed_by_cashier_id uuid;
ALTER TABLE gym_payments    ADD COLUMN IF NOT EXISTS performed_by_cashier_id uuid;
ALTER TABLE subscriptions   ADD COLUMN IF NOT EXISTS performed_by_cashier_id uuid;
ALTER TABLE tenant_payment  ADD COLUMN IF NOT EXISTS performed_by_cashier_id uuid;

-- Las dos que el dueño va a consultar de verdad: "¿quién cobró esto?" y "¿quién dejó
-- entrar a este socio?". El resto no se indexa hasta que alguna consulta lo pida.
CREATE INDEX IF NOT EXISTS ix_gym_payments_cashier
    ON gym_payments (tenant_id, performed_by_cashier_id);
CREATE INDEX IF NOT EXISTS ix_access_log_cashier
    ON access_log (tenant_id, performed_by_cashier_id);
