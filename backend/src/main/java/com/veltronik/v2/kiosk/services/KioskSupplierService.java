package com.veltronik.v2.kiosk.services;

import com.veltronik.v2.core.entities.Tenant;
import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.kiosk.dto.KioskSupplierInputDTO;
import com.veltronik.v2.kiosk.entities.KioskSupplier;
import com.veltronik.v2.kiosk.repositories.KioskPurchaseRepository;
import com.veltronik.v2.kiosk.repositories.KioskSupplierRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.UUID;

/** CRUD de proveedores. Mismo patrón de aislamiento que el resto del módulo. */
@Service
public class KioskSupplierService {

    private final KioskSupplierRepository supplierRepository;
    private final KioskPurchaseRepository purchaseRepository;

    public KioskSupplierService(KioskSupplierRepository supplierRepository,
                                KioskPurchaseRepository purchaseRepository) {
        this.supplierRepository = supplierRepository;
        this.purchaseRepository = purchaseRepository;
    }

    public List<KioskSupplier> findAllForCurrentTenant() {
        return supplierRepository.findByTenantIdOrderByNameAsc(TenantContextHolder.getTenantId());
    }

    public List<KioskSupplier> findActiveForCurrentTenant() {
        return supplierRepository.findByTenantIdAndActiveTrueOrderByNameAsc(TenantContextHolder.getTenantId());
    }

    public KioskSupplier findByIdAndVerifyOwnership(UUID id) {
        KioskSupplier supplier = supplierRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Proveedor no encontrado"));
        if (!supplier.getTenant().getId().equals(TenantContextHolder.getTenantId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Acceso denegado a este proveedor");
        }
        return supplier;
    }

    @Transactional
    public KioskSupplier create(KioskSupplierInputDTO in) {
        KioskSupplier supplier = new KioskSupplier();
        Tenant tenant = new Tenant();
        tenant.setId(TenantContextHolder.getTenantId());
        supplier.setTenant(tenant);
        applyFields(supplier, in);
        return supplierRepository.save(supplier);
    }

    @Transactional
    public KioskSupplier update(UUID id, KioskSupplierInputDTO in) {
        KioskSupplier supplier = findByIdAndVerifyOwnership(id);
        applyFields(supplier, in);
        return supplierRepository.save(supplier);
    }

    @Transactional
    public void deleteAndVerifyOwnership(UUID id) {
        KioskSupplier supplier = findByIdAndVerifyOwnership(id);
        if (purchaseRepository.existsBySupplierId(id)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "El proveedor tiene compras registradas. Desactivalo en lugar de borrarlo.");
        }
        supplierRepository.delete(supplier);
    }

    private void applyFields(KioskSupplier s, KioskSupplierInputDTO in) {
        if (in.getName() != null) s.setName(in.getName().trim());
        if (in.getPhone() != null) s.setPhone(in.getPhone().isBlank() ? null : in.getPhone().trim());
        if (in.getCuit() != null) s.setCuit(in.getCuit().isBlank() ? null : in.getCuit().trim());
        if (in.getNotes() != null) s.setNotes(in.getNotes().isBlank() ? null : in.getNotes().trim());
        if (in.getActive() != null) s.setActive(in.getActive());
    }
}
