-- V46__Subscription_Plan.sql
--
-- QUÉ PLAN CONTRATÓ CADA UNO.
--
-- Hasta hoy Veltronik era un solo producto a un solo precio, así que la suscripción no
-- necesitaba decir "de qué". Con la división en básico y premium, esa pregunta pasa a tener
-- respuesta — y tiene que vivir en la base, no deducirse del monto que pagó.
--
-- POR QUÉ NO DEDUCIRLO DEL PRECIO
-- Sería tentador: "pagó 80.000, entonces es premium". Pero el precio cambia con el tiempo y
-- el monto viaja grabado dentro del preapproval de Mercado Pago del día del alta. Un cliente
-- viejo del básico a 80.000 quedaría leído como premium para siempre, y le abriría funciones
-- que no compró. El plan es un dato del contrato, no una inferencia del importe.
--
-- POR QUÉ TODOS ARRANCAN EN BÁSICO
-- Es lo único que existió hasta ahora: cada suscripción vigente es, por definición, del plan
-- que había. El DEFAULT deja bien a las filas nuevas y el UPDATE a las viejas, así que no
-- queda ninguna sin plan. Y el piso es el plan más chico a propósito: si algún día un dato
-- llega raro, que falle hacia MENOS acceso, nunca hacia más.
--
-- Aditiva e idempotente. No borra ni migra datos.

ALTER TABLE subscriptions
    ADD COLUMN IF NOT EXISTS plan_code varchar(20) NOT NULL DEFAULT 'BASICO';

-- Cinturón y tiradores: el DEFAULT ya cubre las filas existentes al agregar la columna,
-- pero si esta migración corre sobre una base donde la columna se creó a mano sin default,
-- esto la deja consistente igual.
UPDATE subscriptions SET plan_code = 'BASICO' WHERE plan_code IS NULL OR plan_code = '';

-- El listado del dueño y el gateo preguntan "¿qué plan tiene este tenant?" en cada request.
CREATE INDEX IF NOT EXISTS idx_subscriptions_plan_code ON subscriptions (plan_code);
