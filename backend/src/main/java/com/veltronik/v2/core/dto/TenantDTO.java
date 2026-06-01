package com.veltronik.v2.core.dto;

import com.veltronik.v2.core.entities.BusinessType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * DTO para la entidad Tenant.
 *
 * Este es el objeto que viaja entre el frontend y el backend.
 * Nunca se envía la entidad {@code @Entity} directamente por red
 * (Regla 4.2 del Codex).
 */
@Data
public class TenantDTO {

    private UUID id;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    @NotBlank(message = "El nombre del negocio es obligatorio")
    private String name;

    @NotNull(message = "El tipo de negocio es obligatorio")
    private BusinessType businessType;

    private String address;
    private String phone;
    private String email;
    private String logoUrl;
    private LocalDateTime trialEndsAt;
    private boolean isActive;
    
    // Propiedades adicionales para compatibilidad con el frontend
    private String role;
    private String type;

    /** Grupo al que pertenece la sucursal (null = "Sin grupo"). Para agrupar en el lobby. */
    private UUID groupId;
}
