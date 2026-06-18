package com.veltronik.v2.fiscal.repositories;

import com.veltronik.v2.fiscal.entities.FiscalVoucher;
import com.veltronik.v2.fiscal.entities.FiscalVoucherStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface FiscalVoucherRepository extends JpaRepository<FiscalVoucher, UUID> {

    /** Comprobantes de un origen (venta) — para no facturar dos veces lo mismo. */
    List<FiscalVoucher> findByTenantIdAndSourceTypeAndSourceIdOrderByCreatedAtDesc(
            UUID tenantId, String sourceType, UUID sourceId);

    /** Comprobantes a reintentar por el cron de contingencia (corre sin contexto de tenant). */
    List<FiscalVoucher> findTop200ByStatusOrderByCreatedAtAsc(FiscalVoucherStatus status);

    /** Listado de comprobantes del tenant (más recientes primero). */
    List<FiscalVoucher> findTop200ByTenantIdOrderByCreatedAtDesc(UUID tenantId);
}
