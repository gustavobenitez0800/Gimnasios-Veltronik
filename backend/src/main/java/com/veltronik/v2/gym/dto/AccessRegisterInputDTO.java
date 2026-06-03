package com.veltronik.v2.gym.dto;

import lombok.Data;

import java.util.UUID;

/**
 * Contrato de ENTRADA para registrar un acceso (toggle check-in / check-out).
 * Reemplaza el {@code Map<String,Object>} sin tipar del controller. El frontend
 * ya envía {@code memberId} y {@code method}.
 */
@Data
public class AccessRegisterInputDTO {
    private UUID memberId;
    private String method;
}
