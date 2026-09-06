/**
 * ============================================
 * VELTRONIK - LA BASE DEL TERMINAL
 * ============================================
 *
 * El archivo donde el mostrador guarda lo que necesita para trabajar sin internet.
 *
 * <b>Qué guarda, y qué NO.</b> Guarda dos cosas: un espejo de las tablas principales —con
 * la misma estructura, para que se lea y se consulte sin traducir nada— y, más adelante, la
 * cola de lo que todavía no se pudo mandar. No guarda una segunda verdad: el veredicto de
 * cada socio baja resuelto del servidor y acá se copia tal cual. Recalcularlo sería tener
 * dos calendarios en el sistema, que es el bug que ya apareció tres de tres veces.
 *
 * <b>Por qué SQLite y no la base del navegador.</b> El requisito es un corte de luz, no una
 * pestaña que se cierra. IndexedDB (LevelDB por debajo) se corrompe con el enchufe; SQLite
 * en WAL no. Y vive en el proceso principal porque el archivo tiene que sobrevivir a que el
 * renderer se recargue, se cuelgue o se abra dos veces.
 *
 * <b>WAL protege de la corrupción; FULL protege de perder lo último.</b> Son dos cosas
 * distintas y hace falta decir las dos. En WAL con `synchronous = NORMAL` —el acompañante
 * habitual— un apagón no rompe el archivo pero puede comerse las últimas transacciones
 * confirmadas. Para una lista de socios daría igual; para la cola de cobros que viene
 * después, esa transacción es la cuota que alguien pagó en efectivo y nadie más anotó. Por
 * eso va FULL desde ahora: el costo es un fsync por escritura, y acá se escribe un puñado
 * de veces por hora, no miles por segundo.
 *
 * <b>Esto NO puede impedir que el gimnasio abra.</b> `better-sqlite3` es un módulo nativo:
 * si el binario no coincide con la máquina del cliente, el `require` explota. Si eso pasa,
 * la app tiene que seguir andando exactamente como andaba antes de que este archivo
 * existiera —consultando la nube—, no mostrar una pantalla de error. Por eso la carga está
 * envuelta y `disponible()` es la puerta que todos consultan.
 */

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

/** Carpeta y archivo dentro de los datos del usuario. */
const CARPETA = 'nucleo';
const ARCHIVO = 'veltronik.db';

/**
 * El módulo nativo, o null si esta máquina no lo pudo cargar.
 *
 * Se resuelve UNA vez, al cargar el módulo: si falla, falla acá y en silencio, no en medio
 * de la atención a un socio.
 */
let Database = null;
let motivoNoDisponible = null;

try {
    Database = require('better-sqlite3');
} catch (e) {
    motivoNoDisponible = e.message;
    console.warn('[Veltronik] Sin base local: no se pudo cargar better-sqlite3 —', e.message);
}

/** La conexión abierta. Una sola por proceso. */
let db = null;

/**
 * El esquema.
 *
 * <p><b>Los nombres son los de Postgres, no los del JSON.</b> La API habla en camelCase y la
 * base en snake_case; la traducción se hace UNA vez al guardar (ver espejo.cjs). A cambio,
 * cualquier consulta escrita para el servidor se puede probar acá tal cual, y quien abra el
 * archivo con un visor ve las mismas columnas que ya conoce.</p>
 *
 * <p><b>Falta a propósito el historial de pagos.</b> Es la tabla más grande, no tiene ningún
 * uso con el cable desenchufado, y es la que convierte un padrón en un perfil financiero. El
 * DNI no se puede evitar —es el campo por el que busca la recepcionista— pero lo que no está
 * en el archivo no se lo lleva nadie.</p>
 */
const ESQUEMA = `
CREATE TABLE IF NOT EXISTS gym_members (
    id                TEXT PRIMARY KEY,
    tenant_id         TEXT NOT NULL,
    first_name        TEXT,
    last_name         TEXT,
    email             TEXT,
    phone             TEXT,
    document          TEXT,
    is_active         INTEGER NOT NULL DEFAULT 1,
    membership_start  TEXT,
    membership_end    TEXT,
    plan_id           TEXT,

    -- Denormalizado a propósito: el nombre del arancel vive en otra tabla del servidor, y
    -- espejar esa tabla entera para mostrar una etiqueta no vale la pena.
    plan_nombre       TEXT,

    -- ── LA RESPUESTA YA RESUELTA ──
    -- Estas tres NO existen en Postgres: las calcula MemberAccessPolicy y viajan en el DTO.
    -- Se copian tal cual. Si algún día alguien siente la tentación de derivarlas de
    -- membership_end acá adentro, esa es exactamente la línea que no hay que cruzar.
    situacion         TEXT,
    dias_vencido      INTEGER,
    dias_restantes    INTEGER,

    -- Nombre + apellido + documento, sin tildes ni mayúsculas, calculado UNA vez al guardar.
    -- Normalizar en cada tecla es repetir el mismo trabajo miles de veces por búsqueda.
    busqueda          TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS ix_gym_members_tenant   ON gym_members (tenant_id);
CREATE INDEX IF NOT EXISTS ix_gym_members_busqueda ON gym_members (tenant_id, busqueda);

-- De cuándo es el espejo de cada gimnasio. Una fila por tenant: el mismo terminal puede
-- haber visto más de una sucursal, y la lista de un gimnasio no sirve para otro.
CREATE TABLE IF NOT EXISTS espejo_estado (
    tenant_id    TEXT PRIMARY KEY,
    actualizado  INTEGER NOT NULL,
    socios       INTEGER NOT NULL DEFAULT 0
);

-- ── LA COLA: lo que pasó en la puerta y el servidor todavía no sabe ──
--
-- Es la única tabla de este archivo que contiene algo que NO está en ningún otro lado. El
-- espejo se puede perder y se vuelve a bajar; una visita que está acá y se pierde, se
-- perdió para siempre. Por eso la base va en synchronous = FULL: acá adentro hay datos
-- del gimnasio que todavía no tiene nadie más.
--
-- client_ref es la CLAVE PRIMARIA y no un campo más. Es el mismo UUID que viaja al
-- servidor, donde un índice único parcial por tenant (V54) lo rechaza si ya lo vio. Que
-- acá sea la primary key significa que encolar dos veces el mismo acceso es imposible en
-- los dos extremos de la línea, no solo en uno.
CREATE TABLE IF NOT EXISTS cola_accesos (
    client_ref   TEXT PRIMARY KEY,

    -- DE QUÉ GIMNASIO es este acceso. La cola es de la MÁQUINA, pero cada acceso es de un
    -- gimnasio: sin esto, otra sucursal entrando en el mismo terminal mandaría estas
    -- visitas a su propio negocio.
    tenant_id    TEXT,

    member_id    TEXT NOT NULL,
    member_name  TEXT,
    method       TEXT NOT NULL DEFAULT 'manual',

    -- CUÁNDO PASÓ, según el reloj del terminal. El servidor evalúa la dirección contra
    -- este instante y no contra el momento en que le llega. Sin esto, la salida de un
    -- socio que sube tarde se lee como visita abandonada y abre una entrada nueva.
    ocurrido_en  TEXT NOT NULL,

    intentos     INTEGER NOT NULL DEFAULT 0,
    ultimo_error TEXT,

    -- Para ordenar con criterio estable y para saber a quién descartar si la cola se llena.
    creado_en    INTEGER NOT NULL
);

-- El orden de vaciado. Por el momento REAL, no por el de encolado: es lo único que
-- garantiza que reproducir la cola dé el mismo resultado que si hubiera habido internet.
CREATE INDEX IF NOT EXISTS ix_cola_accesos_orden ON cola_accesos (tenant_id, ocurrido_en, creado_en);
`;

/** ¿Hay base local en esta máquina? */
function disponible() {
    return Database !== null;
}

/** Por qué no la hay (para el diagnóstico, no para la pantalla del socio). */
function porQueNo() {
    return motivoNoDisponible;
}

/** La ruta del archivo. Separada para poder mirarla desde afuera sin abrir nada. */
function ruta() {
    return path.join(app.getPath('userData'), CARPETA, ARCHIVO);
}

/**
 * Abre la base (o devuelve la que ya está abierta).
 *
 * Devuelve `null` si esta máquina no puede: sin módulo nativo, sin permisos en la carpeta,
 * disco lleno. El que llama tiene que estar preparado para eso — la app no se cae por no
 * tener copia local, simplemente vuelve a depender de la nube como antes.
 */
function abrir() {
    if (db) return db;
    if (!disponible()) return null;

    try {
        const destino = ruta();
        fs.mkdirSync(path.dirname(destino), { recursive: true });

        const conexion = new Database(destino);

        // El orden importa: WAL primero, y recién después el nivel de sincronía. Al revés,
        // cambiar de journal reescribe `synchronous` con el valor por defecto del modo.
        conexion.pragma('journal_mode = WAL');
        conexion.pragma('synchronous = FULL');

        // Si otra cosa tiene el archivo tomado, esperar en vez de fallar en el acto. Cinco
        // segundos es mucho más de lo que tarda cualquier escritura de este tamaño.
        conexion.pragma('busy_timeout = 5000');

        conexion.exec(ESQUEMA);

        db = conexion;
        return db;
    } catch (e) {
        // Un archivo corrupto, una carpeta sin permisos, un disco lleno: se avisa y se sigue
        // sin base local. Una copia de la lista de socios no puede impedir que el gimnasio abra.
        console.warn('[Veltronik] No se pudo abrir la base local:', e.message);
        motivoNoDisponible = e.message;
        db = null;
        return null;
    }
}

/**
 * Cierra la base. Se llama al salir, para que el WAL se integre al archivo principal en vez
 * de quedar como un checkpoint pendiente que el próximo arranque tiene que rehacer.
 */
function cerrar() {
    if (!db) return;
    try {
        db.close();
    } catch (e) {
        console.warn('[Veltronik] No se pudo cerrar la base local:', e.message);
    } finally {
        db = null;
    }
}

module.exports = { abrir, cerrar, disponible, porQueNo, ruta, ESQUEMA };
