package com.veltronik.v2.gym.controllers;

import com.veltronik.v2.core.entities.Tenant;
import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.gym.dto.GymPlanDTO;
import com.veltronik.v2.gym.entities.GymPlan;
import com.veltronik.v2.gym.repositories.GymPlanRepository;
import com.veltronik.v2.gym.services.GymPlanService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * CREAR UN ARANCEL DESDE AJUSTES.
 *
 * <p>Hasta el 2026-09-21 <b>no se podía crear ningún arancel</b>: la validación exigía "días o
 * clases" mirando {@code durationDays}, un campo congelado desde la V65 que la pantalla ya no
 * manda (ADR-013). Todo arancel nuevo llegaba con 0 y se rechazaba con "El arancel tiene que
 * otorgar días, clases, o las dos cosas". Frenó la carga del catálogo de un gimnasio que estaba
 * migrando.</p>
 *
 * <p>Por eso los tests entran por el controlador y con <b>el cuerpo exacto que manda Ajustes</b>
 * —nombre, precio, cantidad y unidad, nada más—: lo que falló fue la distancia entre lo que la
 * pantalla manda y lo que el backend esperaba, y un test que armara la entidad a mano no la
 * habría visto.</p>
 */
class GymPlanControllerTest {

    private static final UUID TENANT = UUID.fromString("a8712a90-cae6-4a34-a018-8821994e5ffd");

    private GymPlanRepository repository;
    private GymPlanController controller;

    @BeforeEach
    void setUp() {
        repository = mock(GymPlanRepository.class);
        controller = new GymPlanController(new GymPlanService(repository));
        TenantContextHolder.setTenantId(TENANT);

        when(repository.findVigentePorNombre(eq(TENANT), anyString())).thenReturn(Optional.empty());
        when(repository.save(any(GymPlan.class))).thenAnswer(i -> i.getArgument(0));
    }

    @AfterEach
    void tearDown() {
        TenantContextHolder.clear();
    }

    /** Lo que manda `ArancelesSettings.jsx` al guardar. Sin `durationDays` y sin `classes`. */
    private static GymPlanDTO comoLoMandaAjustes(String nombre, int cantidad, String unidad) {
        GymPlanDTO in = new GymPlanDTO();
        in.setName(nombre);
        in.setPrice(new BigDecimal("34000"));
        in.setCoberturaCantidad(cantidad);
        in.setCoberturaUnidad(unidad);
        return in;
    }

    private static HttpStatus estadoDe(Throwable t) {
        return HttpStatus.valueOf(((ResponseStatusException) t).getStatusCode().value());
    }

    // ⭐ EL BUG
    @Test
    @DisplayName("se puede crear un arancel mensual con lo que manda la pantalla")
    void creaUnArancelMensual() {
        GymPlanDTO creado = controller.crear(comoLoMandaAjustes("Musculación semana completa", 1, "MES")).getBody();

        assertThat(creado).isNotNull();
        assertThat(creado.getName()).isEqualTo("Musculación semana completa");
        assertThat(creado.getCoberturaCantidad()).isEqualTo(1);
        assertThat(creado.getCoberturaUnidad()).isEqualTo("MES");
        verify(repository).save(any(GymPlan.class));
    }

    @ParameterizedTest(name = "{0} {1}")
    @DisplayName("se acepta cada opción de la lista de Ajustes")
    @CsvSource({
            "1, DIA", "7, DIA", "15, DIA",
            "1, MES", "2, MES", "3, MES", "6, MES", "12, MES",
            "0, DIA",
    })
    void aceptaCadaOpcionDeLaLista(int cantidad, String unidad) {
        GymPlanDTO creado = controller.crear(comoLoMandaAjustes("Pase", cantidad, unidad)).getBody();

        assertThat(creado).isNotNull();
        assertThat(creado.getCoberturaCantidad()).isEqualTo(cantidad);
        assertThat(creado.getCoberturaUnidad()).isEqualTo(unidad);
    }

    @Test
    @DisplayName("\"no cubre tiempo\" es una opción, no un error de carga (ADR-013)")
    void noCubreTiempoEsUnaOpcion() {
        // La clase suelta: cobra plata sin correr la fecha. La regla vieja la rechazaba por no
        // "otorgar" nada, pero la lista de Ajustes la ofrece con todas las letras.
        GymPlanDTO creado = controller.crear(comoLoMandaAjustes("Clase suelta", 0, "DIA")).getBody();

        assertThat(creado).isNotNull();
        assertThat(creado.getCoberturaCantidad()).isZero();
    }

    @Test
    @DisplayName("una cobertura negativa se rechaza con palabras, no con el CHECK de la base")
    void rechazaCoberturaNegativa() {
        assertThatThrownBy(() -> controller.crear(comoLoMandaAjustes("Pase", -1, "MES")))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(t -> assertThat(estadoDe(t)).isEqualTo(HttpStatus.BAD_REQUEST))
                .hasMessageContaining("negativa");
        verify(repository, never()).save(any());
    }

    @ParameterizedTest(name = "\"{0}\"")
    @DisplayName("una unidad que no es DIA ni MES se rechaza")
    @CsvSource({"SEMANA", "mes", "MESES"})
    void rechazaUnidadDesconocida(String unidad) {
        // Cualquier unidad que no sea MES termina sumando días: una "SEMANA" de 1 sería un día.
        assertThatThrownBy(() -> controller.crear(comoLoMandaAjustes("Pase", 1, unidad)))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(t -> assertThat(estadoDe(t)).isEqualTo(HttpStatus.BAD_REQUEST));
        verify(repository, never()).save(any());
    }

    @Test
    @DisplayName("sigue exigiendo un nombre")
    void exigeNombre() {
        assertThatThrownBy(() -> controller.crear(comoLoMandaAjustes("  ", 1, "MES")))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(t -> assertThat(estadoDe(t)).isEqualTo(HttpStatus.BAD_REQUEST))
                .hasMessageContaining("nombre");
        verify(repository, never()).save(any());
    }

    @Test
    @DisplayName("editar un arancel viejo sigue andando")
    void editaUnArancelViejo() {
        // Uno de antes de la migración: conserva su durationDays, que ya no decide nada.
        UUID id = UUID.randomUUID();
        GymPlan viejo = new GymPlan();
        viejo.setId(id);
        viejo.setName("Mensual");
        viejo.setDurationDays(30);
        Tenant t = new Tenant();
        t.setId(TENANT);
        viejo.setTenant(t);
        when(repository.findById(id)).thenReturn(Optional.of(viejo));

        GymPlanDTO editado = controller.editar(id, comoLoMandaAjustes("Mensual", 3, "MES")).getBody();

        assertThat(editado).isNotNull();
        assertThat(editado.getCoberturaCantidad()).isEqualTo(3);
    }
}
