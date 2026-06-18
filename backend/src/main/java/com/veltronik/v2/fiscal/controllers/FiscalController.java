package com.veltronik.v2.fiscal.controllers;

import com.veltronik.v2.fiscal.dto.FiscalCertificateInputDTO;
import com.veltronik.v2.fiscal.dto.FiscalConfigDTO;
import com.veltronik.v2.fiscal.dto.FiscalConfigInputDTO;
import com.veltronik.v2.fiscal.dto.FiscalVoucherDTO;
import com.veltronik.v2.fiscal.entities.FiscalCondicionIva;
import com.veltronik.v2.fiscal.entities.FiscalEnvironment;
import com.veltronik.v2.fiscal.mappers.FiscalMapper;
import com.veltronik.v2.fiscal.services.FiscalConfigService;
import com.veltronik.v2.fiscal.services.FiscalService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.UUID;
import java.util.function.Function;

/**
 * API de facturación ARCA. Es gestión sensible (CUIT, certificado, comprobantes) → solo OWNER/ADMIN.
 * Vive en {@code /api/fiscal} (no en kiosk) porque el módulo es compartido por las verticales.
 */
@RestController
@RequestMapping("/api/fiscal")
@PreAuthorize("hasAnyRole('OWNER','ADMIN')")
public class FiscalController {

    private final FiscalConfigService configService;
    private final FiscalService fiscalService;
    private final FiscalMapper mapper;

    public FiscalController(FiscalConfigService configService, FiscalService fiscalService, FiscalMapper mapper) {
        this.configService = configService;
        this.fiscalService = fiscalService;
        this.mapper = mapper;
    }

    @GetMapping("/config")
    public ResponseEntity<FiscalConfigDTO> getConfig() {
        return ResponseEntity.ok(mapper.toDto(configService.getOrCreateForCurrentTenant()));
    }

    @PutMapping("/config")
    public ResponseEntity<FiscalConfigDTO> updateConfig(@RequestBody FiscalConfigInputDTO in) {
        FiscalCondicionIva condicion = parse(in.getCondicionIva(), FiscalCondicionIva::valueOf, "condición frente al IVA");
        FiscalEnvironment environment = parse(in.getEnvironment(), FiscalEnvironment::valueOf, "ambiente");
        return ResponseEntity.ok(mapper.toDto(configService.updateForCurrentTenant(
                in.getCuit(), in.getRazonSocial(), condicion, environment, in.getDefaultPosNumber(), in.getEnabled())));
    }

    /** Sube el certificado + clave (se guardan cifrados). */
    @PostMapping("/config/certificate")
    public ResponseEntity<FiscalConfigDTO> uploadCertificate(@Valid @RequestBody FiscalCertificateInputDTO in) {
        return ResponseEntity.ok(mapper.toDto(
                configService.uploadCredentialsForCurrentTenant(in.getCertificatePem(), in.getPrivateKeyPem())));
    }

    @GetMapping("/vouchers")
    public ResponseEntity<List<FiscalVoucherDTO>> getVouchers() {
        return ResponseEntity.ok(mapper.toVoucherDtoList(fiscalService.listVouchersForCurrentTenant()));
    }

    /**
     * Comprobante de una venta (para el ticket del POS). Lo consulta el cajero (cualquier rol),
     * por eso afloja el @PreAuthorize de la clase: es lectura del propio tenant, no es sensible.
     * 204 si todavía no hay comprobante (la emisión es asíncrona → el POS reintenta).
     */
    @GetMapping("/vouchers/by-source")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<FiscalVoucherDTO> getVoucherBySource(@RequestParam String sourceType,
                                                               @RequestParam UUID sourceId) {
        return fiscalService.findBySourceForCurrentTenant(sourceType, sourceId)
                .map(v -> ResponseEntity.ok(mapper.toDto(v)))
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    /** Parseo tolerante de enums: null/blank → null (patch parcial); texto inválido → 400. */
    private <E extends Enum<E>> E parse(String raw, Function<String, E> valueOf, String label) {
        if (raw == null || raw.isBlank()) return null;
        try {
            return valueOf.apply(raw.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Valor inválido para " + label + ": " + raw);
        }
    }
}
