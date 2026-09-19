package com.veltronik.v2.gym.entities;

import com.veltronik.v2.core.entities.TenantAwareEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.util.UUID;

/**
 * Lo que una importación le hizo a UN socio (V84).
 *
 * <p>{@code CREADO}: alcanza con saber cuál es. {@code ACTUALIZADO}: {@link #antes} guarda los
 * valores que tenía en los campos que cambiaron —solo esos—, para devolvérselos al deshacer.</p>
 *
 * <p>Los ids van como columnas sueltas y no como relaciones: este registro solo se lee al
 * deshacer, de a una importación por vez, y nunca se navega desde el socio.</p>
 */
@Entity
@Table(name = "gym_member_import_item")
@Getter
@Setter
public class GymMemberImportItem extends TenantAwareEntity {

    public static final String CREADO = "CREADO";
    public static final String ACTUALIZADO = "ACTUALIZADO";

    @Column(name = "import_id", nullable = false)
    private UUID importId;

    @Column(name = "member_id", nullable = false)
    private UUID memberId;

    @Column(nullable = false, length = 12)
    private String accion;

    /** JSON con los valores anteriores. Texto en Java, {@code jsonb} en la base (igual que {@code attendance_days}). */
    @org.hibernate.annotations.JdbcTypeCode(org.hibernate.type.SqlTypes.JSON)
    @Column(name = "antes")
    private String antes;
}
