package com.veltronik.v2.fiscal;

/**
 * <b>Fachada interna</b> del módulo fiscal (regla del Codex §5.3): el único punto de entrada para
 * que otra vertical emita comprobantes. Kiosk (y mañana gym/courts) dependen SOLO de esta interfaz,
 * nunca de los repos ni del cliente ARCA → módulos desacoplados.
 */
public interface FiscalFacade {

    /**
     * Emite un comprobante para el origen dado. NUNCA propaga fallas de ARCA: si ARCA no responde,
     * el comprobante queda en CONTINGENCY y el cron lo reintenta (la venta nunca se frena).
     * Idempotente por origen: si ya se emitió un comprobante autorizado para ese {@code sourceId},
     * lo devuelve en vez de duplicar.
     */
    FiscalEmissionResult emitir(FiscalEmissionRequest request);
}
