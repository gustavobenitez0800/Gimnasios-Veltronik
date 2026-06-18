package com.veltronik.v2.fiscal.dto;

import lombok.Data;

/** Entrada para configurar ARCA. Patch parcial: solo pisa lo que vino. Enums como String. */
@Data
public class FiscalConfigInputDTO {
    private Long cuit;
    private String razonSocial;
    private String condicionIva;     // MONOTRIBUTO | RESPONSABLE_INSCRIPTO | EXENTO
    private String environment;      // HOMOLOGACION | PRODUCCION
    private Integer defaultPosNumber;
    private Boolean enabled;
}
