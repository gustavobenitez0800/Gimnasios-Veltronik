package com.veltronik.v2.fiscal.services;

import com.veltronik.v2.core.entities.Tenant;
import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.fiscal.FiscalEmissionRequest;
import com.veltronik.v2.fiscal.FiscalEmissionResult;
import com.veltronik.v2.fiscal.entities.*;
import com.veltronik.v2.fiscal.integration.ArcaClient;
import com.veltronik.v2.fiscal.integration.ArcaException;
import com.veltronik.v2.fiscal.integration.CaeResult;
import com.veltronik.v2.fiscal.integration.FiscalCredentials;
import com.veltronik.v2.fiscal.repositories.FiscalVoucherRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.when;

/**
 * Tests del orquestador de emisión: aprobado → AUTHORIZED (CAE+QR), ARCA caído → CONTINGENCY,
 * rechazado → REJECTED. La venta nunca se frena por ARCA.
 */
@ExtendWith(MockitoExtension.class)
class FiscalServiceTest {

    @Mock private FiscalConfigService configService;
    @Mock private ArcaClient arcaClient;
    @Mock private VoucherTypeResolver typeResolver;
    @Mock private FiscalQrService qrService;
    @Mock private FiscalVoucherRepository voucherRepository;

    @InjectMocks private FiscalService service;

    private final UUID tenantId = UUID.randomUUID();
    private final AtomicReference<FiscalVoucher> persisted = new AtomicReference<>();

    @BeforeEach
    void setUp() {
        TenantContextHolder.setTenantId(tenantId);

        FiscalConfig config = new FiscalConfig();
        Tenant tenant = new Tenant();
        tenant.setId(tenantId);
        config.setTenant(tenant);
        config.setCuit(20460764484L);
        config.setCondicionIva(FiscalCondicionIva.MONOTRIBUTO);
        config.setEnvironment(FiscalEnvironment.HOMOLOGACION);
        config.setDefaultPosNumber(1);
        config.setEnabled(true);

        when(configService.requireEnabledForCurrentTenant()).thenReturn(config);
        when(voucherRepository.findByTenantIdAndSourceTypeAndSourceIdOrderByCreatedAtDesc(any(), any(), any()))
                .thenReturn(List.of());
        when(typeResolver.resolve(any(), anyBoolean())).thenReturn(FiscalVoucherType.FACTURA_C);
        // save asigna id y guarda la referencia; findById la devuelve (las dos fases del orquestador).
        when(voucherRepository.save(any(FiscalVoucher.class))).thenAnswer(inv -> {
            FiscalVoucher v = inv.getArgument(0);
            if (v.getId() == null) v.setId(UUID.randomUUID());
            persisted.set(v);
            return v;
        });
        when(voucherRepository.findById(any())).thenAnswer(inv -> Optional.ofNullable(persisted.get()));
    }

    @AfterEach
    void tearDown() {
        TenantContextHolder.clear();
    }

    private FiscalEmissionRequest request() {
        return FiscalEmissionRequest.consumidorFinal("KIOSK_SALE", UUID.randomUUID(), new BigDecimal("100.00"), null);
    }

    @Test
    @DisplayName("emitir aprobado → AUTHORIZED con CAE, número y QR")
    void emitApproved() {
        when(configService.buildCredentials(any()))
                .thenReturn(new FiscalCredentials(20460764484L, "cert", "key", FiscalEnvironment.HOMOLOGACION));
        when(arcaClient.getLastAuthorizedNumber(any(), eq(1), eq(11))).thenReturn(0L);
        when(arcaClient.requestCae(any(), any()))
                .thenReturn(new CaeResult("A", "86240272753567", LocalDate.of(2026, 6, 27), 1L, null));
        when(qrService.buildQrUrl(anyLong(), any(), anyInt(), anyInt(), anyLong(), any(), anyInt(), anyLong(), anyString()))
                .thenReturn("https://www.afip.gob.ar/fe/qr/?p=abc");

        FiscalEmissionResult result = service.emitir(request());

        assertEquals(FiscalVoucherStatus.AUTHORIZED.name(), result.status());
        assertEquals("86240272753567", result.cae());
        assertEquals(1L, result.number());
        assertEquals("https://www.afip.gob.ar/fe/qr/?p=abc", result.qrUrl());
    }

    @Test
    @DisplayName("emitir con ARCA caído → CONTINGENCY (la venta no se frena), sin CAE")
    void emitContingencyWhenArcaDown() {
        when(configService.buildCredentials(any()))
                .thenReturn(new FiscalCredentials(20460764484L, "cert", "key", FiscalEnvironment.HOMOLOGACION));
        when(arcaClient.getLastAuthorizedNumber(any(), anyInt(), anyInt()))
                .thenThrow(new ArcaException("Error de red con ARCA"));

        FiscalEmissionResult result = service.emitir(request());

        assertEquals(FiscalVoucherStatus.CONTINGENCY.name(), result.status());
        assertNull(result.cae());
        assertNotNull(result.observations());
    }

    @Test
    @DisplayName("emitir rechazado por ARCA → REJECTED con el motivo")
    void emitRejected() {
        when(configService.buildCredentials(any()))
                .thenReturn(new FiscalCredentials(20460764484L, "cert", "key", FiscalEnvironment.HOMOLOGACION));
        when(arcaClient.getLastAuthorizedNumber(any(), anyInt(), anyInt())).thenReturn(5L);
        when(arcaClient.requestCae(any(), any()))
                .thenReturn(new CaeResult("R", null, null, 0L, "10016: Falta CondicionIVAReceptorId"));

        FiscalEmissionResult result = service.emitir(request());

        assertEquals(FiscalVoucherStatus.REJECTED.name(), result.status());
        assertNull(result.cae());
        assertEquals("10016: Falta CondicionIVAReceptorId", result.observations());
    }
}
