package com.veltronik.v2.core.dto;

import lombok.AllArgsConstructor;
import lombok.Data;

import java.util.Set;
import java.util.UUID;

/**
 * Manifiesto del espacio de trabajo del usuario en un negocio.
 *
 * Lo consume el frontend para dibujar la navegación SIN duplicar la política de roles:
 * el backend dice qué módulos puede ver el usuario y el front solo los pinta
 * ("el front dibuja lo que pasa en el backend"). La autorización real de los datos
 * sigue en cada endpoint (@PreAuthorize / requireRole).
 */
@Data
@AllArgsConstructor
public class WorkspaceDTO {

    /** Negocio (tenant) al que corresponde este manifiesto. */
    private UUID tenantId;

    /** Vertical del negocio (BusinessType.name(): GYM, FUTBOL_5, KIOSCO, …). */
    private String orgType;

    /** Rol del usuario en este negocio, en minúscula (owner/admin/staff/reception). */
    private String role;

    /** Claves de módulo que el usuario puede ver (contrato con el registry del front). */
    private Set<String> modules;
}
