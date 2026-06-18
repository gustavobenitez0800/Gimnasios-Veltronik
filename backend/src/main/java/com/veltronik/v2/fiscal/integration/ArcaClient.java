package com.veltronik.v2.fiscal.integration;

/**
 * <b>Port</b> hacia ARCA (facturación electrónica). El orquestador ({@code FiscalService})
 * depende SOLO de esta interfaz, no de SOAP ni de cómo se firma el CMS — bajo acoplamiento.
 *
 * <p>La implementación nativa es {@link ArcaSoapClient} (WSAA + WSFEv1). Si algún día se quisiera
 * un proveedor distinto (ej. un SDK de terceros), se cambia el adaptador sin tocar el dominio.</p>
 */
public interface ArcaClient {

    /**
     * Último número autorizado para (punto de venta, tipo de comprobante).
     * El siguiente comprobante usa este valor + 1. ARCA es la fuente de verdad del numerador.
     */
    long getLastAuthorizedNumber(FiscalCredentials credentials, int pointOfSale, int voucherTypeCode);

    /** Solicita el CAE de un comprobante. Devuelve aprobado (con CAE) o rechazado (con motivo). */
    CaeResult requestCae(FiscalCredentials credentials, CaeRequest request);
}
