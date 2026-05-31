package com.veltronik.v2.gym.mappers;

import com.veltronik.v2.gym.dto.GymMemberSummaryDTO;
import com.veltronik.v2.gym.dto.GymPaymentDTO;
import com.veltronik.v2.gym.entities.GymMember;
import com.veltronik.v2.gym.entities.GymPayment;
import org.mapstruct.Mapper;

import java.util.List;

/**
 * Mapper automático entre la entidad {@link GymPayment} y su {@link GymPaymentDTO}.
 *
 * MapStruct genera la implementación en tiempo de compilación. El socio se mapea
 * a un {@link GymMemberSummaryDTO} liviano mediante {@link #toMemberSummary}; si el
 * pago no tiene socio (venta suelta), MapStruct devuelve null automáticamente.
 *
 * <p>El mapeo lee la asociación {@code member} (EAGER) que ya quedó cargada dentro
 * de la transacción del servicio, por lo que es seguro con {@code open-in-view=false}.</p>
 */
@Mapper(componentModel = "spring")
public interface GymPaymentMapper {

    GymPaymentDTO toDto(GymPayment entity);

    List<GymPaymentDTO> toDtoList(List<GymPayment> entities);

    GymMemberSummaryDTO toMemberSummary(GymMember member);
}
