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
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
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
        // La política de socios entra real y no simulada: es una clase pura (compara fechas)
        // y usar la de verdad evita que este test pase con un mock que dice cualquier cosa.
        service = new AccessLogService(repo, memberService,
                new com.veltronik.v2.gym.security.MemberAccessPolicy(3), 6);
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

            var r = service.registerScan(MEMBER, "QR", null, null, null, null);

            assertEquals(AccessLogService.Direction.ENTRADA, r.direction());
            assertFalse(r.recuperado());
        }

        @Test
        @DisplayName("con una visita en curso, el escaneo es la salida")
        void segundoEscaneoEsSalida() {
            visitaAbiertaDesde(LocalDateTime.now().minusHours(1));

            var r = service.registerScan(MEMBER, "QR", null, null, null, null);

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

            var r = service.registerScan(MEMBER, "QR", null, null, null, null);

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

            var r = service.registerScan(MEMBER, "QR", null, null, null, null);

            assertEquals(AccessLogService.Direction.ENTRADA, r.direction(),
                    "si esto vuelve a ser SALIDA, la visita de hoy no se registra nunca");
            assertTrue(r.recuperado(), "hay que avisar que se recuperó una visita abandonada");
        }

        @Test
        @DisplayName("la visita vieja queda cerrada y marcada como cerrada por el sistema")
        void laViejaQuedaMarcada() {
            LocalDateTime ayer = LocalDateTime.now().minusDays(1).withHour(9);
            AccessLog vieja = visitaAbiertaDesde(ayer);

            service.registerScan(MEMBER, "QR", null, null, null, null);

            assertTrue(vieja.getCheckOutAt() != null, "no puede quedar abierta para siempre");
            assertTrue(vieja.isAutoClosed(), "sin la marca, envenena el promedio de permanencia");
        }

        @Test
        @DisplayName("la salida estimada NO cruza la medianoche")
        void elCierreEstimadoNoCruzaLaMedianoche() {
            LocalDateTime ayer = LocalDateTime.now().minusDays(1).withHour(9);
            AccessLog vieja = visitaAbiertaDesde(ayer);

            service.registerScan(MEMBER, "QR", null, null, null, null);

            assertEquals(ayer.toLocalDate(), vieja.getCheckOutAt().toLocalDate(),
                    "cerrar 'ahora' grabaría visitas de 25 horas");
            assertEquals(LocalTime.MAX.withNano(0), vieja.getCheckOutAt().toLocalTime().withNano(0));
        }

        /**
         * El gimnasio abierto de noche. Este caso estuvo ROTO: la regla decía "abandonada si
         * pasaron 6 horas O cambió el día", y esa segunda mitad convertía la salida de
         * cualquiera que cruzara la medianoche en una ENTRADA nueva. El socio tocaba "marcar
         * salida", el sistema contestaba "entrada registrada", y el botón volvía a decir
         * "marcar salida". Parecía trabado.
         */
        @Test
        @DisplayName("entrar 23:00 y salir 00:30 es una SALIDA, aunque haya cambiado el día")
        void cruzarLaMedianocheNoEsAbandono() {
            LocalDateTime anoche = LocalDateTime.now().minusHours(2);
            visitaAbiertaDesde(anoche);

            var r = service.registerScan(MEMBER, "QR", null, null, null, null);

            assertEquals(AccessLogService.Direction.SALIDA, r.direction(),
                    "dos horas es una visita viva, cruce o no cruce la medianoche");
            assertFalse(r.recuperado(), "no hay nada que recuperar: el socio está saliendo");
        }

        @Test
        @DisplayName("una visita larguísima del mismo día también se corta")
        void masDeSeisHorasEsAbandono() {
            visitaAbiertaDesde(LocalDateTime.now().minusHours(7));

            var r = service.registerScan(MEMBER, "QR", null, null, null, null);

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

    @Nested
    @DisplayName("los accesos que llegan tarde (sin internet)")
    class SinInternet {

        @Test
        @DisplayName("un acceso que ya se guardó no se procesa de nuevo")
        void reintentoNoDuplica() {
            // ⭐ EL TEST QUE SOSTIENE TODO. Sin esto, un reintento no duplica: INVIERTE.
            // La dirección se deduce del estado, así que procesar dos veces la misma entrada
            // da salida la segunda vez, y el socio queda "afuera" sin haberse ido.
            UUID sello = UUID.randomUUID();
            AccessLog yaGuardado = new AccessLog();
            yaGuardado.setCheckInAt(LocalDateTime.now().minusMinutes(20));
            yaGuardado.setClientRef(sello);
            when(repo.findByTenantIdAndClientRef(TENANT, sello)).thenReturn(Optional.of(yaGuardado));

            var r = service.registerScan(MEMBER, "manual", null, null, sello, null);

            assertEquals(AccessLogService.Direction.ENTRADA, r.direction());
            assertSame(yaGuardado, r.log());
            // Y sobre todo: no se guardó NADA nuevo ni se tocó al socio.
            verify(repo, never()).save(any(AccessLog.class));
            verify(memberService, never()).findByIdAndVerifyOwnership(any());
        }

        @Test
        @DisplayName("el reintento de una salida se reconoce como salida")
        void reintentoDeSalida() {
            UUID sello = UUID.randomUUID();
            AccessLog cerrado = new AccessLog();
            cerrado.setCheckInAt(LocalDateTime.now().minusHours(2));
            cerrado.setCheckOutAt(LocalDateTime.now().minusMinutes(5));
            cerrado.setClientRef(sello);
            when(repo.findByTenantIdAndClientRef(TENANT, sello)).thenReturn(Optional.of(cerrado));

            var r = service.registerScan(MEMBER, "manual", null, null, sello, null);

            assertEquals(AccessLogService.Direction.SALIDA, r.direction());
            verify(repo, never()).save(any(AccessLog.class));
        }

        @Test
        @DisplayName("la entrada se graba con la hora en que PASÓ, no con la de llegada")
        void guardaElMomentoReal() {
            sinVisitaAbierta();
            LocalDateTime cuandoPaso = LocalDateTime.now().minusHours(3);

            service.registerScan(MEMBER, "manual", null, null, UUID.randomUUID(), cuandoPaso);

            ArgumentCaptor<AccessLog> cap = ArgumentCaptor.forClass(AccessLog.class);
            verify(repo).save(cap.capture());
            assertEquals(cuandoPaso, cap.getValue().getCheckInAt());
        }

        @Test
        @DisplayName("la dirección se decide con el mundo de ESE momento, no con el de ahora")
        void laDireccionMiraElPasado() {
            // El socio entró a las 08:00 y salió a las 09:00, y las dos marcas viajaron en la
            // cola. Cuando llega la SALIDA, la visita de las 08:00 sigue abierta y hace tres
            // horas que empezó. Si se evaluara contra "ahora" caería en la regla de visita
            // abandonada y abriría una entrada nueva — el socio quedaría adentro después de
            // haberse ido. Evaluada a las 09:00, la visita tiene una hora y es una salida.
            LocalDateTime entrada = LocalDateTime.now().withHour(8).withMinute(0).withSecond(0).withNano(0);
            LocalDateTime salida = entrada.plusHours(1);
            AccessLog abierta = visitaAbiertaDesde(entrada);

            var r = service.registerScan(MEMBER, "manual", null, null, UUID.randomUUID(), salida);

            assertEquals(AccessLogService.Direction.SALIDA, r.direction());
            assertEquals(salida, abierta.getCheckOutAt());
        }

        @Test
        @DisplayName("la salida guarda el sello, para que su reintento se reconozca")
        void laSalidaTambienSeSella() {
            UUID sello = UUID.randomUUID();
            AccessLog abierta = visitaAbiertaDesde(LocalDateTime.now().minusHours(1));

            service.registerScan(MEMBER, "manual", null, null, sello, null);

            assertEquals(sello, abierta.getClientRef());
        }

        @Test
        @DisplayName("un reloj adelantado no manda visitas al futuro")
        void relojAdelantado() {
            sinVisitaAbierta();
            LocalDateTime dentroDeUnaSemana = LocalDateTime.now().plusDays(7);

            service.registerScan(MEMBER, "manual", null, null, UUID.randomUUID(), dentroDeUnaSemana);

            ArgumentCaptor<AccessLog> cap = ArgumentCaptor.forClass(AccessLog.class);
            verify(repo).save(cap.capture());
            assertTrue(cap.getValue().getCheckInAt().isBefore(LocalDateTime.now().plusMinutes(1)),
                    "una visita no puede quedar registrada en el futuro");
        }

        @Test
        @DisplayName("un reloj atrasado meses no escribe en un mes ya cerrado")
        void relojAtrasado() {
            sinVisitaAbierta();
            LocalDateTime haceTresMeses = LocalDateTime.now().minusMonths(3);

            service.registerScan(MEMBER, "manual", null, null, UUID.randomUUID(), haceTresMeses);

            ArgumentCaptor<AccessLog> cap = ArgumentCaptor.forClass(AccessLog.class);
            verify(repo).save(cap.capture());
            assertTrue(cap.getValue().getCheckInAt().isAfter(LocalDateTime.now().minusDays(2)),
                    "se acota al límite en vez de ensuciar un mes viejo");
        }

        @Test
        @DisplayName("sin sello, todo sigue exactamente como antes")
        void sinSelloNoCambiaNada() {
            // Los accesos online no traen sello ni momento. Este test fija que la función
            // vieja no cambió de comportamiento: es la que usan todos los gimnasios.
            sinVisitaAbierta();

            var r = service.registerScan(MEMBER, "QR", null, null, null, null);

            assertEquals(AccessLogService.Direction.ENTRADA, r.direction());
            verify(repo, never()).findByTenantIdAndClientRef(any(), any());
        }
    }

    @org.junit.jupiter.api.Nested
    @DisplayName("los números del día")
    class ResumenDelDia {

        private AccessLog visita(int entroHaceMin, Integer duroMin) {
            AccessLog a = new AccessLog();
            LocalDateTime entrada = LocalDateTime.now().minusMinutes(entroHaceMin);
            a.setCheckInAt(entrada);
            if (duroMin != null) a.setCheckOutAt(entrada.plusMinutes(duroMin));
            return a;
        }

        // ⭐ POR QUÉ SE CALCULAN ACÁ: la pantalla muestra 30 filas pero los números son de
        // TODO el día. Antes viajaban los 250 accesos completos —cada uno con la ficha del
        // socio— para que el frontend contara dos números, cada quince segundos.
        @Test
        @DisplayName("el total es el del día entero, no el de lo que se manda")
        void elTotalEsDelDiaEntero() {
            var r = service.resumirDia(java.util.List.of(
                    visita(180, 60), visita(120, 90), visita(60, null)));

            assertEquals(3, r.total());
        }

        @Test
        @DisplayName("el promedio solo cuenta las visitas que ya cerraron")
        void promedioSoloDeLasCerradas() {
            // El que todavía está adentro no tiene duración: meterlo como cero hundiría el
            // promedio, y justo a las horas de más gente.
            var r = service.resumirDia(java.util.List.of(
                    visita(180, 60), visita(120, 90), visita(10, null)));

            assertEquals(75, r.promedioMin());
        }

        @Test
        @DisplayName("sin ninguna visita cerrada el promedio es NULL, no cero")
        void sinCerradasNoHayPromedio() {
            // Cero diría que la gente entra y sale en el acto. "Todavía no sé" es otra cosa.
            var r = service.resumirDia(java.util.List.of(visita(30, null)));

            assertEquals(1, r.total());
            assertNull(r.promedioMin());
        }

        @Test
        @DisplayName("un día sin nadie no rompe")
        void diaVacio() {
            var r = service.resumirDia(java.util.List.of());
            assertEquals(0, r.total());
            assertNull(r.promedioMin());
        }
    }
}
