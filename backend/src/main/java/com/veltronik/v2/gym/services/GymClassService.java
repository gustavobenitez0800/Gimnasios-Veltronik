package com.veltronik.v2.gym.services;

import com.veltronik.v2.core.services.TenantContext;
import com.veltronik.v2.gym.entities.GymClass;
import com.veltronik.v2.gym.repositories.GymClassRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
public class GymClassService {

    private final GymClassRepository classRepository;
    private final TenantContext tenantContext;

    public GymClassService(GymClassRepository classRepository, TenantContext tenantContext) {
        this.classRepository = classRepository;
        this.tenantContext = tenantContext;
    }

    public List<GymClass> findAllForCurrentTenant() {
        return classRepository.findByTenantId(tenantContext.getCurrentTenantId());
    }

    public List<GymClass> findActiveForCurrentTenant() {
        return classRepository.findByTenantIdAndIsActiveTrue(tenantContext.getCurrentTenantId());
    }

    public GymClass findByIdAndVerifyOwnership(UUID id) {
        GymClass gymClass = classRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Clase no encontrada"));
        
        if (!gymClass.getTenant().getId().equals(tenantContext.getCurrentTenantId())) {
            throw new RuntimeException("Acceso denegado a esta clase");
        }
        return gymClass;
    }

    @Transactional
    public GymClass saveForCurrentTenant(GymClass gymClass) {
        if (gymClass.getTenant() == null) {
            gymClass.setTenant(tenantContext.getCurrentTenant());
        } else if (!gymClass.getTenant().getId().equals(tenantContext.getCurrentTenantId())) {
             throw new RuntimeException("Acceso denegado");
        }
        return classRepository.save(gymClass);
    }

    @Transactional
    public void deleteAndVerifyOwnership(UUID id) {
        GymClass gymClass = findByIdAndVerifyOwnership(id);
        classRepository.delete(gymClass);
    }
}
