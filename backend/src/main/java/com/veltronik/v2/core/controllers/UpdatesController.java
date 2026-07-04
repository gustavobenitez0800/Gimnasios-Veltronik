package com.veltronik.v2.core.controllers;

import com.veltronik.v2.core.entities.Device;
import com.veltronik.v2.core.security.DeviceContextHolder;
import com.veltronik.v2.core.services.DeviceRegistryService;
import com.veltronik.v2.core.services.RolloutService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Lo que un EQUIPO pregunta a la nube sobre su propia actualización (ladrillo 7).
 *
 * <p>Autenticado por credencial de equipo ({@code DeviceCredentialFilter} cubre
 * {@code /api/updates/**}, igual que el sync): el updater de Electron llama acá con
 * {@code X-Device-Id + X-Device-Key} y recibe la versión objetivo de SU anillo. Si no
 * hay objetivo publicado, {@code targetVersion} viene null → el updater toma la última
 * (fail-open).</p>
 */
@RestController
@RequestMapping("/api/updates")
@RequiredArgsConstructor
public class UpdatesController {

    private final DeviceRegistryService deviceRegistryService;
    private final RolloutService rolloutService;

    @GetMapping("/target")
    public ResponseEntity<?> target() {
        UUID deviceId = DeviceContextHolder.getDeviceId();
        Optional<Device> device = (deviceId == null) ? Optional.empty() : deviceRegistryService.findDevice(deviceId);
        Short ring = device.map(Device::getUpdateRing).orElse(null);
        String targetVersion = rolloutService.targetVersionFor(ring);

        Map<String, Object> body = new HashMap<>();
        body.put("ring", ring);
        body.put("targetVersion", targetVersion); // null permitido (fail-open en el updater)
        return ResponseEntity.ok(body);
    }
}
