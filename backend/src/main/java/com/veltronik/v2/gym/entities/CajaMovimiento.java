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
 * Plata que entra o sale del cajón sin ser un cobro de socio.
 *
 * <p><b>Por qué existe.</b> El arqueo sabía sumar el fondo y lo cobrado, pero del cajón
 * también SALE plata durante el día. Se le paga $15.000 a la chica de la limpieza y a la
 * noche el sistema espera $15.000 que ya no están: el cierre dice <b>faltante</b>, la persona
 * que atendió no robó nada y el sistema la acusa. Es el mismo bug del fondo inicial con el
 * signo cambiado, y termina igual: el dueño se acostumbra a los faltantes y el día que falta
 * plata de verdad no lo distingue.</p>
 *
 * <p><b>⚠️ Y acá está el punto débil del módulo, dicho de frente:</b> un egreso falso es el
 * robo perfecto. Se escribe "Proveedor $20.000", se guarda la plata, y el cajón cuadra
 * exacto. Esto no lo impide —nada en el software puede, porque la plata sale igual— lo deja
 * <b>a la vista</b>: firmado, con detalle obligatorio, y congelado en el cierre para que el
 * dueño lo vea al lado de la diferencia. El control es que alguien mire; para eso primero
 * tiene que existir el renglón.</p>
 *
 * <p><b>Solo el efectivo mueve el arqueo.</b> Un movimiento por transferencia se anota
 * porque el dueño quiere verlo, pero no toca el conteo: lo que se declara al cerrar es
 * cuánto ENTRÓ a la cuenta, y mezclar salidas ahí obligaría a hacer una resta mental sobre
 * la app del banco.</p>
 */
@Entity
@Table(name = "caja_movimiento")
@Getter
@Setter
public class CajaMovimiento extends TenantAwareEntity {

    public static final String INGRESO = "INGRESO";
    public static final String EGRESO = "EGRESO";

    /** El método que sale del cajón. Es el único que mueve el arqueo. */
    public static final String EFECTIVO = "CASH";

    /**
     * La caja abierta en la que se cargó, si había una.
     *
     * <p>Sin FK y nulo a propósito: se puede gastar plata del cajón con la caja sin abrir, y
     * esa plata falta igual. Igual que con los cobros, lo que manda para el arqueo es la
     * fecha dentro del período, no que alguien se haya acordado de abrir.</p>
     */
    @Column(name = "sesion_id")
    private UUID sesionId;

    /**
     * {@code INGRESO} o {@code EGRESO}.
     *
     * <p>⚠️ Decide el SIGNO, por eso además hay un CHECK en la base: un tipo mal escrito no
     * daría error, daría una diferencia al revés que nadie sabría explicar.</p>
     */
    @Column(nullable = false, length = 10)
    private String tipo;

    /** En qué: limpieza, adelanto, proveedor… Texto y no enum para no migrar por un rubro. */
    @Column(nullable = false, length = 30)
    private String categoria;

    /** Obligatorio en los egresos: "Proveedor" no se verifica, "Proveedor — agua, f. 4412" sí. */
    @Column(length = 255)
    private String detalle;

    /** Siempre positivo. El signo lo pone {@link #tipo}, nunca el monto. */
    @Column(nullable = false)
    private BigDecimal monto;

    /** CASH / TRANSFER / MERCADOPAGO / CARD. Solo CASH mueve el arqueo. */
    @Column(nullable = false, length = 20)
    private String metodo = EFECTIVO;

    /** Cuándo pasó, en hora argentina y escrita por la app: la base responde en la suya. */
    @Column(nullable = false)
    private LocalDateTime fecha;

    /** Congelado: si esa persona se da de baja, el registro sigue diciendo quién sacó la plata. */
    @Column(name = "hecho_por_nombre", length = 160)
    private String hechoPorNombre;

    /** NULL = vigente. Anular no borra: borrar sería poder borrar la prueba. */
    @Column(name = "anulado_at")
    private LocalDateTime anuladoAt;

    @Column(name = "anulado_por_nombre", length = 160)
    private String anuladoPorNombre;

    @Column(name = "motivo_anulacion", length = 255)
    private String motivoAnulacion;

    public boolean estaVigente() {
        return anuladoAt == null;
    }

    /** {@code true} si esta plata pasó por el cajón. Es lo único que el arqueo puede contar. */
    public boolean afectaElCajon() {
        return EFECTIVO.equalsIgnoreCase(metodo);
    }

    public boolean esEgreso() {
        return EGRESO.equalsIgnoreCase(tipo);
    }
}
