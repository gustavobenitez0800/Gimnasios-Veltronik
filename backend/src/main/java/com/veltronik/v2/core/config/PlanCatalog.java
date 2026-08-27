package com.veltronik.v2.core.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;

/**
 * El catálogo de planes: qué existe, qué cuesta, qué incluye y — sobre todo — <b>qué se
 * ofrece</b>.
 *
 * <p><b>Por qué la visibilidad es un dato y no un {@code if}.</b> El premium se está
 * construyendo y no tiene que aparecer todavía como opción de compra, pero sí tiene que
 * existir en el código para poder trabajarlo. Un plan a medio hacer que igual se puede
 * comprar es plata cobrada por algo que no está. Con {@code available} apagado, el plan vive
 * acá, se le programa encima, y el día que esté listo se prende una variable de entorno en
 * Railway — sin deploy y sin tocar el frontend.</p>
 *
 * <p><b>Precio del básico:</b> sale de {@link BillingProperties}, que ya era la fuente única
 * de lo que Mercado Pago cobra. No se duplica acá; se pide.</p>
 *
 * <p><b>Ojo con el precio y las suscripciones vigentes:</b> el monto viaja grabado dentro del
 * preapproval de MP que se creó el día del alta. Cambiar un precio de este catálogo afecta a
 * las suscripciones NUEVAS; a las que ya corren hay que rehacerles el preapproval.</p>
 */
@Component
public class PlanCatalog {

    /**
     * Un plan del catálogo, tal como lo ve el cliente.
     *
     * @param code      identificador estable (se guarda en la base)
     * @param name      nombre comercial
     * @param tagline   una línea que explica para quién es
     * @param price     precio mensual en ARS, por sucursal
     * @param features  lo que el cliente se lleva, para mostrar en la página
     * @param unlocks   lo que habilita de verdad (esto es lo que gatea el backend)
     * @param available si se ofrece HOY como opción de compra
     */
    public record Plan(
            PlanCode code,
            String name,
            String tagline,
            BigDecimal price,
            List<String> features,
            Set<PlanFeature> unlocks,
            boolean available
    ) {}

    private final Plan basico;
    private final Plan premium;

    public PlanCatalog(
            BillingProperties billing,
            @Value("${veltronik.billing.premium-price:80000}") BigDecimal premiumPrice,
            // Nace APAGADO a propósito: un plan sin terminar no se vende. Se prende con la env
            // var BILLING_PREMIUM_AVAILABLE=true cuando el control de acceso esté andando.
            @Value("${veltronik.billing.premium-available:false}") boolean premiumAvailable) {

        this.basico = new Plan(
                PlanCode.BASICO,
                "Veltronik",
                "Todo lo que necesitás para manejar el gimnasio.",
                billing.getMonthlyPrice(),
                List.of(
                        "Gestión ilimitada de socios activos",
                        "Control de caja y pagos mensuales",
                        "Dashboard inteligente con métricas clave",
                        "Registro de asistencia y accesos",
                        "Sigue funcionando sin internet",
                        "Múltiples perfiles de usuario por equipo",
                        "Soporte técnico y asistencia prioritaria",
                        "Nuevas funciones y actualizaciones gratis"
                ),
                EnumSet.noneOf(PlanFeature.class),
                true);

        this.premium = new Plan(
                PlanCode.PREMIUM,
                "Veltronik Premium",
                "El sistema completo, más la puerta.",
                premiumPrice,
                List.of(
                        "Todo lo del plan Veltronik",
                        "Control de acceso con molinetes y puertas",
                        "Reconocimiento facial, tarjetas y QR",
                        "La puerta decide sola, incluso sin internet"
                ),
                EnumSet.of(PlanFeature.CONTROL_DE_ACCESO),
                premiumAvailable);
    }

    /** Todos los planes, se ofrezcan o no. Para uso interno (gateo, administración). */
    public List<Plan> all() {
        return List.of(basico, premium);
    }

    /** Solo lo que se puede comprar HOY. Es lo único que el frontend debería mostrar. */
    public List<Plan> available() {
        return all().stream().filter(Plan::available).toList();
    }

    public Plan get(PlanCode code) {
        return code == PlanCode.PREMIUM ? premium : basico;
    }

    /** ¿Este plan habilita esta función? La pregunta que hace el gateo. */
    public boolean unlocks(PlanCode code, PlanFeature feature) {
        return get(code).unlocks().contains(feature);
    }
}
