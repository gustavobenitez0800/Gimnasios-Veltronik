package com.veltronik.v2.gym.entities;

import com.veltronik.v2.core.entities.TenantAwareEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Una caja abierta: desde cuándo, quién la abrió, y con cuánto cambio arrancó el cajón.
 *
 * <p><b>Por qué existe.</b> Antes el período era implícito —desde el último cierre hasta
 * ahora— y nadie lo abría. Faltaba lo que hace cualquier kiosco: abrir a la mañana
 * declarando el cambio que quedó, y cerrar a la noche.</p>
 *
 * <p><b>Y faltaba el fondo, que es por qué el arqueo nunca cuadraba.</b> El cajón arranca el
 * día con el cambio de ayer. Si el sistema espera solo lo cobrado hoy, ese cambio aparece
 * como sobrante todos los días — y un arqueo que siempre da sobrante es un arqueo que nadie
 * mira.</p>
 *
 * <p>⚠️ Solo puede haber UNA abierta por gimnasio, y eso lo garantiza un índice único parcial
 * en la base, no la pantalla: el gimnasio puede tener la notebook con la web y la PC del
 * mostrador con el escritorio, y dos terminales pueden pedirlo en el mismo instante y las dos
 * ver "no hay ninguna abierta".</p>
 */
@Entity
@Table(name = "caja_sesion")
@Getter
@Setter
public class CajaSesion extends TenantAwareEntity {

    @Column(name = "abierta_at", nullable = false)
    private LocalDateTime abiertaAt;

    /** El nombre se congela: si mañana esa persona ya no trabaja acá, el registro sigue diciendo quién fue. */
    @Column(name = "abierta_por_nombre", length = 160)
    private String abiertaPorNombre;

    /** El cambio que ya estaba en el cajón al abrir. */
    @Column(name = "fondo_inicial", nullable = false)
    private BigDecimal fondoInicial = BigDecimal.ZERO;

    /** NULL = sigue abierta. Es lo que mira el índice único. */
    @Column(name = "cerrada_at")
    private LocalDateTime cerradaAt;

    /** El cierre que la terminó. Sin FK a propósito: ver el comentario de la migración. */
    @Column(name = "cierre_id")
    private UUID cierreId;

    public boolean estaAbierta() {
        return cerradaAt == null;
    }
}
