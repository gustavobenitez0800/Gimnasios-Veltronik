package com.veltronik.v2.gym.controllers;

import com.veltronik.v2.gym.dto.GymPlanDTO;
import com.veltronik.v2.gym.entities.GymPlan;
import com.veltronik.v2.gym.services.GymPlanService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

/**
 * Los aranceles del gimnasio.
 *
 * <p><b>Leer lo puede cualquiera que atienda</b>: recepción necesita el catálogo para cobrar.
 * <b>Tocarlo, solo dueño o admin</b>: cambiar un precio es una decisión del negocio, y quien
 * está en el mostrador no tiene por qué cargar con esa responsabilidad.</p>
 */
@RestController
@RequestMapping("/api/gym/plans")
public class GymPlanController {

    private final GymPlanService service;

    public GymPlanController(GymPlanService service) {
        this.service = service;
    }

    /** Todos, incluidos los dados de baja (para la pantalla de configuración). */
    @GetMapping
    public ResponseEntity<List<GymPlanDTO>> listar() {
        return ResponseEntity.ok(service.findAllForCurrentTenant().stream().map(GymPlanController::toDto).toList());
    }

    /** Solo los que se venden hoy. Es lo que alimenta el selector al cobrar. */
    @GetMapping("/vigentes")
    public ResponseEntity<List<GymPlanDTO>> vigentes() {
        return ResponseEntity.ok(service.findVigentesForCurrentTenant().stream().map(GymPlanController::toDto).toList());
    }

    @PostMapping
    @PreAuthorize("hasAnyRole('OWNER','ADMIN')")
    public ResponseEntity<GymPlanDTO> crear(@RequestBody GymPlanDTO in) {
        GymPlan p = new GymPlan();
        aplicar(p, in);
        return ResponseEntity.ok(toDto(service.save(p)));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAnyRole('OWNER','ADMIN')")
    public ResponseEntity<GymPlanDTO> editar(@PathVariable UUID id, @RequestBody GymPlanDTO in) {
        GymPlan p = service.findByIdAndVerifyOwnership(id);
        aplicar(p, in);
        return ResponseEntity.ok(toDto(service.save(p)));
    }

    /**
     * Da de baja el arancel. No lo borra: los pagos viejos lo nombran.
     */
    @DeleteMapping("/{id}")
    @PreAuthorize("hasAnyRole('OWNER','ADMIN')")
    public ResponseEntity<Void> darDeBaja(@PathVariable UUID id) {
        service.darDeBaja(id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{id}/reactivar")
    @PreAuthorize("hasAnyRole('OWNER','ADMIN')")
    public ResponseEntity<GymPlanDTO> reactivar(@PathVariable UUID id) {
        return ResponseEntity.ok(toDto(service.reactivar(id)));
    }

    // ── Traducción ────────────────────────────────────────────────────────────
    // A mano y no con MapStruct: son seis campos y así queda a la vista que `classes` NULL se
    // conserva como NULL. Un mapeo automático con un int primitivo lo convertiría en 0 sin
    // avisar, y 0 significa otra cosa ("se acabaron", no "no se cuentan").

    private static void aplicar(GymPlan p, GymPlanDTO in) {
        if (in.getName() != null) p.setName(in.getName().trim());
        if (in.getPrice() != null) p.setPrice(in.getPrice());
        if (in.getDurationDays() != null) p.setDurationDays(in.getDurationDays());
        // `classes` se asigna siempre, incluso null: es la forma de pasar un arancel de
        // "cuenta visitas" a "no cuenta visitas".
        p.setClasses(in.getClasses());
        if (in.getActive() != null) p.setActive(in.getActive());
    }

    private static GymPlanDTO toDto(GymPlan p) {
        GymPlanDTO d = new GymPlanDTO();
        d.setId(p.getId());
        d.setName(p.getName());
        d.setPrice(p.getPrice() != null ? p.getPrice() : BigDecimal.ZERO);
        d.setDurationDays(p.getDurationDays());
        d.setClasses(p.getClasses());
        d.setActive(p.isActive());
        return d;
    }
}
