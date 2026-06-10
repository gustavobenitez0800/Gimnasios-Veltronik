package com.veltronik.v2.courts.entities;

import com.veltronik.v2.core.entities.TenantAwareEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.Getter;
import lombok.Setter;

/**
 * Cliente del complejo (el que reserva la cancha).
 *
 * <p><b>El teléfono es LA identidad:</b> en la Fase 3 el bot de WhatsApp matchea al
 * cliente por su número (normalizado). Por eso se captura desde el día 1 y es único
 * por tenant. {@code noShowCount} alimenta la futura lista de no-presentados.</p>
 */
@Entity
@Table(name = "court_customer", uniqueConstraints = {
        @UniqueConstraint(name = "ux_court_customer_phone", columnNames = {"tenant_id", "phone"})
})
@Getter
@Setter
public class CourtCustomer extends TenantAwareEntity {

    @Column(name = "full_name", nullable = false)
    private String fullName;

    /** Normalizado por {@code CourtCustomerService.normalizePhone} (solo dígitos y '+' inicial). */
    @Column(nullable = false, length = 30)
    private String phone;

    @Column(length = 150)
    private String email;

    @Column(columnDefinition = "text")
    private String notes;

    /** Cantidad de turnos confirmados a los que no se presentó. */
    @Column(name = "no_show_count", nullable = false)
    private int noShowCount = 0;
}
