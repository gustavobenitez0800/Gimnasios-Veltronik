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

    // Limpieza: esto es una prueba, no puede dejar basura en el espejo de nadie.
    console.log('');
    espejo.olvidar(GIMNASIO);
    espejo.olvidar(OTRO);
    chequear('limpia lo que ensució', espejo.leer(GIMNASIO).socios.length === 0);

    nucleoDb.cerrar();

    console.log(`\n${fallas === 0 ? 'Todo bien.' : `${fallas} falla(s).`}\n`);
    app.exit(fallas === 0 ? 0 : 1);
});
