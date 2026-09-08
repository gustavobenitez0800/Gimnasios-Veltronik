/**
 * ============================================
 * VELTRONIK - LA COLA DEL MOSTRADOR, EN EL DISCO
 * ============================================
 *
 * El guardado de lo que pasó en el mostrador y el servidor todavía no sabe: entradas,
 * salidas, cobros, altas, egresos, cierres.
 *
 * <b>Esto es distinto del espejo, y la diferencia importa.</b> El espejo es una copia: si se
 * pierde, se vuelve a bajar. La cola es lo único que hay: un cobro que está acá y se pierde
 * <i>se perdió para siempre</i>, porque es plata que el gimnasio todavía no tiene anotada en
 * ningún otro lado. Por eso vive en la misma base con `synchronous = FULL`, y por eso este
 * archivo es conservador hasta la exageración: nada se borra si no hay certeza.
 *
 * <b>⭐ UNA SOLA COLA PARA TODOS LOS TIPOS.</b> Nació como cola de accesos. Se generalizó
 * porque el dueño decidió que se pueda dar de alta a un socio Y COBRARLE en el mismo acto sin
 * internet: eso obliga a que el orden valga <i>entre tipos distintos</i> —el alta del socio X
 * antes que el cobro al socio X, o el servidor recibe un cobro de alguien que para él no
 * existe—. Dos tablas no pueden garantizar un orden entre sí; una sola, ordenada por el
 * momento real, sí.
 *
 * <b>Acá NO vive la lógica de vaciado</b> —el orden, el candado, qué error se reintenta, a qué
 * endpoint va cada tipo— sino solo el guardado. Aquella vive del lado de la pantalla
 * (`lib/colaAccesos.js`), que es quien tiene el cliente HTTP; acá se guarda, se lee en orden y
 * se saca. Separarlo así permite probar la parte difícil sin un motor nativo, que es
 * exactamente la limitación que impuso `better-sqlite3`.
 */

const { abrir } = require('./db.cjs');
const respaldo = require('./respaldo.cjs');

/** Tope de la cola. Un mostrador hace decenas de movimientos por día; 5000 son semanas. */
const MAX_EN_COLA = 5000;

/** Lo que la cola sabe mandar. Está acá para que un tipo mal escrito no entre en silencio. */
const TIPOS = ['ACCESO', 'COBRO', 'ALTA', 'EGRESO', 'CIERRE'];

/** Las columnas propias de la cola. Todo lo demás del ítem viaja adentro del payload. */
const PROPIAS = ['clientRef', 'tipo', 'tenantId', 'ocurridoEn'];

const INSERT = `INSERT OR IGNORE INTO cola
    (client_ref, tipo, tenant_id, ocurrido_en, payload, intentos, ultimo_error, creado_en)
    VALUES (@client_ref, @tipo, @tenant_id, @ocurrido_en, @payload, 0, NULL, @creado_en)`;

/**
 * De la fila de la base a lo que espera la pantalla.
 *
 * <p>El payload se desarma acá, así quien manda el ítem lo recibe plano —`item.memberId`, no
 * `item.payload.memberId`—. El código que ya mandaba accesos no se enteró del cambio.</p>
 */
function aVista(f) {
    let payload = {};
    try {
        payload = f.payload ? JSON.parse(f.payload) : {};
    } catch {
        // Un payload ilegible no puede tumbar el vaciado entero: se devuelve el ítem con lo
        // que sí se sabe y el que lo mande decidirá. Perderlo en silencio sería peor.
        payload = {};
    }
    return {
        clientRef: f.client_ref,
        tipo: f.tipo,
        tenantId: f.tenant_id,
        ocurridoEn: f.ocurrido_en,
        intentos: f.intentos,
        ultimoError: f.ultimo_error,
        creadoEn: f.creado_en,
        ...payload,
    };
}

/**
 * Guarda algo para mandarlo cuando haya internet.
 *
 * <p><b>`INSERT OR IGNORE`, no `INSERT`.</b> Si el mismo `clientRef` ya está encolado, el
 * segundo intento no hace nada en vez de tirar. Es la misma decisión que toma el servidor con
 * su índice único: encolar dos veces lo mismo no puede tener consecuencias.</p>
 *
 * @param item `{tipo, clientRef, tenantId, ocurridoEn, ...lo propio del tipo}`
 */
function encolar(item, conexion) {
    const db = conexion || abrir();
    if (!db) return { ok: false, motivo: 'sin base local' };
    if (!item?.clientRef) return { ok: false, motivo: 'sin sello' };
    if (!item?.ocurridoEn) return { ok: false, motivo: 'sin momento' };

    // Sin tipo se asume ACCESO: es lo que encolaba todo el código anterior a la cola general,
    // y no vale la pena romperlo por una etiqueta que se puede deducir.
    const tipo = item.tipo || 'ACCESO';
    if (!TIPOS.includes(tipo)) return { ok: false, motivo: `tipo desconocido: ${tipo}` };

    // ⚠️ El ACCESO exige socio. Se valida acá y no en el que llama porque un acceso sin socio
    // es una fila que nunca va a poder subir y va a reintentarse para siempre.
    if (tipo === 'ACCESO' && !item.memberId) return { ok: false, motivo: 'acceso sin socio' };

    const payload = {};
    for (const [clave, valor] of Object.entries(item)) {
        if (!PROPIAS.includes(clave)) payload[clave] = valor;
    }

    try {
        const guardar = db.transaction((registro) => {
            const cuantos = db.prepare('SELECT COUNT(*) AS n FROM cola').get().n;
            if (cuantos >= MAX_EN_COLA) {
                // Se descarta el MÁS VIEJO, no el nuevo: si algo hay que perder, que sea lo
                // que ya es historia y no la persona parada en el mostrador ahora mismo.
                db.prepare(`DELETE FROM cola WHERE client_ref = (
                    SELECT client_ref FROM cola ORDER BY ocurrido_en, creado_en LIMIT 1
                )`).run();
            }
            return db.prepare(INSERT).run(registro).changes > 0;
        });

        const entro = guardar({
            client_ref: String(item.clientRef),
            tipo,
            tenant_id: item.tenantId ? String(item.tenantId) : null,
            ocurrido_en: String(item.ocurridoEn),
            payload: JSON.stringify(payload),
            creado_en: Date.now(),
        });

        // La copia legible, DESPUÉS de que la fila esté guardada y fuera de la transacción.
        // El orden importa: el dato de verdad es la fila; esto es su respaldo. Y va sin
        // try/catch acá porque `anotar` ya falla en silencio — si el disco está lleno o la
        // carpeta es de solo lectura, lo encolado se guarda igual. Perderlo por no poder
        // escribir su respaldo sería exactamente al revés de lo que se busca.
        //
        // ⚠️ SOLO SI ENTRÓ DE VERDAD. La primera versión anotaba siempre, y el mismo sello
        // encolado dos veces dejaba la línea repetida en el archivo — la base lo ignoraba y la
        // copia no. Lo mostró el humo: la regla de que un reintento no duplica tiene que valer
        // en los DOS lados de la línea, no en uno.
        if (entro) respaldo.anotar({ ...item, tipo });

        return { ok: true, clientRef: String(item.clientRef) };
    } catch (e) {
        console.warn('[Veltronik] No se pudo encolar:', e.message);
        return { ok: false, motivo: e.message };
    }
}

/**
 * Lo pendiente de un gimnasio, EN EL ORDEN EN QUE OCURRIÓ.
 *
 * <p>Lo de otra sucursal se queda esperando a que esa sucursal vuelva a entrar. No se borra
 * —son movimientos reales— y no se manda con el gimnasio equivocado.</p>
 *
 * <p>Se ordena por el momento real y se desempata por el de encolado: dos cosas con el mismo
 * instante tienen que salir siempre en el mismo orden, o el vaciado deja de ser reproducible.
 * ⭐ Y el orden es de la cola ENTERA, sin mirar el tipo: es lo que hace que el alta de un socio
 * suba antes que el cobro a ese socio.</p>
 */
function pendientes(tenantId, conexion) {
    const db = conexion || abrir();
    if (!db) return [];
    try {
        const filas = tenantId
            ? db.prepare(`SELECT * FROM cola
                          WHERE tenant_id IS NULL OR tenant_id = ?
                          ORDER BY ocurrido_en, creado_en`).all(String(tenantId))
            : db.prepare('SELECT * FROM cola ORDER BY ocurrido_en, creado_en').all();
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
            ? db.prepare(`SELECT COUNT(*) AS n FROM cola
                          WHERE tenant_id IS NULL OR tenant_id = ?`).get(String(tenantId)).n
            : db.prepare('SELECT COUNT(*) AS n FROM cola').get().n;
    } catch {
        return 0;
    }
}

/**
 * Cuántos esperan Y desde cuándo, en una sola consulta.
 *
 * <p><b>La antigüedad importa tanto como el número.</b> "3 pendientes" no dice nada: pueden ser
 * de hace dos minutos —el vaciado está por correr— o de hace tres semanas, que significa que el
 * gimnasio viene guardando movimientos en un solo disco desde hace tres semanas y nadie se
 * enteró. El diseño permite acumular 30 días; sin este dato, esos 30 días pasan en silencio.</p>
 *
 * <p>`MIN` sobre el texto alcanza: `ocurrido_en` es `YYYY-MM-DDTHH:mm:ss`, que ordena igual
 * alfabéticamente que cronológicamente. Por eso ese formato y no uno "más lindo".</p>
 */
function resumen(tenantId, conexion) {
    const db = conexion || abrir();
    if (!db) return { cuantos: 0, masViejo: null };
    try {
        const fila = tenantId
            ? db.prepare(`SELECT COUNT(*) AS n, MIN(ocurrido_en) AS viejo FROM cola
                          WHERE tenant_id IS NULL OR tenant_id = ?`).get(String(tenantId))
            : db.prepare('SELECT COUNT(*) AS n, MIN(ocurrido_en) AS viejo FROM cola').get();
        return { cuantos: fila.n, masViejo: fila.viejo || null };
    } catch {
        return { cuantos: 0, masViejo: null };
    }
}

/** Saca algo de la cola. Solo se llama cuando el servidor lo confirmó o lo rechazó. */
function sacar(clientRef, conexion) {
    const db = conexion || abrir();
    if (!db || !clientRef) return false;
    try {
        db.prepare('DELETE FROM cola WHERE client_ref = ?').run(String(clientRef));
        return true;
    } catch (e) {
        console.warn('[Veltronik] No se pudo sacar de la cola:', e.message);
        return false;
    }
}

/**
 * Anota que un intento falló. NO saca nada de la cola.
 *
 * <p>Lo que falló por red se reintenta indefinidamente: perder una visita es perderle datos al
 * gimnasio, y perder un cobro es perderle plata. Lo que se guarda acá es para poder AVISAR
 * cuando algo viene fallando hace rato, no para rendirse.</p>
 */
function anotarFallo(clientRef, mensaje, conexion) {
    const db = conexion || abrir();
    if (!db || !clientRef) return false;
    try {
        db.prepare(`UPDATE cola
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
 * <p>⚠️ <b>NO se llama al cerrar sesión.</b> Cerrar sesión no puede borrar movimientos: son
 * cosas que pasaron de verdad y que el gimnasio todavía no tiene. Se quedan esperando
 * —marcadas con su sucursal— y salen cuando alguien de ese gimnasio vuelva a entrar. Esto
 * existe para los tests y para un borrado deliberado.</p>
 */
function olvidar(conexion) {
    const db = conexion || abrir();
    if (!db) return false;
    try {
        db.prepare('DELETE FROM cola').run();
        return true;
    } catch {
        return false;
    }
}

module.exports = {
    encolar, pendientes, contar, resumen, sacar, anotarFallo, olvidar, aVista,
    MAX_EN_COLA, TIPOS,
};
