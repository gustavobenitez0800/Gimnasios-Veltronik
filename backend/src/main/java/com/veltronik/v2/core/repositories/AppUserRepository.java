package com.veltronik.v2.core.repositories;

import com.veltronik.v2.core.entities.AppUser;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface AppUserRepository extends JpaRepository<AppUser, UUID> {
    Optional<AppUser> findByEmail(String email);
    boolean existsByEmail(String email);

    /**
     * Cuentas cuya gracia de 30 días ya venció: les toca borrarse. Las busca el trabajo
     * nocturno, sin sesión ni contexto de gimnasio.
     */
    java.util.List<AppUser> findByDeletionScheduledAtBefore(java.time.LocalDateTime limite);
}
