package com.veltronik.v2.kiosk.services;

import com.veltronik.v2.core.entities.Tenant;
import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.kiosk.dto.KioskCashCloseInputDTO;
import com.veltronik.v2.kiosk.dto.KioskCashOpenInputDTO;
import com.veltronik.v2.kiosk.entities.KioskCashSession;
import com.veltronik.v2.kiosk.entities.KioskCashSessionStatus;
import com.veltronik.v2.kiosk.repositories.KioskCashSessionRepository;
import com.veltronik.v2.kiosk.repositories.KioskSaleRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * Tests de la caja: invariante de una sola sesión abierta y cálculo del arqueo.
 */
@ExtendWith(MockitoExtension.class)
class KioskCashServiceTest {

    @Mock private KioskCashSessionRepository cashRepository;
    @Mock private KioskSaleRepository saleRepository;

    @InjectMocks private KioskCashService service;

    private final UUID tenantId = UUID.randomUUID();
    private Tenant tenant;

    @BeforeEach
    void setUp() {
        TenantContextHolder.setTenantId(tenantId);
        tenant = new Tenant();
        tenant.setId(tenantId);
    }

    @AfterEach
    void tearDown() {
        TenantContextHolder.clear();
    }

    private KioskCashSession openSession(BigDecimal opening) {
        KioskCashSession s = new KioskCashSession();
        s.setId(UUID.randomUUID());
        s.setTenant(tenant);
        s.setStatus(KioskCashSessionStatus.OPEN);
        s.setOpeningAmount(opening);
        return s;
    }

    @Test
    @DisplayName("open rechaza (409) abrir una caja si ya hay una abierta")
    void openRejectsWhenAlreadyOpen() {
        when(cashRepository.findByTenantIdAndStatus(tenantId, KioskCashSessionStatus.OPEN))
                .thenReturn(Optional.of(openSession(new BigDecimal("1000"))));

        KioskCashOpenInputDTO in = new KioskCashOpenInputDTO();
        in.setOpeningAmount(new BigDecimal("500"));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () -> service.open(in));
        assertEquals(HttpStatus.CONFLICT, ex.getStatusCode());
        verify(cashRepository, never()).saveAndFlush(any());
    }

    @Test
    @DisplayName("open crea una sesión OPEN con el fondo informado cuando no hay otra abierta")
    void openCreatesSession() {
        when(cashRepository.findByTenantIdAndStatus(tenantId, KioskCashSessionStatus.OPEN))
                .thenReturn(Optional.empty());
        when(cashRepository.saveAndFlush(any(KioskCashSession.class))).thenAnswer(inv -> inv.getArgument(0));

        KioskCashOpenInputDTO in = new KioskCashOpenInputDTO();
        in.setOpeningAmount(new BigDecimal("1500"));

        KioskCashSession s = service.open(in);

        assertEquals(KioskCashSessionStatus.OPEN, s.getStatus());
        assertEquals(0, s.getOpeningAmount().compareTo(new BigDecimal("1500")));
        assertNotNull(s.getOpenedAt());
    }

    @Test
    @DisplayName("close calcula esperado = fondo + ventas en efectivo y la diferencia contra lo declarado")
    void closeComputesArqueo() {
        KioskCashSession open = openSession(new BigDecimal("1000"));
        when(cashRepository.findByTenantIdAndStatus(tenantId, KioskCashSessionStatus.OPEN))
                .thenReturn(Optional.of(open));
        when(saleRepository.sumCashPaymentsBySession(open.getId())).thenReturn(new BigDecimal("5000"));
        when(cashRepository.save(any(KioskCashSession.class))).thenAnswer(inv -> inv.getArgument(0));

        KioskCashCloseInputDTO in = new KioskCashCloseInputDTO();
        in.setClosingDeclared(new BigDecimal("6200")); // contó $6200

        KioskCashSession closed = service.close(in);

        assertEquals(KioskCashSessionStatus.CLOSED, closed.getStatus());
        assertEquals(0, closed.getClosingExpected().compareTo(new BigDecimal("6000"))); // 1000 + 5000
        assertEquals(0, closed.getDifference().compareTo(new BigDecimal("200")));        // 6200 - 6000 (sobrante)
        assertNotNull(closed.getClosedAt());
    }

    @Test
    @DisplayName("close rechaza (409) si no hay caja abierta")
    void closeRejectsWhenNoOpen() {
        when(cashRepository.findByTenantIdAndStatus(tenantId, KioskCashSessionStatus.OPEN))
                .thenReturn(Optional.empty());

        KioskCashCloseInputDTO in = new KioskCashCloseInputDTO();
        in.setClosingDeclared(new BigDecimal("6000"));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () -> service.close(in));
        assertEquals(HttpStatus.CONFLICT, ex.getStatusCode());
        verify(cashRepository, never()).save(any());
    }
}
