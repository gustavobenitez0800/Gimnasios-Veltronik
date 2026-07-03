-- V36__Cashiers.sql  (Fase 1, ladrillo 5 — PIN local de cajeros)
--
-- Los CAJEROS son operadores del mostrador: no tienen cuenta de Google ni email —
-- entran con un PIN. Clasificacion: CONFIG que BAJA (el dueño los gestiona en la
-- nube; el sync engine los lleva al local, donde el login diario funciona sin
-- internet). El PIN vive SOLO como hash BCrypt; jamas viaja ni se devuelve en claro.

CREATE TABLE IF NOT EXISTS cashier (
    id               uuid PRIMARY KEY,
    created_at       timestamp    NOT NULL,
    updated_at       timestamp    NOT NULL,
    tenant_id        uuid         NOT NULL REFERENCES tenant (id),
    origin_device_id uuid,                     -- contrato de TenantAwareEntity (V31)
    name             varchar(120) NOT NULL,
    pin_hash         varchar(72)  NOT NULL,    -- BCrypt
    role             varchar(20)  NOT NULL,    -- CAJERO | ENCARGADO
    is_active        boolean      NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_cashier_tenant ON cashier (tenant_id);
