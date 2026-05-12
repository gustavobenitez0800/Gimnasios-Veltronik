package com.veltronik.v2.core.services;

import org.springframework.lang.NonNull;

import java.util.List;

/**
 * Contrato base para todos los servicios CRUD del sistema Veltronik.
 *
 * Esta interfaz define las 5 operaciones fundamentales que cualquier
 * módulo de negocio (Gym, Salon, Resto, etc.) necesitará exponer.
 * Equivale al antiguo {@code AbstractFacade<T>} de Java EE, modernizado.
 *
 * @param <T>   Tipo de la entidad JPA.
 * @param <DTO> Tipo del Data Transfer Object que se envía/recibe del frontend.
 * @param <ID>  Tipo del identificador (normalmente {@link java.util.UUID}).
 */
public interface BaseService<T, DTO, ID> {
    List<DTO> findAll();
    DTO findById(@NonNull ID id);
    DTO save(@NonNull DTO dto);
    DTO update(@NonNull ID id, @NonNull DTO dto);
    void delete(@NonNull ID id);
}
