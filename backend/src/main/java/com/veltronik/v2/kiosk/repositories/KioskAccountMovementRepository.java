package com.veltronik.v2.kiosk.repositories;

import com.veltronik.v2.kiosk.entities.KioskAccountMovement;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface KioskAccountMovementRepository extends JpaRepository<KioskAccountMovement, UUID> {

    /** Movimientos de un cliente (su cuenta corriente), más recientes primero. */
    List<KioskAccountMovement> findByCustomerIdOrderByCreatedAtDesc(UUID customerId);

    /** ¿El cliente ya tiene movimientos? (protege contra el hard-delete con historial). */
    boolean existsByCustomerId(UUID customerId);
}
