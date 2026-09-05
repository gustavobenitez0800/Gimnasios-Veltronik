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

const http = require('http');
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

/**
 * Cómo queda anotado en el equipo lo que ya le aplicamos.
 *
 * <p><b>Por qué el estado vive en el equipo y no en un archivo nuestro.</b> Antes se guardaba
 * un espejo local de lo último aplicado, para no repetir trabajo. Un espejo es una copia de la
 * verdad, y toda copia se puede desfasar: alcanza con que otra computadora sincronice, que
 * alguien toque el equipo a mano, o que se resetee. Cuando se desfasa, la sincronización
 * compara contra la copia, concluye "no cambió nada" y <b>no hace nada, sin avisar</b>. El
 * síntoma es el peor posible para algo que se cobra: el socio pagó y la puerta no se abre.</p>
 *
 * <p>El campo `tag` de cada persona viaja en el MISMO pedido con el que ya leemos la lista, así
 * que preguntarle al equipo en vez de creerle a un archivo no cuesta un pedido más.</p>
 */
const ETIQUETA = { PERMITIDO: 'VT-OK', BLOQUEADO: 'VT-NO' };

const etiquetaDe = (permitido) => (permitido ? ETIQUETA.PERMITIDO : ETIQUETA.BLOQUEADO);

/**
 * Los campos de una persona que nos importa conservar.
 *
 * <p>⚠️ <b>`/person/update` REEMPLAZA la persona entera, no actualiza campos sueltos.</b>
 * Mandarle `{id, name}` le borra el teléfono, la tarjeta y los permisos. Por eso toda
 * actualización se arma sobre la ficha que devolvió el equipo y se manda completa.</p>
 */
const CAMPOS = [
    'id', 'name', 'idcardNum', 'iDNumber', 'phone', 'password', 'qrCode', 'tag',
    'facePermission', 'idCardPermission', 'iDNumberPermission', 'passwordPermission',
    'fingerPermission', 'qrCodePermission', 'faceAndCardPermission', 'faceAndPasswordPermission',
    'faceAndFingerPermission', 'faceAndQrCodePermission', 'cardAndPasswordPermission',
    'fingerAndPasswordPermission',
];

/** Todas las personas cargadas, con su ficha completa. `personId=-1` es "todas". */
async function personasDelEquipo(cfg) {
    const porId = new Map();
    for (let pagina = 0; pagina < 20; pagina++) {
        const r = await pedir(cfg, '/person/findByPage',
            { pass: cfg.clave, personId: '-1', length: '1000', index: String(pagina) }, 'GET');
        const lista = (r.data && r.data.personInfos) || [];
        for (const p of lista) porId.set(String(p.id), p);
        const info = (r.data && r.data.pageInfo) || {};
        if (!lista.length || porId.size >= (info.total || 0)) break;
    }
    return porId;
}

const alta = (cfg, id, nombre) => pedir(cfg, '/person/create', {
    pass: cfg.clave,
    // facePermission 2 = reconocimiento prendido. Al vencido NO se lo apaga acá: se lo frena
    // con la ventana horaria, así el equipo lo reconoce y el aviso llega CON nombre.
    //
    // Nace SIN etiqueta a propósito: la etiqueta es el sello de "ya le apliqué el horario", y
    // todavía no se lo aplicamos. Si el proceso se corta acá, la próxima corrida lo completa.
    person: JSON.stringify({ id, name: nombre, facePermission: 2, tag: '' }),
});

/** Actualiza una persona mandando su ficha COMPLETA con los cambios encima. */
const actualizar = (cfg, ficha, cambios) => {
    const completa = {};
    for (const campo of CAMPOS) {
        if (ficha[campo] !== undefined && ficha[campo] !== null) completa[campo] = ficha[campo];
    }
    return pedir(cfg, '/person/update', {
        pass: cfg.clave,
        person: JSON.stringify({ ...completa, ...cambios }),
    });
};

const horario = (cfg, id, permitido) => pedir(cfg, '/person/createPasstime', {
    pass: cfg.clave,
    passtime: JSON.stringify({ personId: id, passtime: permitido ? ABIERTO : CERRADO }),
});

// El campo del delete es `id`, no `personId` — el documento lo etiqueta "Person ID" pero la
// clave real que espera el equipo es `id`. Con `personId` contesta "id is abnormal".
const baja = (cfg, id) => pedir(cfg, '/person/delete', { pass: cfg.clave, id });

/** El equipo saca la foto él mismo: la cara nunca pasa por Veltronik. */
const foto = (cfg, id) => pedir(cfg, '/face/takeImg', { pass: cfg.clave, personId: id });

/** Dónde tiene que avisar el equipo cada reconocimiento. */
const avisarA = (cfg, url) => pedir(cfg, '/setIdentifyCallBack', { pass: cfg.clave, callbackUrl: url });

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

/** ¿Ya sincronizamos en este arranque? La primera vez se reaplica todo. */
let yaCorrioUnaVez = false;

/**
 * Qué habría que hacerle al equipo. <b>Función pura: no toca la red.</b>
 *
 * <p>Está separada de la ejecución a propósito. Acá viven las tres decisiones que, si se
 * equivocan, se equivocan caro —a quién dar de alta, a quién cambiarle el horario y sobre
 * todo <b>a quién borrar</b>— y una función pura se puede probar de verdad, sin levantar un
 * equipo ni simular un socket.</p>
 *
 * @param padron      lo que dice Veltronik
 * @param enElEquipo  Map de id → ficha completa, lo que el equipo tiene cargado ahora
 */
function planificar(padron, enElEquipo, reaplicarTodo = false) {
    const acciones = [];
    const delPadron = new Set();

    for (const socio of padron) {
        const id = sinGuiones(socio.id);
        const nombre = String(socio.nombre || 'Socio').slice(0, 32);
        const permitido = !!socio.permitido;
        const etiqueta = etiquetaDe(permitido);
        const ficha = enElEquipo.get(id);
        delPadron.add(id);

        if (!ficha) {
            // Alta: queda cargado pero SIN CARA. Recién cuando alguien le saque la foto desde
            // la ficha del socio, el equipo lo va a reconocer.
            acciones.push({ tipo: 'alta', id, nombre, permitido, etiqueta });
            continue;
        }

        // El equipo dice en qué estado lo dejamos. Si no coincide con el que corresponde hoy
        // —o si nunca se lo aplicamos— hay que reaplicarlo. Nada de esto depende de un archivo
        // nuestro, así que no hay copia que se pueda desfasar.
        if (reaplicarTodo || (ficha.tag || '') !== etiqueta) {
            acciones.push({ tipo: 'permiso', id, nombre, permitido, etiqueta, ficha });
        } else if ((ficha.name || '') !== nombre) {
            acciones.push({ tipo: 'renombrar', id, nombre, ficha });
        }
    }

    // Los que están en el equipo y ya no son socios de este gimnasio. Se filtran los ids que
    // no tienen nuestra forma: alguien pudo haber cargado una persona a mano en el equipo
    // —una prueba, el técnico— y borrarle la cara a alguien que no pusimos nosotros no es
    // nuestro trabajo.
    const sobran = [...enElEquipo.keys()].filter((id) => esNuestro(id) && !delPadron.has(id));

    // ⚠️ El freno. Si el padrón llegara vacío o cortado, sin esto una sola corrida dejaría al
    // gimnasio entero teniendo que volver a sacarse la foto uno por uno.
    const demasiadas = enElEquipo.size > 0 && sobran.length > enElEquipo.size * TOPE_DE_BAJAS;
    if (!demasiadas) {
        for (const id of sobran) acciones.push({ tipo: 'baja', id });
    }

    return { acciones, bajasFrenadas: demasiadas ? sobran.length : 0 };
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

    // La primera corrida de cada arranque reaplica TODO, sin creerle a las etiquetas.
    //
    // La etiqueta cubre el caso en que el desfasaje es nuestro (perdimos el estado, otra
    // computadora sincronizó, el equipo se reseteó). Lo que no puede cubrir es que alguien
    // toque el equipo a mano sin tocar la etiqueta. Esto acota ese riesgo a un arranque: en un
    // gimnasio la computadora se prende todas las mañanas, así que como mucho el desfasaje
    // dura hasta que alguien abre Veltronik. Cuesta una pasada completa, una vez.
    const primera = !yaCorrioUnaVez;
    yaCorrioUnaVez = true;
    const { acciones, bajasFrenadas } = planificar(padron, enElEquipo, primera);
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
                await aplicarPermiso(cfg, { id: a.id, name: a.nombre, facePermission: 2 },
                    a.permitido, a.etiqueta);
                resumen.creados++;
            } else if (a.tipo === 'permiso') {
                await aplicarPermiso(cfg, a.ficha, a.permitido, a.etiqueta, a.nombre);
                resumen.horarios++;
            } else if (a.tipo === 'renombrar') {
                await actualizar(cfg, a.ficha, { name: a.nombre });
                resumen.renombrados++;
            } else if (a.tipo === 'baja') {
                await baja(cfg, a.id);
                resumen.borrados++;
            }
        } catch (e) {
            // Un socio que falla no puede frenar a los otros 384. Se anota y se sigue: como el
            // estado vive en el equipo y la etiqueta no se llegó a sellar, la próxima corrida
            // lo reintenta sola.
            resumen.errores.push({ socio: a.nombre || a.id, error: e.message });
        }
        hecho++;
        if (alAvanzar && hecho % 10 === 0) alAvanzar(hecho, acciones.length);
    }

    resumen.cuando = new Date().toISOString();
    return resumen;
}

/**
 * Le aplica a un socio el horario que le corresponde y recién entonces lo sella.
 *
 * <p><b>El orden importa y es la garantía de todo.</b> Primero la ventana horaria —que es lo
 * que realmente abre o cierra la puerta— y después la etiqueta, que es el sello de "ya está
 * hecho". Si el proceso se corta en el medio, la etiqueta sigue diciendo el estado viejo y la
 * próxima corrida lo vuelve a intentar. Al revés, un corte dejaría al socio sellado como
 * listo con la puerta en el estado equivocado, y nadie volvería a mirarlo.</p>
 */
async function aplicarPermiso(cfg, ficha, permitido, etiqueta, nombre) {
    await horario(cfg, ficha.id, permitido);
    await actualizar(cfg, ficha, nombre ? { tag: etiqueta, name: nombre } : { tag: etiqueta });
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
