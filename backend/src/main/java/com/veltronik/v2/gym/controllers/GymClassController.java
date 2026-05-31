package com.veltronik.v2.gym.controllers;

import com.veltronik.v2.gym.entities.GymClass;
import com.veltronik.v2.gym.services.GymClassService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/gym/classes")
public class GymClassController {

    private final GymClassService classService;

    public GymClassController(GymClassService classService) {
        this.classService = classService;
    }

    @GetMapping
    public ResponseEntity<List<GymClass>> getAllClasses() {
        return ResponseEntity.ok(classService.findAllForCurrentTenant());
    }

    @GetMapping("/active")
    public ResponseEntity<List<GymClass>> getActiveClasses() {
        return ResponseEntity.ok(classService.findActiveForCurrentTenant());
    }

    @GetMapping("/{id}")
    public ResponseEntity<GymClass> getClassById(@PathVariable UUID id) {
        return ResponseEntity.ok(classService.findByIdAndVerifyOwnership(id));
    }

    @PostMapping
    public ResponseEntity<GymClass> createClass(@RequestBody GymClass gymClass) {
        return ResponseEntity.ok(classService.saveForCurrentTenant(gymClass));
    }

    @PutMapping("/{id}")
    public ResponseEntity<GymClass> updateClass(@PathVariable UUID id, @RequestBody GymClass updatedClass) {
        GymClass existingClass = classService.findByIdAndVerifyOwnership(id);
        
        if (updatedClass.getName() != null) existingClass.setName(updatedClass.getName());
        if (updatedClass.getInstructor() != null) existingClass.setInstructor(updatedClass.getInstructor());
        if (updatedClass.getDayOfWeek() != null) existingClass.setDayOfWeek(updatedClass.getDayOfWeek());
        if (updatedClass.getStartTime() != null) existingClass.setStartTime(updatedClass.getStartTime());
        if (updatedClass.getEndTime() != null) existingClass.setEndTime(updatedClass.getEndTime());
        if (updatedClass.getCapacity() > 0) existingClass.setCapacity(updatedClass.getCapacity());
        if (updatedClass.getRoom() != null) existingClass.setRoom(updatedClass.getRoom());
        if (updatedClass.getColor() != null) existingClass.setColor(updatedClass.getColor());
        if (updatedClass.getDescription() != null) existingClass.setDescription(updatedClass.getDescription());
        existingClass.setActive(updatedClass.isActive());

        return ResponseEntity.ok(classService.saveForCurrentTenant(existingClass));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteClass(@PathVariable UUID id) {
        classService.deleteAndVerifyOwnership(id);
        return ResponseEntity.noContent().build();
    }
}
