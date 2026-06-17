package com.veltronik.v2.kiosk.mappers;

import com.veltronik.v2.kiosk.dto.*;
import com.veltronik.v2.kiosk.entities.*;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;

import java.util.List;

/**
 * Mapper MapStruct del módulo Kiosco (entidad → DTO de salida). La ENTRADA usa los
 * {@code *InputDTO} aplicados a mano en los services/controllers (patch parcial, cierra
 * mass-assignment). Nunca expone el tenant. Mismo patrón que {@code CourtsMapper}.
 */
@Mapper(componentModel = "spring")
public interface KioskMapper {

    // ─── Rubros ───
    KioskCategoryDTO toDto(KioskCategory entity);
    List<KioskCategoryDTO> toCategoryDtoList(List<KioskCategory> entities);

    // ─── Productos ───
    @Mapping(target = "categoryId", source = "category.id")
    @Mapping(target = "categoryName", source = "category.name")
    @Mapping(target = "lowStock", expression = "java(!entity.isService() "
            + "&& entity.getStockQuantity() != null && entity.getMinStock() != null "
            + "&& entity.getStockQuantity().compareTo(entity.getMinStock()) <= 0)")
    KioskProductDTO toDto(KioskProduct entity);
    List<KioskProductDTO> toProductDtoList(List<KioskProduct> entities);

    // ─── Movimientos de stock ───
    @Mapping(target = "productId", source = "product.id")
    @Mapping(target = "productName", source = "product.name")
    KioskStockMovementDTO toDto(KioskStockMovement entity);
    List<KioskStockMovementDTO> toMovementDtoList(List<KioskStockMovement> entities);

    // ─── Caja ───
    KioskCashSessionDTO toDto(KioskCashSession entity);
    List<KioskCashSessionDTO> toCashSessionDtoList(List<KioskCashSession> entities);

    // ─── Ventas (agregado) ───
    @Mapping(target = "cashSessionId", source = "cashSession.id")
    KioskSaleDTO toDto(KioskSale entity);
    List<KioskSaleDTO> toSaleDtoList(List<KioskSale> entities);

    @Mapping(target = "productId", source = "product.id")
    @Mapping(target = "productName", source = "productNameSnapshot")
    @Mapping(target = "unitPrice", source = "unitPriceSnapshot")
    @Mapping(target = "ivaRate", source = "ivaRateSnapshot")
    KioskSaleItemDTO toDto(KioskSaleItem entity);

    KioskSalePaymentDTO toDto(KioskSalePayment entity);

    // ─── Configuración ───
    KioskSettingsDTO toDto(KioskSettings entity);
}
