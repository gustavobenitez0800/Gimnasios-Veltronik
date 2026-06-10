package com.veltronik.v2.courts.services;

import com.veltronik.v2.core.entities.Tenant;
import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.courts.entities.CourtCustomer;
import com.veltronik.v2.courts.repositories.CourtCustomerRepository;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.UUID;

/**
 * Clientes del complejo. El teléfono normalizado es la identidad (único por tenant):
 * lo usa el flujo mostrador (busca-o-crea al tipear una reserva) y será la llave del
 * bot de WhatsApp en Fase 3.
 */
@Service
public class CourtCustomerService {

    private final CourtCustomerRepository customerRepository;

    public CourtCustomerService(CourtCustomerRepository customerRepository) {
        this.customerRepository = customerRepository;
    }

    /**
     * Normaliza un teléfono a "solo dígitos, con '+' inicial opcional".
     * "+54 9 (376) 412-3456" → "+5493764123456". No valida formato país:
     * los números argentinos reales son demasiado heterogéneos para rebotar gente.
     */
    public static String normalizePhone(String raw) {
        if (raw == null) return null;
        String trimmed = raw.trim();
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < trimmed.length(); i++) {
            char c = trimmed.charAt(i);
            if (Character.isDigit(c)) sb.append(c);
            else if (c == '+' && sb.isEmpty()) sb.append(c);
        }
        return sb.toString();
    }

    public List<CourtCustomer> findAllForCurrentTenant() {
        return customerRepository.findByTenantIdOrderByFullNameAsc(TenantContextHolder.getTenantId());
    }

    public List<CourtCustomer> searchForCurrentTenant(String query) {
        UUID tenantId = TenantContextHolder.getTenantId();
        String q = (query == null) ? "" : query.trim();
        return customerRepository
                .findByTenantIdAndFullNameContainingIgnoreCaseOrTenantIdAndPhoneContaining(
                        tenantId, q, tenantId, normalizePhone(q));
    }

    public CourtCustomer findByIdAndVerifyOwnership(UUID id) {
        CourtCustomer customer = customerRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Cliente no encontrado"));
        if (!customer.getTenant().getId().equals(TenantContextHolder.getTenantId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Acceso denegado a este cliente");
        }
        return customer;
    }

    /**
     * Flujo mostrador: el dueño tipea nombre + celu en el modal de reserva y el cliente
     * se resuelve solo. Si el teléfono ya existe en el tenant, devuelve ese cliente
     * (NO le pisa el nombre: puede ser un apodo distinto); si no, lo crea.
     */
    @Transactional
    public CourtCustomer findOrCreate(String fullName, String rawPhone) {
        String phone = normalizePhone(rawPhone);
        if (phone == null || phone.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El teléfono del cliente es obligatorio");
        }
        UUID tenantId = TenantContextHolder.getTenantId();
        return customerRepository.findByTenantIdAndPhone(tenantId, phone)
                .orElseGet(() -> {
                    CourtCustomer c = new CourtCustomer();
                    c.setFullName((fullName == null || fullName.isBlank()) ? phone : fullName.trim());
                    c.setPhone(phone);
                    Tenant tenant = new Tenant();
                    tenant.setId(tenantId);
                    c.setTenant(tenant);
                    return customerRepository.save(c);
                });
    }

    @Transactional
    public CourtCustomer saveForCurrentTenant(CourtCustomer customer) {
        if (customer.getTenant() == null) {
            Tenant tenant = new Tenant();
            tenant.setId(TenantContextHolder.getTenantId());
            customer.setTenant(tenant);
        } else if (!customer.getTenant().getId().equals(TenantContextHolder.getTenantId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Acceso denegado");
        }
        customer.setPhone(normalizePhone(customer.getPhone()));
        try {
            return customerRepository.saveAndFlush(customer);
        } catch (DataIntegrityViolationException e) {
            // ux_court_customer_phone: el teléfono es la identidad, no puede repetirse.
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Ya existe un cliente con ese teléfono");
        }
    }

    @Transactional
    public void deleteAndVerifyOwnership(UUID id) {
        CourtCustomer customer = findByIdAndVerifyOwnership(id);
        customerRepository.delete(customer);
    }
}
