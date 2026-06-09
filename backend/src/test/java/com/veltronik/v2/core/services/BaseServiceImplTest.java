package com.veltronik.v2.core.services;

import com.veltronik.v2.core.entities.BaseEntity;
import com.veltronik.v2.core.entities.Tenant;
import com.veltronik.v2.core.entities.TenantAwareEntity;
import com.veltronik.v2.core.exceptions.EntityNotFoundException;
import com.veltronik.v2.core.security.TenantContextHolder;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * Tests del aislamiento multitenant del CRUD genérico (verifyTenantOwnership):
 * findById/update/delete deben rechazar con 403 toda entidad de OTRO tenant,
 * porque la carga por PK NO pasa por el @Filter de Hibernate.
 */
class BaseServiceImplTest {

    /** Entidad de prueba que pertenece a un tenant. */
    static class TestEntity extends TenantAwareEntity {
    }

    /** Entidad de prueba global (sin tenant), como Tenant mismo. */
    static class GlobalEntity extends BaseEntity {
    }

    static class TestService extends BaseServiceImpl<TestEntity, String, UUID> {
        private final JpaRepository<TestEntity, UUID> repository;

        TestService(JpaRepository<TestEntity, UUID> repository) {
            this.repository = repository;
        }

        @Override
        protected String getEntityName() {
            return "TestEntity";
        }

        @Override
        protected JpaRepository<TestEntity, UUID> getRepository() {
            return repository;
        }

        @Override
        protected String toDto(TestEntity entity) {
            return "dto:" + entity.getId();
        }

        @Override
        protected TestEntity toEntity(String dto) {
            return new TestEntity();
        }

        @Override
        protected void updateEntity(String dto, TestEntity entity) {
            // no-op
        }
    }

    static class GlobalService extends BaseServiceImpl<GlobalEntity, String, UUID> {
        private final JpaRepository<GlobalEntity, UUID> repository;

        GlobalService(JpaRepository<GlobalEntity, UUID> repository) {
            this.repository = repository;
        }

        @Override
        protected String getEntityName() {
            return "GlobalEntity";
        }

        @Override
        protected JpaRepository<GlobalEntity, UUID> getRepository() {
            return repository;
        }

        @Override
        protected String toDto(GlobalEntity entity) {
            return "dto:" + entity.getId();
        }

        @Override
        protected GlobalEntity toEntity(String dto) {
            return new GlobalEntity();
        }

        @Override
        protected void updateEntity(String dto, GlobalEntity entity) {
            // no-op
        }
    }

    @SuppressWarnings("unchecked")
    private final JpaRepository<TestEntity, UUID> repository = mock(JpaRepository.class);
    private final TestService service = new TestService(repository);

    private final UUID currentTenantId = UUID.randomUUID();
    private final UUID otherTenantId = UUID.randomUUID();
    private final UUID entityId = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        TenantContextHolder.setTenantId(currentTenantId);
    }

    @AfterEach
    void tearDown() {
        TenantContextHolder.clear();
    }

    private TestEntity entityOwnedBy(UUID tenantId) {
        TestEntity entity = new TestEntity();
        entity.setId(entityId);
        if (tenantId != null) {
            Tenant tenant = new Tenant();
            tenant.setId(tenantId);
            entity.setTenant(tenant);
        }
        return entity;
    }

    private static void assertForbidden(ResponseStatusException ex) {
        assertEquals(HttpStatus.FORBIDDEN, ex.getStatusCode());
    }

    // ─────────────────────────── findById ───────────────────────────

    @Test
    @DisplayName("findById devuelve la entidad si pertenece al tenant del contexto")
    void findByIdReturnsEntityOfOwnTenant() {
        when(repository.findById(entityId)).thenReturn(Optional.of(entityOwnedBy(currentTenantId)));

        assertEquals("dto:" + entityId, service.findById(entityId));
    }

    @Test
    @DisplayName("findById rechaza con 403 una entidad de OTRO tenant")
    void findByIdRejectsEntityOfOtherTenant() {
        when(repository.findById(entityId)).thenReturn(Optional.of(entityOwnedBy(otherTenantId)));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.findById(entityId));
        assertForbidden(ex);
    }

    @Test
    @DisplayName("findById rechaza con 403 si la entidad no tiene tenant asignado")
    void findByIdRejectsEntityWithoutTenant() {
        when(repository.findById(entityId)).thenReturn(Optional.of(entityOwnedBy(null)));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.findById(entityId));
        assertForbidden(ex);
    }

    @Test
    @DisplayName("findById rechaza con 403 si NO hay tenant en el contexto")
    void findByIdRejectsWhenNoTenantContext() {
        TenantContextHolder.clear();
        when(repository.findById(entityId)).thenReturn(Optional.of(entityOwnedBy(currentTenantId)));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.findById(entityId));
        assertForbidden(ex);
    }

    @Test
    @DisplayName("findById lanza EntityNotFoundException si el id no existe")
    void findByIdThrowsNotFoundWhenMissing() {
        when(repository.findById(entityId)).thenReturn(Optional.empty());

        assertThrows(EntityNotFoundException.class, () -> service.findById(entityId));
    }

    // ─────────────────────────── update ───────────────────────────

    @Test
    @DisplayName("update funciona sobre una entidad del propio tenant")
    void updateWorksForOwnTenant() {
        TestEntity entity = entityOwnedBy(currentTenantId);
        when(repository.findById(entityId)).thenReturn(Optional.of(entity));
        when(repository.save(entity)).thenReturn(entity);

        assertEquals("dto:" + entityId, service.update(entityId, "nuevo"));
        verify(repository).save(entity);
    }

    @Test
    @DisplayName("update rechaza con 403 una entidad de OTRO tenant y NO guarda nada")
    void updateRejectsEntityOfOtherTenant() {
        when(repository.findById(entityId)).thenReturn(Optional.of(entityOwnedBy(otherTenantId)));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.update(entityId, "hackeado"));
        assertForbidden(ex);
        verify(repository, never()).save(any());
    }

    // ─────────────────────────── delete ───────────────────────────

    @Test
    @DisplayName("delete funciona sobre una entidad del propio tenant")
    void deleteWorksForOwnTenant() {
        TestEntity entity = entityOwnedBy(currentTenantId);
        when(repository.findById(entityId)).thenReturn(Optional.of(entity));

        service.delete(entityId);
        verify(repository).delete(entity);
    }

    @Test
    @DisplayName("delete rechaza con 403 una entidad de OTRO tenant y NO borra nada")
    void deleteRejectsEntityOfOtherTenant() {
        when(repository.findById(entityId)).thenReturn(Optional.of(entityOwnedBy(otherTenantId)));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.delete(entityId));
        assertForbidden(ex);
        verify(repository, never()).delete(any());
    }

    // ─────────────────────── entidades globales ───────────────────────

    @Test
    @DisplayName("las entidades globales (no TenantAware) no exigen tenant en el contexto")
    void globalEntitiesSkipOwnershipCheck() {
        TenantContextHolder.clear();
        @SuppressWarnings("unchecked")
        JpaRepository<GlobalEntity, UUID> globalRepository = mock(JpaRepository.class);
        GlobalService globalService = new GlobalService(globalRepository);

        GlobalEntity entity = new GlobalEntity();
        entity.setId(entityId);
        when(globalRepository.findById(entityId)).thenReturn(Optional.of(entity));

        assertEquals("dto:" + entityId, globalService.findById(entityId));
    }
}
