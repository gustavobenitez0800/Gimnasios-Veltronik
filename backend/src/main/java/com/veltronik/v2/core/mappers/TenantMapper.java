package com.veltronik.v2.core.mappers;

import com.veltronik.v2.core.dto.TenantDTO;
import com.veltronik.v2.core.entities.Tenant;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.MappingTarget;

/**
 * Mapper automático entre {@link Tenant} y {@link TenantDTO}.
 *
 * MapStruct genera la implementación en tiempo de compilación,
 * eliminando la necesidad de escribir getters/setters de conversión
 * a mano. Spring lo inyecta como un {@code @Component} gracias a
 * {@code componentModel = "spring"}.
 *
 * <p><b>SEGURIDAD (mass-assignment):</b> en la dirección DTO → entidad se ignoran
 * SIEMPRE los campos que gobiernan el acceso/facturación de la plataforma
 * ({@code trialEndsAt}, {@code active}) y los de identidad/auditoría ({@code id},
 * {@code createdAt}, {@code updatedAt}, {@code group}). Sin esto, un
 * {@code PUT /api/tenants/{id}} con {@code "trialEndsAt": "2099-..."} extendería el
 * período de prueba indefinidamente, anulando el Kill Switch. Esos campos solo los
 * escribe el backend (setup, billing, webhooks, grupos).</p>
 */
@Mapper(componentModel = "spring")
public interface TenantMapper {

    /** Convierte una entidad Tenant a su DTO para enviar al frontend. */
    @Mapping(target = "type", source = "businessType")
    @Mapping(target = "role", ignore = true)
    TenantDTO toDto(Tenant entity);

    /** Convierte un DTO recibido del frontend a una entidad Tenant (solo campos editables). */
    @Mapping(target = "id", ignore = true)
    @Mapping(target = "createdAt", ignore = true)
    @Mapping(target = "updatedAt", ignore = true)
    @Mapping(target = "trialEndsAt", ignore = true)
    @Mapping(target = "active", ignore = true)
    @Mapping(target = "group", ignore = true)
    Tenant toEntity(TenantDTO dto);

    /** Actualiza una entidad existente con el DTO del PUT (solo campos editables). */
    @Mapping(target = "id", ignore = true)
    @Mapping(target = "createdAt", ignore = true)
    @Mapping(target = "updatedAt", ignore = true)
    @Mapping(target = "trialEndsAt", ignore = true)
    @Mapping(target = "active", ignore = true)
    @Mapping(target = "group", ignore = true)
    void updateEntityFromDto(TenantDTO dto, @MappingTarget Tenant entity);
}
