/**
 * ============================================
 * VELTRONIK - PRUEBA DE HUMO DEL NÚCLEO LOCAL
 * ============================================
 *
 * Abre la base del terminal de verdad, escribe, lee y borra. Imprime lo que encontró y sale.
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

app.whenReady().then(() => {
    console.log('\n── Núcleo local: prueba de humo ──\n');

    // 1. ¿Carga el módulo nativo en esta máquina?
    chequear('el módulo nativo carga', nucleoDb.disponible(), nucleoDb.porQueNo() || '');
    if (!nucleoDb.disponible()) {
        console.log('\nSin módulo nativo no hay nada más que probar. La app igual funciona:');
        console.log('vuelve a consultar la nube, como antes del núcleo local.\n');
        app.exit(1);
        return;
    }

    // 2. ¿Abre el archivo, y con las pragmas que pedimos?
    const db = nucleoDb.abrir();
    chequear('la base abre', !!db, nucleoDb.ruta());

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
    // Acá se prueba el cifrado del sistema operativo de verdad (DPAPI en Windows), que es
    // otra cosa que la suite no puede tocar.
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

    // ⚠️ Y la copia también: esto escribe en los DOCUMENTOS de una persona de verdad. Dejar
    // ahí un "José Pérez" de mentira es peor que no probar nada — el día que alguien abra esa
    // carpeta buscando visitas reales se va a encontrar con las nuestras.
    // ⚠️ TODOS los tipos que esta prueba escribió, no solo los accesos. Al generalizar la
    // cola, el humo empezó a dejar también cobros-…csv y altas-…csv, y la limpieza vieja
    // —que borraba un solo archivo— los dejaba ahí. Se listan desde los TIPOS de la cola para
    // que el día que se agregue uno nuevo, la limpieza lo tome sola.
    const copias = ['ACCESO', ...cola.TIPOS]
        .map((t) => respaldo.archivoDeHoy(respaldo.donde(), new Date(), t));
    for (const archivo of copias) {
        try {
            if (fs.existsSync(archivo)) fs.unlinkSync(archivo);
        } catch { /* si no se puede borrar, tampoco vale romper la prueba */ }
    }
    chequear('no deja archivos de prueba en Documentos', !copias.some((a) => fs.existsSync(a)));

    nucleoDb.cerrar();

    console.log(`\n${fallas === 0 ? 'Todo bien.' : `${fallas} falla(s).`}\n`);
    app.exit(fallas === 0 ? 0 : 1);
});
