package com.veltronik.v2.core.exceptions;

/**
 * La función pedida NO está incluida en el plan contratado. El gimnasio está autenticado, al
 * día y con acceso al sistema: lo único que no tiene es <em>esta</em> función.
 *
 * <p><b>Por qué existe esta clase y no se usa 402.</b> El 402 (Payment Required) lo emite el
 * {@code KillSwitchFilter} para una sola cosa: la sucursal está impaga y no puede operar. El
 * frontend lo trata como tal — cualquier 402 dispara el muro de cobro. Cuando el padrón del
 * molinete devolvía 402 por no ser premium, un gimnasio <b>al día</b> veía el muro de pago cada
 * vez que el escritorio sincronizaba el equipo: entraba, trabajaba un rato, y al primer pedido
 * del padrón le aparecía "Renová la suscripción". Con el premium apagado eso alcanzaba a
 * <b>todos</b> los clientes, porque todos resuelven a básico.</p>
 *
 * <p>Por eso se devuelve <b>403 con el código {@code FEATURE_NOT_IN_PLAN}</b>, siguiendo el
 * mismo patrón que {@code FORBIDDEN_TENANT} y {@code DEVICE_BOUND_TO_OTHER_TENANT}: el frontend
 * distingue el código y muestra "esta función es del plan premium" sin tocar el muro de cobro
 * ni el contexto de la sucursal.</p>
 *
 * <p><b>La regla:</b> 402 significa «no pagaste»; 403 significa «pagaste, pero esto no te
 * corresponde». Confundirlos le dice a un cliente al día que está en deuda.</p>
 */
public class FeatureNotInPlanException extends RuntimeException {

    /** El código que viaja en el campo {@code error} del cuerpo, para que el frontend lo lea. */
    public static final String CODIGO = "FEATURE_NOT_IN_PLAN";

    public FeatureNotInPlanException(String message) {
        super(message);
    }
}
