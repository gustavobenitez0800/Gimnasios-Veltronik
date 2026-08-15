package com.veltronik.v2.core.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * DTO para la entidad Tenant (un gimnasio / sucursal).
 *
 * Este es el objeto que viaja entre el frontend y el backend.
 * Nunca se envía la entidad {@code @Entity} directamente por red
 * (Regla 4.2 del Codex).
 *
 * <p><b>Ya no viaja el tipo de negocio.</b> Este DTO tenía un
 * {@code @NotNull BusinessType businessType} y un {@code String type} espejo, y el
 * navegador estaba obligado a mandar los dos en cada alta y en cada guardado. Con un
 * único rubro eso era, además de ceremonia, un dato de dominio delegado al cliente:
 * si el front se olvidaba del campo, guardar Ajustes moría con un 400. Hoy el tipo lo
 * decide el servidor al crear el gimnasio y nunca más se toca.</p>
 */
@Data
public class TenantDTO {

    private UUID id;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    @NotBlank(message = "El nombre del gimnasio es obligatorio")
    private String name;

    private String address;
    private String phone;
    private String email;

    /**
     * Logo del gimnasio como data URI (lo normaliza el navegador a un cuadrado de
     * 256px antes de mandarlo — ver lib/logo.js).
     *
     * <p>El tope de 200 KB no es decorativo: sin él, un PUT con una foto de 8 MB en
     * base64 entra en la fila del gimnasio y después viaja en CADA respuesta de
     * {@code /tenants/my}, que es lo primero que carga el lobby. Se valida en el
     * servidor y no solo en el navegador porque la validación del navegador es una
     * cortesía, no un límite.</p>
     */
    @Size(max = 200_000, message = "El logo es demasiado grande")
    private String logoUrl;

    /** Emoji elegido como identidad cuando el dueño no sube una imagen. */
    @Size(max = 16, message = "Ícono inválido")
    private String logoEmoji;

    private LocalDateTime trialEndsAt;
    private boolean isActive;

    /** Rol del usuario que pide la lista (lo completa el servicio, no el cliente). */
    private String role;

    /** Grupo al que pertenece la sucursal (null = "Sin grupo"). Para agrupar en el lobby. */
    private UUID groupId;
}
