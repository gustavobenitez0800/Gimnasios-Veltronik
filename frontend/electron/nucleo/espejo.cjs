/**
 * ============================================
 * VELTRONIK - EL ESPEJO
 * ============================================
 *
 * La copia local de los socios: lo que el mostrador mira cuando no hay internet, y lo que
 * mira también cuando sí lo hay, porque buscar contra un archivo en la propia máquina es
 * instantáneo y salir a la nube en cada tecla no lo es nunca.
 *
 * <b>Es un espejo, no una fuente.</b> Baja entero y reemplaza entero. No se compara con lo
 * que había, no se funde, no hay watermarks ni tombstones que mantener. Con un solo terminal
 * escribiendo y trescientos ochenta y pico de socios, reemplazar cuesta milisegundos y no
 * tiene ninguna de las formas de estar mal que tiene un incremental — la peor de las cuales
 * es la que nadie ve: un socio dado de baja que se queda para siempre porque las bajas no
 * viajan en un watermark.
 *
 * <b>El espejo miente, y está elegido hacia dónde.</b> El que pagó hace diez minutos en otra
 * pantalla aparece con el dato viejo hasta el próximo refresco. Eso no se evita: es la
 * naturaleza de tener una copia. Lo que sí se eligió es equivocarse del lado permisivo —
 * dejar afuera a un socio al día es un problema que se lleva el mostrador; dejar pasar a uno
 * que se dio de baja ayer no le cuesta nada a nadie.
 *
 * <b>La búsqueda se arma del otro lado.</b> Cada fila llega con su campo `busqueda` ya
 * normalizado por el renderer. Podría calcularse acá, pero la pantalla tiene que normalizar
 * lo que teclea el usuario con EXACTAMENTE la misma regla, y dos copias de la misma regla en
 * dos módulos distintos es la forma más barata de que "josé" deje de encontrar a "Jose"
 * dentro de seis meses. Una sola regla, del lado que también la usa para preguntar.
 */

const { abrir } = require('./db.cjs');

/** Las columnas del espejo, en el orden en que se insertan. */
const COLUMNAS = [
    'id', 'tenant_id', 'first_name', 'last_name', 'email', 'phone', 'document',
    'is_active', 'membership_start', 'membership_end', 'plan_id', 'plan_nombre',
    'situacion', 'dias_vencido', 'dias_restantes', 'busqueda',
];

const INSERT = `INSERT INTO gym_members (${COLUMNAS.join(', ')})
                VALUES (${COLUMNAS.map((c) => `@${c}`).join(', ')})`;

// Todas las funciones de acá abajo aceptan una conexión como último parámetro. En la app
// nunca se pasa: usan la de db.cjs. Existe para los tests, que NO pueden abrir la base de
// verdad — el binario de better-sqlite3 se baja compilado contra el ABI de Electron (119) y
// vitest corre sobre el Node de la máquina, que es otro. Así se prueba lo que es nuestro
// (el mapeo de columnas, el alcance por gimnasio, la guarda de la lista vacía) sin pedirle
// a la suite que tenga un motor nativo que no le corresponde tener.

/** Texto o null: SQLite no acepta undefined, y guardar "undefined" como texto es peor. */
function texto(v) {
    return v === undefined || v === null || v === '' ? null : String(v);
}

/** Entero o null. */
function entero(v) {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : null;
}

/**
 * Traduce un socio de la forma en que viaja por la API (camelCase) a la forma en que vive en
 * la base (snake_case, los mismos nombres que Postgres).
 *
 * `document` y `dni` son el mismo dato: el DTO expone el alias por compatibilidad con la UI
 * vieja. Acá se guarda una sola vez, con el nombre real de la columna.
 */
function aFila(tenantId, m) {
    return {
        id: String(m.id),
        tenant_id: String(tenantId),
        first_name: texto(m.firstName),
        last_name: texto(m.lastName),
        email: texto(m.email),
        phone: texto(m.phone),
        document: texto(m.document ?? m.dni),
        // La API manda `active`; el frontend viejo leía `isActive`. Se aceptan los dos, y la
        // ausencia de dato NO es una baja: un socio sin el campo es un socio activo.
        is_active: (m.active ?? m.isActive) === false ? 0 : 1,
        membership_start: texto(m.membershipStart),
        membership_end: texto(m.membershipEnd),
        plan_id: texto(m.planId),
        plan_nombre: texto(m.planNombre),
        situacion: texto(m.situacion),
        dias_vencido: entero(m.diasVencido),
        dias_restantes: entero(m.diasRestantes),
        busqueda: texto(m.busqueda) || '',
    };
}

/** Y la vuelta: de la fila de la base a lo que espera la pantalla. */
function aVista(f) {
    const firstName = f.first_name || '';
    const lastName = f.last_name || '';
    return {
        id: f.id,
        firstName,
        lastName,
        fullName: `${firstName} ${lastName}`.trim(),
        email: f.email,
        phone: f.phone,
        document: f.document,
        dni: f.document,
        isActive: f.is_active === 1,
        active: f.is_active === 1,
        membershipStart: f.membership_start,
        membershipEnd: f.membership_end,
        planId: f.plan_id,
        planNombre: f.plan_nombre,
        situacion: f.situacion,
        diasVencido: f.dias_vencido,
        diasRestantes: f.dias_restantes,
        busqueda: f.busqueda,
    };
}

/**
 * Reemplaza el espejo de un gimnasio.
 *
 * <p>Todo adentro de UNA transacción: si se corta la luz en el medio, el archivo queda con
 * el espejo anterior entero, no con media lista. Un mostrador con la lista de ayer trabaja;
 * uno con media lista de hoy le dice a un socio al día que no existe.</p>
 *
 * @returns {{ok: boolean, socios?: number, actualizado?: number, motivo?: string}}
 */
function guardar(tenantId, socios, conexion) {
    const db = conexion || abrir();
    if (!db) return { ok: false, motivo: 'sin base local' };
    if (!tenantId) return { ok: false, motivo: 'sin gimnasio' };

    const lista = Array.isArray(socios) ? socios : [];

    // Un espejo vacío casi nunca es la verdad: es una consulta que falló y devolvió `[]`, o
    // un tenant recién cambiado. Reemplazar una lista buena por nada dejaría al mostrador
    // ciego justo cuando más la necesita, así que no se toca y se avisa.
    if (lista.length === 0) return { ok: false, motivo: 'lista vacia' };

    try {
        const borrar = db.prepare('DELETE FROM gym_members WHERE tenant_id = ?');
        const insertar = db.prepare(INSERT);
        const marcar = db.prepare(`
            INSERT INTO espejo_estado (tenant_id, actualizado, socios)
            VALUES (@tenant_id, @actualizado, @socios)
            ON CONFLICT(tenant_id) DO UPDATE SET actualizado = @actualizado, socios = @socios
        `);

        const actualizado = Date.now();

        const reemplazar = db.transaction((filas) => {
            borrar.run(String(tenantId));
            for (const fila of filas) insertar.run(fila);
            marcar.run({ tenant_id: String(tenantId), actualizado, socios: filas.length });
        });

        reemplazar(lista.map((m) => aFila(tenantId, m)));
        return { ok: true, socios: lista.length, actualizado };
    } catch (e) {
        console.warn('[Veltronik] No se pudo guardar el espejo:', e.message);
        return { ok: false, motivo: e.message };
    }
}

/**
 * Devuelve el espejo entero de un gimnasio, con de cuándo es.
 *
 * <p>Entero y de una sola vez, a propósito: la pantalla busca contra un array en memoria, no
 * contra la base. Trescientas ochenta filas por IPC son un parpadeo una vez cada varios
 * minutos; una consulta por tecla serían miles de idas y vueltas por búsqueda.</p>
 */
function leer(tenantId, conexion) {
    const db = conexion || abrir();
    if (!db || !tenantId) return { socios: [], actualizado: null };

    try {
        const filas = db
            .prepare('SELECT * FROM gym_members WHERE tenant_id = ? ORDER BY last_name, first_name')
            .all(String(tenantId));
        const estado = db
            .prepare('SELECT actualizado FROM espejo_estado WHERE tenant_id = ?')
            .get(String(tenantId));

        return { socios: filas.map(aVista), actualizado: estado?.actualizado ?? null };
    } catch (e) {
        console.warn('[Veltronik] No se pudo leer el espejo:', e.message);
        return { socios: [], actualizado: null };
    }
}

/** Cuántos hay y de cuándo son, sin traerlos. Lo usa el cartel de estado del mostrador. */
function estado(tenantId, conexion) {
    const db = conexion || abrir();
    if (!db || !tenantId) return { cantidad: 0, actualizado: null };

    try {
        const fila = db
            .prepare('SELECT actualizado, socios FROM espejo_estado WHERE tenant_id = ?')
            .get(String(tenantId));
        return { cantidad: fila?.socios ?? 0, actualizado: fila?.actualizado ?? null };
    } catch {
        return { cantidad: 0, actualizado: null };
    }
}

/**
 * Borra el espejo de un gimnasio.
 *
 * <p>Se usa al cambiar de sucursal. <b>No al cerrar sesión</b>: la lista de socios es del
 * gimnasio, no de la persona que atiende, y el próximo turno tiene que encontrar el
 * mostrador listo para trabajar aunque todavía no haya internet.</p>
 */
function olvidar(tenantId, conexion) {
    const db = conexion || abrir();
    if (!db || !tenantId) return false;
    try {
        db.transaction(() => {
            db.prepare('DELETE FROM gym_members WHERE tenant_id = ?').run(String(tenantId));
            db.prepare('DELETE FROM espejo_estado WHERE tenant_id = ?').run(String(tenantId));
        })();
        return true;
    } catch (e) {
        console.warn('[Veltronik] No se pudo borrar el espejo:', e.message);
        return false;
    }
}

module.exports = { guardar, leer, estado, olvidar, aFila, aVista, COLUMNAS };
