package com.veltronik.v2.core.repositories;

import com.veltronik.v2.core.entities.SesionCierre;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface SesionCierreRepository extends JpaRepository<SesionCierre, UUID> {

    /** Los avisos que ya están anotados, para no volver a anotar un reintento. */
    List<SesionCierre> findByClientRefIn(Collection<UUID> clientRefs);
}
