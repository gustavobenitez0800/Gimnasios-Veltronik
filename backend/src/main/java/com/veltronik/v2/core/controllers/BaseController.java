package com.veltronik.v2.core.controllers;

import com.veltronik.v2.core.entities.BaseEntity;
import com.veltronik.v2.core.services.BaseService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.lang.NonNull;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * Controlador REST abstracto que expone automáticamente los 5 endpoints CRUD.
 *
 * Cualquier módulo nuevo (Gym, Salon, Resto, Ferretería) solo necesita:
 * <pre>{@code
 * @RestController
 * @RequestMapping("/api/ferreterias")
 * public class FerreteriaController extends BaseController<Ferreteria, FerreteriaDTO, UUID> {
 *     // Implementar getService() y listo.
 * }
 * }</pre>
 *
 * <p>Los DTOs recibidos en POST y PUT se validan automáticamente con {@code @Valid}.</p>
 *
 * @param <T>   Tipo de la entidad JPA.
 * @param <DTO> Tipo del Data Transfer Object.
 * @param <ID>  Tipo del identificador.
 *
 * @see BaseService
 */
public abstract class BaseController<T extends BaseEntity, DTO, ID> {

    /** Retorna la instancia del servicio que gestiona la lógica de negocio. */
    protected abstract BaseService<T, DTO, ID> getService();

    @GetMapping
    public ResponseEntity<List<DTO>> getAll() {
        return ResponseEntity.ok(getService().findAll());
    }

    @GetMapping("/{id}")
    public ResponseEntity<DTO> getById(@NonNull @PathVariable ID id) {
        return ResponseEntity.ok(getService().findById(id));
    }

    @PostMapping
    public ResponseEntity<DTO> create(@NonNull @Valid @RequestBody DTO dto) {
        return ResponseEntity.status(HttpStatus.CREATED).body(getService().save(dto));
    }

    @PutMapping("/{id}")
    public ResponseEntity<DTO> update(@NonNull @PathVariable ID id, @NonNull @Valid @RequestBody DTO dto) {
        return ResponseEntity.ok(getService().update(id, dto));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@NonNull @PathVariable ID id) {
        getService().delete(id);
        return ResponseEntity.noContent().build();
    }
}
