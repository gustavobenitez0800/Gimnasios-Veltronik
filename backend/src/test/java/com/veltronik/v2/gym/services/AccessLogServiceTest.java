package com.veltronik.v2.gym.services;

import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.gym.entities.AccessLog;
import com.veltronik.v2.gym.entities.GymMember;
import com.veltronik.v2.gym.repositories.AccessLogRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * La dirección de un escaneo (entrada o salida) es la pieza más frágil de todo el control de
 * acceso, porque el error más común —irse sin marcar— no avisa: envenena los datos en silencio.
 *
 * <p>Estos tests fijan el comportamiento nuevo, y sobre todo fijan que NO vuelva el viejo.</p>
 */
class AccessLogServiceTest {

    private static final UUID TENANT = UUID.randomUUID();
    private static final UUID MEMBER = UUID.randomUUID();

    private AccessLogRepository repo;
    private GymMemberService memberService;
    private AccessLogService service;

    @BeforeEach
    void setUp() {
        repo = mock(AccessLogRepository.class);
        memberService = mock(GymMemberService.class);
        service = new AccessLogService(repo, memberService, 6);
        TenantContextHolder.setTenantId(TENANT);

        GymMember member = new GymMember();
        member.setId(MEMBER);
        when(memberService.findByIdAndVerifyOwnership(MEMBER)).thenReturn(member);
        when(repo.save(any(AccessLog.class))).thenAnswer(i -> i.getArgument(0));
    }

    @AfterEach
    void tearDown() {
        TenantContextHolder.clear();
    }

    /** Deja una visita abierta que entró en el momento indicado. */
    private AccessLog visitaAbiertaDesde(LocalDateTime entrada) {
        AccessLog log = new AccessLog();
        log.setCheckInAt(entrada);
        when(repo.findTopByTenantIdAndMemberIdAndCheckOutAtIsNullOrderByCheckInAtDesc(TENANT, MEMBER))
                .thenReturn(Optional.of(log));
        return log;
    }

    private void sinVisitaAbierta() {
        when(repo.findTopByTenantIdAndMemberIdAndCheckOutAtIsNullOrderByCheckInAtDesc(TENANT, MEMBER))
                .thenReturn(Optional.empty());
    }

    @Nested
    @DisplayName("el día normal")
    class DiaNormal {

        @Test
        @DisplayName("el primer escaneo del día es una entrada")
        void primerEscaneoEsEntrada() {
            sinVisitaAbierta();

            var r = service.registerScan(MEMBER, "QR", null, null);

            assertEquals(AccessLogService.Direction.ENTRADA, r.direction());
            assertFalse(r.recuperado());
        }

        @Test
        @DisplayName("con una visita en curso, el escaneo es la salida")
        void segundoEscaneoEsSalida() {
            visitaAbiertaDesde(LocalDateTime.now().minusHours(1));

            var r = service.registerScan(MEMBER, "QR", null, null);

            assertEquals(AccessLogService.Direction.SALIDA, r.direction());
            assertTrue(r.log().getCheckOutAt() != null, "la salida tiene que quedar grabada");
            assertFalse(r.log().isAutoClosed(), "la cerró el socio, no el sistema");
        }
    }

    @Nested
    @DisplayName("el dedo tembloroso")
    class Rebote {

        @Test
        @DisplayName("escanear dos veces seguidas no lo hace entrar y salir")
        void dobleEscaneoNoCuentaDosVeces() {
            AccessLog abierta = visitaAbiertaDesde(LocalDateTime.now().minusSeconds(3));

            var r = service.registerScan(MEMBER, "QR", null, null);

            assertEquals(AccessLogService.Direction.REBOTE, r.direction());
            assertTrue(abierta.getCheckOutAt() == null, "la visita sigue abierta");
            verify(repo, never()).save(any(AccessLog.class));
        }
    }

    /**
     * El corazón del asunto. Con la lógica vieja (un interruptor: si hay visita abierta la cierro,
     * si no abro una) el olvido del lunes invertía TODAS las visitas siguientes, para siempre.
     */
    @Nested
    @DisplayName("se fue sin marcar")
    class VisitaAbandonada {

        @Test
        @DisplayName("al volver al otro día se registra una ENTRADA, no una salida")
        void alDiaSiguienteEsEntradaNoSalida() {
            LocalDateTime ayer = LocalDateTime.now().minusDays(1).withHour(9);
            visitaAbiertaDesde(ayer);

            var r = service.registerScan(MEMBER, "QR", null, null);

            assertEquals(AccessLogService.Direction.ENTRADA, r.direction(),
                    "si esto vuelve a ser SALIDA, la visita de hoy no se registra nunca");
            assertTrue(r.recuperado(), "hay que avisar que se recuperó una visita abandonada");
        }

        @Test
        @DisplayName("la visita vieja queda cerrada y marcada como cerrada por el sistema")
        void laViejaQuedaMarcada() {
            LocalDateTime ayer = LocalDateTime.now().minusDays(1).withHour(9);
            AccessLog vieja = visitaAbiertaDesde(ayer);

            service.registerScan(MEMBER, "QR", null, null);

            assertTrue(vieja.getCheckOutAt() != null, "no puede quedar abierta para siempre");
            assertTrue(vieja.isAutoClosed(), "sin la marca, envenena el promedio de permanencia");
        }

        @Test
        @DisplayName("la salida estimada NO cruza la medianoche")
        void elCierreEstimadoNoCruzaLaMedianoche() {
            LocalDateTime ayer = LocalDateTime.now().minusDays(1).withHour(9);
            AccessLog vieja = visitaAbiertaDesde(ayer);

            service.registerScan(MEMBER, "QR", null, null);

            assertEquals(ayer.toLocalDate(), vieja.getCheckOutAt().toLocalDate(),
                    "cerrar 'ahora' grabaría visitas de 25 horas");
            assertEquals(LocalTime.MAX.withNano(0), vieja.getCheckOutAt().toLocalTime().withNano(0));
        }

        @Test
        @DisplayName("una visita larguísima del mismo día también se corta")
        void masDeSeisHorasEsAbandono() {
            visitaAbiertaDesde(LocalDateTime.now().minusHours(7));

            var r = service.registerScan(MEMBER, "QR", null, null);

            assertEquals(AccessLogService.Direction.ENTRADA, r.direction(), "nadie entrena siete horas");
            assertTrue(r.recuperado());
        }
    }

    @Nested
    @DisplayName("el cierre nocturno")
    class CierreNocturno {

        @Test
        @DisplayName("cierra lo que quedó abierto de días anteriores")
        void cierraLoDeAyer() {
            AccessLog vieja = new AccessLog();
            vieja.setCheckInAt(LocalDateTime.now().minusDays(2).withHour(20));
            when(repo.findByCheckOutAtIsNullAndCheckInAtBefore(any())).thenReturn(List.of(vieja));

            int cerradas = service.cerrarVisitasAbandonadas();

            assertEquals(1, cerradas);
            assertTrue(vieja.isAutoClosed());
            assertEquals(vieja.getCheckInAt().toLocalDate(), vieja.getCheckOutAt().toLocalDate());
        }

        @Test
        @DisplayName("solo mira días anteriores: al que está adentro ahora no lo toca")
        void noTocaLoDeHoy() {
            when(repo.findByCheckOutAtIsNullAndCheckInAtBefore(any())).thenReturn(List.of());
            ArgumentCaptor<LocalDateTime> limite = ArgumentCaptor.forClass(LocalDateTime.class);

            service.cerrarVisitasAbandonadas();

            verify(repo).findByCheckOutAtIsNullAndCheckInAtBefore(limite.capture());
            assertEquals(LocalTime.MIDNIGHT, limite.getValue().toLocalTime(),
                    "el corte es el arranque de hoy; si fuera 'ahora' echaría a los que están entrenando");
        }
    }
}
