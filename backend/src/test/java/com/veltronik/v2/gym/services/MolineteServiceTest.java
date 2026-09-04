package com.veltronik.v2.gym.services;

import com.veltronik.v2.core.entities.Tenant;
import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.gym.entities.AccessDenied;
import com.veltronik.v2.gym.entities.AccessLog;
import com.veltronik.v2.gym.entities.CheckinPoint;
import com.veltronik.v2.gym.entities.GymMember;
import com.veltronik.v2.gym.repositories.AccessDeniedRepository;
import com.veltronik.v2.gym.repositories.CheckinPointRepository;
import com.veltronik.v2.gym.repositories.GymMemberRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * El molinete es la primera pieza de Veltronik que recibe datos de un aparato que no
 * controlamos, por un endpoint sin login. Estos tests fijan las tres cosas que, si se rompen,
 * se rompen en silencio: que un aviso repetido no invente visitas, que un socio frenado quede
 * anotado una sola vez, y que el gimnasio de un pedido no se le quede pegado al siguiente.
 */
class MolineteServiceTest {

    private static final UUID TENANT = UUID.randomUUID();
    private static final UUID OTRO_TENANT = UUID.randomUUID();
    private static final UUID PUNTO = UUID.randomUUID();
    private static final UUID SOCIO = UUID.fromString("11111111-2222-3333-4444-555555555555");
    private static final String SOCIO_EN_EL_EQUIPO = "11111111222233334444555555555555";
    private static final String SERIE = "E03C1CB7BBE61830";
    private static final String TOKEN = "tok-de-la-puerta";

    private CheckinPointRepository pointRepository;
    private GymMemberRepository memberRepository;
    private AccessDeniedRepository deniedRepository;
    private AccessLogService accessLogService;
    private MolineteService service;

    private CheckinPoint punto;

    @BeforeEach
    void setUp() {
        pointRepository = mock(CheckinPointRepository.class);
        memberRepository = mock(GymMemberRepository.class);
        deniedRepository = mock(AccessDeniedRepository.class);
        accessLogService = mock(AccessLogService.class);
        service = new MolineteService(pointRepository, memberRepository, deniedRepository, accessLogService);

        punto = new CheckinPoint();
        punto.setId(PUNTO);
        punto.setName("Molinete");
        punto.setDeviceSerial(SERIE);
        when(pointRepository.findById(PUNTO)).thenReturn(Optional.of(punto));
        when(pointRepository.findByToken(TOKEN)).thenReturn(Optional.of(lookup(TENANT)));

        when(memberRepository.findById(SOCIO)).thenReturn(Optional.of(socioDe(TENANT)));
        when(deniedRepository.findTopByTenantIdAndMemberIdOrderByOccurredAtDesc(any(), any()))
                .thenReturn(Optional.empty());
        when(accessLogService.registerScan(any(), any(), any(), any(), any(), any()))
                .thenReturn(new AccessLogService.ScanResult(
                        new AccessLog(), AccessLogService.Direction.ENTRADA, false));
    }

    @AfterEach
    void tearDown() {
        TenantContextHolder.clear();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // El camino feliz
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("Reconocido y habilitado: se registra la visita como FACIAL, por esa puerta")
    void registraLaVisita() {
        var r = service.recibir(TOKEN, aviso("face_0", "1788472566659"));

        assertEquals(MolineteService.Resultado.REGISTRADO, r);
        verify(accessLogService).registerScan(eq(SOCIO), eq(AccessLogService.METODO_FACIAL),
                eq(PUNTO), isNullUuid(), any(), any());
    }

    @Test
    @DisplayName("La hora la pone el equipo, no el servidor: un aviso encolado no se anota tarde")
    void respetaLaHoraDelEquipo() {
        service.recibir(TOKEN, aviso("face_0", "1788472566659"));

        ArgumentCaptor<LocalDateTime> cuando = ArgumentCaptor.forClass(LocalDateTime.class);
        verify(accessLogService).registerScan(any(), any(), any(), any(), any(), cuando.capture());
        assertNotNull(cuando.getValue());
        assertEquals(2026, cuando.getValue().getYear());
    }

    /**
     * El equipo guarda lo que no pudo entregar y lo manda de nuevo, sin ponerle número. Si el
     * reenvío no se reconoce, no solo duplica: <b>invierte</b>, porque la dirección se deduce
     * del estado. La segunda vez saldría SALIDA donde hubo ENTRADA.
     */
    @Test
    @DisplayName("El mismo aviso reenviado lleva la misma huella, así el reintento no duplica")
    void elReenvioLlevaLaMismaHuella() {
        service.recibir(TOKEN, aviso("face_0", "1788472566659"));
        service.recibir(TOKEN, aviso("face_0", "1788472566659"));

        ArgumentCaptor<UUID> huella = ArgumentCaptor.forClass(UUID.class);
        verify(accessLogService, org.mockito.Mockito.times(2))
                .registerScan(any(), any(), any(), any(), huella.capture(), any());
        assertEquals(huella.getAllValues().get(0), huella.getAllValues().get(1));
    }

    @Test
    @DisplayName("Dos reconocimientos distintos son huellas distintas")
    void dosReconocimientosDistintos() {
        service.recibir(TOKEN, aviso("face_0", "1788472566659"));
        service.recibir(TOKEN, aviso("face_0", "1788472599999"));

        ArgumentCaptor<UUID> huella = ArgumentCaptor.forClass(UUID.class);
        verify(accessLogService, org.mockito.Mockito.times(2))
                .registerScan(any(), any(), any(), any(), huella.capture(), any());
        org.junit.jupiter.api.Assertions.assertNotEquals(
                huella.getAllValues().get(0), huella.getAllValues().get(1));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // El socio frenado
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("Reconocido y frenado: queda anotado con nombre, que es para lo que sirve")
    void anotaElRechazo() {
        var r = service.recibir(TOKEN, avisoRechazado("1788473563768", "2"));

        assertEquals(MolineteService.Resultado.RECHAZADO, r);
        ArgumentCaptor<AccessDenied> guardado = ArgumentCaptor.forClass(AccessDenied.class);
        verify(deniedRepository).save(guardado.capture());
        assertEquals(SOCIO, guardado.getValue().getMember().getId());
        assertEquals(AccessDenied.Reason.FUERA_DE_HORARIO, guardado.getValue().getReason());
        assertEquals(SERIE, guardado.getValue().getDeviceSerial());
        verify(accessLogService, never()).registerScan(any(), any(), any(), any(), any(), any());
    }

    /**
     * El vencido se queda parado esperando que le abra, y el equipo avisa cada pocos segundos.
     * Sin este freno, la lista de "a quién llamar" se llena de treinta líneas del mismo socio
     * y deja de leerse.
     */
    @Test
    @DisplayName("El forcejeo del vencido se junta en una sola línea")
    void noRepiteElRechazoReciente() {
        // El aviso de abajo es de las 19:12:43 hora AR; este rechazo es de un minuto y medio
        // antes: el mismo forcejeo del mismo socio frente a la misma cámara.
        AccessDenied hacePoco = new AccessDenied();
        hacePoco.setOccurredAt(LocalDateTime.of(2026, 9, 3, 19, 11, 10));
        when(deniedRepository.findTopByTenantIdAndMemberIdOrderByOccurredAtDesc(TENANT, SOCIO))
                .thenReturn(Optional.of(hacePoco));

        var r = service.recibir(TOKEN, avisoRechazado("1788473563768", "2"));

        assertEquals(MolineteService.Resultado.REPETIDO, r);
        verify(deniedRepository, never()).save(any());
    }

    @Test
    @DisplayName("Si vuelve más tarde, eso sí es un intento nuevo")
    void elIntentoDeLaTardeEsOtro() {
        AccessDenied deLaManana = new AccessDenied();
        deLaManana.setOccurredAt(LocalDateTime.of(2026, 9, 3, 9, 0));
        when(deniedRepository.findTopByTenantIdAndMemberIdOrderByOccurredAtDesc(TENANT, SOCIO))
                .thenReturn(Optional.of(deLaManana));

        assertEquals(MolineteService.Resultado.RECHAZADO,
                service.recibir(TOKEN, avisoRechazado("1788473563768", "2")));
        verify(deniedRepository).save(any());
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Lo que NO se anota
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("Un desconocido frente a la cámara no es un socio con un problema de cuota")
    void ignoraAlDesconocido() {
        var r = service.recibir(TOKEN, new MolineteService.Aviso(
                "STRANGERBABY", SERIE, "face_2", "1788472566659", "3"));

        assertEquals(MolineteService.Resultado.DESCONOCIDO, r);
        verify(deniedRepository, never()).save(any());
        verify(accessLogService, never()).registerScan(any(), any(), any(), any(), any(), any());
    }

    @Test
    @DisplayName("Token que no resuelve ninguna puerta: no se toca nada")
    void tokenDesconocido() {
        when(pointRepository.findByToken("otro")).thenReturn(Optional.empty());

        assertEquals(MolineteService.Resultado.NO_AUTORIZADO,
                service.recibir("otro", aviso("face_0", "1788472566659")));
        verify(accessLogService, never()).registerScan(any(), any(), any(), any(), any(), any());
    }

    @Test
    @DisplayName("El socio que el equipo tiene cargado ya no es de este gimnasio")
    void socioDeOtroGimnasio() {
        when(memberRepository.findById(SOCIO)).thenReturn(Optional.of(socioDe(OTRO_TENANT)));

        assertEquals(MolineteService.Resultado.SOCIO_INEXISTENTE,
                service.recibir(TOKEN, aviso("face_0", "1788472566659")));
        verify(accessLogService, never()).registerScan(any(), any(), any(), any(), any(), any());
    }

    // ─────────────────────────────────────────────────────────────────────────
    // El apareo de la puerta con el equipo
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("Otro equipo con el token de esta puerta no entra")
    void serialQueNoCoincide() {
        var r = service.recibir(TOKEN, new MolineteService.Aviso(
                SOCIO_EN_EL_EQUIPO, "0000000000000000", "face_0", "1788472566659", "1"));

        assertEquals(MolineteService.Resultado.NO_AUTORIZADO, r);
        verify(accessLogService, never()).registerScan(any(), any(), any(), any(), any(), any());
    }

    @Test
    @DisplayName("La primera vez, la puerta se queda con el serial del equipo que avisó")
    void apareaEnElPrimerAviso() {
        punto.setDeviceSerial(null);

        assertEquals(MolineteService.Resultado.REGISTRADO,
                service.recibir(TOKEN, aviso("face_0", "1788472566659")));
        assertEquals(SERIE, punto.getDeviceSerial());
        verify(pointRepository).save(punto);
    }

    @Test
    @DisplayName("Un aviso sin serial no aparea nada")
    void sinSerialNoAparea() {
        punto.setDeviceSerial(null);

        var r = service.recibir(TOKEN, new MolineteService.Aviso(
                SOCIO_EN_EL_EQUIPO, "", "face_0", "1788472566659", "1"));

        assertEquals(MolineteService.Resultado.NO_AUTORIZADO, r);
        assertNull(punto.getDeviceSerial());
    }

    // ─────────────────────────────────────────────────────────────────────────
    // El aislamiento
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Este endpoint corre sin sesión, sobre hilos que el servidor reutiliza para otros pedidos.
     * Un gimnasio que quede pegado en el hilo sería el peor error posible del sistema: el
     * pedido siguiente leería los datos de otro negocio.
     */
    @Test
    @DisplayName("El gimnasio del aviso no se le queda pegado al hilo")
    void limpiaElContexto() {
        service.recibir(TOKEN, aviso("face_0", "1788472566659"));
        assertNull(TenantContextHolder.getTenantId());
    }

    @Test
    @DisplayName("Y tampoco se queda pegado cuando algo explota")
    void limpiaElContextoAunqueFalle() {
        when(accessLogService.registerScan(any(), any(), any(), any(), any(), any()))
                .thenThrow(new IllegalStateException("la base se cayó"));

        assertThrows(IllegalStateException.class,
                () -> service.recibir(TOKEN, aviso("face_0", "1788472566659")));
        assertNull(TenantContextHolder.getTenantId());
    }

    @Test
    @DisplayName("Si ya había un gimnasio en el hilo, se lo devuelve como estaba")
    void devuelveElContextoAnterior() {
        TenantContextHolder.setTenantId(OTRO_TENANT);
        service.recibir(TOKEN, aviso("face_0", "1788472566659"));
        assertEquals(OTRO_TENANT, TenantContextHolder.getTenantId());
    }

    // ─────────────────────────────────────────────────────────────────────────
    // El id de socio, ida y vuelta
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("El equipo solo acepta números y letras: el UUID viaja sin guiones")
    void traduceElIdDelEquipo() {
        assertEquals(SOCIO, MolineteService.socioDe(SOCIO_EN_EL_EQUIPO));
        assertEquals(SOCIO, MolineteService.socioDe(SOCIO.toString()));
        assertNull(MolineteService.socioDe("STRANGERBABY"));
        assertNull(MolineteService.socioDe("IDCARD"));
        assertNull(MolineteService.socioDe(""));
        assertNull(MolineteService.socioDe(null));
        assertNull(MolineteService.socioDe("zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz"));
    }

    // ─────────────────────────────────────────────────────────────────────────

    private static MolineteService.Aviso aviso(String tipo, String time) {
        return new MolineteService.Aviso(SOCIO_EN_EL_EQUIPO, SERIE, tipo, time, "1");
    }

    private static MolineteService.Aviso avisoRechazado(String time, String passTimeType) {
        return new MolineteService.Aviso(SOCIO_EN_EL_EQUIPO, SERIE, "face_1", time, passTimeType);
    }

    private static UUID isNullUuid() {
        return org.mockito.ArgumentMatchers.isNull();
    }

    private static GymMember socioDe(UUID tenantId) {
        Tenant t = new Tenant();
        t.setId(tenantId);
        GymMember m = new GymMember();
        m.setId(SOCIO);
        m.setTenant(t);
        return m;
    }

    private static CheckinPointRepository.PointLookup lookup(UUID tenantId) {
        return new CheckinPointRepository.PointLookup() {
            public UUID getPointId() { return PUNTO; }
            public UUID getTenantId() { return tenantId; }
            public String getPointName() { return "Molinete"; }
            public String getGymName() { return "Gimnasio de prueba"; }
        };
    }
}
