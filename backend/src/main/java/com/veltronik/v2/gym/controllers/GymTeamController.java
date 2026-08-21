package com.veltronik.v2.gym.controllers;

import com.veltronik.v2.gym.services.GymTeamService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/gym/team")
@PreAuthorize("hasAnyRole('OWNER','ADMIN')") // gestión de equipo y roles: solo dueño/admin
public class GymTeamController {

    private final GymTeamService teamService;

    public GymTeamController(GymTeamService teamService) {
        this.teamService = teamService;
    }

    @GetMapping
    public ResponseEntity<List<Map<String, Object>>> getTeamMembers() {
        return ResponseEntity.ok(teamService.getTeamMembers());
    }

    /**
     * Suma a alguien al equipo. Si no tiene cuenta en Veltronik, se la crea acá mismo y la
     * respuesta trae la contraseña temporal — una sola vez, para que el dueño se la pase.
     */
    @PostMapping("/invite")
    public ResponseEntity<Map<String, Object>> inviteMember(@RequestBody Map<String, String> payload) {
        String email = payload.get("email");
        String role = payload.get("role");
        String fullName = payload.get("fullName");
        return ResponseEntity.ok(teamService.inviteMember(email, role, fullName));
    }

    @PutMapping("/{userId}/role")
    public ResponseEntity<Map<String, Object>> updateRole(@PathVariable UUID userId, @RequestBody Map<String, String> payload) {
        String role = payload.get("role");
        return ResponseEntity.ok(teamService.updateRole(userId, role));
    }

    @DeleteMapping("/{userId}")
    public ResponseEntity<Void> removeMember(@PathVariable UUID userId) {
        teamService.removeMember(userId);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/activity")
    public ResponseEntity<List<Map<String, Object>>> getActivityLog(@RequestParam(defaultValue = "50") int limit) {
        return ResponseEntity.ok(teamService.getActivityLog(limit));
    }
}
