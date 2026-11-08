package com.veltronik.v2.gym.services;

import com.veltronik.v2.core.exceptions.BusinessException;
import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.support.EmbeddedPostgresTest;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * ⭐ LA CLAVE PARA COBRAR (V92). Lo pidió un gimnasio: «a veces los socios se renuevan solos la
 * cuota». Opcional, la pone el dueño, y para cambiarla o sacarla hay que saberla.
 */
@Transactional
class ClaveDeCobroIntegrationTest extends EmbeddedPostgresTest {

    @Autowired private EntityManager em;
    @Autowired private ClaveDeCobroService service;

    private UUID gym;

    private UUID crearGimnasio(String nombre) {
        UUID id = UUID.randomUUID();
        em.createNativeQuery("""
                INSERT INTO tenant (id, created_at, updated_at, name, is_active)
                VALUES (:id, now(), now(), :n, true)
                """).setParameter("id", id).setParameter("n", nombre + " " + id).executeUpdate();
        return id;
    }

    @BeforeEach
    void preparar() {
        gym = crearGimnasio("Gimnasio de la clave");
        TenantContextHolder.setTenantId(gym);
    }

    @AfterEach
    void limpiar() {
        TenantContextHolder.clear();
    }

    @Test
    @DisplayName("sin clave puesta no se pide nada (lo de siempre)")
    void sinClaveNoSePide() {
        assertFalse(service.activa());
        assertDoesNotThrow(() -> service.verificar(null));
    }

    @Test
    @DisplayName("⭐ puesta: la correcta pasa, la equivocada no")
    void laCorrectaPasa() {
        service.fijar("4827", null);
        assertTrue(service.activa());

        assertDoesNotThrow(() -> service.verificar("4827"));
        BusinessException mal = assertThrows(BusinessException.class, () -> service.verificar("4828"));
        assertEquals("Clave incorrecta.", mal.getMessage());
    }

    @Test
    @DisplayName("se guarda cifrada: en la base no está la clave")
    void seGuardaCifrada() {
        service.fijar("4827", null);
        em.flush();
        String guardada = (String) em.createNativeQuery("SELECT clave_hash FROM clave_de_cobro WHERE tenant_id = :t")
                .setParameter("t", gym).getSingleResult();
        assertFalse(guardada.contains("4827"));
    }

    @Test
    @DisplayName("solo números, de 4 a 8, y nada obvio")
    void soloClavesQueSirven() {
        assertThrows(BusinessException.class, () -> service.fijar("123", null));
        assertThrows(BusinessException.class, () -> service.fijar("abcd", null));
        assertThrows(BusinessException.class, () -> service.fijar("123456789", null));
        BusinessException obvia = assertThrows(BusinessException.class, () -> service.fijar("1234", null));
        assertTrue(obvia.getMessage().contains("fácil de adivinar"));
        assertFalse(service.activa());
    }

    @Test
    @DisplayName("🔴 cambiarla o sacarla exige la actual (el que se renueva solo no la puede borrar)")
    void cambiarExigeLaActual() {
        service.fijar("4827", null);

        assertThrows(BusinessException.class, () -> service.fijar("9051", null));
        assertThrows(BusinessException.class, () -> service.fijar("9051", "0000"));
        assertThrows(BusinessException.class, () -> service.sacar("1111"));
        assertTrue(service.activa());

        service.fijar("9051", "4827");
        assertDoesNotThrow(() -> service.verificar("9051"));
        service.sacar("9051");
        assertFalse(service.activa());
    }

    @Test
    @DisplayName("🔴 cinco intentos fallidos la bloquean un rato, aunque después venga la correcta")
    void elFrenoContraProbarNumeros() {
        service.fijar("4827", null);
        for (int i = 0; i < 5; i++) {
            assertThrows(BusinessException.class, () -> service.verificar("1111"));
        }
        BusinessException bloqueado = assertThrows(BusinessException.class, () -> service.verificar("4827"));
        assertTrue(bloqueado.getMessage().startsWith("Demasiados intentos"));
    }

    @Test
    @DisplayName("es de la sucursal: otra sucursal no la tiene")
    void esDeLaSucursal() {
        service.fijar("4827", null);
        UUID otro = crearGimnasio("Otro gimnasio");
        TenantContextHolder.setTenantId(otro);
        assertFalse(service.activa());
        assertDoesNotThrow(() -> service.verificar(null));
    }
}
