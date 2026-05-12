package com.veltronik.v2.core.mappers;

import com.veltronik.v2.core.dto.TenantDTO;
import com.veltronik.v2.core.entities.Tenant;
import javax.annotation.processing.Generated;
import org.springframework.stereotype.Component;

@Generated(
    value = "org.mapstruct.ap.MappingProcessor",
    date = "2026-05-12T16:09:12-0300",
    comments = "version: 1.5.5.Final, compiler: Eclipse JDT (IDE) 3.46.0.v20260407-0427, environment: Java 21.0.10 (Eclipse Adoptium)"
)
@Component
public class TenantMapperImpl implements TenantMapper {

    @Override
    public TenantDTO toDto(Tenant entity) {
        if ( entity == null ) {
            return null;
        }

        TenantDTO tenantDTO = new TenantDTO();

        tenantDTO.setActive( entity.isActive() );
        tenantDTO.setBusinessType( entity.getBusinessType() );
        tenantDTO.setCreatedAt( entity.getCreatedAt() );
        tenantDTO.setId( entity.getId() );
        tenantDTO.setName( entity.getName() );
        tenantDTO.setUpdatedAt( entity.getUpdatedAt() );

        return tenantDTO;
    }

    @Override
    public Tenant toEntity(TenantDTO dto) {
        if ( dto == null ) {
            return null;
        }

        Tenant tenant = new Tenant();

        tenant.setCreatedAt( dto.getCreatedAt() );
        tenant.setId( dto.getId() );
        tenant.setUpdatedAt( dto.getUpdatedAt() );
        tenant.setActive( dto.isActive() );
        tenant.setBusinessType( dto.getBusinessType() );
        tenant.setName( dto.getName() );

        return tenant;
    }

    @Override
    public void updateEntityFromDto(TenantDTO dto, Tenant entity) {
        if ( dto == null ) {
            return;
        }

        entity.setCreatedAt( dto.getCreatedAt() );
        entity.setId( dto.getId() );
        entity.setUpdatedAt( dto.getUpdatedAt() );
        entity.setActive( dto.isActive() );
        entity.setBusinessType( dto.getBusinessType() );
        entity.setName( dto.getName() );
    }
}
