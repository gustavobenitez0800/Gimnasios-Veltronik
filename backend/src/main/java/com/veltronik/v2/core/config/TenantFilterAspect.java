package com.veltronik.v2.core.config;

import com.veltronik.v2.core.security.TenantContextHolder;
import jakarta.persistence.EntityManager;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.annotation.Before;
import org.hibernate.Session;
import org.springframework.stereotype.Component;

import java.util.UUID;

/**
 * Aspecto que intercepta la ejecución de métodos en servicios y repositorios
 * para activar dinámicamente el filtro de Hibernate (tenantFilter).
 *
 * NOTA CRÍTICA: El pointcut cubre tanto métodos @Transactional como
 * métodos de JpaRepository (findAll, findById, etc.) que NO llevan
 * @Transactional por defecto. Sin esta cobertura, un findAll() devolvería
 * datos de TODOS los tenants — una fuga de datos silenciosa.
 */
@Aspect
@Component
public class TenantFilterAspect {

    private final EntityManager entityManager;

    public TenantFilterAspect(EntityManager entityManager) {
        this.entityManager = entityManager;
    }

    /**
     * Intercepta:
     * 1. Métodos anotados con @Transactional (servicios de negocio)
     * 2. Métodos en clases anotadas con @Transactional a nivel de clase
     * 3. Cualquier método ejecutado dentro de un Repository de Spring Data
     */
    @Before("execution(* com.veltronik.v2..*(..)) && " +
            "(@annotation(org.springframework.transaction.annotation.Transactional) || " +
            "@within(org.springframework.transaction.annotation.Transactional) || " +
            "@within(org.springframework.stereotype.Repository) || " +
            "execution(* org.springframework.data.jpa.repository.JpaRepository+.*(..)))")
    public void enableTenantFilter() {
        UUID tenantId = TenantContextHolder.getTenantId();

        if (tenantId != null) {
            Session session = entityManager.unwrap(Session.class);
            // Activa el filtro definido en TenantAwareEntity
            session.enableFilter("tenantFilter").setParameter("tenantId", tenantId);
        }
    }
}
