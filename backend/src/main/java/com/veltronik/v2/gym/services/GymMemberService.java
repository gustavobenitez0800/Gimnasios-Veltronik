package com.veltronik.v2.gym.services;

import com.veltronik.v2.core.entities.Tenant;
import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.gym.entities.GymMember;
import com.veltronik.v2.gym.repositories.GymMemberRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.UUID;

@Service
@Transactional
public class GymMemberService {

    private final GymMemberRepository repository;
    /**
     * Para resolver el arancel y comprobar que sea de este gimnasio.
     *
     * <p>Se verifica ACÁ y no solo en el controlador a propósito: es la garantía de que
     * ningún camino —ni uno que se agregue mañana— pueda dejar a un socio apuntando al
     * arancel de otro negocio, y cobrarle un precio que su gimnasio no vende.</p>
     */
    private final GymPlanService planService;

    public GymMemberService(GymMemberRepository repository, GymPlanService planService) {
        this.repository = repository;
        this.planService = planService;
    }

    public List<GymMember> findAllForCurrentTenant() {
        return repository.findByTenantId(TenantContextHolder.getTenantId());
    }

    /** Página de socios del tenant actual, con búsqueda opcional (nombre/dni/email). */
    @Transactional(readOnly = true)
    public org.springframework.data.domain.Page<GymMember> findPageForCurrentTenant(
            String search, org.springframework.data.domain.Pageable pageable) {
        UUID tenantId = TenantContextHolder.getTenantId();
        if (search != null && !search.isBlank()) {
            return repository.searchByTenantId(tenantId, search.trim(), pageable);
        }
        return repository.findByTenantId(tenantId, pageable);
    }
    
    public GymMember saveForCurrentTenant(GymMember member) {
        Tenant tenant = new Tenant();
        tenant.setId(TenantContextHolder.getTenantId());
        member.setTenant(tenant);
        return repository.save(member);
    }
    
    public GymMember findByIdAndVerifyOwnership(UUID id) {
        GymMember member = repository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Miembro de gym no encontrado"));
                
        if (!member.getTenant().getId().equals(TenantContextHolder.getTenantId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Acceso denegado a este miembro");
        }
        return member;
    }
    
    public void deleteAndVerifyOwnership(UUID id) {
        GymMember member = findByIdAndVerifyOwnership(id);
        repository.delete(member);
    }

    /**
     * Cuántos socios se pueden tocar de una vez.
     *
     * <p>Existe para que un pedido armado a mano no pueda pedir una escritura sobre la tabla
     * entera. Es holgado a propósito: el gimnasio más grande que esperamos entra cómodo.</p>
     */
    private static final int TOPE_MASIVO = 2000;

    /**
     * Le pone (o le saca) el arancel a muchos socios de una sola vez.
     *
     * <p><b>Por qué esto vive acá y no en un bucle del navegador.</b> El gimnasio tiene 383
     * socios sin arancel. Hacerlo con 383 pedidos desde la pantalla son 383 viajes, más de un
     * minuto de espera, y —lo grave— cerrar la pestaña a la mitad deja la mitad hecha, sin
     * forma de saber cuál. Acá es UNA operación: se aplica entera o no se aplica.</p>
     *
     * @param plan el arancel, o {@code null} para sacárselo a todos
     * @return cuántos socios cambiaron
     */
    public int asignarArancelMasivo(List<UUID> ids, UUID planId) {
        if (ids == null || ids.isEmpty()) return 0;
        if (ids.size() > TOPE_MASIVO) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Son demasiados socios de una vez (máximo " + TOPE_MASIVO + ").");
        }
        // Dos garantías, y hacen falta las dos:
        //  1. el arancel tiene que ser de ESTE gimnasio (lo verifica findByIdAndVerifyOwnership);
        //  2. la escritura se acota por tenant, así un id ajeno en la lista no toca nada.
        // Sin la segunda, una operación que recibe una lista de ids es exactamente el lugar
        // donde alguien cuela el id de un socio de otro negocio.
        com.veltronik.v2.gym.entities.GymPlan plan =
                planId == null ? null : planService.findByIdAndVerifyOwnership(planId);
        return repository.asignarArancel(TenantContextHolder.getTenantId(), ids, plan);
    }
}
