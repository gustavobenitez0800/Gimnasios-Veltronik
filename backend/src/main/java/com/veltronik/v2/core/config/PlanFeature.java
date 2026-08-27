package com.veltronik.v2.core.config;

/**
 * Lo que un plan puede habilitar o no.
 *
 * <p><b>Qué NO va acá.</b> Solo entran las funciones que son un servicio extra reconocible.
 * Que el mostrador siga funcionando sin internet <b>no está en esta lista a propósito</b>:
 * es piso del producto, no plan. Un gimnasio al que se le corta la conexión y no puede cobrar
 * no concluye "me falta un plan", concluye "el sistema falló" — y esa lectura se paga con el
 * cliente, no con una venta.</p>
 *
 * <p>El control de acceso sí se entiende solo como extra: viene con hardware que el gimnasio
 * está comprando igual.</p>
 */
public enum PlanFeature {

    /** Molinetes, lectores y puertas: el sistema decide quién pasa. */
    CONTROL_DE_ACCESO
}
