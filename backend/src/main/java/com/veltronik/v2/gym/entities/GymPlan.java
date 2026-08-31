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

    /** Días de cobertura que otorga. 0 = no mueve la fecha (pack de clases sueltas). */
    @Column(name = "duration_days", nullable = false)
    private int durationDays = 0;

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
