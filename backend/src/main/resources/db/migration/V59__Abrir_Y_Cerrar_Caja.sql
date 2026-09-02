-- ============================================
-- VELTRONIK - Abrir y cerrar la caja
-- ============================================
-- Hasta acá el "período" era implícito: iba desde el último cierre hasta ahora, y nadie lo
-- abría. Faltaba lo que hace cualquier kiosco: abrir la caja a la mañana declarando el
-- cambio que queda adentro, y cerrarla a la noche.
--
-- ⚠️ Y FALTABA EL FONDO, QUE ES POR QUÉ NUNCA CUADRABA. El cajón arranca el día con el
-- cambio de ayer. Si el sistema espera solo lo cobrado hoy, ese cambio aparece como
-- sobrante TODOS los días, y un arqueo que siempre da sobrante es un arqueo que nadie mira.

CREATE TABLE IF NOT EXISTS caja_sesion (
    id                  uuid PRIMARY KEY,
    tenant_id           uuid NOT NULL REFERENCES tenant(id),
    abierta_at          timestamp NOT NULL,
    abierta_por_nombre  varchar(160),
    -- El cambio que ya estaba en el cajón cuando se abrió.
    fondo_inicial       numeric(14,2) NOT NULL DEFAULT 0,
    cerrada_at          timestamp,
    -- El cierre que la terminó. Sin FK: un cierre es un hecho contable y no se borra, pero
    -- si algún día se borrara, no puede llevarse puesta la sesión.
    cierre_id           uuid,
    created_at          timestamp NOT NULL DEFAULT now(),
    updated_at          timestamp NOT NULL DEFAULT now(),
    -- Las trae TenantAwareEntity: qué terminal y qué persona hicieron la operación. Sin
    -- ellas el arranque falla en la validación de esquema, no en tiempo de uso.
    origin_device_id        uuid,
    performed_by_cashier_id uuid
);

-- ⭐ UNA SOLA CAJA ABIERTA POR GIMNASIO, garantizado por la base y no por la pantalla.
--
-- El gimnasio puede tener la notebook con la web y la PC del mostrador con el escritorio.
-- Si las dos abren caja, hay dos períodos pisándose y la plata queda contada dos veces o
-- ninguna. Un chequeo en el código no alcanza: dos terminales pueden pedirlo en el mismo
-- instante y las dos ver "no hay ninguna abierta".
CREATE UNIQUE INDEX IF NOT EXISTS ux_caja_sesion_abierta
    ON caja_sesion (tenant_id) WHERE cerrada_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_caja_sesion_tenant ON caja_sesion (tenant_id, abierta_at DESC);

-- El fondo queda grabado en el cierre: sin él, el número esperado de un cierre viejo no se
-- puede reconstruir.
ALTER TABLE caja_cierre ADD COLUMN IF NOT EXISTS fondo_inicial NUMERIC(14,2) NOT NULL DEFAULT 0;
