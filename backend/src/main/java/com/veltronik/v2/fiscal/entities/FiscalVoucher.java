package com.veltronik.v2.fiscal.entities;

import com.veltronik.v2.core.entities.TenantAwareEntity;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.BatchSize;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Comprobante electrónico (factura / nota de crédito). Raíz de agregado: sus {@link FiscalVoucherItem}
 * se persisten en cascada (mapeo BIDIRECCIONAL para que el FK viaje en el INSERT del hijo).
 *
 * <p><b>Desacople:</b> el origen del comprobante se referencia genéricamente
 * ({@code sourceType} + {@code sourceId}), sin FK a la tabla de ninguna vertical. Así el módulo
 * fiscal sirve a kiosk hoy y a gym/courts mañana sin tocar el esquema.</p>
 */
@Entity
@Table(name = "fiscal_voucher")
@Getter
@Setter
public class FiscalVoucher extends TenantAwareEntity {

    /** Tipo de origen (ej. "KIOSK_SALE"). Junto con sourceId ubica la venta sin acoplar esquemas. */
    @Column(name = "source_type", length = 40)
    private String sourceType;

    @Column(name = "source_id")
    private UUID sourceId;

    @Enumerated(EnumType.STRING)
    @Column(name = "voucher_type", nullable = false, length = 20)
    private FiscalVoucherType voucherType;

    @Column(name = "point_of_sale", nullable = false)
    private Integer pointOfSale;

    /** Número de comprobante. Lo asigna ARCA (FECompUltimoAutorizado + 1); null hasta autorizar. */
    @Column
    private Long number;

    @Column(name = "voucher_date", nullable = false)
    private LocalDate voucherDate;

    /** 80=CUIT, 96=DNI, 99=consumidor final. */
    @Column(name = "doc_tipo", nullable = false)
    private Integer docTipo = 99;

    @Column(name = "doc_nro")
    private Long docNro;

    /** Condición frente al IVA del receptor (5=Consumidor Final). Requerido por ARCA (RG 5616). */
    @Column(name = "condicion_iva_receptor_id", nullable = false)
    private Integer condicionIvaReceptorId = 5;

    /** 1=productos. */
    @Column(nullable = false)
    private Integer concepto = 1;

    @Column(name = "net_amount", nullable = false)
    private BigDecimal netAmount = BigDecimal.ZERO;

    @Column(name = "iva_amount", nullable = false)
    private BigDecimal ivaAmount = BigDecimal.ZERO;

    @Column(name = "total_amount", nullable = false)
    private BigDecimal totalAmount = BigDecimal.ZERO;

    @Column(length = 20)
    private String cae;

    @Column(name = "cae_expiration")
    private LocalDate caeExpiration;

    @Column(name = "qr_url", columnDefinition = "text")
    private String qrUrl;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 15)
    private FiscalVoucherStatus status = FiscalVoucherStatus.PENDING;

    @Column(name = "arca_observations", columnDefinition = "text")
    private String arcaObservations;

    @OneToMany(mappedBy = "voucher", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    @BatchSize(size = 64)
    private List<FiscalVoucherItem> items = new ArrayList<>();

    public void addItem(FiscalVoucherItem item) {
        item.setTenant(getTenant());
        item.setVoucher(this);
        items.add(item);
    }
}
