package com.veltronik.v2.gym.repositories;

import com.veltronik.v2.gym.entities.CajaCierre;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CajaCierreRepository extends JpaRepository<CajaCierre, UUID> {

    /**
     * El último cierre. Es de donde arranca el próximo período.
     *
     * <p>Se ordena por {@code hasta} y no por {@code createdAt}: son casi siempre lo mismo,
     * pero el período lo define hasta cuándo cubre el cierre, no cuándo se guardó la fila.</p>
     */
    Optional<CajaCierre> findTopByTenantIdOrderByHastaDesc(UUID tenantId);

    /**
     * El cierre que ya subió con ese sello, si está.
     *
     * <p>Es la mitad barata de la garantía anti-duplicado; la que garantiza de verdad es el
     * índice único de la V82. Acá se consulta ANTES de tocar nada, para que un reintento
     * devuelva el cierre que ya existe en vez de chocar contra el índice.</p>
     */
    Optional<CajaCierre> findByTenantIdAndClientRef(UUID tenantId, UUID clientRef);

    /** El historial que mira el dueño, del más reciente al más viejo. */
    List<CajaCierre> findByTenantIdOrderByHastaDesc(UUID tenantId, Pageable pageable);

    /** Los cierres hechos en un rango de días: van en el Excel del contador. */
    List<CajaCierre> findByTenantIdAndHastaBetweenOrderByHastaAsc(UUID tenantId, java.time.LocalDateTime desde,
                                                                 java.time.LocalDateTime hasta);
}
