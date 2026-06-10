package com.veltronik.v2.courts.mappers;

import com.veltronik.v2.courts.dto.*;
import com.veltronik.v2.courts.entities.*;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;

import java.util.List;

/**
 * Mapper MapStruct del módulo de canchas (entidad → DTO de salida; la ENTRADA usa
 * los {@code *InputDTO} aplicados a mano en los controllers — patch parcial, cierra
 * el mass-assignment). Nunca expone el tenant.
 */
@Mapper(componentModel = "spring")
public interface CourtsMapper {

    CourtDTO toDto(Court entity);
    List<CourtDTO> toCourtDtoList(List<Court> entities);

    CourtCustomerDTO toDto(CourtCustomer entity);
    List<CourtCustomerDTO> toCustomerDtoList(List<CourtCustomer> entities);

    CourtSettingsDTO toDto(CourtSettings entity);

    @Mapping(target = "courtId", source = "court.id")
    @Mapping(target = "courtName", source = "court.name")
    CourtPriceRuleDTO toDto(CourtPriceRule entity);
    List<CourtPriceRuleDTO> toPriceRuleDtoList(List<CourtPriceRule> entities);

    @Mapping(target = "courtId", source = "court.id")
    @Mapping(target = "courtName", source = "court.name")
    @Mapping(target = "customerId", source = "customer.id")
    @Mapping(target = "customerName", source = "customer.fullName")
    @Mapping(target = "customerPhone", source = "customer.phone")
    @Mapping(target = "recurringId", source = "recurring.id")
    CourtBookingDTO toDto(CourtBooking entity);
    List<CourtBookingDTO> toBookingDtoList(List<CourtBooking> entities);

    @Mapping(target = "courtId", source = "court.id")
    @Mapping(target = "courtName", source = "court.name")
    @Mapping(target = "customerId", source = "customer.id")
    @Mapping(target = "customerName", source = "customer.fullName")
    @Mapping(target = "customerPhone", source = "customer.phone")
    CourtRecurringBookingDTO toDto(CourtRecurringBooking entity);
    List<CourtRecurringBookingDTO> toRecurringDtoList(List<CourtRecurringBooking> entities);
}
