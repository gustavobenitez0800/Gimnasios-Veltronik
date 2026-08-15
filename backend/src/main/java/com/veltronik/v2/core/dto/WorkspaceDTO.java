package com.veltronik.v2.core.dto;

import lombok.AllArgsConstructor;
import lombok.Data;

import java.util.Set;
import java.util.UUID;

/**
 * Manifiesto del espacio de trabajo del usuario en un gimnasio.
 *
 * Lo consume el frontend para dibujar la navegación SIN duplicar la política de roles:
 * el backend dice qué módulos puede ver el usuario y el front solo los pinta
 * ("el front dibuja lo que pasa en el backend"). La autorización real de los datos
 * sigue en cada endpoint (@PreAuthorize / requireRole).
 *
 * <p>Antes también viajaba un {@code orgType} con el rubro, para que el front eligiera
 * paleta y navegación. Se dio de baja con el resto del andamiaje multi-rubro: el
 * front no lo leía para nada más que para confirmar que decía "GYM".</p>
 */
@Data
@AllArgsConstructor
public class WorkspaceDTO {

    /** Gimnasio (tenant) al que corresponde este manifiesto. */
    private UUID tenantId;

    /** Rol del usuario en este gimnasio, en minúscula (owner/admin/staff/reception). */
    private String role;

    /** Claves de módulo que el usuario puede ver (contrato con la navegación del front). */
    private Set<String> modules;
}
