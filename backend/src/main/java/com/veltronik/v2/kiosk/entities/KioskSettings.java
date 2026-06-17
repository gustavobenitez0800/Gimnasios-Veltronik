package com.veltronik.v2.kiosk.entities;

import com.veltronik.v2.core.entities.TenantAwareEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;

/**
 * Configuración del vertical Kiosco. UNA fila por tenant (se crea lazy con defaults al
 * primer acceso, igual que {@code CourtSettings}).
 *
 * <p>Acá vive la diferencia entre un kiosco y otro: recargo por tarjeta, si maneja fiado,
 * si emite factura ARCA automática. Cero código nuevo para variar de negocio.</p>
 */
@Entity
@Table(name = "kiosk_settings", uniqueConstraints = {
        @UniqueConstraint(name = "ux_kiosk_settings_tenant", columnNames = {"tenant_id"})
})
@Getter
@Setter
public class KioskSettings extends TenantAwareEntity {

    /** Recargo porcentual por pago con tarjeta. La lógica de aplicación llega en Fase 2. */
    @Column(name = "card_surcharge_pct", nullable = false)
    private BigDecimal cardSurchargePct = BigDecimal.ZERO;

    /** Habilita la venta a cuenta corriente (fiado). Fase 2. */
    @Column(name = "allow_fiado", nullable = false)
    private boolean allowFiado = false;

    /** Emitir comprobante ARCA automáticamente al cerrar la venta. Fase 3. */
    @Column(name = "auto_invoice", nullable = false)
    private boolean autoInvoice = false;

    /** Mostrar alertas cuando un producto baja de {@code minStock}. */
    @Column(name = "low_stock_alert", nullable = false)
    private boolean lowStockAlert = true;
}
