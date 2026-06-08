package com.veltronik.v2.gym.controllers;

import com.veltronik.v2.gym.dto.GymClassDTO;
import com.veltronik.v2.gym.dto.GymClassInputDTO;
import com.veltronik.v2.gym.entities.GymClass;
import com.veltronik.v2.gym.mappers.GymClassMapper;
import com.veltronik.v2.gym.services.GymClassService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/**
 * API REST de clases/actividades del gimnasio.
 *
 * Devuelve SIEMPRE {@link GymClassDTO} (nunca la entidad JPA cruda) y la ENTRADA usa
 * {@link GymClassInputDTO} (no la entidad), cerrando el mass-assignment. Mismo patrón que
 * el resto del vertical (socios/pagos/accesos): el frontend solo dibuja el contrato del DTO.
 */
@RestController
@RequestMapping("/api/gym/classes")
public class GymClassController {

    private final GymClassService classService;
    private final GymClassMapper classMapper;

    public GymClassController(GymClassService classService, GymClassMapper classMapper) {
        this.classService = classService;
        this.classMapper = classMapper;
    }

    @GetMapping
    public ResponseEntity<List<GymClassDTO>> getAllClasses() {
        return ResponseEntity.ok(classMapper.toDtoList(classService.findAllForCurrentTenant()));
    }

    @GetMapping("/active")
    public ResponseEntity<List<GymClassDTO>> getActiveClasses() {
        return ResponseEntity.ok(classMapper.toDtoList(classService.findActiveForCurrentTenant()));
    }

    @GetMapping("/{id}")
    public ResponseEntity<GymClassDTO> getClassById(@PathVariable UUID id) {
        return ResponseEntity.ok(classMapper.toDto(classService.findByIdAndVerifyOwnership(id)));
    }

    @PostMapping
    public ResponseEntity<GymClassDTO> createClass(@Valid @RequestBody GymClassInputDTO input) {
        GymClass gymClass = new GymClass();
        applyEditableFields(gymClass, input);
        return ResponseEntity.ok(classMapper.toDto(classService.saveForCurrentTenant(gymClass)));
    }

    @PutMapping("/{id}")
    public ResponseEntity<GymClassDTO> updateClass(@PathVariable UUID id, @Valid @RequestBody GymClassInputDTO input) {
        GymClass existingClass = classService.findByIdAndVerifyOwnership(id);
        applyEditableFields(existingClass, input);
        return ResponseEntity.ok(classMapper.toDto(classService.saveForCurrentTenant(existingClass)));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteClass(@PathVariable UUID id) {
        classService.deleteAndVerifyOwnership(id);
        return ResponseEntity.noContent().build();
    }

    /**
     * Copia SOLO los campos editables del DTO a la entidad (patch parcial: cada campo se aplica
     * si vino en el request). Nunca toca id/tenant/timestamps → cierra el mass-assignment.
     */
    private void applyEditableFields(GymClass c, GymClassInputDTO in) {
        if (in.getName() != null) c.setName(in.getName());
        if (in.getInstructor() != null) c.setInstructor(in.getInstructor());
        if (in.getDayOfWeek() != null) c.setDayOfWeek(in.getDayOfWeek());
        if (in.getStartTime() != null) c.setStartTime(in.getStartTime());
        if (in.getEndTime() != null) c.setEndTime(in.getEndTime());
        if (in.getCapacity() != null) c.setCapacity(in.getCapacity());
        if (in.getRoom() != null) c.setRoom(in.getRoom());
        if (in.getColor() != null) c.setColor(in.getColor());
        if (in.getDescription() != null) c.setDescription(in.getDescription());
        if (in.getActive() != null) c.setActive(in.getActive());
    }
}
