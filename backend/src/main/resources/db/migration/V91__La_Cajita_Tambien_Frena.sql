-- ============================================================================
-- V91 · LA CAJITA DEL MOLINETE TAMBIÉN FRENA (03/11/2026)
-- ============================================================================
--
-- Hasta acá, a la lista de «la puerta frenó a un socio» (`access_denied`) solo escribía el
-- molinete facial, con sus dos motivos: FUERA_DE_HORARIO y SIN_PERMISO.
--
-- Con la cajita del molinete la puerta la maneja la PC del mostrador: el socio pasa el llavero
-- y, si no está al día, no se le abre. Pero el mostrador anotaba igual una ENTRADA: el socio
-- figuraba adentro estando en la vereda, y si volvía a pasar el llavero el sistema lo tomaba
-- por una SALIDA —y un molinete que también abre para salir le abría la puerta—.
--
-- Ahora el mostrador deja el mismo registro que el molinete facial, con un motivo propio:
-- NO_ESTA_AL_DIA (`AccessDenied.Reason`). Esta migración solo le hace lugar en el CHECK.
--
-- ⚠️ CON EL CUIDADO DE LA V72/V81. La restricción nueva entra NOT VALID —aplica a toda fila
-- nueva, no revisa las viejas— y después se intenta validar. Si alguna fila vieja no cumpliera
-- (no debería: el único que escribe esa columna es el backend, desde sus constantes), queda NOT
-- VALID y se avisa por el log, sin tirar el arranque del backend, que es cuando corre Flyway.
-- ============================================================================

ALTER TABLE access_denied DROP CONSTRAINT IF EXISTS ck_access_denied_reason;
ALTER TABLE access_denied ADD CONSTRAINT ck_access_denied_reason
    CHECK (reason IN ('FUERA_DE_HORARIO', 'SIN_PERMISO', 'NO_ESTA_AL_DIA')) NOT VALID;

DO $$
BEGIN
    ALTER TABLE access_denied VALIDATE CONSTRAINT ck_access_denied_reason;
    RAISE NOTICE 'V91: ck_access_denied_reason validada.';
EXCEPTION WHEN check_violation THEN
    RAISE WARNING 'V91: ck_access_denied_reason queda NOT VALID: hay filas viejas fuera de los tres motivos (sigue aplicando a todo lo nuevo).';
END $$;
