package com.veltronik.v2.gym.services;

import com.veltronik.v2.core.entities.Tenant;
import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.gym.entities.GymClass;
import com.veltronik.v2.gym.repositories.GymClassRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
public class GymClassService {

    private final GymClassRepository classRepository;

    public GymClassService(GymClassRepository classRepository) {
        this.classRepository = classRepository;
    }

    public List<GymClass> findAllForCurrentTenant() {
        return classRepository.findByTenantId(TenantContextHolder.getTenantId());
    }

    public List<GymClass> findActiveForCurrentTenant() {
        return classRepository.findByTenantIdAndIsActiveTrue(TenantContextHolder.getTenantId());
    }

    public GymClass findByIdAndVerifyOwnership(UUID id) {
        GymClass gymClass = classRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Clase no encontrada"));
        
        if (!gymClass.getTenant().getId().equals(TenantContextHolder.getTenantId())) {
            throw new RuntimeException("Acceso denegado a esta clase");
        }
        return gymClass;
    }

    @Transactional
    public GymClass saveForCurrentTenant(GymClass gymClass) {
        if (gymClass.getTenant() == null) {
            Tenant tenant = new Tenant();
            tenant.setId(TenantContextHolder.getTenantId());
            gymClass.setTenant(tenant);
        } else if (!gymClass.getTenant().getId().equals(TenantContextHolder.getTenantId())) {
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
