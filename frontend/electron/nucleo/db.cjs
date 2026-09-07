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

-- ── LA COLA: lo que pasó en el mostrador y el servidor todavía no sabe ──
--
-- Es la única tabla de este archivo que contiene algo que NO está en ningún otro lado. El
-- espejo se puede perder y se vuelve a bajar; una visita —o un cobro— que está acá y se
-- pierde, se perdió para siempre. Por eso la base va en synchronous = FULL: acá adentro
-- hay datos del gimnasio que todavía no tiene nadie más.
--
-- ⭐ UNA SOLA COLA PARA TODOS LOS TIPOS, Y ES UNA DECISIÓN, NO UNA COMODIDAD.
-- Nació siendo cola_accesos. La fase 3 agrega cobros, altas, egresos y cierres, y el
-- dueño decidió que se pueda dar de alta a un socio Y COBRARLE en el mismo acto sin
-- internet. Eso obliga a que el orden valga ENTRE TIPOS DISTINTOS: el alta del socio X
-- tiene que subir antes que el cobro al socio X, o el servidor recibe un cobro de alguien
-- que para él no existe. Dos tablas no pueden garantizar un orden entre sí; una sola,
-- ordenada por el momento real, sí. Ver docs/FASE3-CAMINOS.md.
--
-- client_ref es la CLAVE PRIMARIA y no un campo más. Es el mismo UUID que viaja al
-- servidor, donde un índice único parcial por tenant lo rechaza si ya lo vio (V54 para
-- accesos, V63 para cobros y movimientos de caja). Que acá sea la primary key significa
-- que encolar dos veces lo mismo es imposible en los dos extremos de la línea.
CREATE TABLE IF NOT EXISTS cola (
    client_ref   TEXT PRIMARY KEY,

    -- ACCESO | COBRO | ALTA | EGRESO | CIERRE. Decide a qué endpoint va y con qué forma.
    tipo         TEXT NOT NULL,

    -- DE QUÉ GIMNASIO es. La cola es de la MÁQUINA, pero cada cosa encolada es de un
    -- gimnasio: sin esto, otra sucursal entrando en el mismo terminal mandaría estas
    -- visitas —o estos cobros— a su propio negocio.
    tenant_id    TEXT,

    -- CUÁNDO PASÓ, según el reloj del terminal. El servidor evalúa contra este instante y
    -- no contra el momento en que le llega. Sin esto, la salida de un socio que sube tarde
    -- se lee como visita abandonada, y un cierre hecho a las 22:00 que sube a las 09:00
    -- barrería las ventas de la mañana siguiente.
    ocurrido_en  TEXT NOT NULL,

    -- Lo propio de cada tipo, en JSON. Va acá y no en columnas porque cada tipo tiene su
    -- forma y agregar un tipo nuevo no puede obligar a migrar la base de todos los
    -- clientes. Lo que SÍ es columna es lo que se consulta: el gimnasio y el momento.
    payload      TEXT NOT NULL,

    intentos     INTEGER NOT NULL DEFAULT 0,
    ultimo_error TEXT,

    -- Para ordenar con criterio estable y para saber a quién descartar si la cola se llena.
    creado_en    INTEGER NOT NULL
);

-- El orden de vaciado. Por el momento REAL, no por el de encolado: es lo único que
-- garantiza que reproducir la cola dé el mismo resultado que si hubiera habido internet.
CREATE INDEX IF NOT EXISTS ix_cola_orden ON cola (tenant_id, ocurrido_en, creado_en);
`;

/**
 * Pasa lo que quedó en la cola vieja de accesos a la cola general. Una sola vez.
 *
 * <p><b>Por qué esto existe y por qué es delicado.</b> En los terminales que ya están
 * instalados puede haber visitas esperando en `cola_accesos`. Eso es lo único de todo el
 * archivo que no se puede volver a bajar de ningún lado: si esta función las pierde, el
 * gimnasio pierde entradas que registró de verdad.</p>
 *
 * <p><b>La trampa que resuelve el renombre.</b> Copiar con `INSERT OR IGNORE` es idempotente
 * mirando UNA corrida, pero no mirando la vida del terminal: una fila que se copió, se subió
 * y se sacó de la cola volvería a aparecer en el próximo arranque, porque el original sigue
 * en la tabla vieja. Se resubiría para siempre. Por eso, al terminar, la tabla vieja se
 * RENOMBRA: la copia deja de tener de dónde repetirse.</p>
 *
 * <p><b>Y no se borra.</b> Se queda como `cola_accesos_migrada`, ocupando nada, hasta que
 * haga falta el espacio. Es un dato irreemplazable: primero se comprueba que la copia salió
 * bien en máquinas de verdad, y recién después se piensa en borrarla.</p>
 */
function migrarColaVieja(conexion) {
    const vieja = conexion.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='cola_accesos'",
    ).get();
    if (!vieja) return { migradas: 0 };

    const paso = conexion.transaction(() => {
        const antes = conexion.prepare('SELECT COUNT(*) AS n FROM cola_accesos').get().n;

        conexion.prepare(`
            INSERT OR IGNORE INTO cola
                (client_ref, tipo, tenant_id, ocurrido_en, payload, intentos, ultimo_error, creado_en)
            SELECT client_ref, 'ACCESO', tenant_id, ocurrido_en,
                   json_object('memberId', member_id, 'memberName', member_name, 'method', method),
                   intentos, ultimo_error, creado_en
            FROM cola_accesos
        `).run();

        // Se comprueba ANTES de renombrar. Si por lo que sea no entraron todas, la tabla
        // vieja se queda donde está y el próximo arranque lo vuelve a intentar: es preferible
        // reintentar para siempre antes que renombrar sobre una copia incompleta.
        const copiadas = conexion.prepare(`
            SELECT COUNT(*) AS n FROM cola_accesos v
            WHERE EXISTS (SELECT 1 FROM cola c WHERE c.client_ref = v.client_ref)
        `).get().n;

        if (copiadas < antes) {
            throw new Error(`la copia quedó incompleta (${copiadas} de ${antes})`);
        }

        conexion.prepare('ALTER TABLE cola_accesos RENAME TO cola_accesos_migrada').run();
        return antes;
    });

    try {
        const migradas = paso();
        if (migradas > 0) {
            console.log(`[Veltronik] Cola: ${migradas} accesos pasados a la cola general.`);
        }
        return { migradas };
    } catch (e) {
        // Que falle no puede impedir que la app abra: la cola vieja sigue intacta y se
        // reintenta en el próximo arranque. Lo que NO puede pasar es perderla.
        console.warn('[Veltronik] No se pudo migrar la cola vieja:', e.message);
        return { migradas: 0, error: e.message };
    }
}

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

        // Después del esquema y antes de devolver la conexión: nadie puede leer la cola
        // hasta que lo que estaba en la vieja esté adentro de la nueva.
        migrarColaVieja(conexion);

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

module.exports = { abrir, cerrar, disponible, porQueNo, ruta, ESQUEMA, migrarColaVieja };
