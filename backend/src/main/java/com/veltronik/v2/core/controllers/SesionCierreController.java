package com.veltronik.v2.core.controllers;

import com.veltronik.v2.core.security.DeviceContextHolder;
import com.veltronik.v2.core.security.SecurityUtils;
import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.core.services.SesionCierreService;
import com.veltronik.v2.core.services.SesionCierreService.Aviso;
import com.veltronik.v2.core.services.SesionCierreService.Origen;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Donde un terminal avisa por qué se le cerró la sesión (V89).
 *
 * <p><b>Va bajo {@code /api/account} y NO bajo un gimnasio</b> porque el aviso sube apenas hay
 * una sesión, y en el Lobby todavía no hay sucursal elegida: {@code KillSwitchFilter} no pide
 * sucursal en este prefijo. Si la sucursal viene en la cabecera, se anota.</p>
 */
@RestController
@RequestMapping("/api/account")
@RequiredArgsConstructor
public class SesionCierreController {

    private final SesionCierreService service;

    /** El cuerpo del pedido: la lista de cierres que el terminal tiene sin avisar. */
    public record Pedido(List<Aviso> cierres) {}

    /**
     * Anota los cierres. Devuelve los sellos que quedaron anotados, que son los que el
     * terminal ya puede olvidar.
     */
    @PostMapping("/cierres-de-sesion")
    public ResponseEntity<?> avisar(@RequestBody(required = false) Pedido pedido,
                                    @RequestHeader(value = "X-App-Version", required = false) String appVersion) {
        UUID userId = SecurityUtils.getCurrentUserId();
        if (userId == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();

        Origen origen = new Origen(userId, TenantContextHolder.getTenantId(),
                DeviceContextHolder.getDeviceId(), appVersion);
        List<UUID> anotados = service.registrar(pedido == null ? null : pedido.cierres(), origen);
        return ResponseEntity.ok(Map.of("anotados", anotados));
    }
}
