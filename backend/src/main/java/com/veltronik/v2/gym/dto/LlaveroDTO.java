package com.veltronik.v2.gym.dto;

import com.veltronik.v2.gym.entities.MemberCredential;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Un llavero, como lo ve la ficha del socio: el número, desde cuándo, quién lo asignó y, si se
 * dio de baja, cuándo y por qué.
 */
public record LlaveroDTO(
        UUID id,
        UUID socioId,
        String codigo,
        boolean activo,
        LocalDateTime asignadoEn,
        String asignadoPor,
        LocalDateTime dadoDeBajaEn,
        String motivoBaja,
        String dadoDeBajaPor) {

    public static LlaveroDTO de(MemberCredential c) {
        return new LlaveroDTO(c.getId(), c.getMemberId(), c.getCodigo(), c.estaActivo(),
                c.getCreatedAt(), c.getAsignadoPorNombre(),
                c.getDadoDeBajaAt(), c.getMotivoBaja(), c.getDadoDeBajaPorNombre());
    }
}
