-- V51__Access_Aviso.sql
--
-- QUE EL MOSTRADOR SE ENTERE EN EL MOMENTO.
--
-- Con el check-in por QR, un socio vencido entra sin que nadie lo vea: el aviso aparece en
-- SU teléfono y ahí muere. La recepcionista se entera recién si mira la lista de accesos y
-- la cruza a mano con el estado de cada uno — o sea, nunca.
--
-- El backend ya sabe cuándo hace falta avisar (lo devuelve como `avisarMostrador` en la
-- respuesta del escaneo). Lo que faltaba era que esa señal llegara a la otra punta.
--
-- POR QUÉ HACE FALTA GUARDAR QUE YA SE ATENDIÓ
-- Sin esto, el aviso de las 9 de la mañana sigue en pantalla a las 8 de la noche. Un cartel
-- que no se puede sacar deja de leerse a los dos días, y con él se pierden los avisos que sí
-- importaban. Marcar "ya lo hablé con él" es lo que mantiene la lista corta y creíble.
--
-- Va en la base y no en cada terminal a propósito: si el gimnasio tiene dos computadoras,
-- que una recepcionista resuelva el caso tiene que apagar el aviso en las dos. Si no, la
-- segunda persona vuelve a interceptar al mismo socio que ya pagó hace diez minutos.
ALTER TABLE access_log
    ADD COLUMN IF NOT EXISTS aviso_visto_at timestamp;

-- La consulta del mostrador es "avisos de hoy sin atender", y corre cada pocos segundos
-- mientras la pantalla está abierta. El índice parcial la deja en nada: solo entran las
-- filas que todavía no se atendieron.
CREATE INDEX IF NOT EXISTS idx_access_log_avisos
    ON access_log (tenant_id, check_in_at DESC)
    WHERE aviso_visto_at IS NULL;
