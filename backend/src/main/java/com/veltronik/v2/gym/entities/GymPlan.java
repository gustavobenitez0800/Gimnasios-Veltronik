package com.veltronik.v2.gym.entities;

import com.veltronik.v2.core.entities.TenantAwareEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;

/**
 * Un arancel del gimnasio: el plan que el socio compra.
 *
 * <p><b>Otorga dos monedas de cobertura</b>, y puede otorgar las dos a la vez: <i>tiempo</i>
 * ({@link #durationDays}) y <i>visitas</i> ({@link #classes}). Un "Pase libre" de un mes con
 * tope de 30 clases es exactamente eso: 30 días y 30 visitas. La cobertura del socio se agota
 * por lo que ocurra primero.</p>
 *
 * <p><b>Por qué el catálogo vive en la base y no en el código.</b> Cada gimnasio vende lo
 * suyo, con sus nombres y sus precios, y los cambia cuando quiere. Antes, cobrar era escribir
 * el monto y las fechas a mano en cada cobro: si alguien se olvidaba de correr el "período
 * hasta" al vender un trimestral, el socio se quedaba con un mes y nadie se enteraba hasta que
 * no lo dejaban entrar. Con el arancel, la duración la dice el plan y no la memoria de quien
 * atiende.</p>
 */
@Entity
@Table(name = "gym_plans")
@Getter
@Setter
public class GymPlan extends TenantAwareEntity {

    @Column(nullable = false, length = 120)
    private String name;

    @Column(nullable = false)
    private BigDecimal price = BigDecimal.ZERO;

    /**
     * @deprecated Desde la V65 la cobertura la dicen {@link #coberturaCantidad} y
     * {@link #coberturaUnidad}. Se conserva para poder auditar qué vendía cada arancel antes
     * de la migración. <b>No la lea nadie para decidir un vencimiento.</b>
     */
    @Deprecated
    @Column(name = "duration_days", nullable = false)
    private int durationDays = 0;

    /**
     * ⭐ CUÁNTO TIEMPO CUBRE, junto con {@link #coberturaUnidad}. <b>0 = no cubre tiempo</b>
     * (la clase suelta: cobra plata pero no corre la fecha).
     *
     * <p>Por defecto <b>1 mes</b>, y eso es el corazón de la decisión (ADR-013). Antes esto
     * eran días y arrancaba en 0 — o sea que el valor por defecto era el que rompía: un arancel
     * creado sin pensar hacía que los cobros no movieran el vencimiento, <b>en silencio</b>,
     * hasta que a un socio no lo dejaban entrar jurando que había pagado.</p>
     */
    @Column(name = "cobertura_cantidad", nullable = false)
    private int coberturaCantidad = 1;

    /**
     * {@code DIA} o {@code MES}.
     *
     * <p><b>La unidad existe porque un mes NO son 30 días.</b> El 7 de marzo más 30 días es el
     * 6 de abril, y el 7 de febrero más 30 es el 9 de marzo. La regla del negocio es "el mismo
     * día del mes que viene", y para poder decir eso hay que guardar la unidad, no solo el
     * número. Si el día no existe —pagó un 31— vence el último que exista.</p>
     */
    @Column(name = "cobertura_unidad", nullable = false, length = 10)
    private String coberturaUnidad = "MES";

    /**
     * Visitas que otorga.
     *
     * <p><b>NULL no es 0.</b> Cero clases sería un arancel que no deja entrar nunca; NULL es un
     * arancel que sencillamente no cuenta visitas, como una mensualidad libre de verdad.</p>
     */
    @Column(name = "classes")
    private Integer classes;

    /**
     * Baja lógica.
     *
     * <p>Un arancel que dejó de venderse tiene que seguir existiendo: hay pagos viejos que lo
     * nombran, y borrarlo dejaría esa historia sin explicación. Se apaga, no se borra.</p>
     */
    @Column(name = "is_active", nullable = false)
    private boolean isActive = true;
}
