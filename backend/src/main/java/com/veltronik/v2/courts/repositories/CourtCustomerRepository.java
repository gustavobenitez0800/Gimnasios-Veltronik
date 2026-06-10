package com.veltronik.v2.courts.repositories;

import com.veltronik.v2.courts.entities.CourtCustomer;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface CourtCustomerRepository extends JpaRepository<CourtCustomer, UUID> {
    List<CourtCustomer> findByTenantIdOrderByFullNameAsc(UUID tenantId);

    /** El teléfono normalizado es la identidad del cliente (la usa el bot de WhatsApp en F3). */
    Optional<CourtCustomer> findByTenantIdAndPhone(UUID tenantId, String phone);

    List<CourtCustomer> findByTenantIdAndFullNameContainingIgnoreCaseOrTenantIdAndPhoneContaining(
            UUID tenantId, String name, UUID tenantId2, String phone);
}
