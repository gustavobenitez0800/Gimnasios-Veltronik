-- V62__Molinete_Facial.sql
--
-- LA ENTRADA POR MOLINETE.
--
-- El equipo de reconocimiento facial vive en la red del gimnasio, guarda las caras adentro y
-- decide solo. Cuando reconoce a alguien, le pega a Veltronik contando qué pasó. Esta
-- migración prepara las dos cosas que faltaban para recibir ese aviso.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Aparear la puerta con el equipo
-- ─────────────────────────────────────────────────────────────────────────────
-- El aviso llega a un endpoint público —el equipo no tiene sesión ni la va a tener— y se
-- identifica con el token del punto de acceso, el mismo mecanismo del QR de la pared: opaco,
-- rotable, y resuelve solo a qué gimnasio pertenece.
--
-- El número de serie es el SEGUNDO factor, no el primero. No es un secreto: cualquiera en la
-- red del gimnasio se lo puede preguntar al equipo sin contraseña. Pero anclado acá, un token
-- filtrado deja de alcanzar para inventar entradas desde afuera: además hay que decir el
-- serial correcto. Se aparea solo la primera vez que el equipo avisa, y a partir de ahí no
-- cambia sin que alguien lo cambie a mano.
ALTER TABLE checkin_point
    ADD COLUMN IF NOT EXISTS device_serial varchar(64);

-- Un equipo físico no puede estar en dos puertas a la vez. Parcial porque la enorme mayoría
-- de los puntos son carteles de QR y no tienen serial.
CREATE UNIQUE INDEX IF NOT EXISTS uq_checkin_point_device_serial
    ON checkin_point (device_serial)
    WHERE device_serial IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Los que quisieron entrar y no pudieron
-- ─────────────────────────────────────────────────────────────────────────────
-- El molinete frena al socio vencido: le reconoce la cara, le dice el nombre en la pantalla y
-- no le abre. Ese intento es información valiosa —es exactamente el socio al que hay que
-- llamar— pero NO ES UNA VISITA: esa persona no entró al gimnasio.
--
-- POR QUÉ UNA TABLA APARTE Y NO UNA COLUMNA `denied` EN access_log.
-- Meter los rechazos en access_log parece más barato y es una trampa: a partir de ese día,
-- TODA consulta que cuente asistencias tendría que acordarse de filtrar la marca. Son muchas
-- —el tablero, los reportes, "quién está adentro", el "¿vino este socio este mes?" con el que
-- el dueño decide a quién llamar— y alcanza con que una se olvide para que el sistema empiece
-- a contar como presente a alguien que se quedó afuera. Separadas, ninguna consulta vieja
-- cambia de significado y no hay nada que recordar.
CREATE TABLE IF NOT EXISTS access_denied (
    id                       uuid PRIMARY KEY,
    created_at               timestamp NOT NULL,
    updated_at               timestamp NOT NULL,
    tenant_id                uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    origin_device_id         uuid,
    performed_by_cashier_id  uuid,

    -- A quién frenó. El equipo lo reconoció, así que siempre sabemos quién es: por eso esto
    -- sirve para llamarlo. Si el equipo NO reconoce a alguien no se guarda nada acá — un
    -- desconocido parado frente a la cámara no es un socio con un problema de cuota.
    member_id                uuid NOT NULL REFERENCES gym_members(id) ON DELETE CASCADE,

    -- Cuándo pasó, con el reloj del equipo ya acotado por el servidor.
    occurred_at              timestamp NOT NULL,

    -- Por qué no pasó, en el vocabulario del equipo (FUERA_DE_HORARIO, SIN_PERMISO).
    reason                   varchar(40) NOT NULL,

    -- Por qué puerta lo intentó, y con qué equipo. Para el dueño con más de una entrada.
    checkin_point_id         uuid REFERENCES checkin_point(id) ON DELETE SET NULL,
    device_serial            varchar(64),

    -- El mostrador ya lo habló con el socio. Mismo criterio que los avisos del QR (V51): un
    -- cartel que no se puede sacar deja de leerse, y se lleva puestos los avisos que importaban.
    aviso_visto_at           timestamp
);

-- La pantalla del mostrador pregunta "rechazados de hoy sin atender" cada pocos segundos.
CREATE INDEX IF NOT EXISTS idx_access_denied_pendientes
    ON access_denied (tenant_id, occurred_at DESC)
    WHERE aviso_visto_at IS NULL;

-- Y el freno anti-repetición pregunta "¿ya guardé un rechazo de este socio recién?". El equipo
-- avisa por RECONOCIMIENTO, no por persona: mientras alguien está parado frente a la cámara
-- manda un aviso cada pocos segundos. Sin esta consulta, un socio vencido esperando a que le
-- abran generaría treinta filas idénticas.
CREATE INDEX IF NOT EXISTS idx_access_denied_socio
    ON access_denied (tenant_id, member_id, occurred_at DESC);
