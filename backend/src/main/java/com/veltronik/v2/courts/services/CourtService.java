package com.veltronik.v2.courts.services;

import com.veltronik.v2.core.entities.Tenant;
import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.courts.entities.Court;
import com.veltronik.v2.courts.repositories.CourtRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.UUID;

/** CRUD de canchas. Mismo patrón de aislamiento que GymClassService. */
@Service
public class CourtService {

    private final CourtRepository courtRepository;

    public CourtService(CourtRepository courtRepository) {
        this.courtRepository = courtRepository;
    }

    public List<Court> findAllForCurrentTenant() {
        return courtRepository.findByTenantIdOrderByDisplayOrderAscNameAsc(TenantContextHolder.getTenantId());
    }

    public List<Court> findActiveForCurrentTenant() {
        return courtRepository.findByTenantIdAndActiveTrueOrderByDisplayOrderAscNameAsc(TenantContextHolder.getTenantId());
    }

    public Court findByIdAndVerifyOwnership(UUID id) {
        Court court = courtRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Cancha no encontrada"));
        if (!court.getTenant().getId().equals(TenantContextHolder.getTenantId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Acceso denegado a esta cancha");
        }
        return court;
    }

    @Transactional
    public Court saveForCurrentTenant(Court court) {
        if (court.getTenant() == null) {
            Tenant tenant = new Tenant();
            tenant.setId(TenantContextHolder.getTenantId());
            court.setTenant(tenant);
        } else if (!court.getTenant().getId().equals(TenantContextHolder.getTenantId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Acceso denegado");
        }
        return courtRepository.save(court);
    }

    @Transactional
    public void deleteAndVerifyOwnership(UUID id) {
        Court court = findByIdAndVerifyOwnership(id);
        courtRepository.delete(court);
    }
}
