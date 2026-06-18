package com.veltronik.v2.kiosk.services;

import com.veltronik.v2.core.entities.Tenant;
import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.kiosk.entities.KioskAccountMovement;
import com.veltronik.v2.kiosk.entities.KioskAccountMovementType;
import com.veltronik.v2.kiosk.entities.KioskCustomer;
import com.veltronik.v2.kiosk.repositories.KioskAccountMovementRepository;
import com.veltronik.v2.kiosk.repositories.KioskCustomerRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** Tests de la cuenta corriente (fiado): deuda atómica, pago, y borrado protegido por historial. */
@ExtendWith(MockitoExtension.class)
class KioskCustomerServiceTest {

    @Mock private KioskCustomerRepository customerRepository;
    @Mock private KioskAccountMovementRepository movementRepository;

    @InjectMocks private KioskCustomerService service;

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

    private KioskCustomer customer(BigDecimal balance) {
        KioskCustomer c = new KioskCustomer();
        c.setId(UUID.randomUUID());
        c.setTenant(tenant);
        c.setFullName("Juan");
        c.setBalance(balance);
        return c;
    }

    @Test
    @DisplayName("registerDebt anota un movimiento DEBT y sube el saldo de forma atómica")
    void registerDebtRaisesBalance() {
        KioskCustomer c = customer(BigDecimal.ZERO);
        UUID saleId = UUID.randomUUID();

        service.registerDebt(c, new BigDecimal("500.00"), saleId);

        ArgumentCaptor<KioskAccountMovement> captor = ArgumentCaptor.forClass(KioskAccountMovement.class);
        verify(movementRepository).save(captor.capture());
        assertEquals(KioskAccountMovementType.DEBT, captor.getValue().getType());
        assertEquals(saleId, captor.getValue().getSaleId());
        verify(customerRepository).applyBalanceDelta(eq(c.getId()), argThat(d -> d.compareTo(new BigDecimal("500.00")) == 0));
    }

    @Test
    @DisplayName("registerPayment anota un PAYMENT y baja el saldo")
    void registerPaymentLowersBalance() {
        KioskCustomer c = customer(new BigDecimal("1000.00"));
        when(customerRepository.findById(c.getId())).thenReturn(Optional.of(c));
        when(customerRepository.save(any(KioskCustomer.class))).thenAnswer(inv -> inv.getArgument(0));

        KioskCustomer result = service.registerPayment(c.getId(), new BigDecimal("300.00"), "pago parcial");

        assertEquals(0, result.getBalance().compareTo(new BigDecimal("700.00")));
        ArgumentCaptor<KioskAccountMovement> captor = ArgumentCaptor.forClass(KioskAccountMovement.class);
        verify(movementRepository).save(captor.capture());
        assertEquals(KioskAccountMovementType.PAYMENT, captor.getValue().getType());
    }

    @Test
    @DisplayName("registerPayment rechaza (400) un monto no positivo")
    void registerPaymentRejectsNonPositive() {
        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.registerPayment(UUID.randomUUID(), BigDecimal.ZERO, null));
        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
        verify(movementRepository, never()).save(any());
    }

    @Test
    @DisplayName("delete bloquea (409) si el cliente tiene movimientos de cuenta corriente")
    void deleteBlockedWithMovements() {
        KioskCustomer c = customer(BigDecimal.ZERO);
        when(customerRepository.findById(c.getId())).thenReturn(Optional.of(c));
        when(movementRepository.existsByCustomerId(c.getId())).thenReturn(true);

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.deleteAndVerifyOwnership(c.getId()));
        assertEquals(HttpStatus.CONFLICT, ex.getStatusCode());
        verify(customerRepository, never()).delete(any());
    }
}
