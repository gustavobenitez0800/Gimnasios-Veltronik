-- ============================================
-- V18: AGRUPACIÓN DE SUCURSALES (Tenant Groups)
-- ============================================
-- Permite al dueño agrupar sus sucursales/negocios (de cualquier rubro) en el lobby,
-- para que con muchas sucursales no sea un alboroto.
--
-- DISEÑO (transversal → vive en core/, no en un vertical):
--   - tenant_group: el grupo, pertenece a un usuario dueño (owner_user_id → app_user).
--   - tenant.group_id: FK NULLABLE a tenant_group.
--
-- MIGRACIÓN 100% ADITIVA (clientes ya en producción):
--   tabla nueva + columna nullable. Los tenants existentes quedan group_id=NULL
--   ("Sin grupo") → el lobby los muestra exactamente como hoy. Cero riesgo de romper datos.

CREATE TABLE IF NOT EXISTS public.tenant_group (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id uuid NOT NULL REFERENCES public.app_user(id) ON DELETE CASCADE,
    name          varchar(120) NOT NULL,
    color         varchar(20),                 -- color opcional para distinguir el grupo en la UI
    sort_order    int NOT NULL DEFAULT 0,       -- orden de visualización
    created_at    timestamp NOT NULL DEFAULT now(),
    updated_at    timestamp NOT NULL DEFAULT now()
);

-- Un dueño no repite el nombre de grupo (evita duplicados accidentales).
CREATE UNIQUE INDEX IF NOT EXISTS ux_tenant_group_owner_name
    ON public.tenant_group (owner_user_id, lower(name));

CREATE INDEX IF NOT EXISTS ix_tenant_group_owner
    ON public.tenant_group (owner_user_id);

-- FK nullable desde tenant. ON DELETE SET NULL: borrar un grupo NO borra las sucursales,
-- solo las desagrupa (vuelven a "Sin grupo"). Coherente con "los datos están seguros".
ALTER TABLE public.tenant
    ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES public.tenant_group(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_tenant_group_id ON public.tenant (group_id);
