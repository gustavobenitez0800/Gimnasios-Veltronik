package com.veltronik.v2.gym.repositories;

import com.veltronik.v2.gym.entities.CajaMovimiento;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

public interface CajaMovimientoRepository extends JpaRepository<CajaMovimiento, UUID> {

    /**
     * Los movimientos de un período, del más nuevo al más viejo.
     *
     * <p>Trae también los anulados: el arqueo los descarta, pero la pantalla del dueño tiene
     * que poder mostrarlos tachados. Un egreso que aparece y desaparece de la lista es
     * exactamente lo que no queremos que se pueda hacer.</p>
     */
    List<CajaMovimiento> findByTenantIdAndFechaBetweenOrderByFechaDesc(
            UUID tenantId, LocalDateTime desde, LocalDateTime hasta);
}
