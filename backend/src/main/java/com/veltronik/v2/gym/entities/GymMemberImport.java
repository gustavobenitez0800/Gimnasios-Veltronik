package com.veltronik.v2.gym.entities;

import com.veltronik.v2.core.entities.TenantAwareEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Una importación de socios que se confirmó (V84).
 *
 * <p>Existe para una sola cosa: poder deshacerla. Lo que la importación hizo con cada socio
 * vive en {@link GymMemberImportItem}; acá queda el resumen y el instante en que terminó de
 * escribir, que es la línea que separa "lo que puso la importación" de "lo que pasó después".</p>
 */
@Entity
@Table(name = "gym_member_import")
@Getter
@Setter
public class GymMemberImport extends TenantAwareEntity {

    /** Nombre del archivo que se subió, para reconocerla en la pantalla. */
    @Column(length = 255)
    private String archivo;

    /** Usuario que la confirmó. Sin FK a propósito: el registro sobrevive a la baja del usuario. */
    @Column(name = "importado_por")
    private UUID importadoPor;

    @Column(nullable = false)
    private int creados;

    @Column(nullable = false)
    private int actualizados;

    @Column(name = "sin_cambios", nullable = false)
    private int sinCambios;

    /**
     * Cuándo terminó de escribir. Un socio con {@code updated_at} posterior se tocó después de
     * importar —un cobro, una edición— y deshacer ya no puede devolverlo sin pisar eso.
     */
    @Column(name = "aplicada_at", nullable = false)
    private LocalDateTime aplicadaAt;

    @Column(name = "deshecha_at")
    private LocalDateTime deshechaAt;

    @Column(name = "deshecha_por")
    private UUID deshechaPor;

    public boolean estaDeshecha() {
        return deshechaAt != null;
    }
}
