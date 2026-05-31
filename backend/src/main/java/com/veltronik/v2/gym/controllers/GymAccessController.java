package com.veltronik.v2.gym.controllers;

import com.veltronik.v2.gym.entities.AccessLog;
import com.veltronik.v2.gym.services.AccessLogService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/gym/access")
public class GymAccessController {

    private final AccessLogService accessService;

    public GymAccessController(AccessLogService accessService) {
        this.accessService = accessService;
    }

    @GetMapping("/today")
    public ResponseEntity<List<AccessLog>> getTodayAccesses() {
        return ResponseEntity.ok(accessService.getTodayAccesses());
    }

    @GetMapping("/active")
    public ResponseEntity<List<AccessLog>> getActiveAccesses() {
        return ResponseEntity.ok(accessService.getActiveAccesses());
    }

    @PostMapping("/register")
    public ResponseEntity<AccessLog> registerAccess(@RequestBody Map<String, Object> payload) {
        UUID memberId = UUID.fromString((String) payload.get("memberId"));
        String method = (String) payload.get("method");
        return ResponseEntity.ok(accessService.registerAccess(memberId, method));
    }

    @PutMapping("/{id}/checkout")
    public ResponseEntity<AccessLog> checkOut(@PathVariable UUID id) {
        return ResponseEntity.ok(accessService.checkOut(id));
    }
}
