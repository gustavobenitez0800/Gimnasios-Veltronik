package com.veltronik.v2.core.services;

import com.veltronik.v2.core.entities.Cashier;
import com.veltronik.v2.core.entities.Tenant;
import com.veltronik.v2.core.exceptions.BusinessException;
import com.veltronik.v2.core.repositories.CashierRepository;
import com.veltronik.v2.core.security.CashierContextCache;
import com.veltronik.v2.core.security.TenantContextHolder;
import org.junit.jupiter.api.*;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * El PIN del mostrador.
 *
 * <p>Lo que se prueba acá no es "guarda y compara": es que cuatro dígitos —10.000
 * combinaciones— no sean adivinables, y que el sistema no le cuente a nadie más de lo que
 * necesita saber.</p>
 */
class CashierServiceTest {

    private static final UUID TENANT = UUID.randomUUID();
    private static final UUID OTRO_TENANT = UUID.randomUUID();

    private CashierRepository repository;
    private CashierContextCache cache;
    private CashierService service;

    private Cashier mariana;
    private final UUID marianaId = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        repository = mock(CashierRepository.class);
        cache = mock(CashierContextCache.class);
        service = new CashierService(repository, cache);

        TenantContextHolder.setTenantId(TENANT);

        Tenant tenant = new Tenant();
        tenant.setId(TENANT);

        mariana = new Cashier();
        mariana.setId(marianaId);
        mariana.setTenant(tenant);
        mariana.setName("Mariana");
        mariana.setPinHash(new BCryptPasswordEncoder().encode("7391"));
        mariana.setActive(true);
    }

    @AfterEach
    void tearDown() {
        TenantContextHolder.clear();
    }

    // ── Abrir turno ────────────────────────────────────────────────────────────

    @Nested
    @DisplayName("Marcar turno")
    class MarcarTurno {

        @Test
        @DisplayName("Con el PIN correcto, abre el turno")
        void pinCorrecto() {
            when(repository.findById(marianaId)).thenReturn(Optional.of(mariana));

            assertThat(service.verifyPin(marianaId, "7391").getName()).isEqualTo("Mariana");
        }

        @Test
        @DisplayName("Con el PIN incorrecto, no dice nada útil")
        void pinIncorrecto() {
            when(repository.findById(marianaId)).thenReturn(Optional.of(mariana));

            assertThatThrownBy(() -> service.verifyPin(marianaId, "0000"))
                    .isInstanceOf(BusinessException.class)
                    .hasMessage("PIN incorrecto.");
        }

        @Test
        @DisplayName("Un cajero que no existe da el MISMO error que un PIN mal puesto")
        void cajeroInexistenteNoSeDistingue() {
            // Si el mensaje distinguiera, quien prueba ids ajenos sabría cuáles existen.
            when(repository.findById(any())).thenReturn(Optional.empty());

            assertThatThrownBy(() -> service.verifyPin(UUID.randomUUID(), "7391"))
                    .isInstanceOf(BusinessException.class)
                    .hasMessage("PIN incorrecto.");
        }

        @Test
        @DisplayName("No se puede abrir turno con un cajero de OTRA sucursal")
        void cajeroDeOtraSucursal() {
            Tenant ajeno = new Tenant();
            ajeno.setId(OTRO_TENANT);
            mariana.setTenant(ajeno);
            when(repository.findById(marianaId)).thenReturn(Optional.of(mariana));

            assertThatThrownBy(() -> service.verifyPin(marianaId, "7391"))
                    .isInstanceOf(BusinessException.class);
        }

        @Test
        @DisplayName("Alguien dado de baja no puede marcar turno")
        void cajeroInactivo() {
            mariana.setActive(false);
            when(repository.findById(marianaId)).thenReturn(Optional.of(mariana));

            assertThatThrownBy(() -> service.verifyPin(marianaId, "7391"))
                    .isInstanceOf(BusinessException.class);
        }
    }

    // ── Lo que hace que 4 dígitos sirvan ───────────────────────────────────────

    @Nested
    @DisplayName("Freno a la fuerza bruta")
    class FuerzaBruta {

        @Test
        @DisplayName("A los 5 intentos fallidos, bloquea")
        void bloqueaTrasCincoIntentos() {
            // Sin esto, un script prueba las 10.000 combinaciones en minutos y el PIN no
            // protege nada.
            when(repository.findById(marianaId)).thenReturn(Optional.of(mariana));

            for (int i = 0; i < 5; i++) {
                assertThatThrownBy(() -> service.verifyPin(marianaId, "1357"))
                        .hasMessage("PIN incorrecto.");
            }

            // El sexto ni siquiera compara: avisa que hay que esperar.
            assertThatThrownBy(() -> service.verifyPin(marianaId, "7391"))
                    .isInstanceOf(BusinessException.class)
                    .hasMessageContaining("Demasiados intentos");
        }

        @Test
        @DisplayName("Un acierto antes del quinto limpia el contador")
        void elAciertoLimpiaElContador() {
            when(repository.findById(marianaId)).thenReturn(Optional.of(mariana));

            for (int i = 0; i < 4; i++) {
                assertThatThrownBy(() -> service.verifyPin(marianaId, "1357"));
            }
            service.verifyPin(marianaId, "7391"); // acierta

            // Vuelve a tener sus cinco intentos: no queda castigado por haberse equivocado antes.
            for (int i = 0; i < 4; i++) {
                assertThatThrownBy(() -> service.verifyPin(marianaId, "1357"))
                        .hasMessage("PIN incorrecto.");
            }
        }

        @Test
        @DisplayName("Cambiarle el PIN destraba un bloqueo en curso")
        void cambiarElPinDestraba() {
            // Caso real: la recepcionista se olvidó el PIN, se bloqueó, y el dueño le pone
            // uno nuevo. Si el bloqueo siguiera, tendría que esperar igual sin motivo.
            when(repository.findById(marianaId)).thenReturn(Optional.of(mariana));
            for (int i = 0; i < 5; i++) {
                assertThatThrownBy(() -> service.verifyPin(marianaId, "1357"));
            }

            service.changePin(marianaId, "8264");

            assertThat(service.verifyPin(marianaId, "8264").getName()).isEqualTo("Mariana");
        }
    }

    // ── Alta y validaciones ────────────────────────────────────────────────────

    @Nested
    @DisplayName("Alta")
    class Alta {

        @Test
        @DisplayName("Guarda el PIN hasheado, nunca en claro")
        void guardaHasheado() {
            when(repository.findByTenantIdAndNameIgnoreCase(TENANT, "Beto")).thenReturn(Optional.empty());
            when(repository.save(any(Cashier.class))).thenAnswer(i -> i.getArgument(0));

            Cashier creado = service.create("Beto", "5824");

            assertThat(creado.getPinHash()).isNotEqualTo("5824");
            assertThat(new BCryptPasswordEncoder().matches("5824", creado.getPinHash())).isTrue();
        }

        @Test
        @DisplayName("Rechaza PINs que no sean 4 números")
        void rechazaPinInvalido() {
            for (String malo : new String[]{"123", "12345", "abcd", "12a4", "", null}) {
                assertThatThrownBy(() -> service.create("Beto", malo))
                        .isInstanceOf(BusinessException.class)
                        .hasMessageContaining("4 números");
            }
        }

        @Test
        @DisplayName("Rechaza los PINs que todo el mundo elige")
        void rechazaPinObvio() {
            // 1234 y 0000 son la mitad de los PINs del mundo. Permitirlos sería dejar el
            // freno de fuerza bruta sin sentido: no hace falta probar 10.000 si con tres
            // alcanza.
            for (String obvio : new String[]{"0000", "1234", "1111", "4321"}) {
                assertThatThrownBy(() -> service.create("Beto", obvio))
                        .isInstanceOf(BusinessException.class)
                        .hasMessageContaining("fácil de adivinar");
            }
        }

        @Test
        @DisplayName("No deja dos personas con el mismo nombre en la sucursal")
        void rechazaNombreRepetido() {
            // En la pantalla de turno se elige por NOMBRE: dos "Mariana" serían una moneda
            // al aire, y la firma de cada movimiento dejaría de significar algo.
            when(repository.findByTenantIdAndNameIgnoreCase(TENANT, "mariana")).thenReturn(Optional.of(mariana));

            assertThatThrownBy(() -> service.create("  mariana  ", "5824"))
                    .isInstanceOf(BusinessException.class)
                    .hasMessageContaining("ese nombre");
        }

        @Test
        @DisplayName("Dar de baja no borra: los movimientos viejos siguen teniendo autor")
        void bajaLogica() {
            when(repository.findById(marianaId)).thenReturn(Optional.of(mariana));

            service.setActive(marianaId, false);

            assertThat(mariana.isActive()).isFalse();
            verify(repository).save(mariana);
            verify(repository, never()).delete(any());
            verify(cache).evict(marianaId, TENANT);
        }
    }
}
