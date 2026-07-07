package com.veltronik.v2.fiscal.entities;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.veltronik.v2.core.entities.TenantAwareEntity;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

/**
 * Configuración fiscal del tenant: su identidad ante ARCA y sus credenciales.
 *
 * <p><b>Seguridad multi-tenant:</b> el certificado X.509 y la clave privada se guardan
 * CIFRADOS (AES-GCM) en {@code certificateEnc}/{@code privateKeyEnc}. Llevan {@link JsonIgnore}
 * → jamás se serializan a la API, jamás se loguean. Se descifran solo en memoria al firmar el
 * Login Ticket de WSAA.</p>
 */
@Entity
@Table(name = "fiscal_config", uniqueConstraints = {
        @UniqueConstraint(name = "ux_fiscal_config_tenant", columnNames = {"tenant_id"})
})
@Getter
@Setter
public class FiscalConfig extends TenantAwareEntity {

    /** CUIT del emisor (11 dígitos). NULL hasta que el dueño lo carga (onboarding);
     *  la emisión lo exige vía requireComplete(), no la BD (V39). */
    @Column
    private Long cuit;

    @Column(name = "razon_social")
    private String razonSocial;

    /** NULL hasta que el dueño la elige (onboarding); la emisión la exige requireComplete(). */
    @Enumerated(EnumType.STRING)
    @Column(name = "condicion_iva", length = 30)
    private FiscalCondicionIva condicionIva;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 15)
    private FiscalEnvironment environment = FiscalEnvironment.HOMOLOGACION;

    @Column(name = "default_pos_number")
    private Integer defaultPosNumber;

    /** Certificado X.509 (PEM) cifrado. SENSIBLE: nunca se expone. */
    @JsonIgnore
    @Column(name = "certificate_enc", columnDefinition = "text")
    private String certificateEnc;

    /** Clave privada (PEM) cifrada. SENSIBLE: nunca se expone. */
    @JsonIgnore
    @Column(name = "private_key_enc", columnDefinition = "text")
    private String privateKeyEnc;

    /** Solo emite si está completo (cuit + cert + key + pos) y activo. */
    @Column(nullable = false)
    private boolean enabled = false;
}
