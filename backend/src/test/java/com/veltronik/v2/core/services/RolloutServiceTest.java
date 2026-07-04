package com.veltronik.v2.core.services;

import com.veltronik.v2.core.entities.UpdateRollout;
import com.veltronik.v2.core.exceptions.BusinessException;
import com.veltronik.v2.core.repositories.UpdateRolloutRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/** Rollout escalonado (ladrillo 7): versión objetivo por anillo, con fail-open. */
class RolloutServiceTest {

    private UpdateRolloutRepository repository;
    private RolloutService service;

    @BeforeEach
    void setUp() {
        repository = mock(UpdateRolloutRepository.class);
        service = new RolloutService(repository);
        when(repository.save(any(UpdateRollout.class))).thenAnswer(inv -> inv.getArgument(0));
    }

    @Test
    @DisplayName("sin objetivo publicado para el anillo → null (fail-open: el updater toma la última)")
    void sin_objetivo_es_null() {
        when(repository.findById(any(Short.class))).thenReturn(Optional.empty());
        assertThat(service.targetVersionFor((short) 0)).isNull();
    }

    @Test
    @DisplayName("anillo null (equipo sin asignar) se trata como 'todos' (2)")
    void ring_null_es_todos() {
        UpdateRollout todos = new UpdateRollout();
        todos.setRing((short) 2);
        todos.setTargetVersion("2.6.4");
        when(repository.findById((short) 2)).thenReturn(Optional.of(todos));

        assertThat(service.targetVersionFor(null)).isEqualTo("2.6.4");
    }

    @Test
    @DisplayName("publicar valida el anillo y la versión")
    void set_valida() {
        when(repository.findById(any(Short.class))).thenReturn(Optional.empty());

        UpdateRollout saved = service.setTarget((short) 0, "2.7.0");
        assertThat(saved.getRing()).isEqualTo((short) 0);
        assertThat(saved.getTargetVersion()).isEqualTo("2.7.0");
        assertThat(saved.getUpdatedAt()).isNotNull();

        assertThatThrownBy(() -> service.setTarget((short) 5, "2.7.0")).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> service.setTarget((short) 0, "  ")).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> service.setTarget(null, "2.7.0")).isInstanceOf(BusinessException.class);
    }
}
