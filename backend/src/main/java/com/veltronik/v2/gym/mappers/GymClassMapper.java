package com.veltronik.v2.gym.mappers;

import com.veltronik.v2.gym.dto.GymClassDTO;
import com.veltronik.v2.gym.entities.GymClass;
import org.mapstruct.Mapper;

import java.util.List;

/**
 * Mapper MapStruct entre {@link GymClass} y {@link GymClassDTO}.
 *
 * <p>Mapea por nombre de propiedad (incluido {@code active}, que en ambos lados resuelve a la
 * propiedad booleana "active"). No expone campos internos (tenant). Genera la implementación
 * en tiempo de compilación; Spring la inyecta por {@code componentModel = "spring"}.</p>
 */
@Mapper(componentModel = "spring")
public interface GymClassMapper {

    GymClassDTO toDto(GymClass entity);

    List<GymClassDTO> toDtoList(List<GymClass> entities);
}
