package com.veltronik.v2.gym.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Contrato de ENTRADA para crear/editar un pago.
 *
 * <p>Cierra el mass-assignment: el controller ya NO recibe la entidad {@code GymPayment}
 * cruda. El socio se referencia por {@code member_id} (snake_case, como ya lo envía el
 * frontend); el {@code GymPaymentService} resuelve y verifica que el socio pertenezca al
 * tenant. El front NO requiere cambios.</p>
 */
@Data
public class GymPaymentInputDTO {
    private BigDecimal amount;
    private LocalDateTime paymentDate;
    private String paymentMethod;
    private String status;
    private String notes;
    private LocalDateTime periodStart;
    private LocalDateTime periodEnd;

    /** Socio asociado. El frontend lo manda como {@code member_id}. */
    @JsonProperty("member_id")
    private UUID memberId;
}
