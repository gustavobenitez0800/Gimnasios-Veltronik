package com.veltronik.v2.courts.entities;

import com.veltronik.v2.core.entities.TenantAwareEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

/**
 * Una cancha física del complejo (ej. "Cancha 1 - Techada").
 *
 * <p>Módulo genérico de canchas: sirve para FUTBOL_5 hoy y PADEL mañana.
 * La diferencia entre deportes es configuración del tenant ({@link CourtSettings}),
 * no código.</p>
 */
@Entity
@Table(name = "court")
@Getter
@Setter
public class Court extends TenantAwareEntity {

    @Column(nullable = false)
    private String name;

    /** Superficie: "SINTETICO", "CESPED", "CEMENTO", "PARQUET". Texto libre acotado. */
    @Column(length = 30)
    private String surface;

    /** true = techada (clave para el drag & drop "llueve → muevo el turno a la techada"). */
    @Column(nullable = false)
    private boolean covered = false;

    @Column(name = "is_active", nullable = false)
    private boolean active = true;

    /** Orden de las columnas en la grilla (Cancha 1, Cancha 2, ...). */
    @Column(name = "display_order", nullable = false)
    private int displayOrder = 0;

    @Column(columnDefinition = "text")
    private String notes;
}
