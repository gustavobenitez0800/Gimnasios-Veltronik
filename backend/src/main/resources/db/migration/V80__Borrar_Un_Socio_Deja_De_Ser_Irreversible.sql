-- ============================================================================
-- V80 — Borrar un socio deja de ser irreversible
-- ============================================================================
-- POR QUÉ.
-- Hasta acá, borrar un socio desde el mostrador era esto:
--
--     GymMemberService.deleteAndVerifyOwnership → repository.delete(member)
--
-- Un DELETE de verdad. Y no se lleva solo al socio: `access_log` y
-- `access_denied` tienen la FK al socio con ON DELETE CASCADE, así que
-- **desaparece también toda su historia de visitas**. Sus cobros sobreviven
-- pero quedan huérfanos (`gym_payment.member_id` es ON DELETE SET NULL): la
-- plata figura, pero ya no se sabe de quién era.
--
-- Sin papelera, sin confirmación con peso, sin deshacer. Un click.
--
-- ── LA INCOHERENCIA QUE ESTO ARREGLA ───────────────────────────────────────
-- Para dar de baja una CUENTA ENTERA —cosa que hace el dueño, una vez, con
-- tiempo— hay 30 días de gracia (V50). Para borrar un SOCIO —cosa que hace
-- quien atiende, cualquier martes, apurada, con alguien esperando del otro lado
-- del mostrador— no había nada.
--
-- El cuidado estaba puesto al revés de quién ejecuta la acción y de cuántas
-- veces por semana ocurre.
--
-- ── Y NO ES TEÓRICO ────────────────────────────────────────────────────────
-- La V74 borró 114 socios que estaban en la tabla del modelo viejo y no en el
-- padrón. La explicación más probable de esos 114 es justamente esta: los
-- borraron desde la pantalla, uno por uno, y la tabla vieja —congelada en el
-- cutover— se quedó con la única copia. O sea que este camino ya se usó, y sin
-- la foto vieja no habría quedado rastro de ninguno.
--
-- ============================================================================
-- CÓMO FUNCIONA
-- ============================================================================
-- Una columna `deleted_at`. Con fecha, el socio no existe para nadie: no está
-- en el padrón, no aparece en el buscador, no entra en los conteos, no abre la
-- puerta. La fila y toda su historia siguen enteras.
--
-- ⚠️ `deleted_at` NO ES `is_active`, y no hay que mezclarlos:
--
--     is_active    ESTADO DE NEGOCIO. El socio existe y está dado de baja
--                  temporalmente (dejó de venir, se congeló la cuota). Se ve en
--                  el padrón, se puede reactivar, cuenta como socio del
--                  gimnasio.
--     deleted_at   NO EXISTE. Se cargó por error, se duplicó, pidió que lo
--                  borren. No se muestra en ninguna pantalla.
--
-- ── POR QUÉ EL FILTRO ES EXPLÍCITO Y NO AUTOMÁTICO ────────────────────────
-- Hibernate tiene `@SQLRestriction`, que filtraría todas las consultas de la
-- entidad sin tocar una por una. Se descartó a propósito, por dos razones:
--
--   1. También escondería al socio de SU PROPIA HISTORIA. `AccessLog.member` es
--      un @ManyToOne EAGER: con la restricción puesta, listar los accesos de un
--      día podría devolver un socio nulo donde la columna es NOT NULL, y eso es
--      un 500 en la pantalla del mostrador. Conservar la historia era el punto
--      de todo esto.
--   2. Un filtro implícito que alguien se olvida de considerar no avisa nunca.
--      Renombrando los métodos del repositorio (`...AndDeletedAtIsNull`), **el
--      compilador encuentra cada llamador**. Lo que se escapa no compila.
--
-- ── CÓMO SE RECUPERA UN SOCIO BORRADO POR ERROR ───────────────────────────
-- Esto es lo que antes no existía. Ver quiénes están en la papelera:
--
--     SELECT id, first_name, last_name, document, deleted_at
--       FROM gym_member
--      WHERE tenant_id = '<id del gimnasio>' AND deleted_at IS NOT NULL
--      ORDER BY deleted_at DESC;
--
-- Y devolver a uno al padrón, con su historia intacta:
--
--     UPDATE gym_member SET deleted_at = NULL WHERE id = '<id del socio>';
-- ============================================================================

ALTER TABLE gym_member ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;

-- Índice parcial y no común: el caso normal es `deleted_at IS NULL` —o sea casi
-- todo el padrón— y un índice sobre eso no sirve para nada. Lo que hay que
-- poder encontrar rápido es lo poco que está en la papelera.
CREATE INDEX IF NOT EXISTS ix_gym_member_borrados
    ON gym_member (tenant_id, deleted_at DESC)
    WHERE deleted_at IS NOT NULL;

COMMENT ON COLUMN gym_member.deleted_at IS
    'Papelera: con fecha, el socio no se muestra en ninguna pantalla, pero la fila y toda su '
    'historia (visitas y cobros) quedan enteras. NO confundir con is_active, que es un estado '
    'de negocio del socio que SÍ existe. Para recuperarlo: poner deleted_at en NULL. Ver V80.';
