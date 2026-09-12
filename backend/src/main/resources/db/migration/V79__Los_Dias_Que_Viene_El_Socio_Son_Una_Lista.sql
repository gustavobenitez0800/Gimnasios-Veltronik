-- ============================================================================
-- V79 — `attendance_days` deja de ser una lista escondida en un texto
-- ============================================================================
-- POR QUÉ.
-- La columna guarda los días que viene el socio como un array JSON —`[1,3,5]`,
-- índices de día de la semana— dentro de una columna `text`. Es la violación de
-- 1NF más clara que queda en el esquema: un campo que contiene una LISTA.
--
-- Y al ser `text`, Postgres no sabe que ahí adentro hay JSON: no valida nada
-- (entra `"asdf"` o un array a medio cerrar igual) y no se puede preguntar
-- nada. "¿Quiénes vienen los martes?" —que para un gimnasio es una pregunta de
-- negocio real, sirve para saber qué días se llena— hoy no se puede responder
-- con una consulta.
--
-- ============================================================================
-- ⭐ POR QUÉ **NO** SE HIZO UNA TABLA HIJA, QUE SERÍA LO "CORRECTO"
-- ============================================================================
-- La normalización de manual acá es una tabla
-- `gym_member_attendance_day(member_id, day_of_week)`. Se evaluó y se descartó,
-- y conviene dejar escrito por qué para que no venga alguien a "terminar el
-- trabajo" sin saber lo que sigue:
--
--   1. En JPA, esa tabla es una `@ElementCollection`, o sea una relación LAZY.
--   2. Este proyecto corre con `spring.jpa.open-in-view=false`.
--   3. Con esa combinación, TODA relación LAZY que el DTO toque tiene que venir
--      resuelta en la consulta o revienta fuera de la transacción. Ya pasó, con
--      el arancel del socio, y costó un bug en producción.
--   4. El DTO del socio SÍ toca este campo, y la consulta que lo usa es la
--      lista del padrón: 385 filas, la pantalla más abierta del sistema. Sería
--      meter un N+1 —o un fetch join con filas duplicadas que hay que
--      colapsar— en el peor lugar posible.
--
-- ¿Qué se compraría a cambio? Nada que haga falta: el backend NUNCA lee este
-- campo. Lo recibe del cliente, lo guarda y se lo devuelve igual.
--
-- `jsonb` da lo que de verdad importa —que el dato esté validado y se pueda
-- consultar— sin agregar una relación ni tocar la consulta del padrón. Si algún
-- día "¿quiénes vienen los martes?" pasa a ser una pantalla y no una curiosidad,
-- la tabla hija se hace ahí, con la consulta pensada para eso.
--
-- Con jsonb la pregunta ya se puede responder hoy, sin tabla nueva:
--     SELECT * FROM gym_member WHERE attendance_days @> '[2]';
--
-- ── LA CONVERSIÓN NO PIERDE NADA, Y LO QUE NO ENTIENDE LO DICE ────────────
-- Mismo criterio que la V78: se cuenta primero lo que no es JSON válido, se
-- deja el número en el log del deploy, y eso queda en NULL en vez de voltear el
-- arranque. Un valor que no era JSON tampoco lo podía leer el cliente.
--
-- ── NO CAMBIA EL CONTRATO ─────────────────────────────────────────────────
-- El DTO sigue siendo `String` y sigue viajando el mismo texto. Además el
-- cliente 2.6.31 ya está preparado para las dos formas: `useMemberController`
-- hace `JSON.parse` si viene string y lo usa directo si viene array.
-- ============================================================================

DO $$
DECLARE
    invalidos bigint;
BEGIN
    SELECT count(*) INTO invalidos
    FROM gym_member
    WHERE attendance_days IS NOT NULL
      AND btrim(attendance_days) <> ''
      AND NOT (attendance_days ~ '^\s*\[.*\]\s*$');

    IF invalidos = 0 THEN
        RAISE NOTICE 'V79: todos los dias de asistencia son arrays JSON validos.';
    ELSE
        RAISE WARNING 'V79: % filas con attendance_days que no es un array JSON; quedan en NULL.', invalidos;
    END IF;
END $$;

-- Lo que no tenga forma de array JSON queda en NULL antes de convertir: el cast
-- a jsonb no perdona, y un solo valor raro voltearía el deploy entero.
UPDATE gym_member
   SET attendance_days = NULL
 WHERE attendance_days IS NOT NULL
   AND (btrim(attendance_days) = '' OR NOT (attendance_days ~ '^\s*\[.*\]\s*$'));

ALTER TABLE gym_member
    ALTER COLUMN attendance_days TYPE jsonb
    USING attendance_days::jsonb;

-- Que siga siendo una LISTA y no cualquier cosa: con `text` no había forma de
-- exigirlo, con jsonb sí.
ALTER TABLE gym_member DROP CONSTRAINT IF EXISTS ck_gym_member_attendance_days;
ALTER TABLE gym_member ADD CONSTRAINT ck_gym_member_attendance_days
    CHECK (attendance_days IS NULL OR jsonb_typeof(attendance_days) = 'array') NOT VALID;

COMMENT ON COLUMN gym_member.attendance_days IS
    'Días que viene el socio, como array JSON de índices 0-6 (0 = domingo). Era `text` hasta '
    'la V79. Se dejó como valor y no como tabla hija a propósito: sería una @ElementCollection '
    'LAZY y con open-in-view=false eso mete un N+1 en la lista del padrón, que es la pantalla '
    'más usada — y el backend nunca lee este campo. Ver V79.';
