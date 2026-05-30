package com.veltronik.v2.core.mappers;

import com.veltronik.v2.core.dto.SubscriptionDTO;
import com.veltronik.v2.core.entities.Subscription;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.MappingTarget;

@Mapper(componentModel = "spring")
public interface SubscriptionMapper {

    @Mapping(target = "tenantId", source = "tenant.id")
    SubscriptionDTO toDto(Subscription entity);

    @Mapping(target = "tenant", ignore = true)
    @Mapping(target = "mpSubscriptionId", ignore = true)
    Subscription toEntity(SubscriptionDTO dto);

    @Mapping(target = "tenant", ignore = true)
    @Mapping(target = "mpSubscriptionId", ignore = true)
    void updateEntityFromDto(SubscriptionDTO dto, @MappingTarget Subscription entity);
}
