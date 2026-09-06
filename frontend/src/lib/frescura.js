// ============================================
// VELTRONIK - CUÁN VIEJA ES LA COPIA LOCAL
// ============================================
// La decisión del dueño (2026-09-06), escrita como código.
//
// ⭐ EL PLAZO NO ES UN INTERRUPTOR: ES CUÁNDO CAMBIA EL CARTEL
// La copia local vale 30 días, y al cumplirse NO se apaga nada. Un gimnasio cuya cooperativa
// de internet tarda un fin de semana largo en arreglar una línea tiene que poder seguir
// atendiendo; frenar la entrada de un socio porque hace ocho días que no hablamos con la
// nube sería convertir un problema del proveedor en un problema del negocio. La prioridad
// es que la caja y el molinete no paren nunca.
//
// Lo único que cambia con el tiempo, entonces, es cuánto insiste el aviso:
//
//   fresca     → hasta 1 h. Discreto y gris. Casi nadie lo mira, y está bien.
//   vieja      → hasta 30 días. Ámbar: "sin conexión desde el <fecha>".
//   muy-vieja  → pasados los 30. Imposible de ignorar, y el veredicto pasa a nombrarse por
//                lo que es: "al día SEGÚN LOS DATOS del <fecha>". Sigue sin frenar a nadie.
//
// Vive acá y no adentro del componente para que se pueda probar sola —es una regla de
// negocio, no una pantalla— y para que el día que algo más necesite saber si la copia está
// vieja (el molinete, un cartel en otra pantalla) no la vuelva a escribir a su manera.

import { REFRESCO_MS } from './localMembers';

/** El plazo que decidió el dueño. No apaga nada: cambia el tono del aviso. */
export const ESPEJO_DIAS = 30;

const HORA_MS = 60 * 60 * 1000;
const DIA_MS = 24 * HORA_MS;

/**
 * En cuál de las tres bandas está la copia.
 *
 * @param {number|null} actualizado  cuándo se refrescó por última vez (epoch ms)
 * @param {number} ahora
 * @returns {'fresca'|'vieja'|'muy-vieja'}
 */
export function bandaDeFrescura(actualizado, ahora) {
    // No saber de cuándo es la copia NO es lo mismo que saber que es vieja. Pasa en el
    // primer arranque, antes del primer refresco, y ahí no hay nada que avisar.
    if (!actualizado) return 'fresca';

    const edad = ahora - actualizado;

    // El umbral discreto es el mayor entre "dos ciclos de refresco" y una hora. Dos ciclos
    // porque uno perdido puede ser una conexión con hipo; una hora porque un mostrador con
    // internet malo pierde ciclos toda la jornada, y un cartel de alarma encendido media
    // jornada deja de avisar.
    if (edad <= Math.max(REFRESCO_MS * 2, HORA_MS)) return 'fresca';

    // El borde va del lado permisivo, como todo lo demás en el mostrador: el día 30 exacto
    // todavía es "vieja", no "muy vieja".
    if (edad <= ESPEJO_DIAS * DIA_MS) return 'vieja';

    return 'muy-vieja';
}
