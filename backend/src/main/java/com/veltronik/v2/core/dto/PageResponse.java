package com.veltronik.v2.core.dto;

import org.springframework.data.domain.Page;

import java.util.List;

/**
 * Respuesta de página liviana y estable para el frontend.
 *
 * Evitamos serializar el {@code PageImpl} de Spring directamente (su JSON es
 * inestable entre versiones y Spring Boot 3.x lo desaconseja). Exponemos solo
 * lo que la UI necesita: el contenido y los totales para armar el paginador.
 */
public record PageResponse<T>(
        List<T> content,
        long totalElements,
        int totalPages,
        int page,
        int size
) {
    public static <T> PageResponse<T> of(Page<T> p) {
        return new PageResponse<>(p.getContent(), p.getTotalElements(), p.getTotalPages(), p.getNumber(), p.getSize());
    }
}
