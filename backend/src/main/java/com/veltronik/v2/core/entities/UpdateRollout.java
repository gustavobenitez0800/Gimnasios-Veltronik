package com.veltronik.v2.core.entities;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;

/**
 * Versión objetivo de un anillo de despliegue (ladrillo 7, ADR-007). El fundador
 * promueve una versión anillo por anillo; el updater de cada equipo consulta la de su
 * anillo. Config global (no tenant-aware): PK = el número de anillo.
 */
@Getter
@Setter
@Entity
@Table(name = "update_rollout")
public class UpdateRollout {

    /** 0=piloto, 1=amigos, 2=todos. */
    @Id
    @Column(name = "ring")
    private Short ring;

    @Column(name = "target_version", nullable = false, length = 32)
    private String targetVersion;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
}
