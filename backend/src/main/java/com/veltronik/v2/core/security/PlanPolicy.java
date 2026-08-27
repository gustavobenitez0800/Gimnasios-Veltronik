package com.veltronik.v2.core.security;

import com.veltronik.v2.core.config.PlanCatalog;
import com.veltronik.v2.core.config.PlanCode;
import com.veltronik.v2.core.config.PlanFeature;
import com.veltronik.v2.core.entities.Subscription;
import com.veltronik.v2.core.repositories.SubscriptionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

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
 * <p><b>Por qué vive en el backend y no en la pantalla.</b> Un {@code if} en el navegador
 * esconde el botón, no saca la función: alcanza con abrir la consola. La misma lección ya
 * salió cara con el SDK de Mercado Pago (lo que se importa, se empaqueta). Si el candado no
 * está acá, no hay candado.</p>
 *
 * <p><b>Falla hacia MENOS acceso.</b> Sin suscripción, con un plan que este build no conoce
 * o con el dato en blanco, la respuesta es básico. Equivocarse hacia abajo se arregla con una
 * llamada del cliente; hacia arriba, se regala lo que se está vendiendo.</p>
 */
@Component
@RequiredArgsConstructor
public class PlanPolicy {

    private final SubscriptionRepository subscriptionRepository;
    private final PlanCatalog catalog;

    /** El plan contratado por el negocio. BÁSICO si no hay suscripción o el dato no se entiende. */
    @Transactional(readOnly = true)
    public PlanCode planOf(UUID tenantId) {
        if (tenantId == null) return PlanCode.BASICO;
        return subscriptionRepository.findFirstByTenantIdOrderByCreatedAtDesc(tenantId)
                .map(Subscription::getPlanCode)
                .map(PlanCode::from)
                .orElse(PlanCode.BASICO);
    }

    /** ¿El plan de este negocio habilita esta función? */
    @Transactional(readOnly = true)
    public boolean hasFeature(UUID tenantId, PlanFeature feature) {
        return catalog.unlocks(planOf(tenantId), feature);
    }
}
