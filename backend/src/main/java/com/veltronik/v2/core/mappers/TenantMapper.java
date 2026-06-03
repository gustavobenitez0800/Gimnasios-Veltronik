package com.veltronik.v2.core.mappers;

import com.veltronik.v2.core.dto.TenantDTO;
import com.veltronik.v2.core.entities.Tenant;
import org.mapstruct.Mapper;
import org.mapstruct.MappingTarget;

/**
 * Mapper automático entre {@link Tenant} y {@link TenantDTO}.
 *
 * MapStruct genera la implementación en tiempo de compilación,
 * eliminando la necesidad de escribir getters/setters de conversión
 * a mano. Spring lo inyecta como un {@code @Component} gracias a
 * {@code componentModel = "spring"}.
 */
@Mapper(componentModel = "spring")
public interface TenantMapper {

    /** Convierte una entidad Tenant a su DTO para enviar al frontend. */
    @org.mapstruct.Mapping(target = "type", source = "businessType")
    @org.mapstruct.Mapping(target = "role", ignore = true)
    TenantDTO toDto(Tenant entity);

    /** Convierte un DTO recibido del frontend a una entidad Tenant. */
    @org.mapstruct.Mapping(target = "businessType", source = "businessType")
    Tenant toEntity(TenantDTO dto);

    /** Actualiza una entidad existente con los datos del DTO (para PUT). */
    void updateEntityFromDto(TenantDTO dto, @MappingTarget Tenant entity);
}
