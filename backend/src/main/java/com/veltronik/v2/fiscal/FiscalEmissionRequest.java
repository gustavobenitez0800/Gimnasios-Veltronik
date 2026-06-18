package com.veltronik.v2.fiscal;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

/**
 * Pedido de emisión de un comprobante. <b>Contrato público del módulo fiscal</b>: lo arma la
 * vertical que factura (kiosk hoy) sin conocer las entidades JPA de fiscal — bajo acoplamiento.
 *
 * <p>El origen es genérico ({@code sourceType}+{@code sourceId}); el módulo fiscal no sabe qué es
 * una venta de kiosco.</p>
 */
public record FiscalEmissionRequest(
        String sourceType,
        UUID sourceId,
        BigDecimal totalAmount,
        int receptorCondicionIvaId,   // 1=Resp. Inscripto, 5=Consumidor Final, ...
        int receptorDocTipo,          // 80=CUIT, 96=DNI, 99=consumidor final
        long receptorDocNro,
        List<FiscalLineItem> items
) {
    /** Atajo para el caso típico del kiosco: venta a consumidor final sin identificar. */
    public static FiscalEmissionRequest consumidorFinal(String sourceType, UUID sourceId,
                                                        BigDecimal total, List<FiscalLineItem> items) {
        return new FiscalEmissionRequest(sourceType, sourceId, total, 5, 99, 0L, items);
    }
}
