package com.veltronik.v2.gym.entities;

import com.veltronik.v2.core.entities.TenantAwareEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

/**
 * La clave para cobrar de una sucursal (V92). Opcional: si no hay fila, no se pide. Una sola por
 * sucursal (la base lo asegura con un UNIQUE sobre {@code tenant_id}).
 *
 * <p>La clave es de la sucursal, no de una persona (para eso está el PIN del turno). Va con BCrypt:
 * ni Veltronik la puede leer. Ver {@code ClaveDeCobroService}.</p>
 *
 * <p>Hereda de {@link TenantAwareEntity} como toda entidad de gym: el filtro por sucursal va
 * puesto aunque el servicio ya busque por la sucursal de la sesión (ArchitectureTest).</p>
 */
@Getter
@Setter
@Entity
@Table(name = "clave_de_cobro")
public class ClaveDeCobro extends TenantAwareEntity {

    @Column(name = "clave_hash", nullable = false, length = 100)
    private String claveHash;
}
