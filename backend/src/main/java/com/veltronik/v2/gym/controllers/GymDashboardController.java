package com.veltronik.v2.gym.controllers;

import com.veltronik.v2.core.controllers.BaseController;
import com.veltronik.v2.gym.services.GymDashboardService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/gym/dashboard")
public class GymDashboardController {

    private final GymDashboardService dashboardService;

    public GymDashboardController(GymDashboardService dashboardService) {
        this.dashboardService = dashboardService;
    }

    @GetMapping("/stats")
    public ResponseEntity<Map<String, Object>> getDashboardStats() {
        return ResponseEntity.ok(dashboardService.getDashboardStats());
    }
}
