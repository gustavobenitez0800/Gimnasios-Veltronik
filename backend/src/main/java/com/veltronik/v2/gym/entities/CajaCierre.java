package com.veltronik.v2.gym.entities;

import com.veltronik.v2.core.entities.TenantAwareEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * Un arqueo de caja: qué dice el sistema, qué dice la persona, y la diferencia.
 *
 * <p><b>Se congela al crearse.</b> No hay endpoint de edición y no debería haberlo: un
 * cierre que se puede reescribir después no sirve para nada. Corregir es hacer OTRO cierre,
 * no cambiar el que hubo.</p>
 *
 * <p>Los montos esperados se guardan como número, no se recalculan al leer. Si mañana
 * alguien corrige un cobro viejo, este cierre tiene que seguir diciendo lo que se vio el día
 * que se hizo — si no, el historial se reescribiría solo y la diferencia de un martes
 * cambiaría en junio.</p>
 */
@Entity
@Table(name = "caja_cierre")
@Getter
@Setter
public class CajaCierre extends TenantAwareEntity {

    /** Desde cuándo cuenta. Es el {@code hasta} del cierre anterior. */
    @Column(nullable = false)
    private LocalDateTime desde;

    /** Cuándo se cerró. */
    @Column(nullable = false)
    private LocalDateTime hasta;

    // ─── Lo que contó el SISTEMA ───

    /**
     * El cambio que ya estaba en el cajón al abrir la caja.
     *
     * <p>Se graba acá y no se busca en la sesión: un cierre tiene que poder reconstruirse
     * solo. Sin este número, el esperado de un cierre viejo no se puede recalcular.</p>
     */
    @Column(name = "fondo_inicial", nullable = false)
    private BigDecimal fondoInicial = BigDecimal.ZERO;

    @Column(name = "esperado_efectivo", nullable = false)
    private BigDecimal esperadoEfectivo = BigDecimal.ZERO;

    @Column(name = "esperado_transferencia", nullable = false)
    private BigDecimal esperadoTransferencia = BigDecimal.ZERO;

    @Column(name = "esperado_tarjeta", nullable = false)
    private BigDecimal esperadoTarjeta = BigDecimal.ZERO;

    /**
     * Mercado Pago. Tiene su propia casilla al cobrar, pero el cierre no lo reconocía y lo
     * mandaba a "otros" junto con los métodos raros: un gimnasio que cobra por MP no veía
     * esa plata en ninguna parte del arqueo.
     */
    @Column(name = "esperado_mercadopago", nullable = false)
    private BigDecimal esperadoMercadopago = BigDecimal.ZERO;

    @Column(name = "esperado_otros", nullable = false)
    private BigDecimal esperadoOtros = BigDecimal.ZERO;

    @Column(name = "cantidad_cobros", nullable = false)
    private int cantidadCobros;

    // ─── Lo que SALIÓ y lo que entró sin ser un cobro ───

    /**
     * Lo que se sacó del cajón en el período: limpieza, adelantos, proveedores.
     *
     * <p>Se congela acá por lo mismo que el fondo: si no, el esperado de un martes cambiaría
     * en junio porque alguien anuló un egreso viejo, y un historial que se reescribe solo no
     * sirve para comparar nada.</p>
     *
     * <p>⚠️ Este número es el que hay que mirar cuando la caja cuadra demasiado bien. Un
     * egreso inventado hace cuadrar el cajón exacto: la plata salió y el sistema la esperaba
     * afuera. Por eso viaja junto a la diferencia y no escondido en otra pantalla.</p>
     */
    @Column(name = "egresos_efectivo", nullable = false)
    private BigDecimal egresosEfectivo = BigDecimal.ZERO;

    /** Plata que entró al cajón sin ser un cobro de socio (una venta suelta, un aporte). */
    @Column(name = "ingresos_efectivo", nullable = false)
    private BigDecimal ingresosEfectivo = BigDecimal.ZERO;

    /** Cuántos movimientos se cargaron a mano. Diez egresos en un día es un dato en sí mismo. */
    @Column(name = "cantidad_movimientos", nullable = false)
    private int cantidadMovimientos;

    // ─── Lo que declaró la PERSONA ───

    /**
     * El efectivo que dijo tener en el cajón. NULL si fue un corte sin conteo.
     *
     * <p>Solo el efectivo se declara: una transferencia no se puede robar —va a la cuenta
     * del gimnasio— y quien atiende no tiene forma de saber su total sin mirar el sistema.
     * Pedírsela sería fricción diaria sin ninguna seguridad a cambio.</p>
     */
    @Column(name = "declarado_efectivo")
    private BigDecimal declaradoEfectivo;

    /** Declarado menos esperado. Negativo = falta plata. NULL si no hubo conteo. */
    @Column(name = "diferencia")
    private BigDecimal diferencia;

    /**
     * Lo que la persona dice que entró por transferencia y Mercado Pago, mirando el banco
     * o la app.
     *
     * <p><b>Por qué se declara.</b> Sin esto quedaba abierto el agujero más grande del
     * módulo: cobrar $48.000 en efectivo, guardarse la plata y registrar el cobro como
     * "transferencia". El cajón cuadra perfecto —el sistema no espera ese efectivo— y la
     * transferencia que el sistema da por recibida nunca existió.</p>
     *
     * <p>Van juntos porque son un solo gesto: se abre la app y se mira cuánto entró.</p>
     */
    @Column(name = "declarado_digital")
    private BigDecimal declaradoDigital;

    /** Negativo = el sistema dice que entró plata que en la cuenta no está. */
    @Column(name = "diferencia_digital")
    private BigDecimal diferenciaDigital;

    /**
     * {@code true} = alguien contó el cajón. {@code false} = corte contable sin contar.
     *
     * <p>Separa dos cosas que se verían iguales en una lista. Recepción SIEMPRE cuenta; el
     * dueño puede cortar sin contar, porque puede estar cerrando el mes desde su casa y no
     * tiene ningún cajón adelante. Sin esta marca, un cierre sin plata verificada parecería
     * un arqueo real.</p>
     */
    @Column(name = "con_arqueo", nullable = false)
    private boolean conArqueo = true;

    /**
     * Por qué no cuadró. Opcional a propósito.
     *
     * <p>Que alguien NUNCA explique sus diferencias es, en sí mismo, un dato — y uno que se
     * pierde si el campo fuera obligatorio y todos escribieran cualquier cosa para poder
     * seguir.</p>
     */
    @Column(columnDefinition = "text")
    private String nota;

    /**
     * El nombre de quien cerró, congelado.
     *
     * <p>El id ya viaja en {@code performedByCashierId}, pero si mañana ese empleado se da
     * de baja el cierre tiene que seguir diciendo quién lo hizo. Un historial que pierde los
     * nombres no sirve para ver un patrón por persona, que es para lo que existe.</p>
     */
    @Column(name = "cerrado_por_nombre", length = 160)
    private String cerradoPorNombre;
}
