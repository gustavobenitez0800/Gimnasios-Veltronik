package com.veltronik.v2.fiscal.services;

import com.veltronik.v2.fiscal.entities.FiscalCondicionIva;
import com.veltronik.v2.fiscal.entities.FiscalVoucherType;
import org.springframework.stereotype.Component;

/**
 * Determina el tipo de comprobante según la condición fiscal del EMISOR y del RECEPTOR.
 *
 * <ul>
 *   <li>Monotributo / Exento → <b>Factura C</b> (no discrimina IVA). El caso del kiosco.</li>
 *   <li>Responsable Inscripto → <b>Factura A</b> (a otro RI) o <b>Factura B</b> (a consumidor final).</li>
 * </ul>
 *
 * <p>Lógica de negocio pura y testeable, fuera del cliente ARCA (alta cohesión).</p>
 */
@Component
public class VoucherTypeResolver {

    /**
     * @param emisor condición frente al IVA de quien factura.
     * @param receptorResponsableInscripto true si el receptor es Responsable Inscripto (solo afecta a un emisor RI).
     */
    public FiscalVoucherType resolve(FiscalCondicionIva emisor, boolean receptorResponsableInscripto) {
        if (emisor == null) {
            throw new IllegalArgumentException("La condición frente al IVA del emisor es obligatoria");
        }
        return switch (emisor) {
            case MONOTRIBUTO, EXENTO -> FiscalVoucherType.FACTURA_C;
            case RESPONSABLE_INSCRIPTO ->
                    receptorResponsableInscripto ? FiscalVoucherType.FACTURA_A : FiscalVoucherType.FACTURA_B;
        };
    }
}
