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

    /** Arancel cobrado, si el cobro pasó por el catálogo. */
    private GymPlanDTO plan;

    /**
     * Historia importada de otro sistema (ADR-014): suma en los ingresos pero no corrió
     * vencimientos ni entró a la caja. La pantalla lo marca para que no se confunda con un
     * cobro hecho acá.
     */
    private boolean importado;

    /**
     * El período ESTIMADO de un cobro importado (V87), para la columna Período de Pagos. Un
     * cobro de Veltronik no lo tiene: el suyo es periodStart/periodEnd, y es de verdad.
     */
    private java.time.LocalDate periodoImportadoDesde;
    private java.time.LocalDate periodoImportadoHasta;
}
