package com.veltronik.v2.core.services;

import com.veltronik.v2.core.entities.UpdateRollout;
import com.veltronik.v2.core.exceptions.BusinessException;
import com.veltronik.v2.core.repositories.UpdateRolloutRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

/**
 * El rollout escalonado (ladrillo 7, ADR-007): qué versión objetivo le toca a cada anillo.
 * El fundador la publica; cada equipo consulta la de su anillo.
 */
@Service
@RequiredArgsConstructor
public class RolloutService {

    /** Un equipo sin anillo asignado se trata como "todos" (la última ola). */
    private static final short DEFAULT_RING = 2;

    private final UpdateRolloutRepository repository;

    /** Versión objetivo del anillo del equipo. Null = sin freno (el updater toma la última). */
    public String targetVersionFor(Short ring) {
        short r = (ring == null) ? DEFAULT_RING : ring;
        return repository.findById(r).map(UpdateRollout::getTargetVersion).orElse(null);
    }

    /** Todos los objetivos publicados (para Mission Control). */
    public List<UpdateRollout> all() {
        return repository.findAll();
    }

    /** Publica/actualiza la versión objetivo de un anillo (fundador). */
    @Transactional
    public UpdateRollout setTarget(Short ring, String targetVersion) {
        if (ring == null || ring < 0 || ring > 2) {
            throw new BusinessException("Anillo inválido (0=piloto, 1=amigos, 2=todos).");
        }
        if (targetVersion == null || targetVersion.isBlank()) {
            throw new BusinessException("Indicá la versión objetivo (ej: 2.7.0).");
        }
        UpdateRollout rollout = repository.findById(ring).orElseGet(() -> {
            UpdateRollout fresh = new UpdateRollout();
            fresh.setRing(ring);
            return fresh;
        });
        rollout.setTargetVersion(targetVersion.trim());
        rollout.setUpdatedAt(LocalDateTime.now());
        return repository.save(rollout);
    }
}
