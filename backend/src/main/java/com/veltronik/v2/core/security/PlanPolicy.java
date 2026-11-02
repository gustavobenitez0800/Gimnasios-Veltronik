package com.veltronik.v2.core.security;

import com.veltronik.v2.core.config.PlanCatalog;
import com.veltronik.v2.core.config.PlanCode;
import com.veltronik.v2.core.config.PlanFeature;
import com.veltronik.v2.core.entities.Subscription;
import com.veltronik.v2.core.entities.Tenant;
import com.veltronik.v2.core.repositories.SubscriptionRepository;
import com.veltronik.v2.core.repositories.TenantRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Optional;
import java.util.UUID;

/**
 * ¿Este negocio contrató esta función? La <b>única fuente de verdad</b> del gateo por plan.
 *
 * <p>Hermana de {@link SubscriptionAccessPolicy}, y la división entre las dos importa:</p>
 * <ul>
 *   <li>{@code SubscriptionAccessPolicy} responde <b>"¿entra?"</b> — si pagó, si está en
 *       prueba, si se le venció.</li>
 *   <li>{@code PlanPolicy} responde <b>"¿hasta dónde entra?"</b> — qué funciones compró.</li>
 * </ul>
 * Son preguntas distintas y no hay que mezclarlas: alguien al día en el plan básico entra
 * perfectamente, pero no abre la puerta con el molinete.
 *
 * <p><b>Dos planes, y no hay que confundirlos</b> (02/11/2026):</p>
 * <ul>
 *   <li>{@link #planOf} es el plan <b>CONTRATADO</b>: el que se cobra. Lo usa la facturación
 *       (cambiar la tarjeta no puede cobrar otro plan que el que se eligió).</li>
 *   <li>{@link #enUso} es el plan con el que el gimnasio <b>FUNCIONA hoy</b>: el contratado, salvo
 *       durante la prueba gratis, que es el Premium entero. Un gimnasio con molinete tiene que
 *       poder probar el molinete antes de pagar: es justo lo que viene a comprar. Lo usan los
 *       candados ({@link #hasFeature}).</li>
 * </ul>
 * Si la prueba también cambiara el plan contratado, alguien que eligió Básico y cambia la
 * tarjeta durante la prueba se generaría un cobro de Premium.
 *
 * <p><b>Por qué vive en el backend y no en la pantalla.</b> Un {@code if} en el navegador
 * esconde el botón, no saca la función: alcanza con abrir la consola. La misma lección ya
 * salió cara con el SDK de Mercado Pago (lo que se importa, se empaqueta). Si el candado no
 * está acá, no hay candado.</p>
 *
 * <p><b>Falla hacia MENOS acceso.</b> Sin suscripción, con un plan que este build no conoce
 * o con el dato en blanco, la respuesta es básico. Equivocarse hacia abajo se arregla con una
 * llamada del cliente; hacia arriba, se regala lo que se está vendiendo. La prueba gratis es la
 * única excepción, y es a propósito: tiene fecha de fin.</p>
 */
@Component
@RequiredArgsConstructor
public class PlanPolicy {

    /** La prueba se mide en hora del negocio, igual que en el Kill Switch. */
    private static final ZoneId ZONA_DEL_NEGOCIO = ZoneId.of("America/Argentina/Buenos_Aires");

    private final SubscriptionRepository subscriptionRepository;
    private final PlanCatalog catalog;
    private final TenantRepository tenantRepository;
    private final SubscriptionAccessPolicy accessPolicy;

    /**
     * El plan con el que funciona hoy el gimnasio.
     *
     * @param pruebaHasta si el plan viene de la prueba gratis, hasta cuándo dura; si no, null
     */
    public record PlanEnUso(PlanCode plan, LocalDateTime pruebaHasta) {
        public boolean porLaPrueba() {
            return pruebaHasta != null;
        }
    }

    /** El plan CONTRATADO (el que se cobra). BÁSICO si no hay suscripción o el dato no se entiende. */
    @Transactional(readOnly = true)
    public PlanCode planOf(UUID tenantId) {
        if (tenantId == null) return PlanCode.BASICO;
        return contratado(ultimaSuscripcion(tenantId));
    }

    /**
     * ⭐ El plan con el que FUNCIONA hoy: el contratado, o el Premium mientras dura la prueba.
     *
     * <ul>
     *   <li>Quien ya paga usa lo que compró, aunque le queden días de prueba: si eligió Básico,
     *       es Básico.</li>
     *   <li>Sin pago vigente y con la prueba corriendo: Premium, hasta que termine la prueba.</li>
     *   <li>Fuera de la prueba: el contratado, como siempre.</li>
     * </ul>
     */
    @Transactional(readOnly = true)
    public PlanEnUso enUso(UUID tenantId) {
        if (tenantId == null) return new PlanEnUso(PlanCode.BASICO, null);
        Optional<Subscription> ultima = ultimaSuscripcion(tenantId);
        PlanCode contratado = contratado(ultima);
        LocalDateTime ahora = LocalDateTime.now(ZONA_DEL_NEGOCIO);

        if (ultima.isPresent() && accessPolicy.otorgaAccesoPago(ultima.get(), ahora)) {
            return new PlanEnUso(contratado, null);
        }
        LocalDateTime finDeLaPrueba = tenantRepository.findById(tenantId)
                .map(Tenant::getTrialEndsAt)
                .orElse(null);
        if (finDeLaPrueba != null && finDeLaPrueba.isAfter(ahora)) {
            return new PlanEnUso(PlanCode.PREMIUM, finDeLaPrueba);
        }
        return new PlanEnUso(contratado, null);
    }

    /** ¿El plan con el que funciona hoy este negocio habilita esta función? */
    @Transactional(readOnly = true)
    public boolean hasFeature(UUID tenantId, PlanFeature feature) {
        return habilita(enUso(tenantId), feature);
    }

    /** Lo mismo, con el plan ya resuelto (para no ir dos veces a la base). */
    public boolean habilita(PlanEnUso plan, PlanFeature feature) {
        return catalog.unlocks(plan.plan(), feature);
    }

    private Optional<Subscription> ultimaSuscripcion(UUID tenantId) {
        return subscriptionRepository.findFirstByTenantIdOrderByCreatedAtDesc(tenantId);
    }

    private static PlanCode contratado(Optional<Subscription> ultima) {
        return ultima.map(Subscription::getPlanCode).map(PlanCode::from).orElse(PlanCode.BASICO);
    }
}
