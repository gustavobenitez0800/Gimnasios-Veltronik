package com.veltronik.v2.gym.controllers;

import com.veltronik.v2.gym.services.GymTeamService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/gym/team")
public class GymTeamController {

    private final GymTeamService teamService;

    public GymTeamController(GymTeamService teamService) {
        this.teamService = teamService;
    }

    @GetMapping
    public ResponseEntity<List<Map<String, Object>>> getTeamMembers() {
        return ResponseEntity.ok(teamService.getTeamMembers());
    }

    @PostMapping("/invite")
    public ResponseEntity<Map<String, Object>> inviteMember(@RequestBody Map<String, String> payload) {
        String email = payload.get("email");
        String role = payload.get("role");
        return ResponseEntity.ok(teamService.inviteMember(email, role));
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
