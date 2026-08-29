-- V50__Account_Deletion.sql
--
-- BORRAR LA CUENTA, DE VERDAD Y CON VUELTA ATRÁS.
--
-- Hasta acá se podía borrar UNA sucursal, al instante y sin arrepentimiento posible. Lo que
-- falta es lo otro: que alguien se vaya del todo —sus gimnasios, sus socios, sus cobros y su
-- login— con treinta días para cambiar de opinión.
--
-- Es la acción más destructiva del sistema. Todo lo de abajo está diseñado alrededor de una
-- sola idea: que un arrepentimiento a los 29 días sea trivial, y que a los 31 sea imposible.
--
-- ⚠️ NO CONFUNDIR CON CANCELAR LA SUSCRIPCIÓN. Cancelar corta el cobro y deja los datos
-- intactos: el cliente vuelve cuando quiere y encuentra todo. Esto borra.


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. La cuenta marcada para borrarse
-- ─────────────────────────────────────────────────────────────────────────────
-- Va en app_user y no en tenant porque lo que se borra es LA PERSONA: sus gimnasios se van
-- con ella, no al revés. Un dueño con tres sucursales borra las tres.
ALTER TABLE app_user
    ADD COLUMN IF NOT EXISTS deletion_requested_at timestamp,
    -- Guardada, no calculada. Si mañana la gracia pasa a 60 días, quien ya pidió el borrado
    -- conserva la fecha que se le prometió: cambiar la política no puede correrle la fecha a
    -- alguien que ya está esperando.
    ADD COLUMN IF NOT EXISTS deletion_scheduled_at timestamp;

-- El trabajo nocturno pregunta "¿a quién le toca hoy?". Índice parcial: la enorme mayoría
-- de las cuentas nunca va a tener esto seteado.
CREATE INDEX IF NOT EXISTS idx_app_user_deletion
    ON app_user (deletion_scheduled_at)
    WHERE deletion_scheduled_at IS NOT NULL;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Los gimnasios de esa cuenta, cerrados mientras corre la gracia
-- ─────────────────────────────────────────────────────────────────────────────
-- La decisión del dueño: durante los 30 días el sistema NO se puede usar, pero sí se puede
-- entrar para arrepentirse. Coherente — pidió irse — y además evita regalar un mes de
-- servicio a quien ya dijo que se va.
--
-- Se marca acá, en una columna propia, y NO reutilizando `is_active`. Si apagáramos
-- `is_active`, al cancelar el borrado no habría forma de saber si ese negocio estaba activo
-- antes o suspendido por otro motivo (falta de pago, baja manual): lo reactivaríamos a ciegas
-- y podríamos devolverle el acceso a alguien que no lo tenía.
ALTER TABLE tenant
    ADD COLUMN IF NOT EXISTS deletion_scheduled_at timestamp;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. La contabilidad de Veltronik, que NO se va con el cliente
-- ─────────────────────────────────────────────────────────────────────────────
-- Cuando se purga la cuenta, `tenant_payment` se va con el tenant (apunta a él). Pero esas
-- filas son dos cosas mezcladas: el dato del cliente Y el registro de que Veltronik cobró.
-- Lo primero es suyo y se borra; lo segundo es de Veltronik y no puede desaparecer — sin eso
-- no se puede cuadrar con Mercado Pago ni justificar los ingresos declarados.
--
-- Por eso el ingreso se COPIA acá antes de purgar, sin nada que identifique al gimnasio: ni
-- nombre, ni email, ni el id original. Queda `cliente_ref`, un valor opaco que permite ver
-- "estos ocho cobros fueron del mismo cliente" sin poder saber cuál era.
CREATE TABLE IF NOT EXISTS saas_revenue (
    id                 uuid PRIMARY KEY,
    created_at         timestamp NOT NULL,

    -- Referencia opaca y estable del cliente que pagó. Sirve para agrupar, no para
    -- identificar: sin la tabla original no hay forma de volver al gimnasio.
    cliente_ref        varchar(64) NOT NULL,

    amount             decimal(10,2) NOT NULL,
    paid_at            timestamp NOT NULL,
    mp_payment_id      varchar(100),
    mp_preapproval_id  varchar(100),

    -- Cuándo se archivó (o sea, cuándo se borró la cuenta).
    archived_at        timestamp NOT NULL
);

-- Un mismo cobro no puede archivarse dos veces si la purga se reintenta.
CREATE UNIQUE INDEX IF NOT EXISTS uq_saas_revenue_mp_payment
    ON saas_revenue (mp_payment_id)
    WHERE mp_payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_saas_revenue_paid_at ON saas_revenue (paid_at);
