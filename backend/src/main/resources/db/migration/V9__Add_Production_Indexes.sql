-- V8__Add_Production_Indexes.sql
-- Índices de rendimiento para tablas de alta consulta en producción.
-- Mejora el tiempo de respuesta de las queries más frecuentes del sistema.

-- Índice en members para búsqueda rápida por tenant (query más frecuente del dashboard)
CREATE INDEX IF NOT EXISTS idx_members_tenant_id ON members(tenant_id);

-- Índice en payments para búsqueda rápida por tenant y fecha
CREATE INDEX IF NOT EXISTS idx_payments_tenant_id ON payments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payments_payment_date ON payments(payment_date DESC);

-- Índice en subscriptions para el job de facturación automática
CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant_id ON subscriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);

-- Índice en tenant_membership para resolución rápida de permisos por usuario
CREATE INDEX IF NOT EXISTS idx_tenant_membership_user_id ON tenant_membership(user_id);
CREATE INDEX IF NOT EXISTS idx_tenant_membership_tenant_id ON tenant_membership(tenant_id);

-- Índice en tenant para el KillSwitchFilter (consulta en cada request autenticado)
CREATE INDEX IF NOT EXISTS idx_tenant_is_active ON tenant(is_active);
