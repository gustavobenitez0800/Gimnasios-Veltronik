package com.veltronik.v2.core.services;

import com.veltronik.v2.core.entities.BaseEntity;
import com.veltronik.v2.core.exceptions.EntityNotFoundException;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.lang.NonNull;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Objects;
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
        updateEntity(dto, entity);
        T updatedEntity = getRepository().save(Objects.requireNonNull(entity));
        return toDto(updatedEntity);
    }

    @Override
    @Transactional
    public void delete(@NonNull ID id) {
        if (!getRepository().existsById(id)) {
            throw new EntityNotFoundException(getEntityName(), id);
        }
        getRepository().deleteById(id);
    }
}
