/**
 * ============================================
 * VELTRONIK - PRUEBA DE HUMO DEL NÚCLEO LOCAL
 * ============================================
 *
 * Abre la base del terminal de verdad, escribe, lee y borra. Imprime lo que encontró y sale:
 * con 0 si todo anduvo, con 1 si algo falló o si no pudo seguir. Sale SIEMPRE.
 *
 * <b>Por qué esto existe y no alcanza con los tests.</b> `better-sqlite3` es un módulo
 * NATIVO: el binario se baja compilado contra el ABI de Electron, y vitest corre sobre el
 * Node de la máquina, que es otro. La suite prueba lo nuestro —el mapeo de columnas, el
 * alcance por gimnasio, la guarda de la lista vacía— con una conexión de mentira, y eso está
 * bien; pero nadie ahí adentro puede responder la pregunta que importa en la máquina de un
 * cliente: <i>¿este equipo puede abrir la base?</i>
 *
 * También sirve como diagnóstico en campo. Si un gimnasio reporta que la copia local no se
 * guarda, esto lo dice en diez segundos y sin adivinar.
 *
 * Uso:
 *   npx electron tools/nucleo-humo.cjs
 *   (o `pnpm run humo:nucleo`)
 */

const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

// ⚠️ ANTES de cargar nada nuestro, para que cubra también un `require` que explota. El cuerpo
// de la prueba tiene su propio `.catch`; esto es para lo que pase fuera de esa promesa.
process.on('uncaughtException', abortar);
process.on('unhandledRejection', abortar);

/**
 * ⚠️ LOS DOCUMENTOS DE ESTA PRUEBA SON DE MENTIRA, Y SE DECIDE ACÁ, ANTES DE CARGAR NADA.
 *
 * Todo lo que se encola deja un renglón en la copia legible (`respaldo.cjs`), y esa copia
 * vive en los Documentos de quien esté sentado en la máquina. `--user-data-dir` no los
 * cambia: aparta la base y la bóveda, pero Documentos es del usuario de Windows, no del
 * perfil. Es la MISMA carpeta donde la app instalada deja lo que el gimnasio anotó sin
 * internet.
 *
 * La primera versión escribía ahí y al terminar borraba los archivos del día ENTEROS. Si ese
 * día el mostrador había trabajado sin internet, se llevaba las visitas y los cobros de
 * verdad junto con nuestro "José Pérez" —hasta los egresos y los cierres, que esto ni
 * siquiera escribe—. Y decía "Todo bien.". Esto se corre justamente en las máquinas donde
 * algo anda mal: es el peor lugar para borrar un respaldo.
 *
 * Por eso se le dice a Electron que, para ESTE proceso, Documentos es una carpeta temporal
 * recién creada. `respaldo.cjs` le pregunta a Electron dónde queda, así que la copia cae ahí
 * sin tocar una línea de la app — y lo mismo cualquier otra cosa que el día de mañana
 * escriba en Documentos. Es una carpeta nueva por corrida, y no una fija, para que lo que
 * deje una corrida cortada no le cambie la cuenta a la siguiente.
 *
 * Si la carpeta no se puede crear, esto tira y la prueba se corta ahí: sin un lugar propio
 * no se encola nada.
 */
let documentosDeVerdad = null;
try {
    documentosDeVerdad = app.getPath('documents');
} catch { /* una máquina sin Documentos: no hay nada que cuidar */ }

const DOCUMENTOS_DE_PRUEBA = fs.mkdtempSync(path.join(os.tmpdir(), 'veltronik-humo-'));
app.setPath('documents', DOCUMENTOS_DE_PRUEBA);

const nucleoDb = require(path.join(__dirname, '..', 'electron', 'nucleo', 'db.cjs'));
const espejo = require(path.join(__dirname, '..', 'electron', 'nucleo', 'espejo.cjs'));
const boveda = require(path.join(__dirname, '..', 'electron', 'nucleo', 'boveda.cjs'));
const cola = require(path.join(__dirname, '..', 'electron', 'nucleo', 'cola.cjs'));
const respaldo = require(path.join(__dirname, '..', 'electron', 'nucleo', 'respaldo.cjs'));

/** Dos gimnasios de mentira, para no pisar el espejo real de nadie. */
const GIMNASIO = 'de000000-0000-4000-8000-000000000001';
const OTRO = 'de000000-0000-4000-8000-000000000002';

let fallas = 0;

function chequear(descripcion, condicion, detalle) {
    const marca = condicion ? '  OK  ' : ' FALLA';
    console.log(`${marca}  ${descripcion}${detalle ? `  — ${detalle}` : ''}`);
    if (!condicion) fallas += 1;
}

/**
 * Borra los Documentos de mentira, enteros: son de esta corrida de punta a punta.
 *
 * <b>No puede tirar.</b> La usa `salir`, y por ahí pasa también `abortar`, que corre cuando ya
 * explotó otra cosa — incluido el caso en que la carpeta ni se llegó a crear. Los reintentos
 * son por el antivirus, que a veces tiene tomado un archivo recién escrito.
 */
function borrarDocumentosDePrueba() {
    try {
        fs.rmSync(DOCUMENTOS_DE_PRUEBA, { recursive: true, force: true, maxRetries: 3 });
    } catch { /* si no se deja borrar, el chequeo del final lo dice; acá no se rompe nada */ }
}

/**
 * La única puerta de salida. Antes de irse borra los Documentos de mentira, así tampoco queda
 * un "José Pérez" en el disco cuando la prueba se corta por la mitad.
 */
function salir(codigo) {
    borrarDocumentosDePrueba();
    app.exit(codigo);
}

/**
 * ¿`hija` queda adentro de `madre`? Se comparan los caminos como los resuelve el sistema: en
 * Windows %TEMP% suele venir en formato corto (`RECEPC~1`) y el mismo lugar se escribe de dos
 * maneras. Ante la duda dice que NO: quien pregunta es la guarda que decide si se escribe.
 */
function adentroDe(hija, madre) {
    try {
        const relativo = path.relative(fs.realpathSync.native(madre), fs.realpathSync.native(hija));
        return relativo !== '' && relativo.split(path.sep)[0] !== '..' && !path.isAbsolute(relativo);
    } catch {
        return false;
    }
}

/**
 * Qué hay en una carpeta: nombre, tamaño y fecha de cada cosa. Solo mira —no abre ni crea
 * nada—, y una carpeta que no existe es una carpeta vacía.
 */
function fotoDe(carpeta) {
    try {
        return fs.readdirSync(carpeta).sort().map((nombre) => {
            const { size, mtimeMs } = fs.statSync(path.join(carpeta, nombre));
            return `${nombre} (${size} bytes, ${new Date(mtimeMs).toISOString()})`;
        });
    } catch {
        return [];
    }
}

/** El veredicto. El código de salida es para quien corre esto desde un script y no lo lee. */
function terminar() {
    console.log(`\n${fallas === 0 ? 'Todo bien.' : `${fallas} falla(s).`}\n`);
    salir(fallas === 0 ? 0 : 1);
}

/**
 * Lo que nadie previó: se dice qué fue y se sale con error.
 *
 * <b>Por qué no alcanza con dejar que explote.</b> En Node un error sin atender termina el
 * proceso con el stack a la vista. En Electron no: el proceso principal sigue vivo, sin
 * ventana, esperando para siempre. Así quedaba esto cuando la base no abría — imprimía la
 * FALLA, usaba igual la conexión que no tenía y nunca llegaba al `app.exit` del final. Un
 * diagnóstico que se cuelga callado es peor que no tenerlo: no dice ni que sí ni que no.
 *
 * <b>No toca el contador ni nada que se defina más abajo</b>, a propósito: tiene que poder
 * correr aunque el archivo se haya cortado en el primer `require`. La única excepción son los
 * Documentos de mentira, que `salir` borra adentro de su propio `try`: si no llegaron a
 * existir, no hay nada que borrar y sigue de largo.
 */
function abortar(error) {
    console.log('\n FALLA  la prueba se cortó por un error inesperado; lo que seguía quedó sin probar:');
    console.log(error && error.stack ? error.stack : String(error));
    console.log('');
    salir(1);
}

function socio(n, nombre, apellido, doc) {
    return {
        id: `00000000-0000-4000-8000-00000000000${n}`,
        firstName: nombre,
        lastName: apellido,
        document: doc,
        active: true,
        membershipEnd: '2026-10-01T00:00:00',
        situacion: 'AL_DIA',
        diasRestantes: 25,
        diasVencido: 0,
        busqueda: `${nombre} ${apellido} ${doc}`.toLowerCase(),
    };
}

/**
 * LA BÓVEDA. Acá se prueba el cifrado del sistema operativo de verdad (DPAPI en Windows), que
 * es otra cosa que la suite no puede tocar.
 *
 * Va en una función aparte porque es lo único de esta prueba que no necesita la base, así que
 * se corre también cuando la base no abre. Y ahí es donde más dice: la bóveda escribe en la
 * MISMA carpeta, de modo que si ella guarda, la carpeta está bien y el problema es de SQLite
 * —el binario o el archivo—.
 */
function probarLaBoveda() {
    console.log('');
    const puedeCifrar = boveda.disponible();
    chequear('el sistema puede cifrar', puedeCifrar, puedeCifrar ? '' : 'sin llavero: se usa localStorage');

    if (puedeCifrar) {
        const CLAVE = 'humo-sesion';
        const SECRETO = '{"refresh_token":"rt-de-mentira","user":{"id":"u1"}}';

        chequear('guarda', boveda.escribir(CLAVE, SECRETO));
        chequear('devuelve lo mismo que guardó', boveda.leer(CLAVE) === SECRETO);

        // Lo que importa de verdad: que en el disco NO esté el texto en claro. Si esto
        // fallara, la bóveda sería un archivo con otro nombre y el mismo problema.
        const enDisco = fs.readFileSync(boveda.ruta(), 'utf8');
        chequear('en el disco NO está en claro', !enDisco.includes('rt-de-mentira'));

        chequear('borra', boveda.borrar(CLAVE) && boveda.leer(CLAVE) === null);
    }
}

app.whenReady().then(() => {
    console.log('\n── Núcleo local: prueba de humo ──\n');

    // ⚠️ ANTES DE ESCRIBIR NADA: ¿a dónde va a ir la copia legible?
    //
    // Se le pregunta a `respaldo.cjs`, que es quien la escribe, y no a Electron: lo que hay
    // que saber es dónde va a caer el renglón, no qué creemos haber configurado arriba. Si
    // algún día ese archivo resuelve su carpeta de otra manera, la redirección deja de
    // alcanzar — y esto lo dice acá, antes de que se encole la primera cosa.
    const copia = respaldo.donde();
    const aislada = adentroDe(copia, DOCUMENTOS_DE_PRUEBA);
    chequear('la copia legible va a una carpeta de esta prueba', aislada, copia || 'no hay carpeta');
    if (!aislada) {
        console.log('\nNo se sigue: lo que se encole dejaría renglones de prueba en una carpeta de verdad.');
        terminar();
        return;
    }

    // La foto de la carpeta de verdad —la que habría usado sin la redirección— para comparar
    // al final. Se arma con el mismo camino que eligió `respaldo.cjs` adentro de los
    // Documentos de mentira, así lo sigue si algún día la mueve.
    const respaldoDeVerdad = documentosDeVerdad
        && path.join(documentosDeVerdad, path.relative(DOCUMENTOS_DE_PRUEBA, copia));
    const fotoAntes = fotoDe(respaldoDeVerdad);

    // 1. ¿Carga el módulo nativo en esta máquina?
    chequear('el módulo nativo carga', nucleoDb.disponible(), nucleoDb.porQueNo() || '');
    if (!nucleoDb.disponible()) {
        console.log('\nSin módulo nativo no hay nada más que probar. La app igual funciona:');
        console.log('vuelve a consultar la nube, como antes del núcleo local.\n');
        salir(1);
        return;
    }

    // 2. ¿Abre el archivo, y con las pragmas que pedimos?
    const db = nucleoDb.abrir();
    chequear('la base abre', !!db, nucleoDb.ruta());
    if (!db) {
        // `abrir()` no tira: devuelve null y deja anotado el motivo. Todo lo que sigue —el
        // espejo, la cola, la migración— vive en esa base, así que no hay con qué probarlo.
        // Va solo el primer renglón: el aviso entero ya lo imprimió db.cjs acá arriba, y
        // cuando falta el binario son más de diez rutas.
        const motivo = String(nucleoDb.porQueNo() || 'no dijo por qué').split('\n')[0];
        console.log(`\nNo abrió: ${motivo}`);
        console.log('Sin base no hay espejo ni cola que probar. Sigue la bóveda, que es un archivo aparte.');
        probarLaBoveda();
        terminar();
        return;
    }

    const journal = db.pragma('journal_mode', { simple: true });
    const sync = db.pragma('synchronous', { simple: true });
    chequear('journal_mode = WAL', String(journal).toLowerCase() === 'wal', `es ${journal}`);
    // 2 es FULL. Es la diferencia entre "no se corrompe" y "no se pierde lo último": con
    // NORMAL un apagón puede comerse la última transacción, y ahí adentro va a haber plata.
    chequear('synchronous = FULL', Number(sync) === 2, `es ${sync}`);

    // 3. Escribir y leer.
    const guardado = espejo.guardar(GIMNASIO, [
        socio(1, 'José', 'Pérez', '24732531'),
        socio(2, 'Ana', 'Gómez', '30111222'),
    ]);
    chequear('guarda el espejo', guardado.ok === true, `${guardado.socios} socios`);

    const leido = espejo.leer(GIMNASIO);
    chequear('lee lo que guardó', leido.socios.length === 2);
    chequear('el nombre vuelve entero', leido.socios[0].fullName.length > 0, leido.socios[0].fullName);
    chequear('el veredicto vuelve tal cual', leido.socios[0].situacion === 'AL_DIA');
    chequear('sabe de cuándo es', typeof leido.actualizado === 'number');

    // 4. Reemplazar de verdad reemplaza (y no acumula).
    espejo.guardar(GIMNASIO, [socio(3, 'Luis', 'Díaz', '28999111')]);
    const despues = espejo.leer(GIMNASIO);
    chequear('refrescar REEMPLAZA, no acumula', despues.socios.length === 1, `quedaron ${despues.socios.length}`);

    // 5. Una lista vacía no borra la lista buena.
    const vacio = espejo.guardar(GIMNASIO, []);
    chequear('una lista vacía no pisa nada', vacio.ok === false && espejo.leer(GIMNASIO).socios.length === 1);

    // 6. Un gimnasio no pisa al otro.
    espejo.guardar(OTRO, [socio(4, 'Marta', 'Ruiz', '27000333')]);
    chequear('cada gimnasio tiene lo suyo',
        espejo.leer(GIMNASIO).socios.length === 1 && espejo.leer(OTRO).socios.length === 1);

    // 7. El archivo existe en el disco, con su WAL al lado.
    const ruta = nucleoDb.ruta();
    chequear('el archivo está en el disco', fs.existsSync(ruta), `${fs.statSync(ruta).size} bytes`);
    chequear('hay WAL', fs.existsSync(`${ruta}-wal`));

    // ── LA BÓVEDA ──
    probarLaBoveda();

    // ── LA COLA ──
    // Lo único de esta base que NO es copia de nada: si se pierde, el gimnasio perdió una
    // visita. Por eso se prueba contra el motor de verdad y no solo con una conexión falsa.
    console.log('');
    const acceso = (ref, cuando) => ({
        clientRef: ref, tenantId: GIMNASIO, memberId: 'de000000-0000-4000-8000-00000000aaaa',
        memberName: 'José Pérez', method: 'manual', ocurridoEn: cuando,
    });

    chequear('encola', cola.encolar(acceso('humo-b', '2026-09-06T11:00:00')).ok);
    chequear('encola otro', cola.encolar(acceso('humo-a', '2026-09-06T10:00:00')).ok);

    // El orden es lo único que sostiene la corrección: mandar la salida antes que la entrada
    // invierte las dos marcas.
    const enCola = cola.pendientes(GIMNASIO);
    chequear('sale en el orden en que OCURRIÓ, no en el que se encoló',
        enCola.map((i) => i.clientRef).join(',') === 'humo-a,humo-b',
        enCola.map((i) => i.clientRef).join(','));

    // Encolar dos veces el mismo acceso tiene que ser inofensivo en los DOS extremos.
    cola.encolar(acceso('humo-a', '2026-09-06T10:00:00'));
    chequear('el mismo sello no entra dos veces', cola.contar(GIMNASIO) === 2, `${cola.contar(GIMNASIO)} en cola`);

    // ⭐ Y LA COPIA LEGIBLE TAMPOCO PUEDE DUPLICARLO. La primera versión anotaba siempre, así
    // que el sello repetido de arriba dejaba la línea dos veces en el archivo: la base lo
    // ignoraba y la copia no. La regla de que un reintento no duplica tiene que valer en los
    // DOS lados de la línea. Esto solo se ve acá, corriendo contra el SQLite de verdad.
    const archivoCopia = respaldo.archivoDeHoy(respaldo.donde());
    const texto = fs.existsSync(archivoCopia) ? fs.readFileSync(archivoCopia, 'utf8') : '';
    const vecesA = (texto.match(/,humo-a,/g) || []).length;
    chequear('la copia legible tiene el acceso UNA sola vez', vecesA === 1, `${vecesA} línea(s)`);
    chequear('y tiene al otro también', (texto.match(/,humo-b,/g) || []).length === 1);

    cola.anotarFallo('humo-a', 'Network Error');
    chequear('anota el fallo SIN sacarlo de la cola',
        cola.contar(GIMNASIO) === 2 && cola.pendientes(GIMNASIO)[0].intentos === 1);

    // ⭐ EL RESUMEN DICE CÓMO VIENE EL DE ADELANTE. De ahí sale que la pantalla distinga "no
    // hay internet" de "el servidor lo rechaza" (Santo Sport, 05/10/2026). 'humo-a' ocurrió
    // primero aunque se encoló segundo, así que es el de adelante: el orden es el del vaciado.
    const como = cola.resumen(GIMNASIO);
    chequear('el resumen cuenta cómo viene el de adelante',
        como.cuantos === 2 && como.primero && como.primero.tipo === 'ACCESO'
            && como.primero.intentos === 1 && como.primero.ultimoError === 'Network Error',
        JSON.stringify(como.primero));
    cola.anotarFallo('humo-a', 'HTTP 500 x1 · could not initialize proxy');
    chequear('y lo último que le contestaron, con el código del servidor adelante',
        cola.resumen(GIMNASIO).primero.ultimoError === 'HTTP 500 x1 · could not initialize proxy'
            && cola.resumen(GIMNASIO).primero.intentos === 2);

    chequear('sacar saca uno solo', cola.sacar('humo-a') && cola.contar(GIMNASIO) === 1);

    cola.olvidar();
    chequear('limpia la cola', cola.contar(GIMNASIO) === 0);

    // ── UNA SOLA COLA: el orden vale ENTRE TIPOS ────────────────────────────────────────
    //
    // Es la razón de ser de la cola general, y sale de una decisión del dueño: se puede dar
    // de alta a un socio Y COBRARLE en el mismo acto sin internet. Si cada tipo tuviera su
    // cola, el servidor podría recibir el cobro de alguien que para él todavía no existe.
    console.log('');
    cola.encolar({ clientRef: 'humo-cobro', tipo: 'COBRO', tenantId: GIMNASIO,
        ocurridoEn: '2026-09-06T10:05:00', monto: 45000, metodo: 'cash' });
    cola.encolar({ clientRef: 'humo-alta', tipo: 'ALTA', tenantId: GIMNASIO,
        ocurridoEn: '2026-09-06T10:00:00', nombre: 'Socio Nuevo' });
    cola.encolar(acceso('humo-acc', '2026-09-06T10:10:00'));

    const mezcla = cola.pendientes(GIMNASIO);
    chequear('el alta sale ANTES que el cobro, aunque se encoló después',
        mezcla.map((i) => i.tipo).join(',') === 'ALTA,COBRO,ACCESO',
        mezcla.map((i) => i.tipo).join(','));

    // El payload viaja en JSON y vuelve PLANO: el que manda el ítem recibe `item.monto`, no
    // `item.payload.monto`. Sin esto habría que tocar todo el código que ya mandaba accesos.
    const elCobro = mezcla.find((i) => i.tipo === 'COBRO');
    chequear('el payload vuelve plano', elCobro.monto === 45000 && elCobro.metodo === 'cash');

    const elAcceso = mezcla.find((i) => i.tipo === 'ACCESO');
    chequear('y el acceso sigue teniendo la forma de siempre',
        elAcceso.memberId === 'de000000-0000-4000-8000-00000000aaaa' && elAcceso.method === 'manual');

    chequear('un tipo inventado no entra', !cola.encolar({
        clientRef: 'humo-raro', tipo: 'LO_QUE_SEA', tenantId: GIMNASIO, ocurridoEn: '2026-09-06T10:00:00',
    }).ok);

    // ── LA SALIDA: es un tipo aparte del ACCESO, y exige la visita ──────────────────────
    //
    // El ACCESO le pide al servidor que deduzca la dirección contra el momento; la SALIDA le
    // dice QUÉ visita cerrar. Sin ese id no hay nada que mandar, así que la fila se
    // reintentaría para siempre — por eso se rechaza acá y no más adelante.
    chequear('una SALIDA sin visita no entra', !cola.encolar({
        clientRef: 'humo-salida-mala', tipo: 'SALIDA', tenantId: GIMNASIO,
        ocurridoEn: '2026-09-06T20:00:00',
    }).ok);

    chequear('una SALIDA con su visita sí', cola.encolar({
        clientRef: 'humo-salida', tipo: 'SALIDA', tenantId: GIMNASIO,
        ocurridoEn: '2026-09-06T20:00:00', accessLogId: 'log-humo-1',
    }).ok);

    const laSalida = cola.pendientes(GIMNASIO).find((i) => i.tipo === 'SALIDA');
    chequear('y su visita vuelve plana, como todo lo demás',
        laSalida && laSalida.accessLogId === 'log-humo-1', laSalida && laSalida.accessLogId);

    cola.olvidar();

    // ── LA MIGRACIÓN DE LA COLA VIEJA ──────────────────────────────────────────────────
    //
    // Es la parte más delicada de todo esto: en los terminales ya instalados puede haber
    // visitas esperando en `cola_accesos`. Eso es lo único de este archivo que no se puede
    // volver a bajar de ningún lado — si la migración las pierde, el gimnasio pierde entradas
    // que registró de verdad. Se prueba contra SQLite de verdad porque usa `json_object` y un
    // `ALTER TABLE ... RENAME`, y ninguna de las dos cosas se puede simular con honestidad.
    console.log('');
    const conn = nucleoDb.abrir();
    conn.exec(`
        DROP TABLE IF EXISTS cola_accesos;
        DROP TABLE IF EXISTS cola_accesos_migrada;
        CREATE TABLE cola_accesos (
            client_ref TEXT PRIMARY KEY, tenant_id TEXT, member_id TEXT NOT NULL,
            member_name TEXT, method TEXT NOT NULL DEFAULT 'manual', ocurrido_en TEXT NOT NULL,
            intentos INTEGER NOT NULL DEFAULT 0, ultimo_error TEXT, creado_en INTEGER NOT NULL
        );
        INSERT INTO cola_accesos VALUES
            ('vieja-1', '${GIMNASIO}', 'de000000-0000-4000-8000-00000000aaaa', 'José Pérez',
             'manual', '2026-09-06T09:00:00', 2, 'Network Error', 1000);
    `);

    const r1 = nucleoDb.migrarColaVieja(conn);
    chequear('pasa la visita vieja a la cola general', r1.migradas === 1);

    const migrada = cola.pendientes(GIMNASIO)[0];
    chequear('con su tipo, su momento y su socio',
        migrada && migrada.tipo === 'ACCESO' && migrada.ocurridoEn === '2026-09-06T09:00:00'
        && migrada.memberId === 'de000000-0000-4000-8000-00000000aaaa');
    chequear('y sin perder los intentos que ya llevaba', migrada.intentos === 2);

    // ⭐ EL RENOMBRE ES LO QUE IMPIDE QUE SE REPITA PARA SIEMPRE. Sin él, una fila que se
    // copió, se subió y se sacó de la cola volvería a aparecer en el próximo arranque —
    // porque el original sigue en la tabla vieja— y se resubiría en cada encendido.
    cola.sacar('vieja-1');
    const r2 = nucleoDb.migrarColaVieja(conn);
    chequear('correrla de nuevo NO revive lo que ya se subió',
        r2.migradas === 0 && cola.contar(GIMNASIO) === 0);

    // Y no se borra: es un dato irreemplazable, se queda hasta que haga falta el espacio.
    const quedaLaVieja = conn.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='cola_accesos_migrada'",
    ).get();
    chequear('la tabla vieja se conserva, no se borra', !!quedaLaVieja);

    conn.exec('DROP TABLE IF EXISTS cola_accesos_migrada');
    cola.olvidar();

    // Limpieza: esto es una prueba, no puede dejar basura en el espejo de nadie.
    console.log('');
    espejo.olvidar(GIMNASIO);
    espejo.olvidar(OTRO);
    chequear('limpia lo que ensució', espejo.leer(GIMNASIO).socios.length === 0);

    // ⚠️ Y la copia también. Todo lo que se encoló arriba dejó su renglón —accesos, cobros,
    // altas, salidas—, pero en los Documentos de mentira de esta corrida. Por eso se borra la
    // carpeta ENTERA, sin listar tipos ni mirar qué hay: es nuestra de punta a punta, y el día
    // que la cola sume un tipo nuevo no hay nada que acordarse de agregar acá.
    borrarDocumentosDePrueba();
    const quedo = fs.existsSync(DOCUMENTOS_DE_PRUEBA);
    chequear('no deja archivos de prueba en el disco', !quedo, quedo ? DOCUMENTOS_DE_PRUEBA : '');

    // Y la contracara, que es la que importa: en los Documentos de una persona de verdad no
    // se agregó, no se cambió y no se borró nada. El chequeo viejo miraba que no quedaran
    // NUESTROS archivos, y daba bien justo cuando acababa de borrar los del gimnasio.
    //
    // Si esto falla sin que se haya tocado este archivo, mirar primero si la app estaba
    // abierta y sin internet: es la única otra cosa que escribe ahí, y un acceso anotado en
    // el mismo segundo de la prueba se ve igual que uno nuestro.
    const fotoDespues = fotoDe(respaldoDeVerdad);
    const cambios = [
        ...fotoAntes.filter((f) => !fotoDespues.includes(f)).map((f) => `antes: ${f}`),
        ...fotoDespues.filter((f) => !fotoAntes.includes(f)).map((f) => `ahora: ${f}`),
    ];
    chequear('y los Documentos de verdad quedaron como estaban', cambios.length === 0, cambios.join(' · '));

    nucleoDb.cerrar();

    terminar();
}).catch(abortar);
