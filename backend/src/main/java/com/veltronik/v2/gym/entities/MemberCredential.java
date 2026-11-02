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
 * Un llavero de un socio (V90, ADR-016). Aparte del DNI: el DNI dice quién es la persona, el
 * llavero es una de las formas de decirle a la puerta quién está pasando.
 *
 * <p><b>Sin relación JPA al socio, a propósito.</b> Se guarda el id y nada más, como el rastro
 * de los cobros ({@link GymPaymentAjuste}): quien necesita el nombre lo busca dentro de su
 * transacción, y nadie arrastra una ficha perezosa fuera de la sesión (open-in-view está
 * apagado, y ese error ya costó un mostrador taponado).</p>
 *
 * <p><b>No se borra: se da de baja.</b> Con {@link #dadoDeBajaAt} deja de abrir y deja de contar
 * para el índice único, así que el mismo llavero se puede volver a asignar; la fila queda para
 * saber de quién era.</p>
 */
@Entity
@Table(name = "member_credential")
@Getter
@Setter
public class MemberCredential extends TenantAwareEntity {

    /** El único tipo que hay hoy (ver el CHECK de la V90). */
    public static final String LLAVERO = "LLAVERO";

    @Column(name = "member_id", nullable = false)
    private UUID memberId;

    @Column(nullable = false, length = 20)
    private String tipo = LLAVERO;

    /** Tal como lo escribe el lector, pasado por {@code Llavero.normalizar}. */
    @Column(nullable = false, length = 64)
    private String codigo;

    @Column(name = "asignado_por_nombre", length = 160)
    private String asignadoPorNombre;

    @Column(name = "dado_de_baja_at")
    private LocalDateTime dadoDeBajaAt;

    @Column(name = "motivo_baja", length = 160)
    private String motivoBaja;

    @Column(name = "dado_de_baja_por_nombre", length = 160)
    private String dadoDeBajaPorNombre;

    /** Abre y cuenta. Uno dado de baja queda solo como historia. */
    public boolean estaActivo() {
        return dadoDeBajaAt == null;
    }
}
