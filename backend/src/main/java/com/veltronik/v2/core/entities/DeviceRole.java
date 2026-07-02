package com.veltronik.v2.core.entities;

/**
 * Rol de un equipo enrolado (Fase 1, ladrillo 2).
 *
 * <p>En la Fase 1 de una sola caja, la CAJA es también su propio ENCARGADO — el rol
 * ENCARGADO ("Caja Madre") cobra pleno sentido con multi-caja (Fase 3), pero la
 * integridad "un encargado activo por sucursal" se aplica desde ya (ADR-002).</p>
 */
public enum DeviceRole {
    /** Terminal de venta / recepción. */
    CAJA,
    /** La "Caja Madre" del local: cerebro local y árbitro de stock (V3). */
    ENCARGADO
}
