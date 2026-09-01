package com.veltronik.v2.gym.entities;

import com.veltronik.v2.core.entities.TenantAwareEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.util.UUID;

/**
 * El rastro de un cobro que se tocó después de registrarse.
 *
 * <p><b>No impide nada: hace visible.</b> El arqueo de caja no sirve si un cobro se puede
 * modificar o borrar después sin que quede nada — se registra el pago para que el socio se
 * vaya contento, y más tarde se borra y la plata queda en el bolsillo. Peor todavía: borrar
 * un cobro no recalcula la cobertura, así que el socio sigue figurando al día y nunca
 * reclama.</p>
 *
 * <p>Solo se anotan los campos que mueven plata. Corregir una nota no es sospechoso, y
 * anotarlo sería ruido que hace ignorar la lista entera.</p>
 */
@Entity
@Table(name = "gym_payment_ajuste")
@Getter
@Setter
public class GymPaymentAjuste extends TenantAwareEntity {

    /**
     * A qué cobro le pasó.
     *
     * <p>Sin relación JPA a propósito: el rastro de un borrado tiene que sobrevivir al cobro
     * borrado. Una FK en cascada se llevaría puesta justamente la prueba de que se borró.</p>
     */
    @Column(name = "payment_id", nullable = false)
    private UUID paymentId;

    /** {@code EDICION} o {@code BORRADO}. */
    @Column(nullable = false, length = 20)
    private String tipo;

    /** Qué cambió. En un borrado queda en {@code null}. */
    @Column(length = 40)
    private String campo;

    /** El valor anterior. En un borrado, el resumen del cobro que se fue. */
    @Column(length = 255)
    private String antes;

    /** El valor nuevo. Vacío en un borrado. */
    @Column(length = 255)
    private String despues;

    /** El nombre de quien lo hizo, congelado: si se da de baja, el rastro lo sigue diciendo. */
    @Column(name = "hecho_por_nombre", length = 160)
    private String hechoPorNombre;

    public static final String EDICION = "EDICION";
    public static final String BORRADO = "BORRADO";
}
