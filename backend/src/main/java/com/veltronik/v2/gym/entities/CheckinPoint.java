package com.veltronik.v2.gym.entities;

import com.veltronik.v2.core.entities.TenantAwareEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

/**
 * El QR que el gimnasio pega en la puerta.
 *
 * <p>El socio lo escanea con su propio teléfono y marca entrada o salida. No hay lector, ni
 * tablet, ni molinete: por eso esta función entra en el plan básico.</p>
 *
 * <p><b>Por qué el QR lleva un token y no el id del gimnasio:</b> el cartel vive colgado en una
 * pared y cualquiera puede fotografiarlo. Con el UUID del tenant adentro estaríamos publicando
 * una llave interna en la entrada del local. Y un token se puede <b>rotar</b>: si alguien copia
 * el cartel y empieza a marcar desde su casa, el dueño genera otro, imprime, y el viejo muere.
 * La identidad del negocio no se puede rotar.</p>
 */
@Getter
@Setter
@Entity
@Table(name = "checkin_point")
public class CheckinPoint extends TenantAwareEntity {

    /**
     * Lo que viaja adentro del QR. Único en TODO el sistema, no por gimnasio: resuelve a qué
     * sucursal pertenece un escaneo, y esa consulta llega SIN contexto de tenant porque el socio
     * no tiene sesión. Si dos gimnasios pudieran repetirlo, un escaneo sería ambiguo.
     */
    @Column(nullable = false, length = 64)
    private String token;

    /** Para el dueño con varias puertas: "Puerta principal", "Entrada de atrás". */
    @Column(nullable = false, length = 120)
    private String name = "Puerta principal";

    /**
     * Rotar es crear el nuevo y apagar este, nunca borrarlo: los accesos ya registrados apuntan
     * acá, y queremos poder decir por qué puerta entró alguien el mes pasado.
     */
    // La columna se llama `is_active`, igual que la bandera de baja lógica de todas las
    // demás tablas (V73). La propiedad Java sigue siendo `active`, así que el JSON que ve
    // el cliente no cambió.
    @Column(name = "is_active", nullable = false)
    private boolean active = true;

    /**
     * Número de serie del molinete que atiende esta puerta (V66). Null en los carteles de QR,
     * que son la enorme mayoría.
     *
     * <p><b>Es el segundo factor, no el primero.</b> No es un secreto —cualquiera en la red del
     * gimnasio se lo puede preguntar al equipo sin contraseña— así que no autoriza nada por sí
     * mismo. Lo que hace es anclar el token a un equipo: filtrado el token, todavía hay que
     * decir el serial correcto para inventar una entrada desde afuera.</p>
     *
     * <p>Se aparea solo la primera vez que el equipo avisa. Confiar en el primero que llega es
     * deliberado: la alternativa era que el dueño copiara un serial a mano en una pantalla de
     * configuración, y un paso manual que casi nadie entiende se hace mal o no se hace. La
     * ventana de riesgo dura desde que se crea la puerta hasta el primer aviso, y el token ya
     * es secreto durante toda esa ventana.</p>
     */
    @Column(name = "device_serial", length = 64)
    private String deviceSerial;
}
