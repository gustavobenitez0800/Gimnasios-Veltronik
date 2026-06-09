package com.veltronik.v2.gym.mappers;

import com.veltronik.v2.gym.dto.GymBookingDTO;
import com.veltronik.v2.gym.dto.GymMemberSummaryDTO;
import com.veltronik.v2.gym.entities.GymBooking;
import com.veltronik.v2.gym.entities.GymMember;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;

import java.util.List;

/**
 * Mapper MapStruct entre {@link GymBooking} y {@link GymBookingDTO}.
 *
 * <p>El socio se mapea a {@link GymMemberSummaryDTO} y de la clase solo viajan id y
 * nombre (asociaciones EAGER, ya cargadas dentro de la transacción del servicio →
 * seguro con {@code open-in-view=false}).</p>
 */
@Mapper(componentModel = "spring")
public interface GymBookingMapper {

    @Mapping(target = "classId", source = "gymClass.id")
    @Mapping(target = "className", source = "gymClass.name")
    GymBookingDTO toDto(GymBooking entity);

    List<GymBookingDTO> toDtoList(List<GymBooking> entities);

    GymMemberSummaryDTO toMemberSummary(GymMember member);
}
