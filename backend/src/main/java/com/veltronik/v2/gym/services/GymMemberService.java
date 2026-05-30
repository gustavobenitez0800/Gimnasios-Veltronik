package com.veltronik.v2.gym.services;

import com.veltronik.v2.core.entities.Tenant;
import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.core.services.BaseServiceImpl;
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

    public GymMemberService(GymMemberRepository repository) {
        this.repository = repository;
    }

    public List<GymMember> findAllForCurrentTenant() {
        return repository.findByTenantId(TenantContextHolder.getTenantId());
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
}
