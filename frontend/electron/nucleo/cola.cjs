/**
 * ============================================
 * VELTRONIK - LA COLA DE ACCESOS, EN EL DISCO
 * ============================================
 *
 * El guardado de lo que pasó en la puerta y el servidor todavía no sabe.
 *
 * <b>Esto es distinto del espejo, y la diferencia importa.</b> El espejo es una copia: si se
 * pierde, se vuelve a bajar. La cola es lo único que hay: una visita que está acá y se pierde
 * <i>se perdió para siempre</i>, porque es un dato que el gimnasio todavía no tiene en ningún
 * otro lado. Por eso vive en la misma base con `synchronous = FULL`, y por eso este archivo
 * es conservador hasta la exageración: nada se borra si no hay certeza.
 *
 * <b>Acá NO vive la lógica de vaciado</b> —el orden, el candado, qué error se reintenta— sino
 * solo el guardado. Aquella vive del lado de la pantalla (`lib/colaAccesos.js`), que es quien
 * tiene el cliente HTTP; acá se guarda, se lee en orden y se saca. Separarlo así permite
 * probar la parte difícil sin un motor nativo, que es exactamente la limitación que impuso
 * `better-sqlite3`.
 */

const { abrir } = require('./db.cjs');
const respaldo = require('./respaldo.cjs');

/** Tope de la cola. Un mostrador hace decenas de accesos por día; 5000 son semanas. */
const MAX_EN_COLA = 5000;

const COLUMNAS = [
    'client_ref', 'tenant_id', 'member_id', 'member_name', 'method',
    'ocurrido_en', 'intentos', 'ultimo_error', 'creado_en',
];

const INSERT = `INSERT OR IGNORE INTO cola_accesos (${COLUMNAS.join(', ')})
                VALUES (${COLUMNAS.map((c) => `@${c}`).join(', ')})`;

/** De la fila de la base a lo que espera la pantalla. */
function aVista(f) {
    return {
        clientRef: f.client_ref,
        tenantId: f.tenant_id,
        memberId: f.member_id,
        memberName: f.member_name || '',
        method: f.method,
        ocurridoEn: f.ocurrido_en,
        intentos: f.intentos,
        ultimoError: f.ultimo_error,
        creadoEn: f.creado_en,
    };
}

/**
 * Guarda un acceso para mandarlo cuando haya internet.
 *
 * <p><b>`INSERT OR IGNORE`, no `INSERT`.</b> Si el mismo `clientRef` ya está encolado, el
 * segundo intento no hace nada en vez de tirar. Es la misma decisión que toma el servidor con
 * su índice único: encolar dos veces el mismo acceso no puede tener consecuencias.</p>
 */
function encolar(item, conexion) {
    const db = conexion || abrir();
    if (!db) return { ok: false, motivo: 'sin base local' };
    if (!item?.clientRef || !item?.memberId) return { ok: false, motivo: 'acceso incompleto' };

    try {
        const guardar = db.transaction((registro) => {
            const cuantos = db.prepare('SELECT COUNT(*) AS n FROM cola_accesos').get().n;
            if (cuantos >= MAX_EN_COLA) {
                // Se descarta el MÁS VIEJO, no el nuevo: si algo hay que perder, que sea lo
                // que ya es historia y no la persona parada en la puerta ahora mismo.
                db.prepare(`DELETE FROM cola_accesos WHERE client_ref = (
                    SELECT client_ref FROM cola_accesos ORDER BY ocurrido_en, creado_en LIMIT 1
                )`).run();
            }
            // Devuelve si REALMENTE entró: con `INSERT OR IGNORE`, un sello repetido no
            // cambia nada, y la copia tiene que enterarse. Ver abajo.
            return db.prepare(INSERT).run(registro).changes > 0;
        });

        const entro = guardar({
            client_ref: String(item.clientRef),
            tenant_id: item.tenantId ? String(item.tenantId) : null,
            member_id: String(item.memberId),
            member_name: item.memberName || null,
            method: item.method || 'manual',
            ocurrido_en: String(item.ocurridoEn),
            intentos: 0,
            ultimo_error: null,
            creado_en: Date.now(),
        });

        // La copia legible, DESPUÉS de que la fila esté guardada y fuera de la transacción.
        // El orden importa: el dato de verdad es la fila; esto es su respaldo. Y va sin
        // try/catch acá porque `anotar` ya falla en silencio — si el disco está lleno o la
        // carpeta es de solo lectura, el acceso se encola igual. Perder la visita por no
        // poder escribir su respaldo sería exactamente al revés de lo que se busca.
        //
        // ⚠️ SOLO SI ENTRÓ DE VERDAD. La primera versión anotaba siempre, y el mismo sello
        // encolado dos veces dejaba la línea repetida en el archivo — la base lo ignoraba y la
        // copia no. Lo mostró el humo, que tiene justamente ese caso: la regla de que un
        // reintento no duplica tiene que valer en los DOS lados de la línea, no en uno.
        if (entro) respaldo.anotar(item);

        return { ok: true, clientRef: String(item.clientRef) };
    } catch (e) {
        console.warn('[Veltronik] No se pudo encolar el acceso:', e.message);
        return { ok: false, motivo: e.message };
    }
}

/**
 * Los accesos pendientes de un gimnasio, EN EL ORDEN EN QUE OCURRIERON.
 *
 * <p>Los de otra sucursal se quedan esperando a que esa sucursal vuelva a entrar. No se
 * borran —son visitas reales— y no se mandan con el gimnasio equivocado.</p>
 *
 * <p>Se ordena por el momento real y se desempata por el de encolado: dos accesos con el
 * mismo instante tienen que salir siempre en el mismo orden, o el vaciado deja de ser
 * reproducible.</p>
 */
function pendientes(tenantId, conexion) {
    const db = conexion || abrir();
    if (!db) return [];
    try {
        const filas = tenantId
            ? db.prepare(`SELECT * FROM cola_accesos
                          WHERE tenant_id IS NULL OR tenant_id = ?
                          ORDER BY ocurrido_en, creado_en`).all(String(tenantId))
            : db.prepare('SELECT * FROM cola_accesos ORDER BY ocurrido_en, creado_en').all();
        return filas.map(aVista);
    } catch (e) {
        console.warn('[Veltronik] No se pudo leer la cola:', e.message);
        return [];
    }
}

/** Cuántos esperan. Para que la pantalla lo pueda decir sin traerlos. */
function contar(tenantId, conexion) {
    const db = conexion || abrir();
    if (!db) return 0;
    try {
        return tenantId
            ? db.prepare(`SELECT COUNT(*) AS n FROM cola_accesos
                          WHERE tenant_id IS NULL OR tenant_id = ?`).get(String(tenantId)).n
            : db.prepare('SELECT COUNT(*) AS n FROM cola_accesos').get().n;
    } catch {
        return 0;
    }
}

/**
 * Cuántos esperan Y desde cuándo, en una sola consulta.
 *
 * <p><b>La antigüedad importa tanto como el número.</b> "3 pendientes" no dice nada: pueden ser
 * de hace dos minutos —el vaciado está por correr— o de hace tres semanas, que significa que el
 * gimnasio viene guardando visitas en un solo disco desde hace tres semanas y nadie se enteró.
 * El diseño permite acumular 30 días; sin este dato, esos 30 días pasan en silencio.</p>
 *
 * <p>`MIN` sobre el texto alcanza: `ocurrido_en` es `YYYY-MM-DDTHH:mm:ss`, que ordena igual
 * alfabéticamente que cronológicamente. Por eso ese formato y no uno "más lindo".</p>
 */
function resumen(tenantId, conexion) {
    const db = conexion || abrir();
    if (!db) return { cuantos: 0, masViejo: null };
    try {
        const fila = tenantId
            ? db.prepare(`SELECT COUNT(*) AS n, MIN(ocurrido_en) AS viejo FROM cola_accesos
                          WHERE tenant_id IS NULL OR tenant_id = ?`).get(String(tenantId))
            : db.prepare('SELECT COUNT(*) AS n, MIN(ocurrido_en) AS viejo FROM cola_accesos').get();
        return { cuantos: fila.n, masViejo: fila.viejo || null };
    } catch {
        return { cuantos: 0, masViejo: null };
    }
}

/** Saca un acceso de la cola. Solo se llama cuando el servidor lo confirmó o lo rechazó. */
function sacar(clientRef, conexion) {
    const db = conexion || abrir();
    if (!db || !clientRef) return false;
    try {
        db.prepare('DELETE FROM cola_accesos WHERE client_ref = ?').run(String(clientRef));
        return true;
    } catch (e) {
        console.warn('[Veltronik] No se pudo sacar el acceso de la cola:', e.message);
        return false;
    }
}

/**
 * Anota que un intento falló. NO saca nada de la cola.
 *
 * <p>Un acceso que falló por red se reintenta indefinidamente: perder una visita es perderle
 * datos al gimnasio. Lo que se guarda acá es para poder AVISAR cuando algo viene fallando
 * hace rato, no para rendirse.</p>
 */
function anotarFallo(clientRef, mensaje, conexion) {
    const db = conexion || abrir();
    if (!db || !clientRef) return false;
    try {
        db.prepare(`UPDATE cola_accesos
                    SET intentos = intentos + 1, ultimo_error = ?
                    WHERE client_ref = ?`)
            .run(String(mensaje || '').slice(0, 200), String(clientRef));
        return true;
    } catch (e) {
        console.warn('[Veltronik] No se pudo anotar el fallo:', e.message);
        return false;
    }
}

/**
 * Vacía la cola entera.
 *
 * <p>⚠️ <b>NO se llama al cerrar sesión.</b> Cerrar sesión no puede borrar accesos: son
 * visitas que pasaron de verdad y que el gimnasio todavía no tiene. Se quedan esperando
 * —marcadas con su sucursal— y salen cuando alguien de ese gimnasio vuelva a entrar. Esto
 * existe para los tests y para un borrado deliberado.</p>
 */
function olvidar(conexion) {
    const db = conexion || abrir();
    if (!db) return false;
    try {
        db.prepare('DELETE FROM cola_accesos').run();
        return true;
    } catch {
        return false;
    }
}

module.exports = {
    encolar, pendientes, contar, resumen, sacar, anotarFallo, olvidar, aVista, MAX_EN_COLA,
};
