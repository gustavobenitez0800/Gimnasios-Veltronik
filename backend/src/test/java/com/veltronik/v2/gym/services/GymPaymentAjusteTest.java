package com.veltronik.v2.gym.services;

import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.gym.entities.GymMember;
import com.veltronik.v2.gym.entities.GymPayment;
import com.veltronik.v2.gym.entities.GymPaymentAjuste;
import com.veltronik.v2.gym.repositories.GymPaymentAjusteRepository;
import com.veltronik.v2.gym.repositories.GymPaymentRepository;
import org.junit.jupiter.api.*;
import org.mockito.ArgumentCaptor;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * El rastro de los cobros que se tocan después.
 *
 * <p><b>El robo que esto hace visible:</b> se registra el cobro —el socio se va contento y
 * su vencimiento se corre— y más tarde se borra, quedándose la plata. Y como borrar un cobro
 * NO recalcula la cobertura, el socio sigue figurando al día y nunca reclama. Sin rastro,
 * nadie se entera jamás.</p>
 *
 * <p>Editar el monto de 48.000 a 40.000 es el mismo robo, más prolijo — y encima deja el
 * arqueo cuadrando, porque el sistema fue cambiado para que cuadre.</p>
 */
class GymPaymentAjusteTest {

    private static final UUID TENANT = UUID.randomUUID();

    private GymPaymentRepository repo;
    private GymPaymentAjusteRepository ajustes;
    private GymPaymentService service;

    @BeforeEach
    void setUp() {
        repo = mock(GymPaymentRepository.class);
        ajustes = mock(GymPaymentAjusteRepository.class);
        GymMemberService memberService = mock(GymMemberService.class);
        service = new GymPaymentService(repo, memberService, mock(GymPlanService.class), ajustes);
        TenantContextHolder.setTenantId(TENANT);
    }

    @AfterEach
    void tearDown() {
        TenantContextHolder.clear();
    }

    private GymPayment pago(String monto, String metodo) {
        GymPayment p = new GymPayment();
        p.setId(UUID.randomUUID());
        p.setAmount(new BigDecimal(monto));
        p.setPaymentMethod(metodo);
        p.setStatus("paid");
        p.setPaymentDate(LocalDateTime.now());
        com.veltronik.v2.core.entities.Tenant t = new com.veltronik.v2.core.entities.Tenant();
        t.setId(TENANT);
        p.setTenant(t);
        return p;
    }

    private List<GymPaymentAjuste> anotados() {
        ArgumentCaptor<GymPaymentAjuste> cap = ArgumentCaptor.forClass(GymPaymentAjuste.class);
        verify(ajustes, atLeast(0)).save(cap.capture());
        return cap.getAllValues();
    }

    @Nested
    @DisplayName("el borrado")
    class Borrado {

        // ⭐ EL TEST DEL ROBO PERFECTO
        @Test
        @DisplayName("borrar un cobro deja rastro ANTES de borrarlo")
        void borrarDejaRastro() {
            GymPayment p = pago("48000", "CASH");
            when(repo.findById(p.getId())).thenReturn(Optional.of(p));

            service.deleteAndVerifyOwnership(p.getId(), "Carla");

            List<GymPaymentAjuste> a = anotados();
            assertEquals(1, a.size());
            assertEquals(GymPaymentAjuste.BORRADO, a.get(0).getTipo());
            assertTrue(a.get(0).getAntes().contains("48000"),
                    "el rastro tiene que decir CUÁNTA plata se fue");
            assertEquals("Carla", a.get(0).getHechoPorNombre());
            verify(repo).delete(p);
        }

        @Test
        @DisplayName("el rastro guarda el id del cobro, que ya no va a existir")
        void guardaElIdDelCobroBorrado() {
            // Por eso la tabla no tiene FK: con una FK en cascada, borrar el cobro se
            // llevaría puesta la prueba de que se borró.
            GymPayment p = pago("48000", "CASH");
            when(repo.findById(p.getId())).thenReturn(Optional.of(p));

            service.deleteAndVerifyOwnership(p.getId(), "Carla");

            assertEquals(p.getId(), anotados().get(0).getPaymentId());
        }
    }

    @Nested
    @DisplayName("la edición")
    class Edicion {

        // ⭐ EL OTRO ROBO: bajarle el monto a un cobro ya hecho.
        @Test
        @DisplayName("bajar el monto queda anotado, con el antes y el después")
        void cambiarElMontoDejaRastro() {
            GymPayment antes = pago("48000", "CASH");
            GymPayment despues = pago("40000", "CASH");
            despues.setId(antes.getId());

            service.anotarEdicion(antes, despues, "Carla");

            List<GymPaymentAjuste> a = anotados();
            assertEquals(1, a.size());
            assertEquals("monto", a.get(0).getCampo());
            assertEquals("48000", a.get(0).getAntes());
            assertEquals("40000", a.get(0).getDespues());
        }

        @Test
        @DisplayName("pasar de efectivo a transferencia también se anota")
        void cambiarElMetodo() {
            // Sirve para maquillar un arqueo: el efectivo esperado baja y el cajón cuadra.
            GymPayment antes = pago("48000", "CASH");
            GymPayment despues = pago("48000", "TRANSFER");
            despues.setId(antes.getId());

            service.anotarEdicion(antes, despues, "Carla");

            assertEquals("método", anotados().get(0).getCampo());
        }

        @Test
        @DisplayName("si no cambió nada que mueva plata, NO se anota")
        void sinCambiosNoAnota() {
            // Anotar cada guardado llenaría la lista de ruido y nadie la miraría. Solo se
            // anota lo que mueve plata.
            GymPayment antes = pago("48000", "CASH");
            GymPayment despues = pago("48000", "CASH");
            despues.setId(antes.getId());

            service.anotarEdicion(antes, despues, "Carla");

            verify(ajustes, never()).save(any());
        }

        @Test
        @DisplayName("dos cambios en el mismo guardado se anotan por separado")
        void variosCambios() {
            GymPayment antes = pago("48000", "CASH");
            GymPayment despues = pago("40000", "TRANSFER");
            despues.setId(antes.getId());

            service.anotarEdicion(antes, despues, "Carla");

            List<GymPaymentAjuste> a = anotados();
            assertEquals(2, a.size(), "monto y método son dos hechos distintos");
        }

        @Test
        @DisplayName("cambiar el estado a pendiente se anota")
        void cambiarElEstado() {
            // Otra forma de sacar plata de la cuenta sin borrar nada: marcarla como no cobrada.
            GymPayment antes = pago("48000", "CASH");
            GymPayment despues = pago("48000", "CASH");
            despues.setId(antes.getId());
            despues.setStatus("pending");

            service.anotarEdicion(antes, despues, "Carla");

            assertEquals("estado", anotados().get(0).getCampo());
        }

        @Test
        @DisplayName("cambiar el cobro de socio se anota")
        void cambiarElSocio() {
            GymMember uno = new GymMember();
            uno.setId(UUID.randomUUID());
            GymMember otro = new GymMember();
            otro.setId(UUID.randomUUID());

            GymPayment antes = pago("48000", "CASH");
            antes.setMember(uno);
            GymPayment despues = pago("48000", "CASH");
            despues.setId(antes.getId());
            despues.setMember(otro);

            service.anotarEdicion(antes, despues, "Carla");

            assertEquals("socio", anotados().get(0).getCampo());
        }
    }
}
