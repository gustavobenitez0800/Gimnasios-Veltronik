-- V49__Checkin_Scanner.sql
--
-- DE QUÉ TELÉFONO VINO CADA MARCA.
--
-- El check-in por QR se identifica con el DNI, y un DNI no es secreto: cualquiera que lo
-- sepa puede marcar en nombre de otro. Cerrar eso del todo exigiría un PIN por socio o que
-- el mostrador apruebe cada teléfono — las dos cosas agregan la fricción que esta función
-- vino a sacar.
--
-- La decisión del dueño fue no agregar fricción, pero DEJAR RASTRO. Para eso hace falta poder
-- distinguir un teléfono de otro.
--
-- QUÉ ES ESTE IDENTIFICADOR, Y QUÉ NO ES
-- Es un número al azar que el propio teléfono se genera la primera vez y guarda. NO sale de
-- ningún dato del aparato ni de la persona: no es el IMEI, ni el número de línea, ni una
-- huella del navegador. No sirve para reconocer a nadie fuera de este gimnasio, y si el socio
-- borra los datos del navegador, cambia y listo.
--
-- Sirve para UNA sola pregunta: "¿este mismo teléfono viene marcando a nombre de personas
-- distintas?". Un socio marca siempre con el suyo; el que presta el teléfono o el que anda
-- probando documentos ajenos deja un patrón visible.
--
-- Nullable a propósito: los accesos que carga el mostrador a mano no tienen teléfono detrás,
-- y los que ya existen tampoco.
ALTER TABLE access_log
    ADD COLUMN IF NOT EXISTS scanner_id uuid;

-- La consulta que importa es "¿a qué socios marcó este teléfono últimamente?", siempre dentro
-- de un gimnasio y acotada por fecha.
CREATE INDEX IF NOT EXISTS idx_access_log_scanner
    ON access_log (tenant_id, scanner_id, check_in_at DESC)
    WHERE scanner_id IS NOT NULL;
