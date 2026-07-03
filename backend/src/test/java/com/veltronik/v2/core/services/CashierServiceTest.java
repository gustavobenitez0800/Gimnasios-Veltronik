package com.veltronik.v2.core.services;

import com.veltronik.v2.core.entities.Cashier;
import com.veltronik.v2.core.entities.Tenant;
import com.veltronik.v2.core.exceptions.BusinessException;
import com.veltronik.v2.core.exceptions.EntityNotFoundException;
import com.veltronik.v2.core.repositories.CashierRepository;
import com.veltronik.v2.core.repositories.TenantRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/** Cajeros con PIN (ladrillo 5): hashing, unicidad entre activos, verificación offline. */
class CashierServiceTest {

    private CashierRepository repository;
    private TenantRepository tenantRepository;
    private CashierService service;

    private final UUID tenantId = UUID.randomUUID();
    private Tenant tenant;

    @BeforeEach
    void setUp() {
        repository = mock(CashierRepository.class);
        tenantRepository = mock(TenantRepository.class);
        service = new CashierService(repository, tenantRepository);

        tenant = new Tenant();
        tenant.setId(tenantId);
        when(tenantRepository.getReferenceById(tenantId)).thenReturn(tenant);
        when(repository.save(any(Cashier.class))).thenAnswer(inv -> inv.getArgument(0));
        when(repository.findByTenantIdAndActiveTrue(tenantId)).thenReturn(List.of());
    }

    @Test
    @DisplayName("el alta hashea el PIN (jamás en claro) y el round-trip verifica")
    void alta_hashea_y_verifica() {
        Cashier created = service.create(tenantId, "Marta", "4321", Cashier.Role.CAJERO);

        assertThat(created.getPinHash()).isNotEqualTo("4321").startsWith("$2"); // BCrypt
        assertThat(created.isActive()).isTrue();

        when(repository.findByTenantIdAndActiveTrue(tenantId)).thenReturn(List.of(created));
        assertThat(service.verifyPin(tenantId, "4321")).isPresent();
        assertThat(service.verifyPin(tenantId, "9999")).isEmpty();
        assertThat(service.verifyPin(tenantId, "no-num")).isEmpty();
    }

    @Test
    @DisplayName("PIN inválido (letras, corto, largo) no pasa")
    void pin_invalido() {
        assertThatThrownBy(() -> service.create(tenantId, "Marta", "123", null))
                .isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> service.create(tenantId, "Marta", "1234567", null))
                .isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> service.create(tenantId, "Marta", "12ab", null))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    @DisplayName("dos cajeros activos no pueden compartir PIN (el login es solo-PIN)")
    void pin_unico_entre_activos() {
        Cashier existing = service.create(tenantId, "Marta", "4321", Cashier.Role.CAJERO);
        existing.setId(UUID.randomUUID()); // en persistencia real el id lo asigna el generador
        when(repository.findByTenantIdAndActiveTrue(tenantId)).thenReturn(List.of(existing));

        assertThatThrownBy(() -> service.create(tenantId, "Pedro", "4321", Cashier.Role.CAJERO))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("en uso");
    }

    @Test
    @DisplayName("reset de PIN: se excluye a sí mismo de la unicidad")
    void reset_excluye_a_si_mismo() {
        Cashier existing = service.create(tenantId, "Marta", "4321", Cashier.Role.CAJERO);
        existing.setId(UUID.randomUUID());
        existing.setTenant(tenant);
        when(repository.findById(existing.getId())).thenReturn(Optional.of(existing));
        when(repository.findByTenantIdAndActiveTrue(tenantId)).thenReturn(List.of(existing));

        service.resetPin(tenantId, existing.getId(), "4321"); // el mismo PIN sobre sí mismo: legal
        service.resetPin(tenantId, existing.getId(), "5555");

        when(repository.findByTenantIdAndActiveTrue(tenantId)).thenReturn(List.of(existing));
        assertThat(service.verifyPin(tenantId, "5555")).isPresent();
    }

    @Test
    @DisplayName("un cajero de OTRO negocio no existe para este tenant (aislamiento)")
    void aislamiento_multi_tenant() {
        Cashier ajeno = new Cashier();
        ajeno.setId(UUID.randomUUID());
        Tenant otroTenant = new Tenant();
        otroTenant.setId(UUID.randomUUID());
        ajeno.setTenant(otroTenant);
        when(repository.findById(ajeno.getId())).thenReturn(Optional.of(ajeno));

        assertThatThrownBy(() -> service.resetPin(tenantId, ajeno.getId(), "1234"))
                .isInstanceOf(EntityNotFoundException.class);
        assertThatThrownBy(() -> service.setActive(tenantId, ajeno.getId(), false))
                .isInstanceOf(EntityNotFoundException.class);
    }
}
