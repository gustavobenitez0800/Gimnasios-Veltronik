package com.veltronik.v2.kiosk.events;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * Evento de dominio: se registró una venta. Lo publica {@code KioskSaleService} y lo escuchan,
 * desacoplados, los interesados (hoy: la facturación ARCA). El evento lleva el {@code tenantId}
 * porque el listener corre en otro hilo (async), donde el ThreadLocal de tenant no se propaga solo.
 */
public record KioskSaleCompletedEvent(UUID tenantId, UUID saleId, BigDecimal total) {}
