package com.veltronik.v2.fiscal.services;

import com.veltronik.v2.fiscal.entities.FiscalCondicionIva;
import com.veltronik.v2.fiscal.entities.FiscalVoucherType;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/** Tests de la derivación del tipo de comprobante. */
class VoucherTypeResolverTest {

    private final VoucherTypeResolver resolver = new VoucherTypeResolver();

    @Test
    @DisplayName("Monotributo siempre emite Factura C")
    void monotributoEmiteC() {
        assertEquals(FiscalVoucherType.FACTURA_C, resolver.resolve(FiscalCondicionIva.MONOTRIBUTO, false));
        assertEquals(FiscalVoucherType.FACTURA_C, resolver.resolve(FiscalCondicionIva.MONOTRIBUTO, true));
    }

    @Test
    @DisplayName("Exento emite Factura C")
    void exentoEmiteC() {
        assertEquals(FiscalVoucherType.FACTURA_C, resolver.resolve(FiscalCondicionIva.EXENTO, false));
    }

    @Test
    @DisplayName("RI a Responsable Inscripto → Factura A")
    void riAResponsableEmiteA() {
        assertEquals(FiscalVoucherType.FACTURA_A, resolver.resolve(FiscalCondicionIva.RESPONSABLE_INSCRIPTO, true));
    }

    @Test
    @DisplayName("RI a consumidor final → Factura B")
    void riAConsumidorFinalEmiteB() {
        assertEquals(FiscalVoucherType.FACTURA_B, resolver.resolve(FiscalCondicionIva.RESPONSABLE_INSCRIPTO, false));
    }

    @Test
    @DisplayName("emisor null → error")
    void emisorNullFalla() {
        assertThrows(IllegalArgumentException.class, () -> resolver.resolve(null, false));
    }
}
