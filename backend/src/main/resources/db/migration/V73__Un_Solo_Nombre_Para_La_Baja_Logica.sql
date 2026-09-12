-- ============================================================================
-- V73 — La baja lógica se llama igual en todas las tablas
-- ============================================================================
-- POR QUÉ.
-- Seis tablas tienen una bandera de baja lógica. Cinco la llaman `is_active`:
--
--     tenant.is_active        tenant_membership.is_active
--     cashier.is_active       gym_class.is_active
--     gym_members.is_active   gym_plans.is_active
--
-- Y `checkin_point` la llama `active`, sola. No hay ninguna razón: la creó otra
-- migración, otro día.
--
-- La mejor prueba de que molesta está en `CheckinPointRepository.findByToken`,
-- que es la consulta que resuelve cada escaneo de QR. Las dos condiciones,
-- pegadas:
--
--        AND cp.active    = true
--        AND t.is_active  = true
--
-- La misma pregunta —"¿esto está dado de baja?"— escrita de dos formas en
-- renglones consecutivos. Eso no se arregla acordándose: se arregla haciendo
-- que solo exista una forma.
--
-- ── POR QUÉ ESTE RENOMBRE SÍ Y OTROS TODAVÍA NO ───────────────────────────
-- Renombrar columnas con clientes 2.6.31 instalados es lo que hay que mirar con
-- cuidado, porque a esos clientes no se los puede actualizar de prepo. Este
-- caso es seguro y conviene dejar escrito por qué:
--
--   · El nombre de la columna NO viaja al cliente. Jackson serializa por el
--     nombre de la propiedad Java (`active`), no por el de la columna. Cambiar
--     `@Column(name = "is_active")` deja el JSON idéntico.
--   · `checkin_point` no la devuelve ningún endpoint como entidad cruda. La
--     única tabla que se serializa directo es `caja_cierre` (CajaController), y
--     esta migración no la toca.
--   · El único lugar que nombra la columna en SQL es esa consulta nativa, y se
--     actualiza en el mismo commit.
--
-- Los renombres que SÍ cambian el contrato JSON —o que tocan `caja_cierre`—
-- quedan para una versión que viaje con su cliente.
-- ============================================================================

ALTER TABLE checkin_point RENAME COLUMN active TO is_active;

COMMENT ON COLUMN checkin_point.is_active IS
    'Baja lógica. Se llamaba `active` hasta la V73: en esta base la bandera de baja lógica '
    'se llama `is_active` en todas las tablas.';
