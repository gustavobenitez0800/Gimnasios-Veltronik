package com.veltronik.v2.core.entities;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

/**
 * Una persona del mostrador, identificada por un PIN de 4 dígitos.
 *
 * <p><b>No es un usuario.</b> No tiene cuenta, no tiene email, no inicia sesión. La sesión
 * la tiene el TERMINAL; el cajero solo dice <i>quién está en el turno</i> para que cada
 * movimiento quede firmado.</p>
 *
 * <p><b>Por qué existe esta figura y no simplemente cuentas para todos.</b> Un mostrador
 * de gimnasio es una caja registradora: máquina compartida, gente que rota, turnos que
 * cambian dos veces por día. Pedir email y contraseña en cada cambio de turno es fricción
 * suficiente para que nadie lo haga — y entonces todos usan la misma cuenta, que es peor
 * que no tener nada. Cuatro dígitos cuestan tres segundos.</p>
 *
 * <p><b>Qué garantiza y qué no.</b> Garantiza <i>responsabilidad</i>: cada cobro y cada
 * acceso queda con un nombre. NO garantiza <i>seguridad</i>: la sesión del terminal ya
 * está abierta, así que alguien podría marcar el PIN de un compañero. Es exactamente la
 * misma propiedad que tiene cualquier caja registradora, y es infinitamente mejor que el
 * anonimato total que había antes.</p>
 *
 * <p>Vive en {@code core} y no en {@code gym} porque no es del dominio de un vertical:
 * cualquier negocio con mostrador la necesita.</p>
 */
@Getter
@Setter
@Entity
@Table(name = "cashier")
public class Cashier extends TenantAwareEntity {

    /** Nombre visible: es lo que la persona toca en la pantalla antes de marcar su PIN. */
    @Column(nullable = false, length = 120)
    private String name;

    /**
     * BCrypt del PIN. {@code @JsonIgnore} por si alguna vez alguien serializa la entidad
     * cruda: el hash no aporta nada al cliente y no tiene por qué salir del servidor.
     */
    @JsonIgnore
    @Column(name = "pin_hash", nullable = false, length = 100)
    private String pinHash;

    /**
     * Baja lógica. Una persona que se fue del gimnasio se desactiva, no se borra: sus
     * movimientos históricos siguen apuntando a ella y tienen que seguir diciendo quién fue.
     */
    @Column(name = "is_active", nullable = false)
    private boolean active = true;
}
