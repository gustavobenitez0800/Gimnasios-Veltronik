package com.veltronik.v2.gym.dto;

import lombok.Data;

/**
 * Contrato de ENTRADA para crear/editar una clase.
 *
 * <p>Cierra el mass-assignment: el controller ya NO recibe la entidad JPA cruda
 * ({@code GymClass}), sino este DTO con SOLO los campos editables. Así el cliente no puede
 * inyectar {@code id}, {@code tenant} ni los timestamps por el cuerpo del request. Los wrappers
 * (Integer/Boolean) permiten distinguir "no vino" (null) de un valor, para el patch parcial del PUT.</p>
 */
@Data
public class GymClassInputDTO {
    private String name;
    private String instructor;
    private String dayOfWeek;
    private String startTime;
    private String endTime;
    private Integer capacity;
    private String room;
    private String color;
    private String description;
    private Boolean active;
}
