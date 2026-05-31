package com.veltronik.v2.gym.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Contrato de salida para los pagos del gimnasio.
 *
 * Es la ÚNICA forma en que un pago viaja al frontend (Mandamiento #5: nunca se
 * expone la entidad JPA cruda). Incluye el socio anidado como {@link GymMemberSummaryDTO}
 * resuelto en el backend, de modo que la vista solo dibuja: el "Socio eliminado"
 * desaparece porque el contrato garantiza el objeto `member` cuando existe.
 *
 * Los nombres de campo replican exactamente lo que consume el controller de React
 * (usePaymentController) para no requerir cambios en el frontend.
 */
@Data
public class GymPaymentDTO {
    private UUID id;
    private BigDecimal amount;
    private LocalDateTime paymentDate;
    private String paymentMethod;
    private String status;
    private String notes;
    private LocalDateTime periodStart;
    private LocalDateTime periodEnd;

    /** Socio asociado al pago. Es null para ventas sueltas (sin socio). */
    private GymMemberSummaryDTO member;
}
