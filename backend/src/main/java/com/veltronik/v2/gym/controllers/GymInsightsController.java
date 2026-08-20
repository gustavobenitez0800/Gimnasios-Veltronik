package com.veltronik.v2.gym.controllers;

import com.veltronik.v2.gym.dto.OwnerInsightsDTO;
import com.veltronik.v2.gym.services.GymOwnerInsightsService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * El resumen del dueño sobre todas sus sucursales juntas.
 *
 * <p>Es el único endpoint del sistema que mira más de una sucursal a la vez; el porqué y
 * los límites están en {@link GymOwnerInsightsService}.</p>
 */
@RestController
@RequestMapping("/api/gym/insights")
@RequiredArgsConstructor
public class GymInsightsController {

    private final GymOwnerInsightsService insightsService;

    /**
     * Plata, altas y bajas de cada sucursal, mes a mes.
     *
     * <p><b>Por qué NO lleva {@code hasRole('OWNER')}.</b> El rol que inyecta
     * {@code TenantContextFilter} es el de la sucursal que el usuario tenga seleccionada en
     * ese momento, y este resumen no habla de esa sucursal sino de todas las suyas. Gatearlo
     * por ahí haría que ver el total dependiera de en qué local entró último, que es
     * justamente lo que esta pantalla viene a arreglar.</p>
     *
     * <p>El control real está en el servicio: arma la lista desde las membresías
     * <b>OWNER</b> del usuario. Quien no sea dueño de nada recibe un resumen vacío — no un
     * 403 confuso, simplemente no hay nada suyo que sumar.</p>
     */
    @GetMapping("/owner")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<OwnerInsightsDTO> ownerInsights(
            @RequestParam(defaultValue = "12") int months) {
        return ResponseEntity.ok(insightsService.forCurrentOwner(months));
    }
}
