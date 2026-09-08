/**
 * ============================================
 * VELTRONIK - LA COPIA LEGIBLE DE LA COLA
 * ============================================
 *
 * Un renglón de texto por cada acceso que se guardó sin internet, en una carpeta que el dueño
 * puede abrir.
 *
 * <b>POR QUÉ EXISTE.</b> La cola es lo único que hay: una visita que está ahí y se pierde se
 * perdió para siempre, porque es un dato que el gimnasio todavía no tiene en ningún otro lado.
 * Y el diseño la deja acumular: el espejo vale 30 días por decisión del dueño, hay UN terminal,
 * y la copia vive en UN disco. En el peor caso eso es un mes de visitas —y con la fase 3
 * adentro, de plata— sin ningún respaldo. Si esa máquina se muere, no hay de dónde sacarlo.
 *
 * <b>LO QUE ESTO PUEDE Y LO QUE NO.</b> No puede ser un respaldo remoto: la premisa de todo
 * esto es que NO hay internet. Lo que sí puede es sacar el dato de adentro del archivo de
 * SQLite y ponerlo en texto plano que sobrevive a que esa base se corrompa, que se puede copiar
 * a un pendrive, abrir en Excel y, en el peor de los casos, volver a cargar a mano.
 *
 * <b>Y de yapa, muchas veces es respaldo remoto sin que hagamos nada:</b> va a la carpeta
 * Documentos, que en la mayoría de las máquinas con Windows está redirigida a OneDrive. Donde
 * eso pasa, la copia sale de la máquina sola. Donde no, sigue siendo un archivo que alguien
 * puede copiar.
 *
 * <b>⚠️ NUNCA PUEDE ROMPER NADA.</b> Esto es secundario: el dato de verdad es la fila en la
 * base. Si el disco está lleno, la carpeta es de solo lectura o el antivirus se pone en el
 * medio, esto falla en silencio y el acceso se encola igual. Al revés sería absurdo — perder
 * la visita por no poder escribir su respaldo.
 */

const fs = require('fs');
const path = require('path');

let carpetaCache;
let avisado = false;

/**
 * Dónde vive la copia. En Documentos y no junto a la base a propósito: `%APPDATA%` es una
 * carpeta oculta que nadie encuentra, y esto existe justamente para que un humano lo pueda
 * agarrar el día que la máquina no arranca.
 */
function carpeta(base) {
    // `base` es la costura de prueba, igual que la conexión opcional de `espejo.cjs`: el
    // binario de Electron no existe en la suite, así que sin esto este archivo no se puede
    // probar. Cuando se inyecta no se cachea, para que un test no le ensucie la carpeta a otro.
    const inyectada = base !== undefined;
    if (!inyectada && carpetaCache !== undefined) return carpetaCache;

    let resultado;
    try {
        // Electron se pide acá adentro y no arriba, por lo mismo.
        const raiz = inyectada ? base : require('electron').app.getPath('documents');
        resultado = path.join(raiz, 'Veltronik', 'respaldo');
        fs.mkdirSync(resultado, { recursive: true });
    } catch (e) {
        if (!avisado) {
            console.warn('[Veltronik] Sin carpeta de respaldo:', e.message);
            avisado = true;
        }
        resultado = null;
    }

    if (!inyectada) carpetaCache = resultado;
    return resultado;
}

/** Cómo se llama el archivo de cada tipo. Un archivo por tipo y por día. */
const NOMBRE = {
    ACCESO: 'accesos', COBRO: 'cobros', ALTA: 'altas', EGRESO: 'egresos', CIERRE: 'cierres',
};

/**
 * Un archivo por día y por tipo: acotado, ordenado, y fácil de mandar por mail si hace falta.
 *
 * <p>Separados por tipo y no todo junto porque esto lo lee una PERSONA: la lista de entradas y
 * la lista de cobros se miran en momentos distintos y por motivos distintos.</p>
 */
function archivoDeHoy(destino, fecha = new Date(), tipo = 'ACCESO') {
    const dd = (n) => String(n).padStart(2, '0');
    const dia = `${fecha.getFullYear()}-${dd(fecha.getMonth() + 1)}-${dd(fecha.getDate())}`;
    const nombre = NOMBRE[tipo] || String(tipo).toLowerCase();
    return path.join(destino, `${nombre}-sin-internet-${dia}.csv`);
}

/** Comillas al estilo CSV. Un apellido con coma no puede correr las columnas. */
function celda(valor) {
    const s = valor === null || valor === undefined ? '' : String(valor);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const ENCABEZADO = 'ocurrio_en,socio,metodo,sello,socio_id,gimnasio_id,anotado_en';

/** El encabezado de los tipos que todavía no tienen columnas propias. Ver `FORMATO`. */
const ENCABEZADO_GENERICO = 'ocurrio_en,tipo,sello,gimnasio_id,datos,anotado_en';

/**
 * Cómo se escribe cada tipo.
 *
 * <p><b>⚠️ El que no está acá NO se pierde: cae en el formato genérico</b>, que guarda el
 * contenido entero como JSON en una columna. Es menos cómodo de leer, pero nada queda sin
 * copia — y esa es la única propiedad que no se puede negociar. A cada tipo se le escriben sus
 * columnas cuando se construye, no antes: inventarlas ahora sería adivinar la forma de algo
 * que todavía no existe.</p>
 */
const FORMATO = {
    ACCESO: {
        encabezado: ENCABEZADO,
        fila: (i) => [i.ocurridoEn, i.memberName, i.method || 'manual',
            i.clientRef, i.memberId, i.tenantId],
    },
};

function formatoDe(tipo) {
    return FORMATO[tipo] || {
        encabezado: ENCABEZADO_GENERICO,
        fila: (i) => {
            const { clientRef, tipo: t, tenantId, ocurridoEn, ...resto } = i;
            return [ocurridoEn, t, clientRef, tenantId, JSON.stringify(resto)];
        },
    };
}

/**
 * Anota lo encolado en la copia del día. Devuelve `true` solo si se escribió de verdad.
 *
 * <p>El <b>sello</b> va a propósito: es el mismo identificador que el servidor usa para no
 * duplicar. Si algún día hay que recargar esto, se puede hacer sin miedo a contar dos veces la
 * misma visita — ni a cobrarle dos veces al mismo socio.</p>
 */
function anotar(item, { ahora = new Date(), base } = {}) {
    const destino = carpeta(base);
    if (!destino || !item) return false;

    try {
        const tipo = item.tipo || 'ACCESO';
        const formato = formatoDe(tipo);
        const archivo = archivoDeHoy(destino, ahora, tipo);
        const nuevo = !fs.existsSync(archivo);

        const linea = [...formato.fila(item), ahora.toISOString()].map(celda).join(',');

        // El BOM va solo al crear: sin él, Excel en Windows abre los acentos rotos y el dueño
        // ve "Benítez" como "BenÃ­tez" justo el día que necesita leer esto.
        fs.appendFileSync(archivo, (nuevo ? `﻿${formato.encabezado}\n` : '') + linea + '\n', 'utf8');
        return true;
    } catch (e) {
        if (!avisado) {
            console.warn('[Veltronik] No se pudo escribir el respaldo de la cola:', e.message);
            avisado = true;
        }
        return false;
    }
}

/** Dónde quedó la copia, para poder decírselo a quien la necesite. */
function donde(base) {
    return carpeta(base);
}

/** Solo para tests: obliga a resolver la carpeta de nuevo. */
function _reiniciar() {
    carpetaCache = undefined;
    avisado = false;
}

module.exports = {
    anotar, donde, archivoDeHoy, celda, ENCABEZADO, ENCABEZADO_GENERICO, _reiniciar,
};
