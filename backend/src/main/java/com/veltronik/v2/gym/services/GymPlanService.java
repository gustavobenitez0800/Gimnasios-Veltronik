package com.veltronik.v2.gym.services;

import com.veltronik.v2.core.entities.Tenant;
import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.gym.entities.GymPlan;
import com.veltronik.v2.gym.repositories.GymPlanRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.UUID;

/**
 * El catálogo de aranceles del gimnasio.
 *
 * <p>Todo acotado al negocio actual, como el resto del vertical: un gimnasio no puede ver ni
 * tocar los aranceles de otro.</p>
 */
@Service
public class GymPlanService {

    private final GymPlanRepository repository;

    public GymPlanService(GymPlanRepository repository) {
        this.repository = repository;
    }

    @Transactional(readOnly = true)
    public List<GymPlan> findAllForCurrentTenant() {
        return repository.findByTenantIdOrderByIsActiveDescPriceAsc(TenantContextHolder.getTenantId());
    }

    /** Los que se pueden cobrar hoy. Es lo que ve el selector al registrar un pago. */
    @Transactional(readOnly = true)
    public List<GymPlan> findVigentesForCurrentTenant() {
        return repository.findByTenantIdAndIsActiveTrueOrderByPriceAsc(TenantContextHolder.getTenantId());
    }

    @Transactional(readOnly = true)
    public GymPlan findByIdAndVerifyOwnership(UUID id) {
        GymPlan plan = repository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Arancel no encontrado"));
        if (plan.getTenant() == null || !plan.getTenant().getId().equals(TenantContextHolder.getTenantId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Acceso denegado a este arancel");
        }
        return plan;
    }

    @Transactional
    public GymPlan save(GymPlan plan) {
        validar(plan);

        UUID tenantId = TenantContextHolder.getTenantId();

        // Dos aranceles vigentes con el mismo nombre serían indistinguibles justo en el momento
        // de cobrar, que es cuando peor se paga el error. La base lo impide con un índice único;
        // esto lo dice con palabras antes de que llegue como un error de constraint.
        repository.findVigentePorNombre(tenantId, plan.getName()).ifPresent(existente -> {
            if (plan.getId() == null || !existente.getId().equals(plan.getId())) {
                throw new ResponseStatusException(HttpStatus.CONFLICT,
                        "Ya existe un arancel vigente que se llama \"" + existente.getName() + "\"");
            }
        });

        Tenant t = new Tenant();
        t.setId(tenantId);
        plan.setTenant(t);
        return repository.save(plan);
    }

    /**
     * Baja lógica. <b>Nunca se borra</b>: hay pagos que nombran a este arancel, y borrarlo
     * dejaría esa historia sin explicación — "se cobraron $45.000 de algo que ya no existe".
     */
    @Transactional
    public void darDeBaja(UUID id) {
        GymPlan plan = findByIdAndVerifyOwnership(id);
        plan.setActive(false);
        repository.save(plan);
    }

    @Transactional
    public GymPlan reactivar(UUID id) {
        GymPlan plan = findByIdAndVerifyOwnership(id);
        repository.findVigentePorNombre(TenantContextHolder.getTenantId(), plan.getName())
                .ifPresent(otro -> { throw new ResponseStatusException(HttpStatus.CONFLICT,
                        "Ya hay un arancel vigente con ese nombre"); });
        plan.setActive(true);
        return repository.save(plan);
    }

    private void validar(GymPlan plan) {
        if (plan.getName() == null || plan.getName().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El arancel necesita un nombre");
        }
        if (plan.getDurationDays() < 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Los días no pueden ser negativos");
        }
        if (plan.getClasses() != null && plan.getClasses() < 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Las clases no pueden ser negativas");
        }
        // Un arancel que no otorga ni tiempo ni clases no cubre nada: sería cobrarle a alguien
        // por nada. Es un error de carga, no una opción.
        if (plan.getDurationDays() == 0 && (plan.getClasses() == null || plan.getClasses() == 0)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "El arancel tiene que otorgar días, clases, o las dos cosas");
        }
    }
}
