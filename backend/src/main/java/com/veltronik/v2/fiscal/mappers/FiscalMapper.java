package com.veltronik.v2.fiscal.mappers;

import com.veltronik.v2.fiscal.dto.FiscalConfigDTO;
import com.veltronik.v2.fiscal.dto.FiscalVoucherDTO;
import com.veltronik.v2.fiscal.entities.FiscalConfig;
import com.veltronik.v2.fiscal.entities.FiscalVoucher;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;

import java.util.List;

/**
 * Mapper MapStruct del módulo fiscal. Nunca expone el certificado/clave (solo un booleano
 * {@code certificateLoaded}). Enums → String automáticos.
 */
@Mapper(componentModel = "spring")
public interface FiscalMapper {

    @Mapping(target = "certificateLoaded",
            expression = "java(entity.getCertificateEnc() != null && entity.getPrivateKeyEnc() != null)")
    @Mapping(target = "keyLoaded", expression = "java(entity.getPrivateKeyEnc() != null)")
    FiscalConfigDTO toDto(FiscalConfig entity);

    FiscalVoucherDTO toDto(FiscalVoucher entity);

    List<FiscalVoucherDTO> toVoucherDtoList(List<FiscalVoucher> entities);
}
