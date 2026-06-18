package com.veltronik.v2.fiscal.services;

import com.veltronik.v2.core.entities.Tenant;
import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.fiscal.FiscalEmissionRequest;
import com.veltronik.v2.fiscal.FiscalEmissionResult;
import com.veltronik.v2.fiscal.FiscalFacade;
import com.veltronik.v2.fiscal.FiscalLineItem;
import com.veltronik.v2.fiscal.entities.*;
import com.veltronik.v2.fiscal.integration.ArcaClient;
import com.veltronik.v2.fiscal.integration.ArcaException;
import com.veltronik.v2.fiscal.integration.CaeRequest;
import com.veltronik.v2.fiscal.integration.CaeResult;
import com.veltronik.v2.fiscal.integration.FiscalCredentials;
import com.veltronik.v2.fiscal.repositories.FiscalVoucherRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Optional;
import java.util.UUID;

/**
 * Orquestador de la emisión de comprobantes (implementa {@link FiscalFacade}).
 *
 * <p><b>Decisión de arquitectura (igual que el webhook de MP):</b> la llamada de red a ARCA se hace
 * FUERA de transacción. El comprobante se persiste PENDING en una tx corta, se habla con ARCA sin
 * conexión de BD tomada, y el resultado se guarda en otra tx corta. Así no se retiene el pool
 * durante el round-trip y la venta nunca se frena: si ARCA no responde → CONTINGENCY y el cron
 * reintenta.</p>
 */
@Service
@Slf4j
public class FiscalService implements FiscalFacade {

    private static final ZoneId BUSINESS_ZONE = ZoneId.of("America/Argentina/Buenos_Aires");

    private final FiscalConfigService configService;
    private final ArcaClient arcaClient;
    private final VoucherTypeResolver typeResolver;
    private final FiscalQrService qrService;
    private final FiscalVoucherRepository voucherRepository;

    public FiscalService(FiscalConfigService configService, ArcaClient arcaClient,
                         VoucherTypeResolver typeResolver, FiscalQrService qrService,
                         FiscalVoucherRepository voucherRepository) {
        this.configService = configService;
        this.arcaClient = arcaClient;
        this.typeResolver = typeResolver;
        this.qrService = qrService;
        this.voucherRepository = voucherRepository;
    }

    @Override
    public FiscalEmissionResult emitir(FiscalEmissionRequest req) {
        FiscalConfig config = configService.requireEnabledForCurrentTenant();
        UUID tenantId = TenantContextHolder.getTenantId();

        // Idempotencia por origen: si ya hay un comprobante NO rechazado para esa venta, lo devolvemos.
        Optional<FiscalVoucher> existing = voucherRepository
                .findByTenantIdAndSourceTypeAndSourceIdOrderByCreatedAtDesc(tenantId, req.sourceType(), req.sourceId())
                .stream().filter(v -> v.getStatus() != FiscalVoucherStatus.REJECTED).findFirst();
        if (existing.isPresent()) {
            return toResult(existing.get());
        }

        FiscalVoucherType type = resolveType(config, req);
        FiscalVoucher voucher = createPending(req, config, type);  // tx corta (save del repo)
        return requestCae(config, voucher);                        // red FUERA de tx
    }

    /** Comprobantes del tenant (más recientes primero) para la pantalla de facturación. */
    public java.util.List<FiscalVoucher> listVouchersForCurrentTenant() {
        return voucherRepository.findTop200ByTenantIdOrderByCreatedAtDesc(TenantContextHolder.getTenantId());
    }

    /** Reintento del cron de contingencia: resuelve la config del tenant del voucher y reintenta. */
    public void retry(FiscalVoucher voucher) {
        configService.findByTenantId(voucher.getTenant().getId())
                .filter(FiscalConfig::isEnabled)
                .ifPresent(config -> requestCae(config, voucher));
    }

    // ─────────────────────────── interno ───────────────────────────

    private FiscalVoucherType resolveType(FiscalConfig config, FiscalEmissionRequest req) {
        boolean receptorResponsableInscripto = req.receptorCondicionIvaId() == 1;
        FiscalVoucherType type = typeResolver.resolve(config.getCondicionIva(), receptorResponsableInscripto);
        if (type != FiscalVoucherType.FACTURA_C) {
            // Factura A/B (Responsable Inscripto) requiere el array <Iva> en WSFE → extensión futura.
            throw new ResponseStatusException(HttpStatus.NOT_IMPLEMENTED,
                    "Por ahora se emite Factura C (Monotributo). Factura A/B (RI) llega en una próxima versión.");
        }
        return type;
    }

    /** Crea el comprobante en estado PENDING (tx corta vía el save del repositorio). */
    private FiscalVoucher createPending(FiscalEmissionRequest req, FiscalConfig config, FiscalVoucherType type) {
        FiscalVoucher voucher = new FiscalVoucher();
        Tenant tenant = new Tenant();
        tenant.setId(TenantContextHolder.getTenantId());
        voucher.setTenant(tenant);
        voucher.setSourceType(req.sourceType());
        voucher.setSourceId(req.sourceId());
        voucher.setVoucherType(type);
        voucher.setPointOfSale(config.getDefaultPosNumber());
        voucher.setVoucherDate(LocalDate.now(BUSINESS_ZONE));
        voucher.setDocTipo(req.receptorDocTipo());
        voucher.setDocNro(req.receptorDocNro());
        voucher.setCondicionIvaReceptorId(req.receptorCondicionIvaId());
        voucher.setConcepto(1);

        BigDecimal total = req.totalAmount().setScale(2, RoundingMode.HALF_UP);
        voucher.setTotalAmount(total);
        voucher.setNetAmount(total);          // Factura C: neto = total (sin discriminar IVA)
        voucher.setIvaAmount(BigDecimal.ZERO);
        voucher.setStatus(FiscalVoucherStatus.PENDING);

        if (req.items() != null) {
            for (FiscalLineItem line : req.items()) {
                FiscalVoucherItem item = new FiscalVoucherItem();
                item.setDescription(line.description());
                item.setQuantity(line.quantity());
                item.setUnitPrice(line.unitPrice());
                item.setIvaRate(line.ivaRate() != null ? line.ivaRate() : new BigDecimal("21.00"));
                item.setSubtotal(line.unitPrice().multiply(line.quantity()).setScale(2, RoundingMode.HALF_UP));
                voucher.addItem(item);
            }
        }
        return voucherRepository.save(voucher);
    }

    /** Habla con ARCA (FUERA de transacción) y persiste el resultado. */
    private FiscalEmissionResult requestCae(FiscalConfig config, FiscalVoucher voucher) {
        CaeOutcome outcome;
        try {
            FiscalCredentials creds = configService.buildCredentials(config);
            int posVta = voucher.getPointOfSale();
            int typeCode = voucher.getVoucherType().getArcaCode();

            long next = arcaClient.getLastAuthorizedNumber(creds, posVta, typeCode) + 1;
            long docNro = voucher.getDocNro() != null ? voucher.getDocNro() : 0L;
            CaeRequest caeReq = new CaeRequest(posVta, typeCode, next, voucher.getVoucherDate(),
                    voucher.getConcepto(), voucher.getDocTipo(), docNro,
                    voucher.getNetAmount(), voucher.getIvaAmount(), voucher.getTotalAmount(),
                    voucher.getCondicionIvaReceptorId());

            CaeResult res = arcaClient.requestCae(creds, caeReq);
            if (res.approved()) {
                long number = res.cbteNumber() > 0 ? res.cbteNumber() : next;
                String qr = qrService.buildQrUrl(config.getCuit(), voucher.getVoucherDate(), posVta, typeCode,
                        number, voucher.getTotalAmount(), voucher.getDocTipo(), docNro, res.cae());
                outcome = new CaeOutcome(FiscalVoucherStatus.AUTHORIZED, number, res.cae(), res.caeExpiration(), qr, res.observations());
            } else {
                outcome = new CaeOutcome(FiscalVoucherStatus.REJECTED, null, null, null, null, res.observations());
            }
        } catch (ArcaException e) {
            log.warn("ARCA no disponible para el comprobante {} → CONTINGENCY: {}", voucher.getId(), e.getMessage());
            outcome = new CaeOutcome(FiscalVoucherStatus.CONTINGENCY, null, null, null, null, truncate(e.getMessage()));
        }
        return toResult(applyOutcome(voucher.getId(), outcome));
    }

    /** Persiste el resultado en una tx corta (recarga el voucher para tocar solo escalares). */
    private FiscalVoucher applyOutcome(UUID voucherId, CaeOutcome o) {
        FiscalVoucher v = voucherRepository.findById(voucherId)
                .orElseThrow(() -> new IllegalStateException("Comprobante " + voucherId + " desapareció"));
        v.setStatus(o.status());
        if (o.number() != null) v.setNumber(o.number());
        v.setCae(o.cae());
        v.setCaeExpiration(o.caeExpiration());
        v.setQrUrl(o.qrUrl());
        v.setArcaObservations(o.observations());
        return voucherRepository.save(v);
    }

    private FiscalEmissionResult toResult(FiscalVoucher v) {
        return new FiscalEmissionResult(v.getId(), v.getStatus().name(),
                v.getVoucherType() != null ? v.getVoucherType().name() : null,
                v.getNumber(), v.getCae(), v.getCaeExpiration(), v.getQrUrl(), v.getArcaObservations());
    }

    private static String truncate(String s) {
        if (s == null) return null;
        return s.length() > 1000 ? s.substring(0, 1000) : s;
    }

    private record CaeOutcome(FiscalVoucherStatus status, Long number, String cae,
                              LocalDate caeExpiration, String qrUrl, String observations) {}
}
