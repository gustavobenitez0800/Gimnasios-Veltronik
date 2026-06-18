package com.veltronik.v2.fiscal.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/** Subida del certificado de ARCA. Llega en claro (PEM) y se guarda CIFRADO; nunca se persiste plano. */
@Data
public class FiscalCertificateInputDTO {
    @NotBlank(message = "El certificado (PEM) es obligatorio")
    private String certificatePem;

    @NotBlank(message = "La clave privada (PEM) es obligatoria")
    private String privateKeyPem;
}
