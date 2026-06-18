package com.veltronik.v2.kiosk.entities;

import com.veltronik.v2.core.entities.TenantAwareEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.BatchSize;

import java.math.BigDecimal;

/**
 * Cliente de cuenta corriente (fiado).
 *
 * <p>{@code balance} = cuánto DEBE. Es un cache: la verdad es la suma firmada de
 * {@link KioskAccountMovement}. Se actualiza con un UPDATE atómico (no read-modify-write).
 * {@code @BatchSize}: al listar ventas con cliente, carga los clientes en lotes (evita N+1).</p>
 */
@Entity
@Table(name = "kiosk_customer")
@Getter
@Setter
@BatchSize(size = 64)
public class KioskCustomer extends TenantAwareEntity {

    @Column(name = "full_name", nullable = false)
    private String fullName;

    @Column(length = 30)
    private String phone;

    /** DNI o CUIT: para identificar al receptor en una factura grande (§ fiscal). */
    @Column(name = "dni_cuit", length = 20)
    private String dniCuit;

    /** Límite de fiado. 0 = sin límite. Si > 0, la venta a cuenta corriente que lo supere se bloquea. */
    @Column(name = "credit_limit", nullable = false)
    private BigDecimal creditLimit = BigDecimal.ZERO;

    /** Deuda actual (cache). La verdad es Σ {@link KioskAccountMovement}. */
    @Column(nullable = false)
    private BigDecimal balance = BigDecimal.ZERO;

    @Column(name = "is_active", nullable = false)
    private boolean active = true;
}
