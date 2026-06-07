package com.veltronik.v2.core.services;

import com.veltronik.v2.core.entities.BaseEntity;
import com.veltronik.v2.core.entities.TenantAwareEntity;
import com.veltronik.v2.core.exceptions.EntityNotFoundException;
import com.veltronik.v2.core.security.TenantContextHolder;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.http.HttpStatus;
import org.springframework.lang.NonNull;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Objects;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Implementación abstracta del CRUD genérico para Veltronik.
 *
 * Centraliza toda la lógica repetitiva de las operaciones CRUD para que
 * los servicios concretos de cada módulo (GymService, SalonService, etc.)
 * solo necesiten implementar 4 métodos abstractos de mapeo.
 *
 * <p><b>Para crear un servicio nuevo, el Junior solo necesita:</b></p>
 * <ol>
 *   <li>Heredar de esta clase.</li>
 *   <li>Implementar {@link #getRepository()}, {@link #toDto(BaseEntity)},
 *       {@link #toEntity(Object)} y {@link #updateEntity(Object, BaseEntity)}.</li>
 * </ol>
 *
 * <p><b>Seguridad multitenant (secure-by-default):</b> {@code findById}, {@code update} y
 * {@code delete} cargan por PK, y el {@code @Filter} de Hibernate NO se aplica a la carga por
 * PK. Para que el CRUD genérico sea seguro aun si un módulo nuevo hereda directamente de acá,
 * {@link #verifyTenantOwnership(BaseEntity)} valida que toda {@link TenantAwareEntity} pertenezca
 * al tenant del contexto antes de devolverla/modificarla/borrarla.</p>
 *
 * @param <T>   Tipo de la entidad JPA.
 * @param <DTO> Tipo del Data Transfer Object.
 * @param <ID>  Tipo del identificador.
 *
 * @see BaseService
 * @see EntityNotFoundException
 */
public abstract class BaseServiceImpl<T extends BaseEntity, DTO, ID> implements BaseService<T, DTO, ID> {

    /** Nombre legible de la entidad, usado en los mensajes de error. */
    protected abstract String getEntityName();

    /** Retorna el repositorio JPA específico de la entidad. */
    protected abstract JpaRepository<T, ID> getRepository();

    /** Convierte una entidad JPA a su DTO correspondiente. */
    protected abstract DTO toDto(T entity);

    /** Convierte un DTO recibido del frontend a una entidad JPA. */
    protected abstract T toEntity(DTO dto);

    /** Actualiza los campos de una entidad existente con los datos de un DTO. */
    protected abstract void updateEntity(DTO dto, T entity);

    @Override
    @Transactional(readOnly = true)
    public List<DTO> findAll() {
        return getRepository().findAll().stream()
                .map(this::toDto)
                .collect(Collectors.toList());
    }

    @Override
    @Transactional(readOnly = true)
    public DTO findById(@NonNull ID id) {
        T entity = getRepository().findById(id)
                .orElseThrow(() -> new EntityNotFoundException(getEntityName(), id));
        verifyTenantOwnership(entity);
        return toDto(entity);
    }

    @Override
    @Transactional
    public DTO save(@NonNull DTO dto) {
        T entity = toEntity(dto);
        T savedEntity = getRepository().save(Objects.requireNonNull(entity));
        return toDto(savedEntity);
    }

    @Override
    @Transactional
    public DTO update(@NonNull ID id, @NonNull DTO dto) {
        T entity = getRepository().findById(id)
                .orElseThrow(() -> new EntityNotFoundException(getEntityName(), id));
        verifyTenantOwnership(entity);
        updateEntity(dto, entity);
        T updatedEntity = getRepository().save(Objects.requireNonNull(entity));
        return toDto(updatedEntity);
    }

    @Override
    @Transactional
    public void delete(@NonNull ID id) {
        T entity = getRepository().findById(id)
                .orElseThrow(() -> new EntityNotFoundException(getEntityName(), id));
        verifyTenantOwnership(entity);
        getRepository().delete(entity);
    }

    /**
     * Defensa en profundidad multitenant: el {@code @Filter} de Hibernate NO se aplica a la
     * carga por PK ({@code findById}), así que sin esto el CRUD genérico podría leer/tocar una
     * entidad de OTRO negocio. Para cualquier {@link TenantAwareEntity} verifica que pertenezca
     * al tenant del contexto. Para entidades globales (como Tenant) no aplica (no-op).
     */
    private void verifyTenantOwnership(T entity) {
        if (entity instanceof TenantAwareEntity tae) {
            UUID current = TenantContextHolder.getTenantId();
            UUID owner = (tae.getTenant() != null) ? tae.getTenant().getId() : null;
            if (current == null || owner == null || !current.equals(owner)) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Acceso denegado a este recurso");
            }
        }
    }
}
