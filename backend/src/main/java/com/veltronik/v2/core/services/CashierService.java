package com.veltronik.v2.core.services;

import com.veltronik.v2.core.entities.Cashier;
import com.veltronik.v2.core.exceptions.BusinessException;
import com.veltronik.v2.core.exceptions.EntityNotFoundException;
import com.veltronik.v2.core.repositories.CashierRepository;
import com.veltronik.v2.core.repositories.TenantRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Cajeros con PIN (Fase 1, ladrillo 5). El dueño los gestiona acá (nube); el sync los
 * baja al local (CONFIG ↓) y {@link #verifyPin} es la pieza que el login local usará
 * offline en el ladrillo 6.
 *
 * <p><b>PIN:</b> 4 a 6 dígitos, único entre los cajeros ACTIVOS del tenant (el login de
 * kiosco es "tecleá tu PIN", sin usuario — dos PINs iguales serían ambiguos). Como solo
 * viven los hashes, la unicidad se verifica matcheando contra cada activo: N chico y el
 * alta de cajero es rara — el costo BCrypt no importa acá.</p>
 */
@Service
@RequiredArgsConstructor
public class CashierService {

    private static final Pattern PIN_FORMAT = Pattern.compile("\\d{4,6}");

    private final CashierRepository cashierRepository;
    private final TenantRepository tenantRepository;
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();

    public List<Cashier> list(UUID tenantId) {
        return cashierRepository.findByTenantIdOrderByNameAsc(tenantId);
    }

    @Transactional
    public Cashier create(UUID tenantId, String name, String pin, Cashier.Role role) {
        if (name == null || name.isBlank()) throw new BusinessException("Poné el nombre del cajero.");
        validatePin(tenantId, pin, null);

        Cashier cashier = new Cashier();
        cashier.setTenant(tenantRepository.getReferenceById(tenantId));
        cashier.setName(name.trim().substring(0, Math.min(120, name.trim().length())));
        cashier.setPinHash(encoder.encode(pin));
        cashier.setRole(role != null ? role : Cashier.Role.CAJERO);
        cashier.setActive(true);
        return cashierRepository.save(cashier);
    }

    @Transactional
    public void resetPin(UUID tenantId, UUID cashierId, String pin) {
        Cashier cashier = requireOwn(tenantId, cashierId);
        validatePin(tenantId, pin, cashierId);
        cashier.setPinHash(encoder.encode(pin));
        cashierRepository.save(cashier);
    }

    /** Desactivar nunca borra: el historial que referencie al cajero queda íntegro. */
    @Transactional
    public void setActive(UUID tenantId, UUID cashierId, boolean active) {
        Cashier cashier = requireOwn(tenantId, cashierId);
        cashier.setActive(active);
        cashierRepository.save(cashier);
    }

    /**
     * El corazón del login local (ladrillo 6): PIN → cajero activo del tenant.
     * Funciona idéntico en la nube y en el local (los hashes bajan por sync).
     */
    public Optional<Cashier> verifyPin(UUID tenantId, String pin) {
        if (pin == null || !PIN_FORMAT.matcher(pin).matches()) return Optional.empty();
        return cashierRepository.findByTenantIdAndActiveTrue(tenantId).stream()
                .filter(c -> encoder.matches(pin, c.getPinHash()))
                .findFirst();
    }

    private void validatePin(UUID tenantId, String pin, UUID exceptCashierId) {
        if (pin == null || !PIN_FORMAT.matcher(pin).matches()) {
            throw new BusinessException("El PIN debe tener entre 4 y 6 dígitos.");
        }
        boolean enUso = cashierRepository.findByTenantIdAndActiveTrue(tenantId).stream()
                .filter(c -> exceptCashierId == null || !exceptCashierId.equals(c.getId()))
                .anyMatch(c -> encoder.matches(pin, c.getPinHash()));
        if (enUso) throw new BusinessException("Ese PIN ya está en uso por otro cajero. Elegí otro.");
    }

    private Cashier requireOwn(UUID tenantId, UUID cashierId) {
        return cashierRepository.findById(cashierId)
                .filter(c -> c.getTenant() != null && tenantId.equals(c.getTenant().getId()))
                .orElseThrow(() -> new EntityNotFoundException("cajero de este negocio", cashierId));
    }
}
