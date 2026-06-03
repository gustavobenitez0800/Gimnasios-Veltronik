package com.veltronik.v2.gym.mappers;

import com.veltronik.v2.gym.dto.AccessLogDTO;
import com.veltronik.v2.gym.dto.GymMemberSummaryDTO;
import com.veltronik.v2.gym.entities.AccessLog;
import com.veltronik.v2.gym.entities.GymMember;
import org.mapstruct.Mapper;

import java.util.List;

/**
 * Mapper MapStruct entre {@link AccessLog} y {@link AccessLogDTO}.
 *
 * <p>El socio se mapea a {@link GymMemberSummaryDTO} (asociación EAGER, ya cargada
 * dentro de la transacción del servicio → seguro con {@code open-in-view=false}).</p>
 */
@Mapper(componentModel = "spring")
public interface AccessLogMapper {

    AccessLogDTO toDto(AccessLog entity);

    List<AccessLogDTO> toDtoList(List<AccessLog> entities);

    GymMemberSummaryDTO toMemberSummary(GymMember member);
}
