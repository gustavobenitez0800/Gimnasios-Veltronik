package com.veltronik.v2.fiscal.dto;

import lombok.Data;

/** Salida de la config fiscal. NUNCA expone cert/key (van con @JsonIgnore en la entidad). */
@Data
public class FiscalConfigDTO {
    private Long cuit;
    private String razonSocial;
    private String condicionIva;
    private String environment;
    private Integer defaultPosNumber;
    private boolean enabled;
    /** Derivado: ¿ya se subió el certificado? (sin exponerlo). */
    private boolean certificateLoaded;
}
