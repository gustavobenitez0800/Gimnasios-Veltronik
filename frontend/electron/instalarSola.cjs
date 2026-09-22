/**
 * ============================================
 * VELTRONIK - LA VERSIÓN NUEVA SE INSTALA SOLA, EN UN MOMENTO QUE NO MOLESTA
 * ============================================
 *
 * Reportado por el dueño (2026-09-22): "en la versión desktop no llegaron actualizaciones".
 * Llegaban: el actualizador las bajaba. Pero las INSTALABA recién al cerrar la app, o si
 * alguien tocaba "Actualizar ahora" en el Lobby. La PC del mostrador arranca con Windows y
 * queda en Accesos todo el día, así que ninguna de las dos pasaba: la versión nueva quedaba
 * esperando para siempre.
 *
 * Ahora, con una versión descargada, se instala sola (en silencio, ~15 segundos, y la app
 * vuelve a abrirse) en uno de dos momentos:
 *
 *   · al ABRIR la app: en los primeros minutos nadie está cobrando todavía. Es el caso de
 *     todas las mañanas: la PC se prende, la app abre, instala lo que bajó ayer, y arranca
 *     el día con la versión nueva.
 *   · cuando la PC lleva un rato SIN USAR (ni teclado ni mouse): nadie está atendiendo.
 *
 * ⚠️ Y SI FALLA, NO SE VUELVE A INTENTAR EN CADA ARRANQUE. Un antivirus que frena el
 * instalador dejaría la app reiniciándose sola cada vez que se abre. Se anotan los intentos
 * por versión; pasado el tope, queda el botón para hacerlo a mano.
 */

const path = require('path');
const fs = require('fs');

/** Los primeros minutos de la app abierta: todavía no se está atendiendo a nadie. */
const AL_ABRIR_S = 3 * 60;
/** Sin teclado ni mouse este rato: nadie está usando la PC. */
const SIN_USAR_S = 20 * 60;
/** Cuántas veces se intenta instalar sola la misma versión. */
const MAX_INTENTOS = 2;
/** Cada cuánto se mira si ya es un buen momento. */
const CADA_MS = 60 * 1000;

/**
 * ¿Es un buen momento para instalar? La regla, sola, para poder probarla.
 * @returns {'al-abrir'|'sin-usar'|null}
 */
function convieneInstalar({ segundosAbierta, segundosSinUsar }) {
    if (segundosAbierta <= AL_ABRIR_S) return 'al-abrir';
    if (segundosSinUsar >= SIN_USAR_S) return 'sin-usar';
    return null;
}

/**
 * @param {object} o
 * @param {{getSystemIdleTime: () => number}} o.powerMonitor  el de Electron
 * @param {() => void} o.instalar   quitAndInstall silencioso
 * @param {string} o.carpeta        userData: dónde anotar los intentos
 * @param {number} o.arrancoEn      cuándo abrió la app (ms)
 */
function crearInstaladorSolo({
    powerMonitor, instalar, carpeta, arrancoEn,
    ahora = () => Date.now(), programar = setInterval, cancelar = clearInterval,
    leer = fs.readFileSync, escribir = fs.writeFileSync, avisar = () => {},
}) {
    const archivo = path.join(carpeta, 'instalacion-automatica.json');
    let pendiente = null;
    let timer = null;
    let instalando = false;

    const intentosDe = (version) => {
        try {
            const d = JSON.parse(leer(archivo, 'utf8'));
            return d && d.version === version ? Number(d.intentos) || 0 : 0;
        } catch { return 0; }
    };
    const anotarIntento = (version) => {
        try {
            escribir(archivo, JSON.stringify({ version, intentos: intentosDe(version) + 1, cuando: new Date(ahora()).toISOString() }));
        } catch { /* sin disco: igual se intenta una vez */ }
    };

    function revisar() {
        if (!pendiente || instalando) return;
        if (intentosDe(pendiente) >= MAX_INTENTOS) {
            // Ya se intentó y la app sigue en la versión vieja: algo la frena. Queda el botón.
            cancelar(timer);
            timer = null;
            return;
        }
        let sinUsar = 0;
        try { sinUsar = powerMonitor.getSystemIdleTime(); } catch { sinUsar = 0; }
        const motivo = convieneInstalar({ segundosAbierta: (ahora() - arrancoEn) / 1000, segundosSinUsar: sinUsar });
        if (!motivo) return;

        instalando = true;
        anotarIntento(pendiente);
        cancelar(timer);
        timer = null;
        avisar(`Instalando la versión ${pendiente} sola (${motivo}).`);
        instalar();
    }

    return {
        /** Hay una versión descargada y lista. */
        listo(version) {
            pendiente = version;
            revisar();
            if (!instalando && !timer && intentosDe(version) < MAX_INTENTOS) timer = programar(revisar, CADA_MS);
        },
    };
}

module.exports = { crearInstaladorSolo, convieneInstalar, AL_ABRIR_S, SIN_USAR_S, MAX_INTENTOS };
