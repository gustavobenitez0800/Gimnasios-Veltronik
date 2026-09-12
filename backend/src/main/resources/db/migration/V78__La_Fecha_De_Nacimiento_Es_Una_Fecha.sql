-- ============================================================================
-- V78 — `birth_date` deja de ser texto y pasa a ser una fecha
-- ============================================================================
-- POR QUÉ.
-- En el modelo original (V2) esta columna era `date`. La reescritura del modelo
-- unificado la volvió a crear como `text` (V29) y así quedó. Nadie lo decidió:
-- se perdió en el camino.
--
-- Lo que cuesta está a la vista en `GymMemberRepository.cumplenHoy`, que es la
-- consulta que arma el saludo de cumpleaños del Dashboard:
--
--     SUBSTRING(m.birth_date FROM 6 FOR 5) = :mesYDia
--
-- Para preguntar "¿quién cumple hoy?" hay que RECORTAR UN STRING por posición
-- de caracteres, confiando en que todos los valores tengan exactamente el
-- formato ISO. El javadoc lo admite: "un valor con otro formato simplemente no
-- coincide, que es mejor que hacer explotar la consulta entera". O sea que un
-- socio con la fecha cargada distinto no cumple años nunca, y nadie se entera.
--
-- Y como es `text`, nada impide guardar "asdf", "12/05/1990" o "1990-13-45".
--
-- ── LA CONVERSIÓN NO ROMPE NADA, Y LO QUE NO PUEDE CONVERTIR LO DICE ───────
-- Un cast a secas (`birth_date::date`) voltea la migración entera si hay UN
-- solo valor raro. Y un chequeo por expresión regular no alcanza: '2005-02-30'
-- tiene forma de fecha ISO y no existe.
--
-- Así que la conversión se hace con una función que INTENTA el cast y devuelve
-- NULL si no puede. Antes de convertir, cuenta cuántos valores se van a perder
-- y lo deja en el log del deploy: si el número es 0 —que es lo esperable,
-- porque el alta viene de un <input type="date"> que solo produce ISO— no se
-- perdió nada; si no es 0, ahí está el dato para revisarlo, y lo que se pierde
-- era texto que la consulta de cumpleaños ya ignoraba.
--
-- ── POR QUÉ NO CAMBIA EL CONTRATO CON LOS CLIENTES INSTALADOS ─────────────
-- El DTO sigue siendo `String`. En la salida, MapStruct formatea el `LocalDate`
-- con ISO_LOCAL_DATE → "2005-02-07", exactamente lo que viaja hoy. En la
-- entrada, el alta pasa por un solo punto (`GymMemberController`) que parsea de
-- forma tolerante: vacío o ilegible queda en NULL en vez de tirar un error a un
-- mostrador que no se puede actualizar.
-- ============================================================================

-- Cast tolerante, solo para esta migración.
CREATE OR REPLACE FUNCTION pg_temp_fecha_o_null(txt text) RETURNS date AS $$
BEGIN
    IF txt IS NULL OR btrim(txt) = '' THEN
        RETURN NULL;
    END IF;
    RETURN btrim(txt)::date;
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;   -- no era una fecha; la consulta de cumpleaños ya la ignoraba
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Contar antes de tocar, y dejarlo en el log del deploy.
DO $$
DECLARE
    ilegibles bigint;
BEGIN
    SELECT count(*) INTO ilegibles
    FROM gym_member
    WHERE birth_date IS NOT NULL
      AND btrim(birth_date) <> ''
      AND pg_temp_fecha_o_null(birth_date) IS NULL;

    IF ilegibles = 0 THEN
        RAISE NOTICE 'V78: todas las fechas de nacimiento se convirtieron sin perder ninguna.';
    ELSE
        RAISE WARNING 'V78: % fechas de nacimiento no eran fechas y quedan en NULL. La consulta de cumpleanos ya las ignoraba.', ilegibles;
    END IF;
END $$;

ALTER TABLE gym_member
    ALTER COLUMN birth_date TYPE date
    USING pg_temp_fecha_o_null(birth_date);

DROP FUNCTION pg_temp_fecha_o_null(text);

-- ── POR QUÉ NO HAY UN ÍNDICE PARA LOS CUMPLEAÑOS ──────────────────────────
-- El primer intento fue indexar la expresión que usa la consulta:
--
--     CREATE INDEX ... ON gym_member (tenant_id, to_char(birth_date, 'MM-DD'))
--
-- Postgres lo rechaza: `to_char(date, text)` es STABLE y no IMMUTABLE —su
-- salida depende de la configuración regional de la sesión— y en un índice solo
-- entran expresiones inmutables. Se podría indexar con EXTRACT, que sí lo es,
-- pero entonces la consulta tiene que preguntar por mes y día POR SEPARADO para
-- poder usarlo, y eso obliga a cambiarle la firma al repositorio y a su llamador.
--
-- No vale la pena, y conviene decir por qué en vez de dejarlo picando: la
-- consulta ya entra por `ix_gym_member_tenant`, así que solo mira los socios de
-- UN gimnasio —unos cientos— y evalúa `to_char` sobre esas filas. Eso son
-- microsegundos. Lo que arregla esta migración es el TIPO: que no se pueda
-- guardar basura y que no haya que recortar un string por posición. El índice
-- sería optimización prematura, y encima contagiosa (cambiaría una API interna
-- para nada).
--
-- Si algún día el padrón de un solo gimnasio llega a decenas de miles, se hace
-- con EXTRACT y se cambia la firma ahí, con el número que lo justifique.

COMMENT ON COLUMN gym_member.birth_date IS
    'Fecha de nacimiento. Era `text` desde la V29 y volvió a ser `date` en la V78: con texto, '
    'buscar cumpleaños obligaba a recortar el string por posición y un valor mal formateado '
    'no cumplía años nunca.';
