package com.veltronik.v2.gym.entities;

import com.veltronik.v2.core.entities.TenantAwareEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * Un cobro YA CERRADO que se corrigió o se anuló, y en qué cierre entró la diferencia (V88).
 *
 * <p><b>Por qué existe.</b> Un cierre queda congelado: el del martes dice lo que se vio el
 * martes, aunque el miércoles alguien corrija un cobro del martes. Antes de la V88 esa
 * corrección no entraba en ningún cierre: si el cobro bajaba de $48.000 a $40.000, los $8.000
 * no aparecían en ningún lado. Ahora el cierre del miércoles la toma —a la vista, como
 * corrección— y este renglón dice cuál fue: lo que había contado el cierre anterior y lo que
 * vale ahora. La diferencia es {@code despues - antes}, por forma de pago.</p>
 *
 * <p>Sin relación JPA con el cobro, igual que {@link GymPaymentAjuste}: la prueba de una
 * corrección no se puede ir con el cobro.</p>
 */
@Entity
@Table(name = "caja_cierre_ajuste")
@Getter
@Setter
public class CajaCierreAjuste extends TenantAwareEntity {

    /** El cierre en el que entró la diferencia (no el que había contado el cobro). */
    @Column(name = "cierre_id", nullable = false)
    private UUID cierreId;

    @Column(name = "payment_id", nullable = false)
    private UUID paymentId;

    /** Lo que había contado el cierre anterior. */
    @Column(name = "metodo_antes", nullable = false, length = 20)
    private String metodoAntes;

    @Column(name = "monto_antes", nullable = false)
    private BigDecimal montoAntes;

    /** Lo que vale ahora. Un cobro anulado vale cero, con su mismo método. */
    @Column(name = "metodo_despues", nullable = false, length = 20)
    private String metodoDespues;

    @Column(name = "monto_despues", nullable = false)
    private BigDecimal montoDespues;
}
