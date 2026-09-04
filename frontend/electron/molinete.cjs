/**
 * ============================================
 * VELTRONIK - MOLINETE FACIAL (LAN)
 * ============================================
 *
 * La mitad que le MANTIENE LA LISTA AL DÍA al equipo de reconocimiento facial.
 *
 * El equipo decide solo: guarda las caras adentro y reconoce sin preguntarle a nadie, por eso
 * abre en milisegundos y sigue funcionando con el internet caído. Lo que necesita de nosotros
 * es saber quién es socio y quién puede pasar hoy.
 *
 * <b>Por qué vive en el escritorio y no en la nube.</b> El equipo está detrás del router del
 * gimnasio: desde internet no se le llega. Y el fabricante es explícito — <i>"do not call
 * interfaces of the same device in other client server at the same time"</i>: un solo programa
 * puede manejarlo. Ese programa es este.
 *
 * <b>Por qué en el proceso principal y no en la pantalla.</b> Acá no hay CORS ni contenido
 * mixto: es Node hablándole a una IP de la red local. Desde el navegador dependeríamos de que
 * el equipo mande las cabeceras justas — hoy las manda, pero es una promesa de un aparato que
 * no controlamos y que se actualiza solo.
 *
 * El veredicto de cada socio NO se calcula acá. Baja resuelto en el padrón, junto con el
 * nombre: el escritorio recibe un sí o un no y lo aplica. Toda cuenta de fechas copiada
 * termina estando mal en alguna de las copias.
 */

const { app } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');
const store = require('./store.cjs');

const PUERTO = 8090;
const TIMEOUT_MS = 8000;

/** La ventana horaria del que puede pasar, y la del que no. */
const ABIERTO = '00:00:00,23:59:59';
const CERRADO = '00:00:00,00:00:01';

// ─────────────────────────────────────────────────────────────────────────────
// Transporte
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Un pedido al equipo. Cuerpo siempre `x-www-form-urlencoded`, que es lo único que entiende.
 *
 * <p>Se usa `http` y no `fetch` a propósito: hace falta un timeout duro. Un equipo colgado o
 * desenchufado que acepta la conexión TCP y no contesta nunca dejaría la sincronización
 * esperando para siempre, y con ella la pantalla que la disparó.</p>
 */
function pedir(cfg, ruta, campos, metodo = 'POST') {
    return new Promise((resolve, reject) => {
        const cuerpo = campos ? new URLSearchParams(campos).toString() : null;
        const esGet = metodo === 'GET';
        const req = http.request({
            host: cfg.ip,
            port: PUERTO,
            path: esGet && cuerpo ? `${ruta}?${cuerpo}` : ruta,
            method: metodo,
            timeout: TIMEOUT_MS,
            headers: esGet ? {} : {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(cuerpo || ''),
            },
        }, (res) => {
            let texto = '';
            res.on('data', (t) => { texto += t; });
            res.on('end', () => {
                try {
                    const json = JSON.parse(texto);
                    if (json.success === false) {
                        reject(new Error(json.msg || json.code || 'El equipo rechazó el pedido'));
                        return;
                    }
                    resolve(json);
                } catch {
                    // El fabricante lo documenta: respuesta vacía = la URL está mal.
                    reject(new Error(`Respuesta ilegible del equipo (${res.statusCode})`));
                }
            });
        });
        req.on('timeout', () => { req.destroy(new Error('El equipo no contestó a tiempo')); });
        req.on('error', reject);
        if (!esGet && cuerpo) req.write(cuerpo);
        req.end();
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Operaciones sobre el equipo
// ─────────────────────────────────────────────────────────────────────────────

const info = (cfg) => pedir(cfg, '/device/information', { pass: cfg.clave }, 'GET');

/** El serial. Es el único pedido que no lleva contraseña: sirve para probar la conexión. */
const serie = (cfg) => pedir(cfg, '/getDeviceKey', null, 'GET');

/** Todas las personas cargadas. `personId=-1` es "todas"; el equipo pagina de a 1000. */
async function personasDelEquipo(cfg) {
    const porId = new Map();
    for (let pagina = 0; pagina < 20; pagina++) {
        const r = await pedir(cfg, '/person/findByPage',
            { pass: cfg.clave, personId: '-1', length: '1000', index: String(pagina) }, 'GET');
        const lista = (r.data && r.data.personInfos) || [];
        for (const p of lista) porId.set(String(p.id), { nombre: p.name || '' });
        const info = (r.data && r.data.pageInfo) || {};
        if (!lista.length || porId.size >= (info.total || 0)) break;
    }
    return porId;
}

const alta = (cfg, id, nombre) => pedir(cfg, '/person/create', {
    pass: cfg.clave,
    // facePermission 2 = reconocimiento prendido. Al vencido NO se lo apaga acá: se lo frena
    // con la ventana horaria, así el equipo lo reconoce y el aviso llega CON nombre.
    person: JSON.stringify({ id, name: nombre, facePermission: 2 }),
});

const renombrar = (cfg, id, nombre) => pedir(cfg, '/person/update', {
    pass: cfg.clave,
    person: JSON.stringify({ id, name: nombre }),
});

const horario = (cfg, id, permitido) => pedir(cfg, '/person/createPasstime', {
    pass: cfg.clave,
    passtime: JSON.stringify({ personId: id, passtime: permitido ? ABIERTO : CERRADO }),
});

const baja = (cfg, id) => pedir(cfg, '/person/delete', { pass: cfg.clave, personId: id });

/** El equipo saca la foto él mismo: la cara nunca pasa por Veltronik. */
const foto = (cfg, id) => pedir(cfg, '/face/takeImg', { pass: cfg.clave, personId: id });

/** Dónde tiene que avisar el equipo cada reconocimiento. */
const avisarA = (cfg, url) => pedir(cfg, '/setIdentifyCallBack', { pass: cfg.clave, callbackUrl: url });

// ─────────────────────────────────────────────────────────────────────────────
// Lo último que le aplicamos al equipo
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Un espejo de lo que le mandamos la última vez, para no repetir trabajo.
 *
 * <p><b>Por qué hace falta.</b> El equipo sabe decir qué personas tiene, pero no en qué ventana
 * horaria quedó cada una sin preguntárselo de a una — 385 pedidos para averiguar algo que
 * cambia dos veces por día. Con este espejo, una sincronización normal son cero o tres pedidos.</p>
 *
 * <p>Es una caché, no la verdad: si se pierde o queda vieja, lo peor que pasa es que la próxima
 * sincronización reaplique de más. La verdad de quién está cargado la sigue teniendo el equipo,
 * y se le pregunta en cada corrida.</p>
 */
const ARCHIVO_ESPEJO = 'veltronik-molinete.json';

function rutaEspejo() {
    return path.join(app.getPath('userData'), ARCHIVO_ESPEJO);
}

function leerEspejo() {
    try {
        const parsed = JSON.parse(fs.readFileSync(rutaEspejo(), 'utf8'));
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};   // primera vez, corrupto, o sin permisos: se reaplica y listo
    }
}

function guardarEspejo(valores) {
    const destino = rutaEspejo();
    const temporal = `${destino}.tmp`;
    try {
        fs.writeFileSync(temporal, JSON.stringify(valores), 'utf8');
        fs.renameSync(temporal, destino);
    } catch (e) {
        console.warn('[Molinete] No se pudo guardar el espejo:', e.message);
        try { fs.unlinkSync(temporal); } catch { /* nada que limpiar */ }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Configuración
// ─────────────────────────────────────────────────────────────────────────────

/** IP y clave del equipo. Son de ESTA máquina y de este local, no de la cuenta. */
function config() {
    const guardado = store.get('molinete') || {};
    return { ip: guardado.ip || '', clave: guardado.clave || '', activo: !!guardado.activo };
}

function guardarConfig(cambios) {
    const actual = config();
    const nueva = {
        ip: typeof cambios.ip === 'string' ? cambios.ip.trim() : actual.ip,
        clave: typeof cambios.clave === 'string' ? cambios.clave : actual.clave,
        activo: typeof cambios.activo === 'boolean' ? cambios.activo : actual.activo,
    };
    store.set('molinete', nueva);
    return nueva;
}

// ─────────────────────────────────────────────────────────────────────────────
// La sincronización
// ─────────────────────────────────────────────────────────────────────────────

/** El equipo solo acepta números y letras en el id de una persona. */
const sinGuiones = (uuid) => String(uuid).replace(/-/g, '');

/** ¿Este id del equipo lo pusimos nosotros? Los cargados a mano no se tocan. */
const esNuestro = (id) => /^[0-9a-fA-F]{32}$/.test(id);

/**
 * Cuánta gente se puede borrar de una vez sin que lo mire una persona.
 *
 * <p><b>Borrar a alguien del equipo le borra la cara</b>, y volver a cargarlo exige tenerlo
 * parado enfrente otra vez. Si el padrón llegara vacío o cortado por un error, sin este tope
 * una sola sincronización dejaría al gimnasio entero teniendo que re-enrolarse. Cuando se pasa,
 * no se borra nada y se avisa: que decida una persona.</p>
 */
const TOPE_DE_BAJAS = 0.2;

/**
 * Qué habría que hacerle al equipo. <b>Función pura: no toca la red.</b>
 *
 * <p>Está separada de la ejecución a propósito. Acá viven las tres decisiones que, si se
 * equivocan, se equivocan caro —a quién dar de alta, a quién cambiarle el horario y sobre
 * todo <b>a quién borrar</b>— y una función pura se puede probar de verdad, sin levantar un
 * equipo ni simular un socket.</p>
 *
 * @param padron      lo que dice Veltronik
 * @param enElEquipo  Map de id → {nombre}, lo que el equipo tiene cargado ahora
 * @param espejo      lo último que le aplicamos nosotros
 */
function planificar(padron, enElEquipo, espejo) {
    const acciones = [];
    const espejoNuevo = {};

    for (const socio of padron) {
        const id = sinGuiones(socio.id);
        const nombre = String(socio.nombre || 'Socio').slice(0, 32);
        const permitido = !!socio.permitido;
        const enEquipo = enElEquipo.get(id);
        const antes = espejo[id];

        if (!enEquipo) {
            // Alta: queda cargado pero SIN CARA. Recién cuando alguien le saque la foto desde
            // la ficha del socio, el equipo lo va a reconocer.
            acciones.push({ tipo: 'alta', id, nombre, permitido });
        } else {
            if (enEquipo.nombre !== nombre) acciones.push({ tipo: 'renombrar', id, nombre });
            // El horario solo se reaplica si cambió. Es lo que hace que una sincronización
            // normal —donde no pasó nada— sean cero pedidos en vez de 385.
            if (!antes || antes.permitido !== permitido) {
                acciones.push({ tipo: 'horario', id, nombre, permitido });
            }
        }
        espejoNuevo[id] = { nombre, permitido };
    }

    // Los que están en el equipo y ya no son socios de este gimnasio. Se filtran los ids que
    // no tienen nuestra forma: alguien pudo haber cargado una persona a mano en el equipo
    // —una prueba, el técnico— y borrarle la cara a alguien que no pusimos nosotros no es
    // nuestro trabajo.
    const sobran = [...enElEquipo.keys()].filter((id) => esNuestro(id) && !espejoNuevo[id]);

    // ⚠️ El freno. Si el padrón llegara vacío o cortado, sin esto una sola corrida dejaría al
    // gimnasio entero teniendo que volver a sacarse la foto uno por uno.
    const demasiadas = enElEquipo.size > 0 && sobran.length > enElEquipo.size * TOPE_DE_BAJAS;
    if (!demasiadas) {
        for (const id of sobran) acciones.push({ tipo: 'baja', id });
    }

    return { acciones, espejoNuevo, bajasFrenadas: demasiadas ? sobran.length : 0 };
}

/**
 * Deja al equipo con exactamente los socios del padrón, y a cada uno con su horario.
 *
 * @param {Array<{id:string, nombre:string, permitido:boolean}>} padron el que baja del backend
 * @param {(hecho:number, total:number)=>void} [alAvanzar] para pintar la barra de progreso
 */
async function sincronizar(padron, alAvanzar) {
    const cfg = config();
    if (!cfg.ip || !cfg.clave) {
        return { ok: false, error: 'Falta configurar la IP o la clave del molinete.' };
    }
    if (!Array.isArray(padron)) {
        return { ok: false, error: 'El padrón no llegó.' };
    }

    let enElEquipo;
    try {
        enElEquipo = await personasDelEquipo(cfg);
    } catch (e) {
        return { ok: false, error: `No se pudo leer el equipo: ${e.message}` };
    }

    const { acciones, espejoNuevo, bajasFrenadas } = planificar(padron, enElEquipo, leerEspejo());
    if (bajasFrenadas) {
        console.warn(`[Molinete] ${bajasFrenadas} bajas de ${enElEquipo.size}: no se borra nada.`);
    }

    const resumen = {
        ok: true, creados: 0, renombrados: 0, horarios: 0, borrados: 0,
        errores: [], bajasFrenadas, total: padron.length,
    };

    let hecho = 0;
    for (const a of acciones) {
        try {
            if (a.tipo === 'alta') {
                await alta(cfg, a.id, a.nombre);
                await horario(cfg, a.id, a.permitido);
                resumen.creados++;
            } else if (a.tipo === 'renombrar') {
                await renombrar(cfg, a.id, a.nombre);
                resumen.renombrados++;
            } else if (a.tipo === 'horario') {
                await horario(cfg, a.id, a.permitido);
                resumen.horarios++;
            } else if (a.tipo === 'baja') {
                await baja(cfg, a.id);
                resumen.borrados++;
            }
        } catch (e) {
            // Un socio que falla no puede frenar a los otros 384. Se anota, se lo saca del
            // espejo y se sigue: la próxima corrida lo reintenta solo.
            delete espejoNuevo[a.id];
            resumen.errores.push({ socio: a.nombre || a.id, error: e.message });
        }
        hecho++;
        if (alAvanzar && hecho % 10 === 0) alAvanzar(hecho, acciones.length);
    }

    guardarEspejo(espejoNuevo);
    resumen.cuando = new Date().toISOString();
    return resumen;
}

/** Prueba la conexión. Devuelve lo que el equipo dice de sí mismo. */
async function probar() {
    const cfg = config();
    if (!cfg.ip) return { ok: false, error: 'Falta la IP del molinete.' };
    try {
        const key = await serie(cfg);
        if (!cfg.clave) return { ok: true, serie: key.data, sinClave: true };
        const d = (await info(cfg)).data || {};
        return {
            ok: true,
            serie: d.deviceKey || key.data,
            version: d.version,
            personas: Number(d.personCount || 0),
            caras: Number(d.faceCount || 0),
        };
    } catch (e) {
        return { ok: false, error: e.message };
    }
}

/** Pone al equipo en modo captura para un socio. Hay que estar parado enfrente. */
async function sacarFoto(socioId) {
    const cfg = config();
    if (!cfg.ip || !cfg.clave) return { ok: false, error: 'Falta configurar el molinete.' };
    try {
        await foto(cfg, sinGuiones(socioId));
        return { ok: true };
    } catch (e) {
        return { ok: false, error: e.message };
    }
}

/** Le dice al equipo a qué dirección avisar cada reconocimiento. */
async function configurarAviso(url) {
    const cfg = config();
    if (!cfg.ip || !cfg.clave) return { ok: false, error: 'Falta configurar el molinete.' };
    try {
        await avisarA(cfg, url);
        return { ok: true };
    } catch (e) {
        return { ok: false, error: e.message };
    }
}

module.exports = { config, guardarConfig, probar, sincronizar, sacarFoto, configurarAviso, planificar };
