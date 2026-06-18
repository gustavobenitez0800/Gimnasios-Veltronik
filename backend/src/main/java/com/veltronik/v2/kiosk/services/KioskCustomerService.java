package com.veltronik.v2.kiosk.services;

import com.veltronik.v2.core.entities.Tenant;
import com.veltronik.v2.core.security.SecurityUtils;
import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.kiosk.dto.KioskCustomerInputDTO;
import com.veltronik.v2.kiosk.entities.KioskAccountMovement;
import com.veltronik.v2.kiosk.entities.KioskAccountMovementType;
import com.veltronik.v2.kiosk.entities.KioskCustomer;
import com.veltronik.v2.kiosk.repositories.KioskAccountMovementRepository;
import com.veltronik.v2.kiosk.repositories.KioskCustomerRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

/**
 * Clientes y cuenta corriente (fiado). El saldo es la suma del libro mayor
 * {@link KioskAccountMovement}; {@code balance} es un cache.
 *
 * <p>Concurrencia: la deuda de una venta (posible concurrencia) usa UPDATE atómico y NO toca el
 * cliente en memoria (no-dirty → no se pisa). El pago manual (sin concurrencia) escribe directo.</p>
 */
@Service
public class KioskCustomerService {

    private final KioskCustomerRepository customerRepository;
    private final KioskAccountMovementRepository movementRepository;

    public KioskCustomerService(KioskCustomerRepository customerRepository,
                                KioskAccountMovementRepository movementRepository) {
        this.customerRepository = customerRepository;
        this.movementRepository = movementRepository;
    }

    public List<KioskCustomer> findAllForCurrentTenant() {
        return customerRepository.findByTenantIdOrderByFullNameAsc(TenantContextHolder.getTenantId());
    }

    public List<KioskCustomer> findActiveForCurrentTenant() {
        return customerRepository.findByTenantIdAndActiveTrueOrderByFullNameAsc(TenantContextHolder.getTenantId());
    }

    public List<KioskCustomer> findWithDebtForCurrentTenant() {
        return customerRepository.findWithDebt(TenantContextHolder.getTenantId());
    }

    public KioskCustomer findByIdAndVerifyOwnership(UUID id) {
        KioskCustomer customer = customerRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Cliente no encontrado"));
        if (!customer.getTenant().getId().equals(TenantContextHolder.getTenantId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Acceso denegado a este cliente");
        }
        return customer;
    }

    public List<KioskAccountMovement> accountMovements(UUID customerId) {
        findByIdAndVerifyOwnership(customerId);
        return movementRepository.findByCustomerIdOrderByCreatedAtDesc(customerId);
    }

    @Transactional
    public KioskCustomer create(KioskCustomerInputDTO in) {
        KioskCustomer customer = new KioskCustomer();
        Tenant tenant = new Tenant();
        tenant.setId(TenantContextHolder.getTenantId());
        customer.setTenant(tenant);
        applyFields(customer, in);
        return customerRepository.save(customer);
    }

    @Transactional
    public KioskCustomer update(UUID id, KioskCustomerInputDTO in) {
        KioskCustomer customer = findByIdAndVerifyOwnership(id);
        applyFields(customer, in); // OJO: NO toca balance (solo se mueve por movimientos)
        return customerRepository.save(customer);
    }

    @Transactional
    public void deleteAndVerifyOwnership(UUID id) {
        KioskCustomer customer = findByIdAndVerifyOwnership(id);
        if (movementRepository.existsByCustomerId(id)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "El cliente tiene movimientos de cuenta corriente. Desactivalo en lugar de borrarlo.");
        }
        customerRepository.delete(customer);
    }

    /** Deuda por una venta fiada: asiento DEBT + suba atómica del saldo (no toca el cliente en memoria). */
    @Transactional
    public void registerDebt(KioskCustomer customer, BigDecimal amount, UUID saleId) {
        KioskAccountMovement movement = new KioskAccountMovement();
        movement.setTenant(customer.getTenant());
        movement.setCustomer(customer);
        movement.setType(KioskAccountMovementType.DEBT);
        movement.setAmount(amount);
        movement.setSaleId(saleId);
        movement.setCreatedBy(SecurityUtils.getCurrentUserId());
        movementRepository.save(movement);
        customerRepository.applyBalanceDelta(customer.getId(), amount);
    }

    /** Pago de la cuenta (manual): asiento PAYMENT + baja del saldo. Devuelve el cliente actualizado. */
    @Transactional
    public KioskCustomer registerPayment(UUID customerId, BigDecimal amount, String notes) {
        if (amount == null || amount.signum() <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El monto del pago debe ser mayor a cero");
        }
        KioskCustomer customer = findByIdAndVerifyOwnership(customerId);
        KioskAccountMovement movement = new KioskAccountMovement();
        movement.setTenant(customer.getTenant());
        movement.setCustomer(customer);
        movement.setType(KioskAccountMovementType.PAYMENT);
        movement.setAmount(amount);
        movement.setNotes(notes != null && !notes.isBlank() ? notes.trim() : null);
        movement.setCreatedBy(SecurityUtils.getCurrentUserId());
        movementRepository.save(movement);

        customer.setBalance(customer.getBalance().subtract(amount)); // operación dirigida, sin concurrencia
        return customerRepository.save(customer);
    }

    private void applyFields(KioskCustomer c, KioskCustomerInputDTO in) {
        if (in.getFullName() != null) c.setFullName(in.getFullName().trim());
        if (in.getPhone() != null) c.setPhone(in.getPhone().isBlank() ? null : in.getPhone().trim());
        if (in.getDniCuit() != null) c.setDniCuit(in.getDniCuit().isBlank() ? null : in.getDniCuit().trim());
        if (in.getCreditLimit() != null) c.setCreditLimit(in.getCreditLimit());
        if (in.getActive() != null) c.setActive(in.getActive());
    }
}
