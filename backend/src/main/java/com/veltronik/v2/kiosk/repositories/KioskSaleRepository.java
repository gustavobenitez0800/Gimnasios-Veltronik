package com.veltronik.v2.kiosk.repositories;

import com.veltronik.v2.kiosk.entities.KioskSale;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface KioskSaleRepository extends JpaRepository<KioskSale, UUID> {

    /** Idempotencia: ¿esta venta (client_uuid) ya se registró? Replay seguro de la cola offline. */
    Optional<KioskSale> findByTenantIdAndClientUuid(UUID tenantId, UUID clientUuid);

    /** Ventas de una sesión de caja (resumen; los items se cargan solo en el detalle). */
    List<KioskSale> findByCashSessionIdOrderByCreatedAtDesc(UUID cashSessionId);

    /** Ventas del tenant en una ventana de fechas (reportes / listado del día). */
    List<KioskSale> findByTenantIdAndCreatedAtBetweenOrderByCreatedAtDesc(
            UUID tenantId, LocalDateTime from, LocalDateTime to);

    /**
     * Efectivo cobrado en una sesión (para el arqueo): Σ de los pagos CASH de las ventas
     * COMPLETED de esa caja. Solo el efectivo entra al cierre.
     */
    @Query("""
            SELECT COALESCE(SUM(pay.amount), 0) FROM KioskSale s
            JOIN s.payments pay
            WHERE s.cashSession.id = :sessionId
              AND s.status = com.veltronik.v2.kiosk.entities.KioskSaleStatus.COMPLETED
              AND pay.method = com.veltronik.v2.kiosk.entities.KioskPaymentMethod.CASH
            """)
    BigDecimal sumCashPaymentsBySession(@Param("sessionId") UUID sessionId);
}
