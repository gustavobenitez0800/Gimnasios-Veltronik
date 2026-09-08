package com.veltronik.v2.gym.repositories;

import com.veltronik.v2.gym.entities.CajaMovimiento;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
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

    /**
     * El movimiento que ya se guardó con ese sello del terminal, si está.
     *
     * <p>Es la mitad en código de la garantía de la V63: antes de escribir nada, si ese
     * {@code client_ref} ya existe se devuelve el que hay y no se ejecuta ningún efecto. La
     * otra mitad —la que de verdad garantiza— es el índice único parcial, porque el vaciado
     * de la cola puede correr dos veces a la vez y entre el "buscá" y el "insertá" hay una
     * ventana por la que pasan las dos.</p>
     *
     * <p>Va por gimnasio: dos gimnasios pueden generar el mismo UUID sin que uno pise al
     * otro. "Improbable" no es una garantía de aislamiento.</p>
     */
    Optional<CajaMovimiento> findByTenantIdAndClientRef(UUID tenantId, UUID clientRef);
}
