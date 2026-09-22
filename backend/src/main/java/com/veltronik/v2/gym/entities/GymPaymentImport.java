package com.veltronik.v2.gym.entities;

import com.veltronik.v2.core.entities.TenantAwareEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Una importación de historial de caja de otro sistema (V86, ADR-014).
 *
 * <p>Los cobros y gastos que creó la apuntan con {@code import_id}. Existe para dos cosas:
 * marcar esos movimientos como historia —que la caja y la cobertura ignoran— y poder
 * deshacer la importación entera si se subió el archivo equivocado.</p>
 */
@Entity
@Table(name = "gym_payment_import")
@Getter
@Setter
public class GymPaymentImport extends TenantAwareEntity {

    @Column(length = 255)
    private String archivo;

    @Column(name = "importado_por")
    private UUID importadoPor;

    @Column(nullable = false)
    private int cobros;

    @Column(nullable = false)
    private int gastos;

    @Column(name = "total_cobros", nullable = false)
    private BigDecimal totalCobros = BigDecimal.ZERO;

    @Column(name = "total_gastos", nullable = false)
    private BigDecimal totalGastos = BigDecimal.ZERO;

    private LocalDateTime desde;

    private LocalDateTime hasta;

    @Column(name = "aplicada_at", nullable = false)
    private LocalDateTime aplicadaAt;

    @Column(name = "deshecha_at")
    private LocalDateTime deshechaAt;

    /** Cuándo se reconstruyeron los períodos de sus cobros (V87). NULL = pendiente. */
    @Column(name = "periodos_at", insertable = false, updatable = false)
    private LocalDateTime periodosAt;

    @Column(name = "deshecha_por")
    private UUID deshechaPor;

    public boolean estaDeshecha() {
        return deshechaAt != null;
    }
}
