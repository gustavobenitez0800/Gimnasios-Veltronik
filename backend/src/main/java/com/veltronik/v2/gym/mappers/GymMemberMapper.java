package com.veltronik.v2.gym.mappers;

import com.veltronik.v2.gym.dto.GymMemberDTO;
import com.veltronik.v2.gym.entities.GymMember;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;

import java.util.List;

/**
 * Mapper automático entre la entidad {@link GymMember} y su {@link GymMemberDTO}.
 *
 * Genera la implementación en compilación (MapStruct). Mapea `dni` desde `document`
 * por compatibilidad con el frontend legacy; el resto de los campos se mapean por
 * nombre. NO expone campos internos como tenant o userId.
 */
@Mapper(componentModel = "spring")
public interface GymMemberMapper {

    @Mapping(target = "dni", source = "document")
    @Mapping(target = "fullName", expression = "java(buildFullName(entity))")
    GymMemberDTO toDto(GymMember entity);

    List<GymMemberDTO> toDtoList(List<GymMember> entities);

    /** Nombre para mostrar: "Nombre Apellido", tolerante a nulos. */
    default String buildFullName(GymMember entity) {
        String fn = entity.getFirstName() != null ? entity.getFirstName() : "";
        String ln = entity.getLastName() != null ? entity.getLastName() : "";
        return (fn + " " + ln).trim();
    }
}
