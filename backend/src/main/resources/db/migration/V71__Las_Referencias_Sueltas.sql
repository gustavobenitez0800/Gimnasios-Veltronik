-- ============================================================================
-- V71 — Las referencias sueltas: se atan las que corresponde, y se explican
--       por escrito las que NO hay que atar
-- ============================================================================
-- POR QUÉ.
-- Hay nueve columnas en la base que son el id de otra fila y no tienen FK. A
-- primera vista parece un descuido repetido nueve veces y la reacción sana es
-- "ponéselas a todas". Sería un error: se revisó una por una y SOLO DOS tienen
-- que llevar FK. Las otras siete están sueltas por motivos buenos, y atarlas
-- rompería cosas que hoy funcionan.
--
-- Esta migración hace las dos, y —más importante— deja escrito en la base misma
-- por qué las otras siete se quedan como están. Un comentario en `COMMENT ON
-- COLUMN` viaja con la columna: el próximo que abra la tabla y piense "che,
-- acá falta una FK" va a encontrar la respuesta en el mismo lugar donde le nació
-- la duda, y no va a romper nada por prolijo.
-- ============================================================================


-- ============================================================================
-- PARTE 1 — Las dos que sí van
-- ============================================================================
-- `caja_movimiento.sesion_id` y `caja_sesion.cierre_id` las asigna EL SERVIDOR,
-- dentro de la misma transacción, a partir de una fila que acaba de leer o de
-- guardar (CajaService: `.ifPresent(s -> m.setSesionId(s.getId()))` y
-- `ses.setCierreId(guardado.getId())`). No hay ids que invente el cliente ni
-- que puedan llegar fuera de orden desde la cola del mostrador sin internet:
-- son punteros internos entre dos filas que ya existen.
--
-- ON DELETE SET NULL y no CASCADE: si alguna vez se borra una sesión de caja,
-- los movimientos de plata de ese día NO se van con ella. Pierden a qué turno
-- pertenecían, que es un dato de organización; la plata que entró y salió sigue
-- estando, que es el dato del que depende el arqueo.

-- Primero se limpia lo que ya estuviera huérfano, porque agregar la FK sobre un
-- huérfano hace fallar el deploy entero. Se los deja en NULL, que es
-- exactamente el mismo estado al que los llevaría el ON DELETE SET NULL.
UPDATE caja_movimiento m
   SET sesion_id = NULL
 WHERE m.sesion_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM caja_sesion s WHERE s.id = m.sesion_id);

UPDATE caja_sesion s
   SET cierre_id = NULL
 WHERE s.cierre_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM caja_cierre c WHERE c.id = s.cierre_id);

ALTER TABLE caja_movimiento DROP CONSTRAINT IF EXISTS fk_caja_movimiento_sesion;
ALTER TABLE caja_movimiento
    ADD CONSTRAINT fk_caja_movimiento_sesion
    FOREIGN KEY (sesion_id) REFERENCES caja_sesion(id) ON DELETE SET NULL;

ALTER TABLE caja_sesion DROP CONSTRAINT IF EXISTS fk_caja_sesion_cierre;
ALTER TABLE caja_sesion
    ADD CONSTRAINT fk_caja_sesion_cierre
    FOREIGN KEY (cierre_id) REFERENCES caja_cierre(id) ON DELETE SET NULL;

-- Una FK sin índice del lado hijo obliga a Postgres a recorrer la tabla entera
-- cada vez que se borra el padre, para ver si alguien lo apuntaba. Con la purga
-- de cuenta (V50) borrando de a tabla entera, eso se nota.
CREATE INDEX IF NOT EXISTS ix_caja_movimiento_sesion
    ON caja_movimiento (sesion_id) WHERE sesion_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_caja_sesion_cierre
    ON caja_sesion (cierre_id) WHERE cierre_id IS NOT NULL;


-- ============================================================================
-- PARTE 1.b — Cinco FK que ya existían y nunca tuvieron índice
-- ============================================================================
-- Las encontró `EsquemaInvariantesTest` la primera vez que corrió, que es
-- exactamente para lo que se escribió.
--
-- Dos de las cinco son la trampa fina: el índice PARECE estar y no sirve.
--
--     idx_access_denied_socio  ON access_denied (tenant_id, member_id, occurred_at DESC)
--     ix_gym_members_plan      ON gym_members   (tenant_id, plan_id)
--
-- Los dos son perfectos para la consulta que los motivó —siempre acotada a un
-- gimnasio— pero la columna de la FK va SEGUNDA. Postgres solo puede entrar a un
-- índice compuesto por su primera columna, así que para responder "¿alguien
-- apunta a este socio?" no lo usa: recorre la tabla entera. Un índice compuesto
-- que empieza por `tenant_id` no cubre la FK, aunque la columna figure adentro.
--
-- Dónde se paga: al borrar el padre. Y el borrado que más pesa acá es la purga
-- de cuenta (V50), que recorre las tablas borrando por `tenant_id` hasta diez
-- veces — cada pasada volviendo a recorrer entera cada tabla hija sin índice.
CREATE INDEX IF NOT EXISTS ix_access_denied_member
    ON access_denied (member_id);

CREATE INDEX IF NOT EXISTS ix_access_denied_checkin_point
    ON access_denied (checkin_point_id) WHERE checkin_point_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_access_log_checkin_point
    ON access_log (checkin_point_id) WHERE checkin_point_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_gym_members_plan_fk
    ON gym_members (plan_id) WHERE plan_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_tenant_payment_tenant
    ON tenant_payment (tenant_id);


-- ============================================================================
-- PARTE 2 — Las siete que NO van, y por qué
-- ============================================================================

-- ── gym_payment_ajuste.payment_id ──────────────────────────────────────────
-- ⛔ LA TRAMPA. Es la que más pinta tiene de necesitar FK: es NOT NULL, se
-- llama `payment_id` y apunta a `gym_payments`. Ponérsela ROMPERÍA BORRAR UN
-- COBRO, que es de lo más usado del mostrador.
--
-- Porque el ajuste de tipo BORRADO es, justamente, el acta de defunción del
-- cobro. `GymPaymentService.deleteAndVerifyOwnership` hace las dos cosas en
-- este orden:
--
--     anotar(payment.getId(), BORRADO, ...);   -- queda el rastro
--     repository.delete(payment);              -- y el cobro se va
--
-- O sea que después de un borrado el `payment_id` del ajuste apunta —a
-- propósito— a una fila que ya no existe. Con FK, la segunda línea fallaría
-- siempre; con ON DELETE CASCADE sería peor todavía, porque borrar el cobro se
-- llevaría puesto el registro de que alguien lo borró. Una auditoría que se
-- borra junto con lo que audita no es una auditoría.
COMMENT ON COLUMN gym_payment_ajuste.payment_id IS
    'Id del cobro ajustado. SIN FK A PROPÓSITO: el ajuste de tipo BORRADO sobrevive '
    'al cobro que registra (GymPaymentService borra la fila después de anotar). Una FK '
    'rompería el borrado de un cobro; un CASCADE borraría la auditoría con lo auditado. '
    'Ver V71.';

-- ── access_log.scanner_id ──────────────────────────────────────────────────
-- No es el id de ninguna fila de esta base: es el identificador que se genera
-- el TELÉFONO que escanea el QR, y llega en el cuerpo del request
-- (PublicCheckinController). No hay tabla de teléfonos, ni la va a haber:
-- sirve para responder "¿a qué socios marcó este aparato?" sin darlo de alta.
COMMENT ON COLUMN access_log.scanner_id IS
    'Identificador que se genera el teléfono que escanea el QR, no una fila de esta base. '
    'Sin FK por definición — no hay tabla de teléfonos. Ver V49 y V71.';

-- ── origin_device_id / performed_by_cashier_id (en 14 tablas) ──────────────
-- Son la FIRMA de quién hizo cada cosa, y una firma tiene que sobrevivir a la
-- baja del que firmó. Si el terminal se da de baja o la persona deja de
-- trabajar, los cobros que hizo siguen diciendo quién los hizo. Con FK habría
-- que elegir entre no poder dar de baja un equipo (RESTRICT) o borrar la
-- autoría de su historia (CASCADE / SET NULL), y las dos son peores.
--
-- Además `device_registry` no tiene `tenant_id` a propósito: un equipo vive
-- entre negocios, y la purga de cuenta (V50) lo suelta en vez de borrarlo.
COMMENT ON COLUMN gym_payments.origin_device_id IS
    'Qué terminal originó el registro. Sin FK a propósito: la firma sobrevive a la baja '
    'del equipo. Misma regla en las 14 tablas que heredan de TenantAwareEntity. Ver V71.';
COMMENT ON COLUMN gym_payments.performed_by_cashier_id IS
    'Quién atendió (PIN del mostrador). Sin FK a propósito: la firma sobrevive a la baja '
    'de la persona. Misma regla en las 14 tablas que heredan de TenantAwareEntity. Ver V71.';

COMMENT ON COLUMN device_registry.enrolled_tenant_id IS
    'Sucursal donde está enrolado el equipo. Sin FK a propósito: device_registry no lleva '
    'tenant_id porque un equipo vive entre negocios, y la purga de cuenta lo suelta en vez '
    'de borrarlo (TenantService). Ver V71.';
COMMENT ON COLUMN device_registry.last_tenant_id IS
    'Última sucursal vista. Sin FK, misma razón que enrolled_tenant_id. Ver V71.';
COMMENT ON COLUMN device_registry.enrolled_by_user_id IS
    'Quién enroló el equipo. Sin FK a propósito: es una firma y sobrevive a la baja de la '
    'cuenta que enroló. Ver V71.';


-- ============================================================================
-- PARTE 3 — La columna que no la usa nadie
-- ============================================================================
-- `gym_members.user_id` la agregó la V29 reconciliando deriva, y desde entonces
-- NADIE la escribe ni la lee: no hay un solo `setUserId` ni `getUserId` sobre
-- GymMember en todo el backend. Iba a servir para que el socio tuviera cuenta
-- propia, cosa que nunca se construyó.
--
-- No se borra acá. Borrar una columna es irreversible y esta migración tiene
-- otro asunto; queda anotada para que la próxima limpieza la encuentre marcada
-- y no tenga que volver a investigar si se usa.
COMMENT ON COLUMN gym_members.user_id IS
    'SIN USO. La agregó la V29 para un "socio con cuenta propia" que nunca se construyó: '
    'ningún código la escribe ni la lee. Candidata a borrarse. Ver V71.';

-- Misma marca para las dos que quedaron vivas por decisión explícita, así se
-- distingue "esto sobró" de "esto se dejó a propósito".
COMMENT ON COLUMN gym_members.classes_remaining IS
    'CONGELADA. El cupo de clases se dio de baja el 2026-09-02: la cobertura la decide solo '
    'la fecha (ADR-013). Los valores viejos se dejaron a propósito porque borrar es '
    'irreversible, y MemberAccessPolicyTest prueba que ya no cambian ninguna decisión.';

COMMENT ON COLUMN gym_plans.duration_days IS
    'CONGELADA. Reemplazada por cobertura_cantidad + cobertura_unidad (V65, ADR-013). Se '
    'dejó porque es lo único que dice qué vendía cada arancel antes de esa migración.';
