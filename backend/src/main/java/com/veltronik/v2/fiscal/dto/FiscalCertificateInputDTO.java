package com.veltronik.v2.fiscal.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/**
 * Subida del certificado de ARCA. Llega en claro (PEM) y se guarda CIFRADO; nunca se persiste plano.
 * La clave privada es OPCIONAL: en el flujo del generador de CSR ya está guardada en el servidor y
 * solo se pega el certificado; en el flujo avanzado se pegan ambos.
 */
@Data
public class FiscalCertificateInputDTO {
    @NotBlank(message = "El certificado (PEM) es obligatorio")
    private String certificatePem;

    private String privateKeyPem;
}
