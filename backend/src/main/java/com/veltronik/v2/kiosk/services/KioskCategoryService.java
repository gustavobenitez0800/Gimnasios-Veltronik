package com.veltronik.v2.kiosk.services;

import com.veltronik.v2.core.entities.Tenant;
import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.kiosk.dto.KioskCategoryInputDTO;
import com.veltronik.v2.kiosk.entities.KioskCategory;
import com.veltronik.v2.kiosk.repositories.KioskCategoryRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.UUID;

/** CRUD de rubros. Mismo patrón de aislamiento que {@code CourtService}. */
@Service
public class KioskCategoryService {

    private final KioskCategoryRepository categoryRepository;

    public KioskCategoryService(KioskCategoryRepository categoryRepository) {
        this.categoryRepository = categoryRepository;
    }

    public List<KioskCategory> findAllForCurrentTenant() {
        return categoryRepository.findByTenantIdOrderByDisplayOrderAscNameAsc(TenantContextHolder.getTenantId());
    }

    public List<KioskCategory> findActiveForCurrentTenant() {
        return categoryRepository.findByTenantIdAndActiveTrueOrderByDisplayOrderAscNameAsc(TenantContextHolder.getTenantId());
    }

    public KioskCategory findByIdAndVerifyOwnership(UUID id) {
        KioskCategory category = categoryRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Rubro no encontrado"));
        if (!category.getTenant().getId().equals(TenantContextHolder.getTenantId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Acceso denegado a este rubro");
        }
        return category;
    }

    @Transactional
    public KioskCategory create(KioskCategoryInputDTO in) {
        KioskCategory category = new KioskCategory();
        Tenant tenant = new Tenant();
        tenant.setId(TenantContextHolder.getTenantId());
        category.setTenant(tenant);
        applyFields(category, in);
        return categoryRepository.save(category);
    }

    @Transactional
    public KioskCategory update(UUID id, KioskCategoryInputDTO in) {
        KioskCategory category = findByIdAndVerifyOwnership(id);
        applyFields(category, in);
        return categoryRepository.save(category);
    }

    @Transactional
    public void deleteAndVerifyOwnership(UUID id) {
        KioskCategory category = findByIdAndVerifyOwnership(id);
        categoryRepository.delete(category);
    }

    private void applyFields(KioskCategory c, KioskCategoryInputDTO in) {
        if (in.getName() != null) c.setName(in.getName().trim());
        if (in.getDisplayOrder() != null) c.setDisplayOrder(in.getDisplayOrder());
        if (in.getActive() != null) c.setActive(in.getActive());
    }
}
